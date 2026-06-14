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
   
   // After cities are rendered, load the radar card and fetch radar image
   if (userLocation) {
     loadRadarCard(userLocation.lat, userLocation.lon);
   }
 }

// ===== RADAR CARD =====
async function loadRadarCard(lat, lon) {
  const container = document.getElementById('radar-card-container');
  if (!container) return;

  // Build radar card HTML
  const layerOptions = Object.entries(RADAR_LAYERS).map(([key, value]) => 
    `<option value="${value}" ${value === RADAR_DEFAULT_LAYER ? 'selected' : ''}>${key.replace('_', ' ')}</option>`
  ).join('');

  container.innerHTML = `
    <div class="radar-card" data-radar-lat="${lat.toFixed(4)}" data-radar-lon="${lon.toFixed(4)}">
      <div class="radar-card-header">
        <span class="radar-card-title">Radar</span>
        <select class="radar-layer-select" title="Select radar layer">${layerOptions}</select>
        <span class="radar-card-timestamp">Loading...</span>
      </div>
      <div class="radar-card-body">
        <img class="radar-image" alt="Radar" />
      </div>
      <div class="radar-clip-controls">
        <button class="radar-clip-btn radar-clip-play-btn" title="Play/pause clip">▶</button>
        <span class="radar-clip-frame-label">0/0</span>
        <div class="radar-clip-progress"><div class="radar-clip-progress-bar"></div></div>
      </div>
    </div>`;

  // Fetch and display radar image
  await updateRadarImage(lat, lon);

  // Layer selector event
  const layerSelect = container.querySelector('.radar-layer-select');
  if (layerSelect) {
    layerSelect.addEventListener('change', async (e) => {
      e.stopPropagation();
      // Clear cache for this layer and re-fetch
      await clearRadarCacheForLayer(lat, lon, RADAR_DEFAULT_LAYER);
      await updateRadarImage(lat, lon, e.target.value);
    });
  }

  // Clip playback controls
  const playBtn = container.querySelector('.radar-clip-play-btn');
  if (playBtn) {
    playBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const meta = getRadarMeta(lat, lon, layerSelect?.value || RADAR_DEFAULT_LAYER);
      if (!meta || !meta.timestamps.length) return;
      
      // Fetch last 10 frames for animation
      const frames = await getRadarFramesForClip(lat, lon, layerSelect?.value || RADAR_DEFAULT_LAYER, 10);
      if (!frames || !frames.length) return;

      // Toggle playback
      if (playBtn.classList.contains('active')) {
        playBtn.classList.remove('active');
        playBtn.textContent = '▶';
        container.querySelector('.radar-clip-controls').classList.remove('active');
        return;
      }

      playBtn.classList.add('active');
      playBtn.textContent = '⏸';
      container.querySelector('.radar-clip-controls').classList.add('active');
      
      // Start playback
      let frameIdx = 0;
      const progressBar = container.querySelector('.radar-clip-progress-bar');
      const frameLabel = container.querySelector('.radar-clip-frame-label');
      
      function showNextFrame() {
        if (!playBtn.classList.contains('active')) return;
        
        const frame = frames[frameIdx % frames.length];
        const img = container.querySelector('.radar-image');
        if (img && frame) {
          img.src = frame.dataUrl;
          img.style.display = 'block';
          progressBar.style.width = `${((frameIdx + 1) / frames.length) * 100}%`;
          frameLabel.textContent = `${frameIdx + 1}/${frames.length}`;
        }
        
        frameIdx++;
        setTimeout(showNextFrame, 500); // 2 FPS (radar updates every ~2 min)
      }
      
      showNextFrame();
    });
  }
}

// Update radar image for current timestamp
async function updateRadarImage(lat, lon, layer = null) {
  const container = document.getElementById('radar-card-container');
  if (!container) return;

  const card = container.querySelector('.radar-card');
  const img = container.querySelector('.radar-image');
  const timestampEl = container.querySelector('.radar-card-timestamp');

  // Show loading state
  card.classList.add('radar-loading');

  try {
    const result = await fetchRadarImageForLocation(lat, lon, layer || RADAR_DEFAULT_LAYER);
    
    if (result.error) {
      console.warn('[Radar] Failed to load radar:', result.error);
      timestampEl.textContent = 'Failed to load';
      card.classList.remove('radar-loading');
      return;
    }

    // Update timestamp display
    if (result.timestamp) {
      const date = new Date(result.timestamp);
      timestampEl.textContent = date.toLocaleTimeString();
    }

    // Remove loading spinner — either when image loads or immediately if it was cached
    if (result.cached) {
      card.classList.remove('radar-loading');
    } else {
      img.onload = () => {
        card.classList.remove('radar-loading');
      };
      img.onerror = () => {
        console.warn('[Radar] Image failed to load');
        img.style.display = 'none';
        timestampEl.textContent = 'Failed to load';
        card.classList.remove('radar-loading');
      };
    }

    // Update the radar image element
    img.src = result.imageUrl;
    
    // Show the image — for cached images, CSS selector [src]:not([src=""]) will handle display
    // For uncached images, the onload handler will set display: block
    if (result.cached) {
      // Cached data URLs may not trigger onload — ensure visibility immediately
      img.style.display = 'block';
    }
  } catch (e) {
    console.error('[Radar] Error loading radar:', e);
    timestampEl.textContent = 'Failed to load';
    card.classList.remove('radar-loading');
  }
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