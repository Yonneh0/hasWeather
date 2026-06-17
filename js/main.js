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
let _selectedRadarOverlay = 'qcd-composite'; // Current overlay selection

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

   // Debug location select
   const debugSel = document.getElementById('debug-location-select');
   if (debugSel) {
     debugSel.addEventListener('change', async () => {
       const val = debugSel.value;

       if (val === 'local') {
         // Clear cached userLocation so getLocation() re-fetches fresh browser geolocation
         userLocation = null;
       } else {
         const [lat, lon] = val.split(':').map(Number);
         userLocation = { lat, lon };
       }

       _nearbyCache = null;
       _nearbyCacheTime = 0;
       await run();
     });
   }

   // Toggle network outage retry when pressing the refresh button while offline
   // (already handled above in checkNetwork)

   // Radar overlay combo box handler
   const radarSel = document.getElementById('radar-overlay-select');
   if (radarSel) {
     radarSel.addEventListener('change', () => applyRadarOverlaySelection(userLocation?.lat, userLocation?.lon));
   }

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

  // Setup radar overlay select and start background radar updates (only if not "None")
  if (userLocation) {
    loadRadarOverlaySelect(userLocation.lat, userLocation.lon);
    if (_selectedRadarOverlay !== 'none') {
      loadRadarBackground(userLocation.lat, userLocation.lon);
      startRadarUpdates(userLocation.lat, userLocation.lon);
    }
  }

}

// ===== RADAR BACKGROUND STATE =====
let _currentRadarLayer = null; // WMS layer name for current display (e.g., 'conus_cref_qcd')
let _radarUpdateTimer = null;
const RADAR_UPDATE_INTERVAL_MS = 4 * 60 * 1000; // 4 min — update before cache expires

// ===== RADAR BACKGROUND =====
async function loadRadarBackground(lat, lon) {
  const bg = document.getElementById('radar-background');
  if (!bg) return;

  // Get the WMS layer name for current overlay selection
  let selectedLayerName = _selectedRadarOverlay === 'none' ? null : RADAR_LAYERS[_selectedRadarOverlay]?.wmsLayer;

  if (_selectedRadarOverlay === 'none') {
    // Hide radar image, show animated canvas background
    bg.style.backgroundImage = 'none';
    return;
  }

  if (!selectedLayerName) return;

  _currentRadarLayer = selectedLayerName;

  // Check overlay-specific cache first
  const cached = getCachedRadarOverlay(lat, lon, selectedLayerName);
  if (cached) {
    console.log('[Radar] Loading cached overlay');
    makeWhiteTransparent(cached, (transparentUrl) => {
      bg.style.backgroundImage = `url(${transparentUrl})`;
      bg.style.backgroundSize = 'cover';
      bg.style.backgroundPosition = 'center';
      bg.style.backgroundRepeat = 'no-repeat';
    });
    return;
  }

  // Not cached — show animated canvas first (no stale data)
  bg.style.backgroundImage = 'none';
  console.log('[Radar] Overlay not cached, showing animated background while loading');

  const dataUrl = await window.fetchRadarImageForOverlay(lat, lon, selectedLayerName);
  if (dataUrl) {
    makeWhiteTransparent(dataUrl, (transparentUrl) => {
      bg.style.backgroundImage = `url(${transparentUrl})`;
      bg.style.backgroundSize = 'cover';
      bg.style.backgroundPosition = 'center';
      bg.style.backgroundRepeat = 'no-repeat';
    });
  }
}

