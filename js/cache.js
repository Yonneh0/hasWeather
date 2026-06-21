// ===== DATA CACHE =====
// Unified cache for ALL API calls with configurable TTL per type and LRU eviction

// NWS cache key — used by cross-source lookups to check for cached NWS data.
// Defined here (before utils.js) so it's available when the NWS toggle code runs.
function nwsCacheKey(lat, lon) {
  return `nws_${DataCache._roundCoord(lat)}_${DataCache._roundCoord(lon)}`;
}

// ===== LOG COUNTERS =====
const _logCounter = { hits: 0, misses: 0, sets: 0, evictions: 0 };

function DataCacheLogSummary(context) {
  if (_logCounter.hits === 0 && _logCounter.misses === 0 && _logCounter.sets === 0) return;
  const parts = [];
  if (_logCounter.hits > 0) parts.push(`${_logCounter.hits}h`);
  if (_logCounter.misses > 0) parts.push(`${_logCounter.misses}m`);
  if (_logCounter.sets > 0) parts.push(`${_logCounter.sets}s`);
  if (_logCounter.evictions > 0) parts.push(`${_logCounter.evictions}e`);
  console.log(`[Cache] ${parts.join(', ')}${context ? ` — ${context}` : ''}`);
  _logCounter.hits = 0;
  _logCounter.misses = 0;
  _logCounter.sets = 0;
  _logCounter.evictions = 0;
}

// ===== NWS RATE LIMITER =====
// NWS API limit: 1 request/second, burst of 3.
// Moved here (before utils.js) so isNwsBoundsAvailable can use it during initial page load.
const RATE_LIMITER_POLL_INTERVAL_MS = 50;

const _nwsRateLimiter = {
  lastRequestTime: 0,
  burstCount: 0,
  burstWindow: 0,
  maxBurst: 3,
  burstWindowMs: 1000,
  minIntervalMs: 1000,

  _checkBurst() {
    const now = Date.now();
    if (now - this.burstWindow > this.burstWindowMs) {
      this.burstCount = 0;
      this.burstWindow = now;
    }
    return this.burstCount < this.maxBurst;
  },

  _waitForBurst() {
    return new Promise(resolve => {
      const check = () => {
        if (this._checkBurst()) resolve();
        else setTimeout(check, RATE_LIMITER_POLL_INTERVAL_MS);
      };
      check();
    });
  },

  async waitForSlot() {
    const now = Date.now();
    const timeSinceLast = now - this.lastRequestTime;

    // If we're within the burst window and at max burst, wait
    if (timeSinceLast < this.burstWindowMs && !this._checkBurst()) {
      await this._waitForBurst();
    }

    // Ensure minimum interval between requests
    if (timeSinceLast < this.minIntervalMs) {
      await new Promise(r => setTimeout(r, this.minIntervalMs - timeSinceLast));
    }

    this.burstCount++;
    this.burstWindow = Date.now();
    this.lastRequestTime = Date.now();
  },
};

// ===== COORDINATE PRECISION =====
// Rounding factor for cache key generation (~1km accuracy)
const COORD_ROUND_PRECISION = 100;

// ===== NWS TOGGLE STATE =====
// Track which cities have NWS data actively displayed (per-city toggle).
// Entries are intentionally NOT cleaned up when cities are removed — preserves user preference
// across removal/re-addition. Negligible storage impact (~30 bytes per entry).
const NWS_ACTIVE_STORAGE_KEY = 'hasW_nwsActive';
let _nwsActive = {}; // { place_id: boolean }

// Restore NWS toggle state from localStorage on load
try {
  const saved = localStorage.getItem(NWS_ACTIVE_STORAGE_KEY);
  if (saved) _nwsActive = JSON.parse(saved);
} catch { /* ignore corrupted data */ }

function saveNwsActiveState() {
  try {
    localStorage.setItem(NWS_ACTIVE_STORAGE_KEY, JSON.stringify(_nwsActive));
  } catch { /* ignore storage errors */ }
}

