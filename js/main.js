// ===== STATE =====
let userLocation = null;
let unit = 'F';
let weatherData = [];
let isLoading = false;
let _nearbyCache = null;
let _nearbyCacheTime = 0;
let _toggleDebounceTimer = null;
let _chartResizeTimer = null;
let _maxCities = MAX_CITIES; // Default: show nearest 6 cities

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  initParticles();

  const unitBtn = document.getElementById('unit-toggle');
  const refreshBtn = document.getElementById('refresh-btn');
  const gameBtn = document.getElementById('game-btn');

  if (unitBtn) unitBtn.addEventListener('click', toggleUnit);
  if (refreshBtn) refreshBtn.addEventListener('click', refresh);
  if (gameBtn) gameBtn.addEventListener('click', toggleGame);

  // Chart redraw on resize (includes ghost charts)
  window.addEventListener('resize', () => {
    clearTimeout(_chartResizeTimer);
    _chartResizeTimer = setTimeout(() => {
      drawAllCharts();
      drawGhostCharts();
    }, CHART_RESIZE_DEBOUNCE_MS);
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

  // Load nearby cities and display the nearest _maxCities
  const nearby = await findNearbyCities(userLocation.lat, userLocation.lon);
  
  // Sort by distance from user (closest first)
  nearby.sort((a, b) => a.distance - b.distance);
  
  // Take only the nearest _maxCities cities
  const allCities = nearby.slice(0, _maxCities);

  if (allCities.length === 0) {
    return;
  }

  // Render placeholder cards while requests are in flight
  renderPlaceholderCards(allCities);
  
   // Load radar image as page background
   if (userLocation) {
     loadRadarBackground(userLocation.lat, userLocation.lon);
   }

  // Fetch OM weather data
  const omResults = await Promise.allSettled(
    [fetchWeatherForCities(allCities).catch(() => null)]
  );
  
  weatherData = [];
  if (omResults[0].status === 'fulfilled' && omResults[0].value) {
    weatherData = omResults[0].value;
  }

  // Check NWS bounds and fetch NWS data where available — all in parallel
  if (weatherData.length > 0) {
    // Check all bounds in parallel (only for cities within US lat/lon range).
    // isNwsBoundsAvailable now propagates errors, so we wrap each call.
    const boundsPromises = weatherData.map(async (city) => {
      if (city.latitude != null && city.longitude != null &&
          city.latitude >= 17 && city.latitude <= 71 &&
          city.longitude >= -170 && city.longitude <= -65) {
        try {
          const inBounds = await isNwsBoundsAvailable(city.latitude, city.longitude);
          return { city, nwsBounds: inBounds };
        } catch (err) {
          console.warn(`[NWS bounds] ${city.name} (${city.latitude},${city.longitude}): ${err.message}`);
          return { city, nwsBounds: false };
        }
      }
      return { city, nwsBounds: false };
    });
    
    const boundsResults = await Promise.all(boundsPromises);
    for (const { city, nwsBounds } of boundsResults) {
      city.nwsBounds = nwsBounds;
    }
    
    // Queue cities that have NWS bounds for data fetching
    const nwsCities = weatherData.filter(c => c.nwsBounds);

    // Fetch NWS data for all queued cities in parallel (still per-city since NWS doesn't support batching)
    if (nwsCities.length > 0) {
      const nwsResults = await Promise.allSettled(
        nwsCities.map(city => fetchForCity(city.latitude, city.longitude).catch(() => null))
      );

      // Store NWS data on each city object — do NOT update cards yet
      for (let i = 0; i < nwsCities.length; i++) {
        const city = nwsCities[i];
        const result = nwsResults[i];
        if (result.status === 'fulfilled' && result.value && result.value.current) {
          const nwsAppData = nwsToAppData(city, result.value);
          if (nwsAppData) {
            city.nwsData = nwsAppData;
          }
        }
      }
    }
  }

  // All requests complete — render once
  renderAll();

}

// ===== RADAR BACKGROUND =====
async function loadRadarBackground(lat, lon) {
  const bg = document.getElementById('radar-background');
  if (!bg) return;

  // Fetch image (uses cache if available)
  const dataUrl = await window.fetchCurrentRadarImage(lat, lon);
  if (!dataUrl) {
    console.warn('[Radar] No background image loaded');
    return;
  }

  // Replace white pixels with transparency on a canvas, then set as background
  makeWhiteTransparent(dataUrl, (transparentUrl) => {
    bg.style.backgroundImage = `url(${transparentUrl})`;
    bg.style.backgroundSize = 'cover';
    bg.style.backgroundPosition = 'center';
    bg.style.backgroundRepeat = 'no-repeat';
  });
}

// Process image to replace white pixels with transparency
function makeWhiteTransparent(dataUrl, callback) {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Replace white pixels (R,G,B > 240) with full transparency
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) {
        data[i + 3] = 0; // alpha = 0
      }
    }

    ctx.putImageData(imageData, 0, 0);
    callback(canvas.toDataURL('image/png'));
  };
  img.src = dataUrl;
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