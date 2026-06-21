// — Utility Functions —
function toF(c) { return c * 9 / 5 + 32; }
function toC(f) { return (f - 32) * 5 / 9; }
function convertTemp(celsius) {
  if (celsius == null || celsius !== celsius) return NaN;
  return unit === 'F' ? toF(celsius) : toC(celsius);
}
function tempUnit() { return unit === 'F' ? '°F' : '°C'; }

function escapeHTML(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const DEG_TO_RAD = Math.PI / 180;

function haversine(lat1, lon1, lat2, lon2) {
  const R = EARTH_RADIUS_MI;
  const dLat = (lat2 - lat1) * DEG_TO_RAD;
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearing(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * DEG_TO_RAD;
  const y = Math.sin(dLon) * Math.cos(lat2 * DEG_TO_RAD);
  const x = Math.cos(lat1 * DEG_TO_RAD) * Math.sin(lat2 * DEG_TO_RAD) -
            Math.sin(lat1 * DEG_TO_RAD) * Math.cos(lat2 * DEG_TO_RAD) * Math.cos(dLon);
  let b = Math.atan2(y, x) / DEG_TO_RAD;
  return (b + 360) % 360;
}

// — Constants —
const AQI_GOOD_THRESHOLD = 50;
const AQI_MODERATE_THRESHOLD = 100;
const COMPASS_SECTORS = 16;
const COMPASS_SECTOR_SIZE = 22.5;
const WIND_DIRECTIONS_COUNT = 8;
const WIND_DIRECTION_STEP = 45;
const DEFAULT_LAT = 43.41947;
const DEFAULT_LON = -83.95081;
const IP_API_URL = 'https://ipinfo.io/json';
const MIN_BACKGROUND_REFRESH_MS = 60 * 1000;
const BACKGROUND_REFRESH_FRACTION = 0.8;
// Location refresh intervals defined in constants.js:
// COORD_CHANGE_THRESHOLD_MI, IP_LOCATION_REFRESH_MS, GEOLOCATION_BACKGROUND_REFRESH_MS

function bearingToCompass(deg) {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / COMPASS_SECTOR_SIZE) % COMPASS_SECTORS];
}

function aqiLabel(aqi) {
  if (aqi == null || aqi === false || aqi !== aqi) return { label: '—', cls: '' };
  if (aqi <= AQI_GOOD_THRESHOLD) return { label: 'Good', cls: 'aqi-good' };
  if (aqi <= AQI_MODERATE_THRESHOLD) return { label: 'Moderate', cls: 'aqi-moderate' };
  return { label: 'Unhealthy', cls: 'aqi-unhealthy' };
}

function getWindCompass(deg) {
  const arrow = ['⬆', '↗', '➡', '↘', '⬇', '↙', '⬅', '↖'][Math.round(deg / WIND_DIRECTION_STEP) % WIND_DIRECTIONS_COUNT];
  return `<span class="wind-compass"><span class="compass-dial">${arrow}</span> ${bearingToCompass(deg)} ${deg}°</span>`;
}

function isDaytime(hour, sunrise, sunset) {
  return hour >= sunrise && hour < sunset;
}

// — Location —
// Pending promise to prevent concurrent fetches (similar pattern to _nwsBoundsCache)
let _locationPendingPromise = null;
// Timers for background location refresh
let _ipLocationRefreshTimer = null;
let _geolocationRefreshTimer = null;

/**
 * Compare two coordinates by distance. Returns true if the distance exceeds the threshold.
 */
function coordDistanceExceedsThreshold(lat1, lon1, lat2, lon2) {
  const dist = haversine(lat1, lon1, lat2, lon2);
  const changed = dist > COORD_CHANGE_THRESHOLD_MI;
  if (changed) {
    console.log(`[Location] Distance check: ${dist.toFixed(2)} mi > ${COORD_CHANGE_THRESHOLD_MI} mi threshold`);
  }
  return changed;
}

/**
 * Validate if the cached IP location is still current by comparing against ipinfo.io.
 * Returns true if the location has changed (needs update), false otherwise.
 */
