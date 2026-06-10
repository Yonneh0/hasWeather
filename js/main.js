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

// ===== GAME TOGGLE =====
function toggleGame() {
  const gameBtn = document.getElementById('game-btn');
  if (!gameBtn || typeof DONKEY_RUNNER === 'undefined') return;

  const isVisible = !DONKEY_RUNNER.gamePanel?.classList.contains('donkey-hidden');
  if (isVisible) {
    DONKEY_RUNNER.minimize();
    gameBtn.classList.remove('active');
  } else {
    DONKEY_RUNNER.toggle();
    gameBtn.classList.add('active');
  }
}
