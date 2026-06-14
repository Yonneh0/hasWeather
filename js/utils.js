// ===== UTILITY FUNCTIONS =====
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

function haversine(lat1, lon1, lat2, lon2) {
  const R = EARTH_RADIUS_MI;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearing(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
  let b = Math.atan2(y, x) * 180 / Math.PI;
  return (b + 360) % 360;
}

function bearingToCompass(deg) {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

function aqiLabel(aqi) {
  if (aqi === null || aqi === undefined || aqi === false || aqi !== aqi) return { label: '—', cls: '' };
  if (aqi <= 50) return { label: 'Good', cls: 'aqi-good' };
  if (aqi <= 100) return { label: 'Moderate', cls: 'aqi-moderate' };
  return { label: 'Unhealthy', cls: 'aqi-unhealthy' };
}

// ===== WIND COMPASS =====
function getWindCompass(deg) {
  const arrow = ['⬆', '↗', '➡', '↘', '⬇', '↙', '⬅', '↖'][Math.round(deg / 45) % 8];
  return `<span class="wind-compass"><span class="compass-dial">${arrow}</span> ${bearingToCompass(deg)} ${deg}°</span>`;
}

// ===== DAY/NIGHT CHECK =====
function isDaytime(hour, sunrise, sunset) {
  return hour >= sunrise && hour < sunset;
}

// ===== IP-BASED LOCATION API CLIENT =====
// Provides fallback geolocation via ipinfo.io.

// ===== ENDPOINT =====
const IP_API = 'https://ipinfo.io/json';

// ===== GET LOCATION (Browser Geolocation + IP Fallback) =====
async function getLocation() {
  // Check in-memory cache
  if (userLocation) return userLocation;

  // Check localStorage cache for IP geolocation
  const cachedIP = DataCache.get('ip_location', 'ipLocation');
  if (cachedIP) {
    return cachedIP;
  }

  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: GEOLOCATION_TIMEOUT_MS });
    });
    const { latitude, longitude } = pos.coords;
    const loc = { lat: latitude, lon: longitude };
    // Cache browser geolocation briefly (it's not reliable to cache long-term)
    return loc;
  } catch {
    try {
      const res = await fetch(IP_API);
      const data = await res.json();
      const lat = parseFloat(data.loc?.split(',')[0] ?? data.lat);
      const lon = parseFloat(data.loc?.split(',')[1] ?? data.lon);
      const loc = { lat, lon };
      // Cache IP location for 24 hours
      DataCache.set('ip_location', loc, 'ipLocation');
      return loc;
    } catch {
      return { lat: 43.41947, lon: -83.95081 };
    }
  }
}

// ===== NWS BOUNDS CHECK =====
// Track NWS bounds availability per city (checked during initial fetch)
const _nwsBoundsCache = {}; // { lat,lon: Promise<boolean> | { value: boolean, expiresAt: number } }
const NWS_BOUNDS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour TTL

async function isNwsBoundsAvailable(lat, lon) {
  const key = `${DataCache._roundCoord(lat)},${DataCache._roundCoord(lon)}`;
  if (key in _nwsBoundsCache) {
    const entry = _nwsBoundsCache[key];
    // If it's a TTL entry, check expiration
    if (typeof entry === 'object' && !entry.then && 'value' in entry) {
      if (Date.now() < entry.expiresAt) return entry.value;
      delete _nwsBoundsCache[key]; // Expired — fall through to re-check
    } else {
      // It's a pending Promise — return it (concurrent request dedup)
      return entry;
    }
  }
  const promise = (async () => {
    try {
      const url = `${NWS_API}/points/${lat},${lon}`;
      // Use rate-limited NWS fetch to avoid 429s during bulk checks
      await _nwsRateLimiter.waitForSlot();
      const data = await (await fetch(url)).json();
      const props = data?.properties || {};
      return !!(props.gridId || props.cwa) && !!props.gridX && !!props.gridY;
    } catch {
      return false;
    }
  })();
  // Cache as Promise while pending
  _nwsBoundsCache[key] = promise;
  const result = await promise;
  // Replace with TTL entry after resolution
  _nwsBoundsCache[key] = { value: result, expiresAt: Date.now() + NWS_BOUNDS_CACHE_TTL_MS };
  return result;
}

// ===== BACKGROUND REFRESH =====
let _bgRefreshTimer = null;