async function validateIpLocation() {
  const cachedIP = DataCache.get('ip_location', 'ipLocation');
  if (!cachedIP) {
    console.log('[Location] No cached IP location — needs refresh');
    return true;
  }

  console.log(`[Location] Validating IP location (cached: ${cachedIP.lat.toFixed(2)}, ${cachedIP.lon.toFixed(2)})`);

  try {
    const res = await fetch(IP_API_URL);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    const ipLat = parseFloat(data.loc?.split(',')[0] ?? data.lat);
    const ipLon = parseFloat(data.loc?.split(',')[1] ?? data.lon);

    console.log(`[Location] Current IP: ${data.ip}, lat/lon: (${ipLat.toFixed(2)}, ${ipLon.toFixed(2)})`);

    // Check if the IP has changed (ipinfo returns the IP address)
    const cachedIPAddr = DataCache.get('ip_address', 'ipAddress');
    const currentIP = data.ip;
    if (cachedIPAddr && cachedIPAddr !== currentIP) {
      console.log(`[Location] ⚠️ IP changed: ${cachedIPAddr} → ${currentIP}`);
      return true;
    }

    // Check if the location has moved beyond threshold
    const latChanged = coordDistanceExceedsThreshold(cachedIP.lat, cachedIP.lon, ipLat, ipLon);
    if (latChanged) {
      console.log(`[Location] ⚠️ Location changed — cached: (${cachedIP.lat.toFixed(2)}, ${cachedIP.lon.toFixed(2)}), current IP: (${ipLat.toFixed(2)}, ${ipLon.toFixed(2)})`);
      return true;
    }

    console.log('[Location] ✓ IP location validated — no change');
    return false; // Location is still valid
  } catch (err) {
    // If validation fails, assume location might have changed
    console.warn('[Location] ✗ Validation failed:', err.message);
    return true;
  }
}

async function getLocation() {
  if (userLocation) {
    console.log('[Location] Already resolved:', `(${userLocation.lat.toFixed(2)}, ${userLocation.lon.toFixed(2)})`);
    return userLocation;
  }

  // Check browser geolocation cache first
  const cachedGeo = DataCache.get('geolocation', 'geolocation');
  if (cachedGeo) {
    console.log(`[Location] ✓ Using cached browser geolocation: (${cachedGeo.lat.toFixed(2)}, ${cachedGeo.lon.toFixed(2)})`);
    return cachedGeo;
  }

  // Check IP-based location cache as fallback
  const cachedIP = DataCache.get('ip_location', 'ipLocation');
  if (cachedIP) {
    console.log(`[Location] ✓ Using cached IP location: (${cachedIP.lat.toFixed(2)}, ${cachedIP.lon.toFixed(2)})`);
    return cachedIP;
  }

  // If another call is already fetching, wait for it instead of duplicating
  if (_locationPendingPromise) {
    console.log('[Location] Concurrent fetch pending — waiting...');
    return _locationPendingPromise;
  }

  console.log('[Location] No cached location — starting geolocation fetch...');

  _locationPendingPromise = (async () => {
    try {
      console.log('[Location] Attempting browser geolocation...');
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: GEOLOCATION_TIMEOUT_MS });
      });
      const { latitude, longitude } = pos.coords;
      const loc = { lat: latitude, lon: longitude };
      console.log(`[Location] ✓ Browser geolocation successful: (${latitude.toFixed(2)}, ${longitude.toFixed(2)})`);
      // Cache the browser geolocation result for future lookups
      DataCache.set('geolocation', loc, 'geolocation');
      return loc;
    } catch (geocErr) {
      console.warn('[Location] ✗ Browser geolocation failed:', geocErr.message);

      try {
        console.log('[Location] Falling back to IP-based location...');
        const res = await fetch(IP_API_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const lat = parseFloat(data.loc?.split(',')[0] ?? data.lat);
        const lon = parseFloat(data.loc?.split(',')[1] ?? data.lon);
        const loc = { lat, lon };
        console.log(`[Location] ✓ IP-based location: ${data.ip} → (${lat.toFixed(2)}, ${lon.toFixed(2)})`);
        // Also cache the IP address to detect future changes
        DataCache.set('ip_address', data.ip, 'ipAddress');
        DataCache.set('ip_location', loc, 'ipLocation');
        return loc;
      } catch (ipErr) {
        console.error('[Location] ✗ IP fallback also failed — using default:', ipErr.message);
        return { lat: DEFAULT_LAT, lon: DEFAULT_LON };
      }
    } finally {
      // Clear the pending promise after resolution
      _locationPendingPromise = null;
    }
  })();

  return _locationPendingPromise;
}

