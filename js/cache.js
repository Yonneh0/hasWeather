// ===== DATA CACHE =====
// Unified cache for ALL API calls with configurable TTL per type and LRU eviction
const DataCache = {
  // Default: max number of cache entries per type before LRU eviction kicks in
  MAX_ENTRIES_PER_TYPE: 500,

  // TTLs in milliseconds
  TTL: {
    weather: 15 * 60 * 1000,      // 15 minutes
    airQuality: 15 * 60 * 1000,   // 15 minutes
    geocode: 24 * 60 * 60 * 1000, // 24 hours
    nearby: 10 * 60 * 1000,       // 10 minutes
    ipLocation: 24 * 60 * 60 * 1000, // 24 hours
    nwsPoint: 15 * 60 * 1000,     // 15 minutes
    nwsForecast: 10 * 60 * 1000,  // 10 minutes
    nwsHourly: 5 * 60 * 1000,     // 5 minutes
    nwsCurrent: 10 * 60 * 1000,   // 10 minutes
    nwsObservation: 5 * 60 * 1000, // 5 minutes
    nwsAlerts: 2 * 60 * 1000,     // 2 minutes
    nwsZoneForecast: 10 * 60 * 1000, // 10 minutes
    nwsCityData: 10 * 60 * 1000,   // 10 minutes (NWS city data)
    nwsStations: 30 * 60 * 1000,   // 30 minutes (observation stations)
    nwsObsLatest: 5 * 60 * 1000,   // 5 minutes (latest observation from station)
    nwsObsHistorical: 5 * 60 * 1000, // 5 minutes (historical observation)
    nwsProducts: 10 * 60 * 1000,   // 10 minutes (text products)
    nwsAviation: 10 * 60 * 1000,   // 10 minutes (aviation data)
    nwsRadar: 5 * 60 * 1000,       // 5 minutes (radar data)
    nwsGrid: 10 * 60 * 1000,       // 10 minutes (raw gridpoint data)
    nwsZone: 15 * 60 * 1000,       // 15 minutes (zone metadata)
    nwsCounty: 15 * 60 * 1000,     // 15 minutes (county metadata)
    nwsOffice: 15 * 60 * 1000,     // 15 minutes (office metadata)
    nwsActiveAlerts: 2 * 60 * 1000, // 2 minutes (active alerts)
    nwsAlertTypes: 60 * 60 * 1000,  // 60 minutes (alert type list)
    nwsProductTypes: 60 * 60 * 1000, // 60 minutes (product type list)
    nwsProductLocations: 60 * 60 * 1000, // 60 minutes (product location list)
    nwsRadarServers: 60 * 60 * 1000, // 60 minutes (radar server list)
    nwsRadarStations: 60 * 60 * 1000, // 60 minutes (radar station list)
    nwsGlossary: 24 * 60 * 60 * 1000, // 24 hours (glossary)
    nwsOffices: 15 * 60 * 1000,    // 15 minutes (office list)
  },

  // Round coordinates to 2 decimal places (~1km accuracy) for cache key grouping
  _roundCoord(coord) {
    return Math.round(coord * 100) / 100;
  },

  // Get the LRU list key for a cache type
  _lruKey(type) {
    return `hasw_lru_${type}`;
  },

  // Get the LRU list for a type (array of keys, most-recently-used first)
  _getLruList(type) {
    try {
      const raw = localStorage.getItem(this._lruKey(type));
      if (!raw) return [];
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  },

  // Set the LRU list for a type
  _setLruList(type, list) {
    try {
      localStorage.setItem(this._lruKey(type), JSON.stringify(list));
    } catch (e) {
      // ignore LRU write failures
    }
  },

  // Evict least-recently-used entries when the cache exceeds the limit
  _evictIfNecessary(type) {
    try {
      const maxEntries = this.MAX_ENTRIES_PER_TYPE;
      const lruList = this._getLruList(type);
      if (lruList.length <= maxEntries) return;

      // Remove the oldest entries (they're at the end of the LRU list)
      const toRemove = lruList.splice(0, lruList.length - maxEntries);
      for (const key of toRemove) {
        localStorage.removeItem(`hasw_cache_${key}`);
        console.log(`[DataCache] EVICTED (LRU): ${key}`);
      }
      this._setLruList(type, lruList);
    } catch (e) {
      // ignore eviction failures
    }
  },

  // Move a key to the front of the LRU list (most-recently-used)
  _touchLru(type, key) {
    try {
      const lruList = this._getLruList(type);
      const idx = lruList.indexOf(key);
      if (idx !== -1) {
        lruList.splice(idx, 1); // remove from current position
      }
      lruList.unshift(key); // move to front
      this._setLruList(type, lruList);
    } catch (e) {
      // ignore LRU touch failures
    }
  },

  // Check if a cache entry exists and is not expired
  has(key, type) {
    try {
      const raw = localStorage.getItem(`hasw_cache_${key}`);
      if (!raw) {
        console.log(`[DataCache] MISS (not found): ${key}`);
        return false;
      }
      const entry = JSON.parse(raw);
      // Validate type matches
      if (type && entry.type !== type) {
        console.log(`[DataCache] MISS (type mismatch): ${key} (expected: ${type}, got: ${entry.type})`);
        return false;
      }
      const expired = !entry || (Date.now() - entry.timestamp > this.TTL[entry.type]);
      if (expired) {
        console.log(`[DataCache] MISS (expired): ${key} (type: ${entry.type})`);
        return false;
      }
      console.log(`[DataCache] HIT: ${key} (type: ${entry.type})`);
      return true;
    } catch (e) {
      console.log(`[DataCache] MISS (error): ${key}`);
      return false;
    }
  },

  // Get cached data (returns null if expired/missing)
  get(key, type) {
    try {
      const raw = localStorage.getItem(`hasw_cache_${key}`);
      if (!raw) {
        console.log(`[DataCache] MISS (not found): ${key}`);
        return null;
      }
      const entry = JSON.parse(raw);
      // Validate type and expiration
      if (entry.type !== type) {
        console.log(`[DataCache] MISS (type mismatch): ${key} (expected: ${type}, got: ${entry.type})`);
        return null;
      }
      if (Date.now() - entry.timestamp > this.TTL[entry.type]) {
        console.log(`[DataCache] MISS (expired): ${key} (type: ${type}, age: ${Math.round((Date.now() - entry.timestamp) / 1000)}s, ttl: ${this.TTL[type] / 1000}s)`);
        localStorage.removeItem(`hasw_cache_${key}`);
        return null;
      }
      console.log(`[DataCache] HIT: ${key} (type: ${type}, age: ${Math.round((Date.now() - entry.timestamp) / 1000)}s)`);
      this._touchLru(type, key);
      return entry.data;
    } catch (e) {
      console.log(`[DataCache] MISS (parse error): ${key}`, e);
      return null;
    }
  },

  // Store data with timestamp and type
  set(key, data, type) {
    try {
      const size = new Blob([JSON.stringify({ timestamp: Date.now(), type: type, data: data })]).size;
      console.log(`[DataCache] SET: ${key} (type: ${type}, size: ${Math.round(size / 100)} / 100B)`);
      localStorage.setItem(`hasw_cache_${key}`, JSON.stringify({
        timestamp: Date.now(),
        type: type,
        data: data
      }));
      this._touchLru(type, key);
      this._evictIfNecessary(type);
    } catch (e) {
      console.log(`[DataCache] SET FAILED: ${key} - ${e.message}`);
    }
  },

  // Invalidate a specific cache key
  invalidate(key) {
    console.log(`[DataCache] INVALIDATE: ${key}`);
    localStorage.removeItem(`hasw_cache_${key}`);
  },

};
