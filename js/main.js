// ===== STATE =====
let userLocation = null;
let unit = 'F';
let weatherData = [];
let isLoading = false;
let _nearbyCache = null;
let _nearbyCacheTime = 0;
let _toggleDebounceTimer = null;
let _chartResizeTimer = null;
let _maxCities = parseInt(localStorage.getItem('hasW_maxCities') ?? '6', 10);

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  initParticles();

  const unitBtn = document.getElementById('unit-toggle');
  const refreshBtn = document.getElementById('refresh-btn');
  const gameBtn = document.getElementById('game-btn');
  const favBtn = document.getElementById('fav-btn');
  const favDropdown = document.getElementById('fav-dropdown');
  const favSearch = document.getElementById('fav-search');
  const favMaxCities = document.getElementById('fav-max-cities');
  const favMaxVal = document.getElementById('fav-max-val');
  const searchBtn = document.getElementById('search-btn');
  const cityInput = document.getElementById('city-input');

  if (unitBtn) unitBtn.addEventListener('click', toggleUnit);
  if (refreshBtn) refreshBtn.addEventListener('click', refresh);
  if (gameBtn) gameBtn.addEventListener('click', toggleGame);
  if (searchBtn) searchBtn.addEventListener('click', handleCitySearch);
  if (cityInput) {
    cityInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') handleCitySearch();
    });
  }

  // Favorites button toggle
  if (favBtn && favDropdown) {
    favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = favDropdown.classList.toggle('open');
      if (isOpen) {
        // Refresh dropdown data on open
        _allNearbyCities = [];
        favSearch.value = '';
        favSearch.focus();
        renderFavDropdown(null);
        // Position dropdown to stay on screen
        requestAnimationFrame(() => {
          const rect = favDropdown.getBoundingClientRect();
          const btnRect = favBtn.getBoundingClientRect();
          // Reset any previous positioning
          favDropdown.style.left = '0';
          favDropdown.style.right = 'auto';
          favDropdown.style.top = '';
          favDropdown.style.bottom = '';
          // Check right edge overflow
          if (rect.right > window.innerWidth) {
            favDropdown.style.left = 'auto';
            favDropdown.style.right = '0';
          }
          // Check bottom edge overflow
          if (rect.bottom > window.innerHeight) {
            favDropdown.style.top = 'auto';
            favDropdown.style.bottom = `calc(100% + 0.5rem)`;
          }
        });
      }
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!favDropdown.contains(e.target) && e.target !== favBtn) {
        favDropdown.classList.remove('open');
      }
    });

    // Prevent dropdown clicks from closing
    favDropdown.addEventListener('click', (e) => e.stopPropagation());
  }

  // Favorites search with debounce
  let _searchDebounce = null;
  if (favSearch) {
    favSearch.addEventListener('input', () => {
      clearTimeout(_searchDebounce);
      _searchDebounce = setTimeout(() => {
        const q = favSearch.value.trim();
        renderFavDropdown(q || null);
      }, 350);
    });
  }

  // Max cities setting — realtime apply
  if (favMaxCities) {
    favMaxCities.value = _maxCities;
    if (favMaxVal) favMaxVal.textContent = _maxCities;
    favMaxCities.addEventListener('input', async () => {
      _maxCities = parseInt(favMaxCities.value, 10);
      localStorage.setItem('hasW_maxCities', _maxCities);
      if (favMaxVal) favMaxVal.textContent = _maxCities;
      // Re-fetch nearby cities and re-render
      _nearbyCache = null;
      _nearbyCacheTime = 0;
      _allNearbyCities = [];
      // Clear DataCache for nearby cities so fresh fetch happens
      if (userLocation) {
        const nearbyKey = `nearby_${DataCache._roundCoord(userLocation.lat)}_${DataCache._roundCoord(userLocation.lon)}`;
        DataCache.invalidate(nearbyKey);
      }
      if (!isLoading) {
        isLoading = true;
        const btn = document.getElementById('refresh-btn');
        if (btn) { btn.classList.add('spinning'); btn.disabled = true; }
        await run();
        if (btn) { btn.classList.remove('spinning'); btn.disabled = false; }
        isLoading = false;
      }
    });
  }

  // Chart redraw on resize
  window.addEventListener('resize', () => {
    clearTimeout(_chartResizeTimer);
    _chartResizeTimer = setTimeout(() => drawAllCharts(), CHART_RESIZE_DEBOUNCE_MS);
  });

   // Debug location preset buttons
   document.querySelectorAll('.debug-loc-btn').forEach(btn => {
     btn.addEventListener('click', async () => {
       const lat = parseFloat(btn.dataset.lat);
       const lon = parseFloat(btn.dataset.lon);
       const name = btn.dataset.name;
       userLocation = { lat, lon };
       const locEl = document.getElementById('user-location');
       if (locEl) {
         const latDir = lat >= 0 ? 'N' : 'S';
         const lonDir = lon >= 0 ? 'E' : 'W';
         locEl.textContent = `\u{1F4CD} ${Math.abs(lat).toFixed(2)}\u00B0${latDir}, ${Math.abs(lon).toFixed(2)}\u00B0${lonDir} (${name})`;
       }
       // Clear nearby cache so fresh results are fetched for new location
       _nearbyCache = null;
       _nearbyCacheTime = 0;
       await run();
     });
   });

   // Toggle network outage retry when pressing the refresh button while offline
   // (already handled above in checkNetwork)

   // Start the app with network check
   checkNetworkAndRun(run);
 });