/**
 * Periodically check if the user's browser location has changed significantly.
 * If it has, update userLocation and invalidate weather caches.
 */
async function checkGeolocationChange() {
  if (!userLocation) {
    console.log('[Geolocation] No user location — skipping check');
    return false;
  }

  try {
    console.log(`[Geolocation] Checking position (cached: ${userLocation.lat.toFixed(2)}, ${userLocation.lon.toFixed(2)})`);
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: GEOLOCATION_TIMEOUT_MS });
    });
    const { latitude, longitude } = pos.coords;
    console.log(`[Geolocation] New position: (${latitude.toFixed(2)}, ${longitude.toFixed(2)})`);

    // Check if the position has changed beyond threshold
    if (coordDistanceExceedsThreshold(userLocation.lat, userLocation.lon, latitude, longitude)) {
      console.log(`[Geolocation] ⚠️ Position changed — old: (${userLocation.lat.toFixed(2)}, ${userLocation.lon.toFixed(2)}), new: (${latitude.toFixed(2)}, ${longitude.toFixed(2)})`);
      // Invalidate caches for both old and new locations before updating
      const oldNearbyKey = `nearby_${DataCache._roundCoord(userLocation.lat)}_${DataCache._roundCoord(userLocation.lon)}`;
      DataCache.invalidate(oldNearbyKey);
      userLocation = { lat: latitude, lon: longitude };
      // Invalidate weather cache keys for the new location too (they'll be fetched fresh)
      const newWeatherKey = weatherAqiCacheKey(latitude, longitude);
      DataCache.invalidate(newWeatherKey);
      // Also invalidate the cached geolocation since position has changed
      DataCache.invalidate('geolocation');
      console.log('[Geolocation] ✓ Location updated — caches invalidated');
      return true;
    }

    console.log('[Geolocation] ✓ Position unchanged');
  } catch (err) {
    // Geolocation error — just log it, don't update location
    console.warn('[Geolocation] ✗ Check failed:', err.message);
  }
  return false;
}

/**
 * Calculate the elapsed time since the cached IP location entry was created.
 * Returns null if there's no valid cache entry.
 */
function getIpLocationElapsed() {
  const raw = localStorage.getItem('hasw_cache_ip_location');
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw);
    if (entry.type !== 'ipLocation') return null;
    return Date.now() - entry.timestamp;
  } catch {
    return null;
  }
}

/**
 * Calculate the elapsed time since the cached geolocation entry was created.
 * Returns null if there's no valid cache entry.
 */
function getGeolocationElapsed() {
  const raw = localStorage.getItem('hasw_cache_geolocation');
  if (!raw) return null;
  try {
    const entry = JSON.parse(raw);
    if (entry.type !== 'geolocation') return null;
    return Date.now() - entry.timestamp;
  } catch {
    return null;
  }
}

/**
 * Get the elapsed time since any location cache was created (IP or geolocation).
 * Returns null if neither exists.
 */
function getLocationElapsed() {
  const geoElapsed = getGeolocationElapsed();
  if (geoElapsed != null && geoElapsed > 0) return geoElapsed;
  return getIpLocationElapsed();
}

/**
 * Get the TTL for any location cache type.
 */
function getLocationTTL() {
  const raw = localStorage.getItem('hasw_cache_geolocation');
  if (raw) {
    try {
      const entry = JSON.parse(raw);
      if (entry.type === 'geolocation' && DataCache.TTL.geolocation) return DataCache.TTL.geolocation;
    } catch {}
  }
  const ipRaw = localStorage.getItem('hasw_cache_ip_location');
  if (ipRaw) {
    try {
      const entry = JSON.parse(ipRaw);
      if (entry.type === 'ipLocation' && DataCache.TTL.ipLocation) return DataCache.TTL.ipLocation;
    } catch {}
  }
  // Default to IP TTL as fallback
  return DataCache.TTL.ipLocation || 24 * 60 * 60 * 1000;
}

/**
 * Stop the background IP location validation timer.
 */
function stopIpLocationRefresh() {
  if (_ipLocationRefreshTimer) {
    console.log('[Location] Stopping IP validation timer');
    clearInterval(_ipLocationRefreshTimer);
    _ipLocationRefreshTimer = null;
  }
}

