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
async function getLocation() {
  if (userLocation) return userLocation;

  const cachedIP = DataCache.get('ip_location', 'ipLocation');
  if (cachedIP) return cachedIP;

  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: GEOLOCATION_TIMEOUT_MS });
    });
    const { latitude, longitude } = pos.coords;
    return { lat: latitude, lon: longitude };
  } catch {
    try {
      const res = await fetch(IP_API_URL);
      const data = await res.json();
      const lat = parseFloat(data.loc?.split(',')[0] ?? data.lat);
      const lon = parseFloat(data.loc?.split(',')[1] ?? data.lon);
      const loc = { lat, lon };
      DataCache.set('ip_location', loc, 'ipLocation');
      return loc;
    } catch {
      return { lat: DEFAULT_LAT, lon: DEFAULT_LON };
    }
  }
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
      return entry;
    }
  }
  const promise = (async () => {
    try {
      const data = await (await fetch(`${NWS_API}/points/${lat},${lon}`)).json();
      const props = data?.properties || {};
      return !!(props.gridId || props.cwa) && !!props.gridX && !!props.gridY;
    } catch {
      return false;
    }
  })();
  _nwsBoundsCache[key] = promise;
  const result = await promise;
  _nwsBoundsCache[key] = { value: result, expiresAt: Date.now() + NWS_BOUNDS_CACHE_TTL_MS };
  return result;
}

// — Background Refresh —
let _bgRefreshTimer = null;

function getCityShortestTTL(city) {
  let shortest = Infinity;
  const lat = city.latitude;
  const lon = city.longitude;

  const consolidatedKey = weatherAqiCacheKey(lat, lon);
  const consolidatedEntry = localStorage.getItem(`hasw_cache_${consolidatedKey}`);
  if (consolidatedEntry) {
    const entry = JSON.parse(consolidatedEntry);
    const ttl = DataCache.TTL[entry.type] || DataCache.TTL.weather;
    const remaining = ttl - (Date.now() - entry.timestamp);
    if (remaining < shortest) shortest = remaining;
  }

  const weatherKey = weatherCacheKey(lat, lon);
  const weatherEntry = localStorage.getItem(`hasw_cache_${weatherKey}`);
  if (weatherEntry && !consolidatedEntry) {
    const entry = JSON.parse(weatherEntry);
    const ttl = DataCache.TTL[entry.type] || DataCache.TTL.weather;
    const remaining = ttl - (Date.now() - entry.timestamp);
    if (remaining < shortest) shortest = remaining;
  }

  const aqiKey = aqiCacheKey(lat, lon);
  const airEntry = localStorage.getItem(`hasw_cache_${aqiKey}`);
  if (airEntry && !consolidatedEntry) {
    const entry = JSON.parse(airEntry);
    const ttl = DataCache.TTL[entry.type] || DataCache.TTL.airQuality;
    const remaining = ttl - (Date.now() - entry.timestamp);
    if (remaining < shortest) shortest = remaining;
  }

  const nwsPointKey = nwsPointCacheKey(lat, lon);
  const nwsEntry = localStorage.getItem(`hasw_cache_${nwsPointKey}`);
  if (nwsEntry) {
    const entry = JSON.parse(nwsEntry);
    const ttl = DataCache.TTL[entry.type] || DataCache.TTL.nwsPoint;
    const remaining = ttl - (Date.now() - entry.timestamp);
    if (remaining < shortest) shortest = remaining;
  }

  return shortest === Infinity ? MIN_BACKGROUND_REFRESH_MS : shortest;
}

function startBackgroundRefresh() {
  if (_bgRefreshTimer) clearInterval(_bgRefreshTimer);

  let shortestTTL = Infinity;
  if (weatherData.length > 0) {
    for (const city of weatherData) {
      const ttl = getCityShortestTTL(city);
      if (ttl < shortestTTL) shortestTTL = ttl;
    }
  }

  const interval = Math.max(MIN_BACKGROUND_REFRESH_MS, shortestTTL * BACKGROUND_REFRESH_FRACTION);

  _bgRefreshTimer = setInterval(() => {
    if (isLoading || !userLocation || weatherData.length === 0) return;

    for (const city of weatherData) {
      DataCache.invalidate(weatherAqiCacheKey(city.latitude, city.longitude));
      DataCache.invalidate(weatherCacheKey(city.latitude, city.longitude));
      DataCache.invalidate(aqiCacheKey(city.latitude, city.longitude));
    }

    run();
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

  DataCache.invalidate('ip_location');
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