// Refresh the currently-displayed radar overlay
async function refreshRadarBackground(lat, lon) {
  if (!_currentRadarLayer || !lat || !lon) return;
  const dataUrl = await window.fetchRadarImageForOverlay(lat, lon, _currentRadarLayer);
  if (!dataUrl) return;

  const bg = document.getElementById('radar-background');
  if (!bg) return;

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

// Start radar background updates (only if overlay is displayed)
function startRadarUpdates(lat, lon) {
  if (_radarUpdateTimer) clearInterval(_radarUpdateTimer);

  // Use the shortest TTL from all city data to determine refresh interval
  let shortestTTL = Infinity;
  if (weatherData.length > 0) {
    for (const city of weatherData) {
      const ttl = getCityShortestTTL(city);
      if (ttl < shortestTTL) shortestTTL = ttl;
    }
  }

  // Radar refresh interval: 80% of the radar TTL, minimum 2 minutes
  const interval = Math.max(2 * 60 * 1000, shortestTTL * BACKGROUND_REFRESH_FRACTION);
  _radarUpdateTimer = setInterval(() => refreshRadarBackground(lat, lon), interval);

  console.log(`[Radar] Background updates every ${Math.round(interval / 1000)}s (shortest TTL: ${Math.round(shortestTTL / 1000)}s)`);
}

// Stop radar background updates
function stopRadarUpdates() {
  if (_radarUpdateTimer) {
    clearInterval(_radarUpdateTimer);
    _radarUpdateTimer = null;
  }
}

// ===== RADAR COMBO BOX =====
let _radarOptionsLoaded = false;

function loadRadarOverlaySelect(lat, lon) {
  const sel = document.getElementById('radar-overlay-select');
  if (!sel) return;

  // Restore from localStorage
  const stored = localStorage.getItem('hasw_radar_overlay');
  if (stored && stored !== 'null') {
    _selectedRadarOverlay = stored;
  } else {
    _selectedRadarOverlay = RADAR_DEFAULT_OVERLAY;
  }

  // Populate options from predefined RADAR_LAYERS
  const existingOpts = new Set();
  sel.querySelectorAll('option').forEach(o => existingOpts.add(o.value));

  // Add "None" option
  let noneOpt = sel.querySelector('option[value="none"]');
  if (!noneOpt) {
    noneOpt = document.createElement('option');
    noneOpt.value = 'none';
    noneOpt.textContent = 'None';
    sel.insertBefore(noneOpt, sel.firstChild);
    existingOpts.add('none');
  }

  // Add all predefined radar layers
  Object.entries(RADAR_LAYERS).forEach(([key, val]) => {
    if (!existingOpts.has(key)) {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = val.label;
      sel.appendChild(opt);
    }
  });

  // Also fetch and add discovered overlays from GetCapabilities
  if (!_radarOptionsLoaded) {
    window.fetchAvailableRadarLayers(lat, lon).then(layers => {
      _radarOptionsLoaded = true;
      const existingOpts = new Set();
      sel.querySelectorAll('option').forEach(o => existingOpts.add(o.value));

      for (const layer of layers) {
        // Map WMS layer name to our key
        let key = Object.keys(RADAR_LAYERS).find(k => RADAR_LAYERS[k].wmsLayer === layer.name);
        if (!key && layer.name.startsWith('conus_')) {
          // Generate a key for discovered layers
          const shortName = layer.name.replace('conus_', '').replace('_qcd', '');
          key = shortName;
          RADAR_LAYERS[key] = { wmsLayer: layer.name, label: layer.label };
        }

        if (key && !existingOpts.has(key)) {
          const opt = document.createElement('option');
          opt.value = key;
          opt.textContent = layer.label;
          sel.appendChild(opt);
        }
      }

      // Set the correct value after adding options
      sel.value = _selectedRadarOverlay;
    });
  }

  sel.value = _selectedRadarOverlay;
}

function applyRadarOverlaySelection(lat, lon) {
  const sel = document.getElementById('radar-overlay-select');
  if (!sel) return;
  const wasNone = _selectedRadarOverlay === 'none';
  const isNowNone = sel.value === 'none';
  _selectedRadarOverlay = sel.value;
  localStorage.setItem('hasw_radar_overlay', _selectedRadarOverlay);

  // If switching TO "None", stop background updates and clear radar image
  if (isNowNone && !wasNone) {
    stopRadarUpdates();
    const bg = document.getElementById('radar-background');
    if (bg) bg.style.backgroundImage = 'none';
    _currentRadarLayer = null;
    return;
  }

  // If switching FROM "None", start background updates and load image
  if (!isNowNone && wasNone) {
    _currentRadarLayer = RADAR_LAYERS[_selectedRadarOverlay]?.wmsLayer || null;
    loadRadarBackground(lat, lon);
    startRadarUpdates(lat, lon);
    return;
  }

  // Same overlay type, just reload the image (don't restart timer)
  loadRadarBackground(lat, lon);
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