/**
 * Start the background IP location validation timer.
 * Periodically checks if the user's IP/location has changed since it was cached.
 * Interval is based on elapsed time since the cache was created, capped so it never
 * exceeds a reasonable maximum (60 minutes). This ensures validation happens even when
 * the cache is fresh — we don't want to wait hours before detecting an IP change.
 */
function startIpLocationRefresh() {
  stopIpLocationRefresh();

  // Only start if we have a valid userLocation
  if (!userLocation) {
    console.log('[Location] Cannot start IP validation — no user location');
    return;
  }

  const elapsed = getIpLocationElapsed();
  let interval;

  if (elapsed != null && elapsed > 0) {
    // Start validating after 15 minutes from cache creation, then increase frequency
    // as the cache ages — but cap at 60 minutes max interval.
    // After 30 min: validate every 30 min, after 60 min: every hour, etc.
    const ipLocationTTL = DataCache.TTL.ipLocation || 24 * 60 * 60 * 1000;
    const timeSinceCache = elapsed / ipLocationTTL; // fraction of TTL elapsed

    if (timeSinceCache < 0.1) {
      // Less than 10% of TTL — validate every 15 minutes
      interval = 15 * 60 * 1000;
    } else if (timeSinceCache < 0.3) {
      // 10-30% of TTL — validate every 20 minutes
      interval = 20 * 60 * 1000;
    } else if (timeSinceCache < 0.5) {
      // 30-50% of TTL — validate every 30 minutes
      interval = 30 * 60 * 1000;
    } else if (timeSinceCache < 0.8) {
      // 50-80% of TTL — validate every hour
      interval = 60 * 60 * 1000;
    } else {
      // Over 80% of TTL — validate every 30 minutes (cache is about to expire)
      interval = 30 * 60 * 1000;
    }
    console.log(`[Location] ✓ IP validation timer started — every ${Math.round(interval / 1000)}s (elapsed: ${Math.round(elapsed / 60000)} min of TTL)`);
  } else {
    // No valid cache entry — validate frequently
    interval = MIN_BACKGROUND_REFRESH_MS;
    console.log(`[Location] ✓ IP validation timer started — every ${Math.round(interval / 1000)}s (no cache TTL, using minimum)`);
  }

  const tickIpValidation = async () => {
    const locationChanged = await validateIpLocation();
    if (locationChanged) {
      console.log('[Location] ⚠️ IP location validation failed — invalidating cache and forcing refresh');
      // Invalidate the cached IP location so next getLocation() call re-fetches
      DataCache.invalidate('ip_location');
      DataCache.invalidate('ip_address');
      userLocation = null;
    }
    // Recalculate interval based on current elapsed time after each validation
    const newElapsed = getIpLocationElapsed();
    if (newElapsed != null && newElapsed > 0) {
      const newTTL = DataCache.TTL.ipLocation || 24 * 60 * 60 * 1000;
      const newTimeSinceCache = newElapsed / newTTL;

      let newInterval;
      if (newTimeSinceCache < 0.1) newInterval = 15 * 60 * 1000;
      else if (newTimeSinceCache < 0.3) newInterval = 20 * 60 * 1000;
      else if (newTimeSinceCache < 0.5) newInterval = 30 * 60 * 1000;
      else newInterval = 60 * 60 * 1000;

      // Only restart timer if interval changed significantly (> 25% difference)
      if (Math.abs(newInterval - interval) / interval > 0.25) {
        clearInterval(_ipLocationRefreshTimer);
        interval = newInterval;
        _ipLocationRefreshTimer = setInterval(tickIpValidation, interval);
      }
    }
  };

  _ipLocationRefreshTimer = setInterval(tickIpValidation, interval);
}

/**
 * Stop the background geolocation refresh timer.
 */
function stopGeolocationRefresh() {
  if (_geolocationRefreshTimer) {
    console.log('[Geolocation] Stopping background refresh timer');
    clearInterval(_geolocationRefreshTimer);
    _geolocationRefreshTimer = null;
  }
}

/**
 * Start the background geolocation refresh timer.
 * Periodically checks if the user's browser location has changed significantly.
 * Interval is based on elapsed time since the cache was created, capped at 5 minutes.
 */