// ===== MAIN RUN =====
async function run() {
  if (!userLocation) {
    userLocation = await getLocation();
  }

  const locEl = document.getElementById('user-location');
  if (locEl) locEl.textContent = `\u{1F4CD} ${userLocation.lat.toFixed(2)}\u00B0N, ${Math.abs(userLocation.lon).toFixed(2)}\u00B0W`;

  _nearbyCache = null;
  _nearbyCacheTime = 0;

  // Load nearby cities + favorites, then render both
  const nearby = await findNearbyCities(userLocation.lat, userLocation.lon);
  const favAll = FavoritesManager.getAll();

  // Combine: nearby cities first, then favorites that aren't already in nearby
  // Use BOTH place_id AND coordinate proximity matching to prevent duplicates
  const allCities = [...nearby];
  const seenPlaceIds = new Set(nearby.map(c => String(c.place_id)));
  const seenCoords = new Set(nearby.map(c => {
    const lat = c.latitude != null ? DataCache._roundCoord(c.latitude) : null;
    const lon = c.longitude != null ? DataCache._roundCoord(c.longitude) : null;
    return lat != null && lon != null ? `${lat},${lon}` : null;
  }).filter(Boolean));

  for (const fav of favAll) {
    const favPlaceId = String(fav.place_id);
    const favLat = fav.latitude != null ? DataCache._roundCoord(fav.latitude) : null;
    const favLon = fav.longitude != null ? DataCache._roundCoord(fav.longitude) : null;

    // Skip if place_id already seen (same physical city from same source)
    if (seenPlaceIds.has(favPlaceId)) continue;

    // Skip if coordinate proximity match (same physical city from different source)
    const favCoordKey = favLat != null && favLon != null ? `${favLat},${favLon}` : null;
    if (favCoordKey != null) {
      let isCoordDuplicate = false;
      for (const existingCoord of seenCoords) {
        const [exLat, exLon] = existingCoord.split(',').map(Number);
        // 0.01° tolerance (≈1km)
        if (Math.abs(favLat - exLat) < 0.01 && Math.abs(favLon - exLon) < 0.01) {
          isCoordDuplicate = true;
          break;
        }
      }
      if (isCoordDuplicate) continue;
    }

    allCities.push({
      place_id: favPlaceId,
      name: fav.name,
      state: fav.state,
      latitude: fav.latitude,
      longitude: fav.longitude,
      distance: haversine(userLocation.lat, userLocation.lon, fav.latitude, fav.longitude),
      bearing: bearing(userLocation.lat, userLocation.lon, fav.latitude, fav.longitude),
    });
    seenPlaceIds.add(favPlaceId);
    if (favCoordKey != null) seenCoords.add(favCoordKey);
  }

  // Sort all cities by distance from user (closest first)
  allCities.sort((a, b) => a.distance - b.distance);

  if (allCities.length === 0) {
    return;
  }

    // Always use OM as base for all cities
    weatherData = await fetchWeatherForCities(allCities);

    // Check NWS bounds for each city and fetch NWS data where available — sequential to respect rate limits
    const nwsCities = [];
    for (const city of weatherData) {
      if (city.latitude != null && city.longitude != null) {
        // Quick bounds filter first (no API call for obvious non-NWS cities)
        if (city.latitude >= 17 && city.latitude <= 71 && city.longitude >= -170 && city.longitude <= -65) {
          city.nwsBounds = await isNwsBoundsAvailable(city.latitude, city.longitude);
        } else {
          city.nwsBounds = false;
        }
      } else {
        city.nwsBounds = false;
      }

      // Queue cities that have NWS bounds for data fetching
      if (city.nwsBounds) {
        nwsCities.push(city);
      }
    }

    // Fetch NWS data for all queued cities in parallel
    if (nwsCities.length > 0) {
      const nwsResults = await Promise.allSettled(
        nwsCities.map(city => fetchForCity(city.latitude, city.longitude).catch(() => null))
      );

      // Store NWS data on each city object as separate from OM data
      for (let i = 0; i < nwsCities.length; i++) {
        const city = nwsCities[i];
        const result = nwsResults[i];
        if (result.status === 'fulfilled' && result.value && result.value.current) {
          // Convert NWS data to app format
          const nwsAppData = nwsToAppData(city, result.value);
          if (nwsAppData) {
            city.nwsData = nwsAppData;
          }
        }
      }
    }

   renderAll();
}

// ===== GAME TOGGLE =====
function toggleGame() {
  const gameBtn = document.getElementById('game-btn');
  if (!gameBtn || typeof DONKEY_RUNNER === 'undefined') return;

  const isVisible = !DONKEY_RUNNER.gamePanel?.classList.contains('donkey-hidden');
  if (isVisible) {
    DONKEY_RUNNER.close();
    gameBtn.classList.remove('active');
  } else {
    DONKEY_RUNNER.toggle();
    gameBtn.classList.add('active');
  }
}