const DataCache = {
  // Max cache entries per type before LRU eviction
  MAX_ENTRIES_PER_TYPE: 500,

  // TTLs in milliseconds — grouped by category
  TTL: {
    // Non-NWS sources
    weather:     15 * 60 * 1000,   // 15 min
    airQuality:  15 * 60 * 1000,   // 15 min
    geocode:    24 * 60 * 60 * 1000, // 24 hr
    nearby:     15 * 60 * 1000,   // 15 min (aligned with weather)
    ipLocation: 24 * 60 * 60 * 1000, // 24 hr
    geolocation: 24 * 60 * 60 * 1000, // 24 hr

    // NWS general data
    nwsPoint:      15 * 60 * 1000,   // 15 min
    nwsForecast:   10 * 60 * 1000,   // 10 min
    nwsHourly:      5 * 60 * 1000,   // 5 min
    nwsCurrent:    10 * 60 * 1000,   // 10 min
    nwsObservation: 5 * 60 * 1000,   // 5 min

    // NWS alerts & products
    nwsAlerts:          2 * 60 * 1000,   // 2 min
    nwsActiveAlerts:    2 * 60 * 1000,   // 2 min
    nwsZoneForecast:   10 * 60 * 1000,   // 10 min
    nwsCityData:       10 * 60 * 1000,   // 10 min
    nwsProducts:       10 * 60 * 1000,   // 10 min
    nwsAviation:       10 * 60 * 1000,   // 10 min
    nwsObsLatest:       5 * 60 * 1000,   // 5 min
    nwsObsHistorical:   5 * 60 * 1000,   // 5 min

    // NWS radar data
    nwsRadar:         5 * 60 * 1000,   // 5 min
    nwsGrid:          10 * 60 * 1000,   // 10 min
    nwsStations:     30 * 60 * 1000,   // 30 min

    // NWS metadata (lists)
    nwsAlertTypes:        60 * 60 * 1000,  // 60 min
    nwsProductTypes:      60 * 60 * 1000,  // 60 min
    nwsProductLocations:  60 * 60 * 1000,  // 60 min
    nwsRadarServers:      60 * 60 * 1000,  // 60 min
    nwsRadarStations:     60 * 60 * 1000,  // 60 min

    // NWS metadata (entities)
    nwsZone:    15 * 60 * 1000,   // 15 min
    nwsCounty:  15 * 60 * 1000,   // 15 min
    nwsOffice:  15 * 60 * 1000,   // 15 min
    nwsOffices: 15 * 60 * 1000,   // 15 min

    // NWS static reference
    nwsGlossary: 24 * 60 * 60 * 1000, // 24 hr
  },

  // Round coordinates to 2 decimal places (~1km accuracy) for cache key grouping
  _roundCoord(coord) {
    return Math.round(coord * COORD_ROUND_PRECISION) / COORD_ROUND_PRECISION;
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
        _logCounter.evictions++;
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
      if (!raw) return false;
      const entry = JSON.parse(raw);
      if (type != null && entry.type !== type) return false;
      const ttlKey = type ?? entry.type;
      if (!entry || Date.now() - entry.timestamp > this.TTL[ttlKey]) return false;
      _logCounter.hits++;
      return true;
    } catch {
      _logCounter.misses++;
      return false;
    }
  },

  // Get cached data (returns null if expired/missing/wrong type)
  get(key, type) {
    try {
      const raw = localStorage.getItem(`hasw_cache_${key}`);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (type != null && entry.type !== type) return null;
      const ttlKey = type ?? entry.type;
      if (Date.now() - entry.timestamp > this.TTL[ttlKey]) {
        localStorage.removeItem(`hasw_cache_${key}`);
        return null;
      }
      _logCounter.hits++;
      this._touchLru(type, key);
      return entry.data;
    } catch (e) {
      console.error(`[DataCache] parse error: ${key}`, e);
      _logCounter.misses++;
      return null;
    }
  },

  // Store data with timestamp and type
  set(key, data, type) {
    try {
      localStorage.setItem(`hasw_cache_${key}`, JSON.stringify({
        timestamp: Date.now(),
        type: type,
        data: data
      }));
      this._touchLru(type, key);
      this._evictIfNecessary(type);
      _logCounter.sets++;
    } catch (e) {
      console.error(`[DataCache] SET FAILED: ${key} - ${e.message}`);
    }
  },

  // Invalidate a specific cache key by type
  invalidate(key) {
    localStorage.removeItem(`hasw_cache_${key}`);
  },

};