function startGeolocationRefresh() {
  stopGeolocationRefresh();

  // Only start if we have a valid userLocation
  if (!userLocation) {
    console.log('[Geolocation] Cannot start background refresh — no user location');
    return;
  }

  const elapsed = getLocationElapsed();
  let interval;
  const locTTL = getLocationTTL();

  if (elapsed != null && elapsed > 0) {
    // Start checking every 5 minutes from cache creation, decreasing frequency as
    // the cache ages — but never less than 15 minutes.
    const timeSinceCache = elapsed / locTTL;

    if (timeSinceCache < 0.1) {
      // Less than 10% of TTL — check every 5 minutes
      interval = 5 * 60 * 1000;
    } else if (timeSinceCache < 0.3) {
      // 10-30% of TTL — check every 8 minutes
      interval = 8 * 60 * 1000;
    } else if (timeSinceCache < 0.5) {
      // 30-50% of TTL — check every 10 minutes
      interval = 10 * 60 * 1000;
    } else if (timeSinceCache < 0.8) {
      // 50-80% of TTL — check every 15 minutes
      interval = 15 * 60 * 1000;
    } else {
      // Over 80% of TTL — check every 10 minutes (cache is about to expire)
      interval = 10 * 60 * 1000;
    }
    console.log(`[Geolocation] ✓ Background refresh timer started — every ${Math.round(interval / 1000)}s (elapsed: ${Math.round(elapsed / 60000)} min of TTL)`);
  } else {
    // No valid cache entry — check frequently
    interval = MIN_BACKGROUND_REFRESH_MS;
    console.log(`[Geolocation] ✓ Background refresh timer started — every ${Math.round(interval / 1000)}s (no cache TTL, using minimum)`);
  }

  const tickGeolocationChange = async () => {
    const positionChanged = await checkGeolocationChange();
    if (positionChanged) {
      console.log('[Geolocation] ⚠️ Position changed — invalidating location cache, forcing refresh');
      // Re-fetch weather data for the new location
      DataCache.invalidate('ip_location');
      DataCache.invalidate('ip_address');
    }
    // Recalculate interval based on current elapsed time after each check
    const newElapsed = getLocationElapsed();
    if (newElapsed != null && newElapsed > 0) {
      const newTTL = getLocationTTL();
      const newTimeSinceCache = newElapsed / newTTL;

      let newInterval;
      if (newTimeSinceCache < 0.1) newInterval = 5 * 60 * 1000;
      else if (newTimeSinceCache < 0.3) newInterval = 8 * 60 * 1000;
      else if (newTimeSinceCache < 0.5) newInterval = 10 * 60 * 1000;
      else if (newTimeSinceCache < 0.8) newInterval = 15 * 60 * 1000;
      else newInterval = 10 * 60 * 1000;

      // Only restart timer if interval changed significantly (> 25% difference)
      if (Math.abs(newInterval - interval) / interval > 0.25) {
        clearInterval(_geolocationRefreshTimer);
        interval = newInterval;
        _geolocationRefreshTimer = setInterval(tickGeolocationChange, interval);
      }
    }
  };

  _geolocationRefreshTimer = setInterval(tickGeolocationChange, interval);
}

/**
 * Stop all background location refresh timers.
 */
function stopAllLocationRefresh() {
  console.log('[Location] Stopping all location timers');
  stopIpLocationRefresh();
  stopGeolocationRefresh();
}

// — NWS Bounds Check —
const _nwsBoundsCache = {};
const NWS_BOUNDS_CACHE_TTL_MS = 60 * 60 * 1000;

