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
      showLocationPrompt();
      return { lat: 43.41947, lon: -83.95081 };
    }
  }
}

// ===== LOCATION PROMPT =====
function showLocationPrompt() {
  document.getElementById('location-prompt').classList.remove('hidden');
}

function hideLocationPrompt() {
  document.getElementById('location-prompt').classList.add('hidden');
}

async function handleCitySearch() {
  const input = document.getElementById('city-input');
  const city = input.value.trim();
  if (!city) return;

  hideLocationPrompt();
  input.value = '';

  try {
    const url = `${NOMINATIM}?q=${encodeURIComponent(city)}&format=jsonv2&limit=1`;
    const res = await fetch(url);
    const data = await res.json();
    if (data?.length > 0) {
      userLocation = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
      document.getElementById('user-location').textContent = `\u{1F4CD} ${userLocation.lat.toFixed(2)}\u00B0N, ${Math.abs(userLocation.lon).toFixed(2)}\u00B0W`;
      await run();
    }
  } catch {
    // silently ignore search failures
  }
}

// ===== NWS BOUNDS CHECK =====
// Track NWS bounds availability per city (checked lazily when rendering card)
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

// ===== PER-CITY NWS TOGGLE =====
// Per-city toggle allows users to switch individual city cards from Open-Meteo (OM) base data
// to NWS-enhanced data. The toggle state is persisted to localStorage for cross-session
// persistence, so user preferences are remembered across app reloads.
//
// Note: _nwsActive state and saveNwsActiveState() are declared in cache.js as global state.

// In-flight guard: prevent concurrent toggles for the same city (Fix #2)
const _nwsToggleInFlight = {}; // { placeId: Promise | null }

/**
 * Toggle NWS enhancement for a city card.
 * 
 * When the user clicks the NWS toggle button (⚡) on a city card, this function:
 * 1. If NWS is currently active: deactivates and switches to OM display (no network traffic)
 * 2. If NWS is not active: checks geographic bounds, cached data, and NWS API availability
 *    before attempting to fetch from the NWS API
 * 
 * Visual feedback is provided for all outcomes: green (success), red (error), amber (outside bounds).
 * 
 * @param {string} placeId - The unique place_id of the city card
 */
async function toggleCityNws(placeId) {
   // Show processing feedback immediately before checking in-flight guard
   showNwsToggleFeedback(placeId, 'processing');

   // Prevent concurrent toggles for the same city (Fix #2)
   if (_nwsToggleInFlight[placeId]) return;

   const city = weatherData.find(c => c.place_id === placeId);
   if (!city) return;

   if (_nwsActive[placeId]) {
     // Deactivate — just swap to OM display, no network traffic
     _nwsActive[placeId] = false;
     city.nwsActive = false;
     city.source = 'open-meteo';
     saveNwsActiveState();
     renderAll();
     return;
   }

   // Activate — check geographic bounds first (no API call for obvious non-NWS cities)
   if (city.latitude < 17 || city.latitude > 71 || city.longitude < -170 || city.longitude > -65) {
     showNwsToggleFeedback(placeId, 'bounds');
     return;
   }

    // Check for cached NWS data first (avoid redundant API calls)
    const ck = nwsCacheKey(city.latitude, city.longitude);
    const cachedNws = DataCache.get(ck, 'nwsCityData');
    if (cachedNws && cachedNws.weather) {
      // Merge cached NWS data into the city object so toggle actually shows NWS data (Fix #5)
      const nwsCurrent = cachedNws.weather.current || {};
      const nwsHourly = cachedNws.weather.hourly || {};
      // Preserve OM precipitation since NWS hourly doesn't have it
      const omHourly = city.weather?.hourly || {};
      city.source = 'nws';
      city.nwsActive = true;
      city.weather = {
        current: { ...city.weather?.current, ...nwsCurrent },
        hourly: {
          time: nwsHourly.time || omHourly.time || [],
          temperature: nwsHourly.temperature ?? omHourly.temperature_2m ?? [],
          weather_code: nwsHourly.weather_code ?? omHourly.weather_code ?? [],
          precipitation: omHourly.precipitation ?? omHourly.precipitation_mm ?? [],
          wind_speed_10m: nwsHourly.wind_speed_10m ?? omHourly.wind_speed_10m ?? [],
          wind_direction_10m: nwsHourly.wind_direction_10m ?? omHourly.wind_direction_10m ?? [],
          relative_humidity_2m: nwsHourly.relative_humidity_2m ?? omHourly.relative_humidity_2m ?? [],
        },
      };
      if (cachedNws.aqi) city.aqi = cachedNws.aqi;
      _nwsActive[placeId] = true;
      saveNwsActiveState();
      renderAll();
      showNwsToggleFeedback(placeId, 'success'); // Fix #14: Show feedback on cache hit activation
      return;
    }

   // Check NWS bounds — use cached result if available
   const hasNws = await isNwsBoundsAvailable(city.latitude, city.longitude);
   if (!hasNws) {
     showNwsToggleFeedback(placeId, 'bounds');
     return;
   }

   // Cache the bounds result on the city object
   city.nwsBounds = true;

   // Set in-flight guard — store the actual fetch promise so concurrent toggles can share it
   _nwsToggleInFlight[placeId] = (async () => {
     try {
       // Fetch from NWS API
       const nwsData = await fetchForCity(city.latitude, city.longitude);
      if (!nwsData) {
        // NWS returned no data — deactivate toggle with visual feedback
        _nwsActive[placeId] = false;
        city.nwsActive = false;
        city.source = 'open-meteo';
        saveNwsActiveState();
        renderAll();
        showNwsToggleFeedback(placeId, 'error');
        return;
      }
      // Validate that NWS data has a valid current condition (partial data = not usable)
      if (!nwsData.current) {
        _nwsActive[placeId] = false;
        city.nwsActive = false;
        city.source = 'open-meteo';
        saveNwsActiveState();
        renderAll();
        // Show bounds-style feedback for incomplete data (not a full error — just insufficient data)
        showNwsToggleFeedback(placeId, 'bounds');
        return;
      }
      DataCache.set(ck, nwsData, 'nwsCityData');
      _nwsActive[placeId] = true;
      city.nwsActive = true;
      city.source = 'nws';
      saveNwsActiveState();
      renderAll();
      showNwsToggleFeedback(placeId, 'success');
    } catch (err) {
      // NWS fetch failed — show visual feedback and deactivate toggle
      _nwsActive[placeId] = false;
      city.nwsActive = false;
      city.source = 'open-meteo';
      saveNwsActiveState();
      renderAll();
      showNwsToggleFeedback(placeId, 'error');
      console.error('[NWS] Failed to fetch data for city:', placeId, err);
    } finally {
      // Clear in-flight guard (Fix #2)
      delete _nwsToggleInFlight[placeId];
    }
   })();

   await _nwsToggleInFlight[placeId];
 }

