// ===== SOURCE TOGGLE =====
// Track NWS availability per location
let _nwsAvailability = {}; // { lat,lon: boolean }

function isNwsAvailableForLocation(lat, lon) {
  const key = `${DataCache._roundCoord(lat)},${DataCache._roundCoord(lon)}`;
  return !!_nwsAvailability[key];
}

// Update source toggle UI to reflect NWS availability
async function updateSourceToggleUI() {
  const btn = document.getElementById('source-toggle');
  if (!btn) return;
  
  // Check if ALL current cities have NWS coverage (not just any)
  let allCitiesHaveNws = true;
  let hasAnyCityWithNws = false;
  
  if (weatherData.length > 0) {
    for (const city of weatherData) {
      const key = `${DataCache._roundCoord(city.latitude)},${DataCache._roundCoord(city.longitude)}`;
      // Check cache first
      let nwsAvail = false;
      if (key in _nwsAvailability) {
        nwsAvail = _nwsAvailability[key];
      } else {
        // Check uncached
        nwsAvail = await checkNwsCoverage(city.latitude, city.longitude);
        _nwsAvailability[key] = nwsAvail;
      }
      
      if (nwsAvail) {
        hasAnyCityWithNws = true;
      } else {
        allCitiesHaveNws = false;
      }
    }
  }
  
  // Update button state - only enable toggle if ALL cities have NWS coverage
  const isNws = currentSource === 'nws';
  
  btn.textContent = currentSource === 'open-meteo' ? 'OM' : 'NWS';
  btn.classList.toggle('nws', isNws && allCitiesHaveNws);
  
  // Disable button if not ALL cities have NWS coverage (toggle only works when all cities are in coverage)
  if (!allCitiesHaveNws) {
    btn.disabled = true;
    btn.title = 'Some cities outside NWS coverage — OM active';
    btn.classList.add('disabled');
    // Auto-switch to OM if currently on NWS but not all cities have NWS
    if (isNws && !allCitiesHaveNws) {
      currentSource = 'open-meteo';
      localStorage.setItem('hasW_source', 'open-meteo');
      btn.textContent = 'OM';
      btn.classList.remove('nws');
      btn.disabled = false;
      btn.title = 'Some cities outside NWS coverage — OM active';
      btn.classList.remove('disabled');
    }
  } else if (isNws && hasAnyCityWithNws) {
    // Currently on NWS and at least one city has NWS - show toggle enabled
    btn.disabled = false;
    btn.title = 'Switch to OM';
    btn.classList.remove('disabled');
  } else {
    // On OM, some cities have NWS - allow toggle
    btn.disabled = false;
    btn.title = hasAnyCityWithNws ? 'Switch to NWS' : 'No NWS coverage available';
    btn.classList.remove('disabled');
  }
}

function toggleSource() {
  const btn = document.getElementById('source-toggle');
  if (btn && btn.disabled) return;
  
  // Save preference
  localStorage.setItem('hasW_source', currentSource === 'open-meteo' ? 'nws' : 'open-meteo');
  currentSource = currentSource === 'open-meteo' ? 'nws' : 'open-meteo';
  
  // Update background refresh timers
  startBackgroundRefresh();
  
  // Re-fetch data with new source
  refresh();
}

// Restore saved source preference
function restoreSourcePreference() {
  const saved = localStorage.getItem('hasW_source');
  if (saved === 'nws') {
    currentSource = 'nws';
  }
}

// ===== BACKGROUND REFRESH =====
let _bgRefreshTimer = null;

// NWS minimum background refresh interval (10 minutes) — prevents 429s
const NWS_MIN_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

// Get the shortest remaining TTL for a city's data
function getCityShortestTTL(city) {
  let shortest = Infinity;
  if (currentSource === 'open-meteo') {
    // Weather and AQI have separate cache keys now
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
    // Check AQI cache (separate key)
    const airEntry = localStorage.getItem(`hasw_cache_${aqiKey}`);
    if (airEntry) {
      const entry = JSON.parse(airEntry);
      const ttl = DataCache.TTL[entry.type] || DataCache.TTL.airQuality;
      const remaining = ttl - (Date.now() - entry.timestamp);
      if (remaining < shortest) shortest = remaining;
    }
  } else {
    // NWS: check ALL NWS cache keys for this city
    const nwsCacheKeys = [
      nwsPointCacheKey(city.latitude, city.longitude),
      nwsGridCacheKey('DTX', 0, 0), // placeholder — check the cityData key instead
    ];
    const nwsCityCacheKey = nwsCacheKey(city.latitude, city.longitude);

    // Check point cache
    const pointEntry = localStorage.getItem(`hasw_cache_${nwsCacheKeys[0]}`);
    if (pointEntry) {
      const entry = JSON.parse(pointEntry);
      const ttl = DataCache.TTL[entry.type] || DataCache.TTL.nwsPoint;
      const remaining = ttl - (Date.now() - entry.timestamp);
      if (remaining < shortest) shortest = remaining;
    }

    // Check cityData cache (the actual NWS city data)
    const cityDataEntry = localStorage.getItem(`hasw_cache_${nwsCityCacheKey}`);
    if (cityDataEntry) {
      const entry = JSON.parse(cityDataEntry);
      const ttl = DataCache.TTL[entry.type] || DataCache.TTL.nwsCityData;
      const remaining = ttl - (Date.now() - entry.timestamp);
      if (remaining < shortest) shortest = remaining;
    }
  }
  return shortest === Infinity ? 10 * 60 * 1000 : shortest; // Default to 10 minutes if no cache
}

function startBackgroundRefresh() {
  // Clear existing timer
  if (_bgRefreshTimer) clearInterval(_bgRefreshTimer);
  
  // Calculate the shortest remaining TTL across all cities
  let shortestTTL = Infinity;
  if (weatherData.length > 0) {
    for (const city of weatherData) {
      const ttl = getCityShortestTTL(city);
      if (ttl < shortestTTL) shortestTTL = ttl;
    }
  }
  
  // For NWS: use a fixed 10-minute interval (never faster)
  // For OM: use 80% of the shortest TTL as the refresh interval (with a minimum of 1 minute)
  let interval;
  if (currentSource === 'nws') {
    interval = NWS_MIN_REFRESH_INTERVAL_MS;
  } else {
    interval = Math.max(60 * 1000, shortestTTL * 0.8);
  }
  
  _bgRefreshTimer = setInterval(() => {
    if (isLoading) return;
    if (!userLocation) return;
    
    // Only refresh if we have weather data
    if (weatherData.length === 0) return;
    
    // Invalidate all caches for the current source
    if (currentSource === 'open-meteo') {
      // Invalidate both weather and AQI caches (separate keys)
      for (const city of weatherData) {
        const weatherCk = weatherCacheKey(city.latitude, city.longitude);
        const aqiCk = aqiCacheKey(city.latitude, city.longitude);
        DataCache.invalidate(weatherCk);
        DataCache.invalidate(aqiCk);
      }
    } else {
      // NWS: invalidate all NWS caches for this city
      for (const city of weatherData) {
        const ck = nwsPointCacheKey(city.latitude, city.longitude);
        DataCache.invalidate(ck);
        const cityCk = nwsCacheKey(city.latitude, city.longitude);
        DataCache.invalidate(cityCk);
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

// ===== MAIN RUN =====