async function isNwsBoundsAvailable(lat, lon) {
  const key = `${DataCache._roundCoord(lat)},${DataCache._roundCoord(lon)}`;
  if (key in _nwsBoundsCache) {
    const entry = _nwsBoundsCache[key];
    if (typeof entry === 'object' && !entry.then && 'value' in entry) {
      if (Date.now() < entry.expiresAt) return entry.value;
      delete _nwsBoundsCache[key];
    } else {
      return Promise.resolve(entry).catch(() => {
        delete _nwsBoundsCache[key];
        return isNwsBoundsAvailable(lat, lon);
      });
    }
  }
  const promise = (async () => {
    // Rate-limit the bounds check through the global NWS rate limiter
    await _nwsRateLimiter.waitForSlot();
    try {
      const data = await (await fetch(`${NWS_API}/points/${lat},${lon}`)).json();
      const props = data?.properties || {};
      return !!(props.gridId || props.cwa) && !!props.gridX && !!props.gridY;
    } catch (err) {
      // Only return false for 404 (outside coverage). Network errors propagate
      // so the caller can retry or handle them.
      console.warn(`[NWS bounds] ${key}: ${err.message}`);
      throw err;
    }
  })();
  _nwsBoundsCache[key] = promise;
  const result = await promise;
  _nwsBoundsCache[key] = { value: result, expiresAt: Date.now() + NWS_BOUNDS_CACHE_TTL_MS };
  return result;
}

// — Background Refresh —
let _bgRefreshTimer = null;
let _lastRefreshCityCount = 0;
let _bgRefreshGen = 0;

function getCityShortestTTL(city) {
  let shortest = Infinity;
  const lat = city.latitude;
  const lon = city.longitude;

  if (lat == null || lon == null) return MIN_BACKGROUND_REFRESH_MS;

  // Check consolidated cache (weatherAqi) — primary source
  const consolidatedKey = weatherAqiCacheKey(lat, lon);
  const consolidatedEntry = localStorage.getItem(`hasw_cache_${consolidatedKey}`);
  if (consolidatedEntry) {
    try {
      const entry = JSON.parse(consolidatedEntry);
      // Only count TTL if the weather data is actually valid (non-null current)
      if (entry.data && entry.data.weather && entry.data.weather.current && Object.keys(entry.data.weather.current).length > 0) {
        const ttl = DataCache.TTL[entry.type] || DataCache.TTL.weather;
        const remaining = ttl - (Date.now() - entry.timestamp);
        if (remaining < shortest) shortest = remaining;
      }
    } catch {}
  }

  // Check legacy weather cache (only if consolidated is missing or invalid)
  const weatherKey = weatherCacheKey(lat, lon);
  const weatherEntry = localStorage.getItem(`hasw_cache_${weatherKey}`);
  if (weatherEntry) {
    try {
      const entry = JSON.parse(weatherEntry);
      // If consolidated exists and is valid, skip legacy to avoid double-counting
      if (!consolidatedEntry || !consolidatedEntry.includes('"type":"weatherAqi"')) {
        const ttl = DataCache.TTL[entry.type] || DataCache.TTL.weather;
        const remaining = ttl - (Date.now() - entry.timestamp);
        if (remaining < shortest) shortest = remaining;
      }
    } catch {}
  }

  // Check legacy AQI cache (only if consolidated is missing or invalid)
  const aqiKey = aqiCacheKey(lat, lon);
  const airEntry = localStorage.getItem(`hasw_cache_${aqiKey}`);
  if (airEntry) {
    try {
      const entry = JSON.parse(airEntry);
      if (!consolidatedEntry || !consolidatedEntry.includes('"type":"weatherAqi"')) {
        const ttl = DataCache.TTL[entry.type] || DataCache.TTL.airQuality;
        const remaining = ttl - (Date.now() - entry.timestamp);
        if (remaining < shortest) shortest = remaining;
      }
    } catch {}
  }

  // Check NWS point cache
  const nwsPointKey = nwsPointCacheKey(lat, lon);
  const nwsEntry = localStorage.getItem(`hasw_cache_${nwsPointKey}`);
  if (nwsEntry) {
    try {
      const entry = JSON.parse(nwsEntry);
      const ttl = DataCache.TTL[entry.type] || DataCache.TTL.nwsPoint;
      const remaining = ttl - (Date.now() - entry.timestamp);
      if (remaining < shortest) shortest = remaining;
    } catch {}
  }

  // Radar cache — only relevant when overlay is displayed (not "none")
  if (typeof RADAR_LAYERS !== 'undefined' && typeof _selectedRadarOverlay !== 'undefined') {
    const activeOverlay = _selectedRadarOverlay || 'qcd-composite';
    // Skip radar TTL if overlay is "none"
    if (activeOverlay !== 'none') {
      const layerName = RADAR_LAYERS[activeOverlay]
        ? RADAR_LAYERS[activeOverlay].wmsLayer
        : activeOverlay;
      const radarKey = `hasw_radar_overlay_${layerName}_${lat.toFixed(4)}_${lon.toFixed(4)}`;
      const radarEntry = localStorage.getItem(radarKey);
      if (radarEntry) {
        try {
          const entry = JSON.parse(radarEntry);
          const remaining = RADAR_CACHE_TTL - (Date.now() - entry.timestamp);
          if (remaining < shortest) shortest = remaining;
        } catch {}
      }
    }
  }

  return shortest === Infinity ? MIN_BACKGROUND_REFRESH_MS : shortest;
}