// ===== NWS TOGGLE VISUAL FEEDBACK =====

// Visual feedback types: 'success' (green), 'error' (red), 'bounds' (amber - city outside NWS bounds), 'processing' (blue - already toggling)
const FEEDBACK_STYLES = Object.freeze({ // Fix #12: Freeze to prevent accidental mutation
  success:    { bg: 'rgba(70, 200, 100, 0.5)', border: 'rgba(70, 200, 100, 0.6)', text: '#fff', title: 'NWS enhancement active!' },
  error:      { bg: 'rgba(200, 70, 70, 0.5)', border: 'rgba(200, 70, 70, 0.6)', text: '#fff', title: 'NWS enhancement unavailable' },
  bounds:     { bg: 'rgba(200, 180, 50, 0.5)', border: 'rgba(200, 180, 50, 0.6)', text: '#fff', title: 'Outside NWS coverage area' },
  processing: { bg: 'rgba(70, 130, 255, 0.5)', border: 'rgba(70, 130, 255, 0.6)', text: '#fff', title: 'Processing toggle...' },
});

// Track pending feedback timeouts to prevent timing conflicts (Fix #12)
const _feedbackTimeouts = {}; // { placeId: timeoutId }

function showNwsToggleFeedback(placeId, type) {
  const btn = document.querySelector(`.nws-toggle-btn[data-placeid="${CSS.escape(String(placeId))}"]`);
  if (!btn) return;
  
  // Clear any pending feedback for this city (Fix #12: prevent timing conflict)
  if (_feedbackTimeouts[placeId]) {
    clearTimeout(_feedbackTimeouts[placeId]);
    delete _feedbackTimeouts[placeId];
  }
  
  const style = FEEDBACK_STYLES[type];
  if (!style) return;
  
  // Set inline styles to override CSS class defaults
  btn.style.background = style.bg;
  btn.style.borderColor = style.border;
  btn.style.color = style.text;
  btn.title = style.title;
  
  _feedbackTimeouts[placeId] = setTimeout(() => {
    // Remove inline styles to restore CSS class-based defaults
    btn.style.background = '';
    btn.style.borderColor = '';
    btn.style.color = '';
    btn.title = 'Toggle NWS enhancement'; // Fix #13: Restore default title instead of removing it
    delete _feedbackTimeouts[placeId];
  }, 1500);
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
  
  // Check NWS cache (Fix #16: Include NWS data in TTL calculation)
  const nwsCityKey = nwsCacheKey(city.latitude, city.longitude);
  const nwsEntry = localStorage.getItem(`hasw_cache_${nwsCityKey}`);
  if (nwsEntry) {
    const entry = JSON.parse(nwsEntry);
    const ttl = DataCache.TTL[entry.type] || DataCache.TTL.nwsCityData;
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
    
    // Invalidate caches for all cities (conditional by source type to avoid unnecessary ops)
    for (const city of weatherData) {
      if (city.source === 'nws') {
        // NWS-only cities — only invalidate NWS cache
        const nwsCityCk = nwsCacheKey(city.latitude, city.longitude);
        DataCache.invalidate(nwsCityCk);
      } else {
        // OM cities — invalidate OM caches and any NWS cache that might exist (for cross-source)
        const weatherCk = weatherCacheKey(city.latitude, city.longitude);
        const aqiCk = aqiCacheKey(city.latitude, city.longitude);
        const nwsCityCk = nwsCacheKey(city.latitude, city.longitude);
        DataCache.invalidate(weatherCk);
        DataCache.invalidate(aqiCk);
        DataCache.invalidate(nwsCityCk);
      }
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
  _allNearbyCities = [];
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