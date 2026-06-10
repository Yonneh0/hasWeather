// ===== DATA CACHE =====
// Unified cache for ALL API calls with configurable TTL per type
const DataCache = {
  // TTLs in milliseconds
  TTL: {
    weather: 15 * 60 * 1000,      // 15 minutes
    airQuality: 15 * 60 * 1000,   // 15 minutes
    geocode: 24 * 60 * 60 * 1000, // 24 hours
    nearby: 10 * 60 * 1000,       // 10 minutes
    ipLocation: 24 * 60 * 60 * 1000 // 24 hours
  },

  // Round coordinates to 2 decimal places (~1km accuracy) for cache key grouping
  _roundCoord(coord) {
    return Math.round(coord * 100) / 100;
  },

  // Check if a cache entry exists and is not expired
  has(key) {
    try {
      const raw = localStorage.getItem(`hasw_cache_${key}`);
      if (!raw) {
        console.log(`[DataCache] MISS (not found): ${key}`);
        return false;
      }
      const entry = JSON.parse(raw);
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
    } catch (e) {
      console.log(`[DataCache] SET FAILED: ${key} - ${e.message}`);
    }
  },

  // Invalidate a specific cache key
  invalidate(key) {
    console.log(`[DataCache] INVALIDATE: ${key}`);
    localStorage.removeItem(`hasw_cache_${key}`);
  },

  // Clear all cache entries
  clearAll() {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('hasw_cache_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    console.log(`[DataCache] CLEARED ALL: ${keysToRemove.length} entries`);
  },

  // Get total cache size in KB
  getSize() {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('hasw_cache_')) {
        total += localStorage.key(i).length + localStorage.getItem(key).length;
      }
    }
    return Math.round(total / 1024 * 100) / 100;
  }
};