// Get the shortest remaining TTL across all cities' weather + AQI caches
function getCityShortestTTL(city) {
  let shortest = Infinity;
  const weatherKey = weatherCacheKey(city.latitude, city.longitude);
  const aqiKey = aqiCacheKey(city.latitude, city.longitude);
  
  // Check weather cache
  const weatherEntry = localStorage.getItem(`hasw_cache_${weatherKey}`);
  if (weatherEntry) {
    const entry = JSON.parse(weatherEntry);
    const ttl = DataCache.TTL[entry.type] || DataCache.TTL.weather;
    const remaining = ttl - (Date.now() - entry.timestamp);
    if (remaining < shortest) shortest = remaining;
  }
  
  // Check AQI cache
  const airEntry = localStorage.getItem(`hasw_cache_${aqiKey}`);
  if (airEntry) {
    const entry = JSON.parse(airEntry);
    const ttl = DataCache.TTL[entry.type] || DataCache.TTL.airQuality;
    const remaining = ttl - (Date.now() - entry.timestamp);
    if (remaining < shortest) shortest = remaining;
  }
  
  // Check NWS cache — only nwsPoint entries matter (they have the longest TTL among NWS types)
  const nwsPointKey = nwsPointCacheKey(city.latitude, city.longitude);
  const nwsEntry = localStorage.getItem(`hasw_cache_${nwsPointKey}`);
  if (nwsEntry) {
    const entry = JSON.parse(nwsEntry);
    const ttl = DataCache.TTL[entry.type] || DataCache.TTL.nwsPoint;
    const remaining = ttl - (Date.now() - entry.timestamp);
    if (remaining < shortest) shortest = remaining;
  }
  
  // Default to 15 minutes if no cache — NWS rate limits at 1 req/sec, so use a conservative default
  return shortest === Infinity ? 15 * 60 * 1000 : shortest;
}

function startBackgroundRefresh() {
  // Clear existing timer
  if (_bgRefreshTimer) clearInterval(_bgRefreshTimer);
  
  // Calculate the shortest remaining TTL across all cities and use 80% of it as the refresh interval (with a minimum of 1 minute)
  let shortestTTL = Infinity;
  if (weatherData.length > 0) {
    for (const city of weatherData) {
      const ttl = getCityShortestTTL(city);
      if (ttl < shortestTTL) shortestTTL = ttl;
    }
  }
  
  // Use 80% of the shortest TTL as the refresh interval, with a minimum of 1 minute
  const interval = Math.max(60 * 1000, shortestTTL * 0.8);
  
  _bgRefreshTimer = setInterval(() => {
    if (isLoading) return;
    if (!userLocation) return;
    
    // Only refresh if we have weather data
    if (weatherData.length === 0) return;
    
    // Invalidate OM caches for all cities (NWS is always fetched where available)
    for (const city of weatherData) {
      const weatherCk = weatherCacheKey(city.latitude, city.longitude);
      const aqiCk = aqiCacheKey(city.latitude, city.longitude);
      DataCache.invalidate(weatherCk);
      DataCache.invalidate(aqiCk);
    }
    
    // Re-fetch data silently
    run();
  }, interval);
}

// ===== REFRESH & UNIT TOGGLE =====
function toggleUnit() {
  if (_toggleDebounceTimer) return;
  _toggleDebounceTimer = setTimeout(() => {
    _toggleDebounceTimer = null;
    unit = unit === 'F' ? 'C' : 'F';
    const btn = document.getElementById('unit-toggle');
    if (btn) btn.textContent = `°${unit}`;
    renderAll();
  }, TOGGLE_DEBOUNCE_MS);
}

async function refresh() {
  if (isLoading) return;
  isLoading = true;
  const btn = document.getElementById('refresh-btn');
  btn.classList.add('spinning');
  btn.disabled = true;

  // Clear weather, nearby, and ip caches on refresh
  DataCache.invalidate('ip_location');
  _nearbyCache = null;
  _nearbyCacheTime = 0;
  // Also invalidate nearby DataCache entry
  if (userLocation) {
    const nearbyKey = `nearby_${DataCache._roundCoord(userLocation.lat)}_${DataCache._roundCoord(userLocation.lon)}`;
    DataCache.invalidate(nearbyKey);
  }

  await run();

  btn.classList.remove('spinning');
  btn.disabled = false;
  isLoading = false;
}