function stopBackgroundRefresh() {
  if (_bgRefreshTimer) {
    clearInterval(_bgRefreshTimer);
    _bgRefreshTimer = null;
  }
  _bgRefreshGen++;
  // Also stop location timers when background refresh stops
  stopAllLocationRefresh();
}

function startBackgroundRefresh() {
  // Capture the generation before any concurrent calls
  const gen = _bgRefreshGen;

  // Stop any existing timer first (also stops location timers)
  stopBackgroundRefresh();

  // Guard: don't start if no weather data — but keep location timers running if we have a userLocation
  if (!weatherData || weatherData.length === 0) {
    console.log('[BackgroundRefresh] No weather data, skipping');
    // Restart location timers since they were stopped above
    if (userLocation) {
      startIpLocationRefresh();
      startGeolocationRefresh();
    }
    return;
  }

  let shortestTTL = Infinity;
  for (const city of weatherData) {
    const ttl = getCityShortestTTL(city);
    if (ttl < shortestTTL) shortestTTL = ttl;
  }

  // If no TTLs found, use minimum interval
  if (shortestTTL === Infinity) shortestTTL = MIN_BACKGROUND_REFRESH_MS;
  const interval = Math.max(MIN_BACKGROUND_REFRESH_MS, shortestTTL * BACKGROUND_REFRESH_FRACTION);

  _lastRefreshCityCount = weatherData.length;
  console.log(`[BackgroundRefresh] Starting gen=${gen}: ${weatherData.length} cities, interval=${Math.round(interval / 1000)}s (shortest TTL=${Math.round(shortestTTL / 1000)}s)`);

  _bgRefreshTimer = setInterval(() => {
    // Skip if this timer belongs to a stale generation
    if (_bgRefreshGen !== gen) return;

    if (isLoading || !userLocation) return;

    // Re-fetch only if city count changed or data is stale
    if (weatherData.length !== _lastRefreshCityCount) {
      _lastRefreshCityCount = weatherData.length;
    }

    for (const city of weatherData) {
      if (city.latitude != null && city.longitude != null) {
        DataCache.invalidate(weatherAqiCacheKey(city.latitude, city.longitude));
        DataCache.invalidate(weatherCacheKey(city.latitude, city.longitude));
        DataCache.invalidate(aqiCacheKey(city.latitude, city.longitude));
      }
    }

    // Pass true to indicate this is a background refresh (won't block full refresh)
    run(true);
  }, interval);
}

// — Refresh & Unit Toggle —
function toggleUnit() {
  if (_toggleDebounceTimer) return;
  _toggleDebounceTimer = setTimeout(() => {
    _toggleDebounceTimer = null;
    unit = unit === 'F' ? 'C' : 'F';
    const btn = document.getElementById('unit-toggle');
    if (btn) btn.textContent = `°${unit}`;
    renderAll();
    window.dispatchEvent(new CustomEvent('unitChanged', { detail: { unit } }));
  }, TOGGLE_DEBOUNCE_MS);
}

async function refresh() {
  if (isLoading) return;
  isLoading = true;
  const btn = document.getElementById('refresh-btn');
  btn.classList.add('spinning');
  btn.disabled = true;

  // Stop existing background timers before re-fetching
  stopBackgroundRefresh();

  DataCache.invalidate('ip_location');
  DataCache.invalidate('ip_address');
  _nearbyCache = null;
  _nearbyCacheTime = 0;
  if (userLocation) {
    const nearbyKey = `nearby_${DataCache._roundCoord(userLocation.lat)}_${DataCache._roundCoord(userLocation.lon)}`;
    DataCache.invalidate(nearbyKey);
  }

  await run();

  btn.classList.remove('spinning');
  btn.disabled = false;
  isLoading = false;
}
