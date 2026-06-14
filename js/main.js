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

// ===== RADAR PLAYER =====
async function loadRadarCard(lat, lon) {
  const container = document.getElementById('radar-card-container');
  if (!container) return;

  // Build radar player HTML
  const layerOptions = Object.entries(RADAR_LAYERS).map(([key, value]) => 
    `<option value="${value}" ${value === RADAR_DEFAULT_LAYER ? 'selected' : ''}>${key.replace('_', ' ')}</option>`
  ).join('');

  const speedOptions = (window.SPEED_OPTIONS || [0.5, 1, 2, 4, 8]).map((speed, idx) => 
    `<option value="${speed}" ${idx === 1 ? 'selected' : ''}>${speed}x</option>`
  ).join('');

  container.innerHTML = `
    <div id="radar-player-card" class="radar-fade-in">
      <!-- Titlebar -->
      <div class="radar-player-header">
        <!-- Left: Playback Controls -->
        <div class="radar-header-section">
          <button class="radar-btn radar-btn-play radar-tooltip" id="radar-play-btn" data-tooltip="Play/Pause (Space)">▶</button>
          <span class="radar-speed-select" title="Playback speed">
            <select class="radar-speed-select" id="radar-speed-select" title="Speed">${speedOptions}</select>
          </span>
        </div>
        
        <div class="radar-header-divider"></div>
        
        <!-- Center: Zoom Controls -->
        <div class="radar-header-section">
          <button class="radar-btn radar-tooltip" id="radar-zoom-out-btn" data-tooltip="Zoom out (-)">−</button>
          <span class="radar-zoom-text" id="radar-zoom-text">100%</span>
          <button class="radar-btn radar-tooltip" id="radar-zoom-in-btn" data-tooltip="Zoom in (+)">+</button>
          <button class="radar-btn radar-tooltip" id="radar-reset-btn" data-tooltip="Reset view (0)">⟲</button>
        </div>
        
        <div class="radar-header-divider"></div>
        
        <!-- Right: Layer & Info -->
        <div class="radar-header-section">
          <select class="radar-layer-select" id="radar-layer-select" title="Radar layer">${layerOptions}</select>
          <span class="radar-timestamp" id="radar-timestamp">--:--</span>
          <button class="radar-btn radar-tooltip" id="radar-load-all-btn" data-tooltip="Load all cached frames">Load All</button>
          <button class="radar-btn radar-fullscreen-btn radar-tooltip" id="radar-fullscreen-btn" data-tooltip="Toggle fullscreen">⛶</button>
        </div>
      </div>
      
      <!-- Canvas Display -->
      <div id="radar-canvas-container" class="radar-canvas-container">
        <canvas id="radar-canvas"></canvas>
        <div class="radar-loading-overlay" id="radar-loading-overlay">
          <div class="radar-spinner"></div>
          <span class="radar-loading-text" id="radar-loading-text">Loading radar...</span>
        </div>
      </div>
      
      <!-- Prefetch Progress -->
      <div class="radar-prefetch-bar">
        <div class="radar-prefetch-progress" id="radar-prefetch-progress" style="width: 0%"></div>
      </div>
      <span class="radar-prefetch-text" id="radar-frame-count-text">0/0 frames</span>
      
      <!-- Timeline -->
      <div class="radar-timeline-container">
        <span class="radar-time-range" id="radar-time-range">--:-- — --:--</span>
        <div class="radar-timeline-progress-bar">
          <div class="radar-timeline-progress" id="radar-timeline-progress" style="width: 0%"></div>
        </div>
        <div class="radar-timeline" id="radar-timeline"></div>
      </div>
    </div>`;

  // Bind events
  bindRadarPlayerEvents();

  // Initialize radar player engine
  if (window.RADAR_PLAYER) {
    window.RADAR_PLAYER.init(lat, lon);
  }
}

function bindRadarPlayerEvents() {
  const container = document.getElementById('radar-card-container');
  if (!container) return;

  // Play/Pause button
  const playBtn = document.getElementById('radar-play-btn');
  if (playBtn) {
    playBtn.addEventListener('click', () => {
      if (window.RADAR_PLAYER) window.RADAR_PLAYER.togglePlayback();
    });
  }

  // Speed selector
  const speedSelect = document.getElementById('radar-speed-select');
  if (speedSelect) {
    speedSelect.addEventListener('change', (e) => {
      e.stopPropagation();
      if (!window.RADAR_PLAYER) return;
      const state = window.RADAR_PLAYER.getState();
      state.speed = parseFloat(e.target.value);
      // If playing, restart the playback loop with new speed
      if (state.isPlaying) {
        window.RADAR_PLAYER.stopPlayback();
        window.RADAR_PLAYER.togglePlayback();
      }
    });
  }

  // Zoom in button
  const zoomInBtn = document.getElementById('radar-zoom-in-btn');
  if (zoomInBtn) {
    zoomInBtn.addEventListener('click', () => {
      if (window.RADAR_PLAYER) window.RADAR_PLAYER.zoomIn();
    });
  }

  // Zoom out button
  const zoomOutBtn = document.getElementById('radar-zoom-out-btn');
  if (zoomOutBtn) {
    zoomOutBtn.addEventListener('click', () => {
      if (window.RADAR_PLAYER) window.RADAR_PLAYER.zoomOut();
    });
  }

  // Reset view button
  const resetBtn = document.getElementById('radar-reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (window.RADAR_PLAYER) window.RADAR_PLAYER.resetView();
    });
  }

  // Layer selector
  const layerSelect = document.getElementById('radar-layer-select');
  if (layerSelect) {
    layerSelect.addEventListener('change', async (e) => {
      e.stopPropagation();
      if (!window.RADAR_PLAYER) return;
      await window.RADAR_PLAYER.switchLayer(e.target.value);
    });
  }

  // Load all frames button
  const loadAllBtn = document.getElementById('radar-load-all-btn');
  if (loadAllBtn) {
    loadAllBtn.addEventListener('click', async () => {
      if (!window.RADAR_PLAYER) return;
      const state = window.RADAR_PLAYER.getState();
      // Pre-fetch all remaining frames
      for (let i = 0; i < state.allTimestamps.length; i++) {
        const timestamp = state.allTimestamps[i];
        const cached = await getCachedRadarFrameAsDataURL(state.lat, state.lon, state.layer, timestamp);
        if (!cached) {
          await fetchRadarImageForTimestamp(state.lat, state.lon, state.layer, timestamp);
        }
      }
    });
  }

  // Fullscreen button
  const fullscreenBtn = document.getElementById('radar-fullscreen-btn');
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', () => {
      if (window.RADAR_PLAYER) window.RADAR_PLAYER.toggleFullscreen();
    });
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