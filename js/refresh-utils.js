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
  
  // Check if NWS is available for any current city
  let nwsAvailable = false;
  let omAvailable = true; // OM is always available
  
  if (weatherData.length > 0) {
    for (const city of weatherData) {
      const key = `${DataCache._roundCoord(city.latitude)},${DataCache._roundCoord(city.longitude)}`;
      // Check cache first
      if (key in _nwsAvailability && _nwsAvailability[key]) {
        nwsAvailable = true;
        break;
      }
      // Check uncached
      const avail = await checkNwsCoverage(city.latitude, city.longitude);
      _nwsAvailability[key] = avail;
      if (avail) {
        nwsAvailable = true;
        break;
      }
    }
  }
  
  // Update button state
  const isNws = currentSource === 'nws';
  const hasNws = nwsAvailable;
  
  btn.textContent = currentSource === 'open-meteo' ? 'OM' : 'NWS';
  btn.classList.toggle('nws', isNws && hasNws);
  
  // Disable button if neither source is available
  if (!hasNws && !omAvailable) {
    btn.disabled = true;
    btn.title = 'No data source available for this location';
    btn.classList.add('disabled');
  } else if (isNws && !hasNws) {
    // Currently on NWS but NWS not available - switch to OM
    currentSource = 'open-meteo';
    localStorage.setItem('hasW_source', 'open-meteo');
    btn.textContent = 'OM';
    btn.classList.remove('nws');
    btn.disabled = false;
    btn.title = 'NWS not available for this location';
    btn.classList.remove('disabled');
  } else if (!isNws && hasNws) {
    // Currently on OM and NWS is available - show toggle
    btn.disabled = false;
    btn.title = hasNws ? 'Switch to NWS' : 'NWS not available for this location';
    btn.classList.remove('disabled');
  } else {
    // Both available or neither available
    btn.disabled = false;
    btn.title = hasNws ? 'Switch to OM' : 'NWS not available for this location';
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

// Get the shortest remaining TTL for a city's data
function getCityShortestTTL(city) {
  let shortest = Infinity;
  if (currentSource === 'open-meteo') {
    // Weather and AQI share the same cache key but different types
    const weatherKey = weatherCacheKey(city.latitude, city.longitude);
    // Check weather cache
    const weatherEntry = localStorage.getItem(`hasw_cache_${weatherKey}`);
    if (weatherEntry) {
      const entry = JSON.parse(weatherEntry);
      const ttl = DataCache.TTL[entry.type] || DataCache.TTL.weather;
      const remaining = ttl - (Date.now() - entry.timestamp);
      if (remaining < shortest) shortest = remaining;
    }
    // Check AQI cache (same key but different type)
    const airEntry = localStorage.getItem(`hasw_cache_${weatherKey}`);
    if (airEntry) {
      const entry = JSON.parse(airEntry);
      const ttl = DataCache.TTL[entry.type] || DataCache.TTL.airQuality;
      const remaining = ttl - (Date.now() - entry.timestamp);
      if (remaining < shortest) shortest = remaining;
    }
  } else {
    // NWS: use the shortest TTL for all NWS data types
    const pointKey = nwsPointCacheKey(city.latitude, city.longitude);
    const pointEntry = localStorage.getItem(`hasw_cache_${pointKey}`);
    if (pointEntry) {
      const entry = JSON.parse(pointEntry);
      const ttl = DataCache.TTL.nwsPoint;
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
  
  // Use 80% of the shortest TTL as the refresh interval (with a minimum of 1 minute)
  const interval = Math.max(60 * 1000, shortestTTL * 0.8);
  
  _bgRefreshTimer = setInterval(() => {
    if (isLoading) return;
    if (!userLocation) return;
    
    // Only refresh if we have weather data
    if (weatherData.length === 0) return;
    
    // Invalidate all caches for the current source
    if (currentSource === 'open-meteo') {
      // Invalidate weather cache (weather and AQI share the same key but different types)
      for (const city of weatherData) {
        const ck = weatherCacheKey(city.latitude, city.longitude);
        DataCache.invalidate(ck);
      }
    } else {
      // NWS: invalidate all NWS caches
      for (const city of weatherData) {
        const ck = nwsPointCacheKey(city.latitude, city.longitude);
        DataCache.invalidate(ck);
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
