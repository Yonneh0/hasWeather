// ===== STATE =====
let userLocation = null;
let unit = 'F';
let weatherData = [];
let isLoading = false;
let _nearbyCache = null;
let _nearbyCacheTime = 0;
let _chartResizeTimer = null;
let _maxCities = MAX_CITIES; // Default: show nearest 6 cities
let _selectedRadarOverlay = 'qcd-composite'; // Current overlay selection

// ===== RUN GUARD =====
// Prevent concurrent run() invocations from background refresh
let _runPending = false;

// ===== RADAR MARKER TOGGLE STATE =====
let _radarMarkersVisible = false;
let _markerResizeTimer = null;

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  console.log('[App] Initializing...');
  initParticles();

  const unitBtn = document.getElementById('unit-toggle');
  const refreshBtn = document.getElementById('refresh-btn');
  const gameBtn = document.getElementById('game-btn');
  const aboutBtn = document.getElementById('about-btn');
  const radarToggleBtn = document.getElementById('radar-toggle-btn');

  if (unitBtn) unitBtn.addEventListener('click', toggleUnit);
  if (refreshBtn) refreshBtn.addEventListener('click', refresh);
  if (gameBtn) gameBtn.addEventListener('click', toggleGame);
  if (aboutBtn) aboutBtn.addEventListener('click', toggleAbout);
  if (radarToggleBtn) radarToggleBtn.addEventListener('click', toggleRadarMarkers);

  // About panel close button
  const aboutCloseBtn = document.getElementById('about-close-btn');
  if (aboutCloseBtn) aboutCloseBtn.addEventListener('click', closeAbout);

  // Chart redraw on resize (includes ghost charts)
  window.addEventListener('resize', () => {
    clearTimeout(_chartResizeTimer);
    _chartResizeTimer = setTimeout(() => {
      drawAllCharts();
      drawGhostCharts();
    }, CHART_RESIZE_DEBOUNCE_MS);
    // Also redraw markers if visible
    onMarkerResize();
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
async function run(isBackground = false) {
  // For background refreshes, don't block on concurrent full refresh — just skip
  // For full refreshes (isBackground=false), prevent concurrent runs
  if (!isBackground && _runPending) return;

  if (!isBackground) _runPending = true;

  try {
    const prevLoc = userLocation ? `${userLocation.lat.toFixed(4)},${userLocation.lon.toFixed(4)}` : null;

    if (!userLocation) {
      userLocation = await getLocation();
      console.log(`[Location] Resolved: ${userLocation.lat.toFixed(2)}°, ${Math.abs(userLocation.lon).toFixed(2)}°`);
    } else if (prevLoc) {
      const newLoc = `${userLocation.lat.toFixed(4)},${userLocation.lon.toFixed(4)}`;
      if (newLoc !== prevLoc) {
        console.log(`[Location] Changed: ${prevLoc} → ${newLoc}`);
      }
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
    
    // Save a snapshot of existing data before clearing, for fallback on fetch failure
    const cachedData = weatherData.map(city => ({ ...city, weather: city.weather ? { ...city.weather } : null, nwsData: city.nwsData ? { ...city.nwsData } : null }));

    // Fetch OM weather data
    const omResults = await Promise.allSettled(
      [fetchWeatherForCities(allCities).catch(() => null)]
    );

    let fetchedData = [];
    if (omResults[0].status === 'fulfilled' && omResults[0].value) {
      fetchedData = omResults[0].value;
    }

    // If fetch produced empty/null data, restore from cache to avoid blank cards
    if (!fetchedData || fetchedData.length === 0) {
      console.log('[run] Fetch returned no data, restoring cached:', cachedData.length, 'cities');
      weatherData = cachedData;
    } else {
      weatherData = fetchedData;
    }

    // Fill any cities with null weather from cache as fallback
    for (let i = 0; i < weatherData.length; i++) {
      const city = weatherData[i];
      if ((!city.weather || !city.weather.current) && cachedData[i]) {
        const cachedCity = cachedData[i];
        if (cachedCity.weather && cachedCity.weather.current) {
          console.log(`[run] City ${city.name} has null weather, using cached data`);
          city.weather = cachedCity.weather;
          city.aqi = cachedCity.aqi || {};
        }
      }
    }

    // Check NWS bounds and fetch NWS data where available — all in parallel
    if (weatherData.length > 0) {
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
      
      const nwsCities = weatherData.filter(c => c.nwsBounds);

      if (nwsCities.length > 0) {
        const nwsResults = await Promise.allSettled(
          nwsCities.map(city => fetchForCity(city.latitude, city.longitude).catch(() => null))
        );

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
    DataCacheLogSummary('location update');
    renderAll();

    // Setup radar overlay select and start background radar updates (only if not "None")
    if (userLocation) {
      loadRadarOverlaySelect(userLocation.lat, userLocation.lon);
      if (_selectedRadarOverlay !== 'none') {
        loadRadarBackground(userLocation.lat, userLocation.lon);
        startRadarUpdates(userLocation.lat, userLocation.lon);
      }
    }

    // Start periodic background refresh of weather data
    startBackgroundRefresh();
  } finally {
    if (!isBackground) _runPending = false;
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

  // Set the current layer before any conditional branches so it's correct for both cache lookup and display
  _currentRadarLayer = RADAR_LAYERS[_selectedRadarOverlay]?.wmsLayer || null;

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

// ===== ABOUT PANEL TOGGLE =====
function toggleAbout() {
  const aboutBtn = document.getElementById('about-btn');
  const panel = document.getElementById('about-panel');
  if (!aboutBtn || !panel) return;

  const isVisible = panel.classList.contains('about-visible');
  if (isVisible) {
    panel.classList.remove('about-visible');
    panel.classList.add('about-hidden');
    aboutBtn.classList.remove('active');
  } else {
    panel.classList.remove('about-hidden');
    panel.classList.add('about-visible');
    aboutBtn.classList.add('active');
  }
}

function closeAbout() {
  const aboutBtn = document.getElementById('about-btn');
  const panel = document.getElementById('about-panel');
  if (!aboutBtn || !panel) return;

  panel.classList.remove('about-visible');
  panel.classList.add('about-hidden');
  aboutBtn.classList.remove('active');
}

// ===== RENDER ALL (with card count logging) =====
let _lastCardCount = 0;

function renderAll() {
  const grid = document.getElementById('city-grid');
  if (!grid) return;

  const seenCoords = new Map();
  const deduped = [];
  for (const entry of weatherData) {
    const lat = entry.latitude != null ? DataCache._roundCoord(entry.latitude) : null;
    const lon = entry.longitude != null ? DataCache._roundCoord(entry.longitude) : null;
    if (lat == null || lon == null) {
      deduped.push(entry);
      continue;
    }
    const coordKey = `${lat},${lon}`;
    let isDup = false;
    for (const [existingKey, existingEntry] of seenCoords) {
      const [exLat, exLon] = existingKey.split(',').map(Number);
      if (Math.abs(lat - exLat) < COORD_MATCH_TOLERANCE && Math.abs(lon - exLon) < COORD_MATCH_TOLERANCE) {
        isDup = true;
        if (!existingEntry.place_id && entry.place_id) {
          seenCoords.set(existingKey, entry);
          const dupIdx = deduped.findIndex(d => d === existingEntry);
          if (dupIdx !== -1) deduped[dupIdx] = entry;
        }
        break;
      }
    }
    if (!isDup) {
      seenCoords.set(coordKey, entry);
      deduped.push(entry);
    }
  }
  weatherData = deduped;

  const added = weatherData.length - _lastCardCount;
  _lastCardCount = weatherData.length;
  if (added !== 0) {
    const lines = [`${added > 0 ? 'Added' : 'Removed'}: ${Math.abs(added)} card(s) (${weatherData.length} total)`];
    for (const city of weatherData) {
      const lat = city.latitude != null ? city.latitude.toFixed(2) + '°' : '?';
      const lon = city.longitude != null ? Math.abs(city.longitude).toFixed(2) + '°' : '?';
      lines.push(`  ${city.name} — ${lat}, ${lon}`);
    }
    console.log('[Cards]', lines.join('\n'));
  }

  grid.innerHTML = '';

  weatherData.forEach((data, i) => {
    const card = document.createElement('div');
    card.className = 'city-card';
    card.dataset.cityName = data.name;
    card.dataset.placeid = data.place_id || '';
    card.dataset.citydist = data.distance != null ? data.distance : '';
    card.dataset.citylat = data.latitude != null ? data.latitude : '';
    card.dataset.citylon = data.longitude != null ? data.longitude : '';
    card.style.animationDelay = `${i * CARD_ANIMATION_STAGGER_MS}ms`;
    card.style.animationFillMode = 'forwards';
    card.style.overflow = 'visible';
    const suffix = data.latitude != null && data.longitude != null ? `${data.latitude}_${data.longitude}` : undefined;
    card.innerHTML = renderCityCard(data, suffix);
    grid.appendChild(card);
  });

  applyBackgrounds();

  setTimeout(() => {
    drawAllCharts();
    drawGhostCharts();
  }, RENDER_ALL_CHART_DELAY_MS);
}

// ===== RADAR MARKER TOGGLE =====
function createRadarMapContainer() {
  // Only create once
  if (document.getElementById('radar-map-container')) return;

  const container = document.createElement('div');
  container.id = 'radar-map-container';
  container.className = 'radar-map-container hidden';
  container.innerHTML = `
    <div class="radar-marker-layer" id="radar-marker-layer"></div>
    <div class="radar-user-marker" title="Your Location"></div>
  `;
  document.body.appendChild(container);
}

function calculateMarkerPosition(city) {
  if (!userLocation || city.latitude == null || city.longitude == null) return null;

  // Calculate offset in degrees from user location
  const dLat = city.latitude - userLocation.lat;
  const dLon = city.longitude - userLocation.lon;

  // Convert to km (approximate)
  const latKm = dLat * 111.32;
  const lonKm = dLon * 111.32 * Math.cos(userLocation.lat * DEG_TO_RAD);

  // Radar shows a square area centered on user, radius = RADAR_BBOX_RADIUS_KM (200km)
  const bboxSize = RADAR_BBOX_RADIUS_KM * 2; // 400km

  // Position as percentage within the 512x512 container
  // left: 0% = west edge, 50% = user location, 100% = east edge
  return {
    leftPct: ((lonKm + bboxSize / 2) / bboxSize) * 100,
    topPct: ((bboxSize / 2 - latKm) / bboxSize) * 100,
  };
}

function renderMarkers() {
  createRadarMapContainer();
  const container = document.getElementById('radar-map-container');
  const layer = document.getElementById('radar-marker-layer');
  if (!container || !layer) return;

  // Calculate scale to match background-size: cover behavior
  // The radar image is 512x512, scaled to fill viewport like background-size: cover
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const scale = Math.max(vw, vh) / RADAR_IMAGE_SIZE;
  container.style.transform = `translate(-50%, -50%) scale(${scale})`;

  // Track which city keys are currently rendered
  const existingDots = layer.querySelectorAll('.radar-marker-dot');
  const existingKeys = new Set();
  existingDots.forEach(d => existingKeys.add(d.dataset.key));

  const currentKeys = new Set();

  for (const city of weatherData) {
    if (city.latitude == null || city.longitude == null) continue;

    const key = `${city.latitude.toFixed(4)}:${city.longitude.toFixed(4)}`;
    currentKeys.add(key);

    // Try to update existing marker instead of recreating
    let dot = layer.querySelector(`.radar-marker-dot[data-key="${key}"]`);
    if (dot) {
      existingKeys.delete(key);
      // Update position and content
      const pos = calculateMarkerPosition(city);
      if (pos) {
        dot.style.left = `${pos.leftPct}%`;
        dot.style.top = `${pos.topPct}%`;
      }
      dot.setAttribute('data-cityname', city.name);
      dot.title = city.name;
      const distText = city.distance != null ? `${Math.round(city.distance)} mi` : '';
      dot.innerHTML = `
        <span class="marker-city-name">${escapeHTML(city.name)}</span>
        ${distText ? `<span class="marker-distance">${distText}</span>` : ''}
      `;
    } else {
      // Create new marker
      const pos = calculateMarkerPosition(city);
      if (!pos) continue;

      dot = document.createElement('div');
      dot.className = 'radar-marker-dot';
      dot.dataset.key = key;
      dot.style.left = `${pos.leftPct}%`;
      dot.style.top = `${pos.topPct}%`;
      dot.title = city.name;
      dot.setAttribute('data-cityname', city.name);
      const distText = city.distance != null ? `${Math.round(city.distance)} mi` : '';
      dot.innerHTML = `
        <span class="marker-city-name">${escapeHTML(city.name)}</span>
        ${distText ? `<span class="marker-distance">${distText}</span>` : ''}
      `;
      layer.appendChild(dot);
    }
  }

  // Remove stale markers for cities no longer in weatherData
  for (const key of existingKeys) {
    if (!currentKeys.has(key)) {
      const staleDot = layer.querySelector(`.radar-marker-dot[data-key="${key}"]`);
      if (staleDot) staleDot.remove();
    }
  }
}

function toggleRadarMarkers() {
  const btn = document.getElementById('radar-toggle-btn');
  if (!btn) return;

  _radarMarkersVisible = !_radarMarkersVisible;
  btn.classList.toggle('active', _radarMarkersVisible);

  if (_radarMarkersVisible) {
    // Show markers, hide cards with animation
    renderMarkers();

    const container = document.getElementById('radar-map-container');
    if (container) {
      container.classList.remove('hidden');
    }

    // Animate cards outward — disable CSS animation to avoid transform conflicts
    const cards = document.querySelectorAll('.city-card');
    cards.forEach(card => {
      card.style.animation = 'none';
      card.style.opacity = '1';
      card.style.transform = 'scale(1)';
      card.style.zIndex = '1'; // Below radar container (z=2)

      // Force reflow so the browser registers the starting state
      void card.offsetHeight;

      const cardRect = card.getBoundingClientRect();
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      const dx = (cardRect.left + cardRect.width / 2 - centerX) / Math.max(centerX, 1);
      const dy = (cardRect.top + cardRect.height / 2 - centerY) / Math.max(centerY, 1);

      card.style.transition = 'opacity 0.9s ease, transform 1s cubic-bezier(0.16, 1, 0.3, 1)';
      card.style.transformOrigin = `${50 + dx * 50}% ${50 + dy * 50}%`;
      card.style.transform = `scale(2.5)`;
      card.style.opacity = '0';
    });
  } else {
    // Hide markers, show cards with animation
    const container = document.getElementById('radar-map-container');
    if (container) {
      container.classList.add('hidden');
    }

    // Animate cards back in
    const cards = document.querySelectorAll('.city-card');
    cards.forEach(card => {
      card.style.transition = 'opacity 0.9s ease, transform 1s cubic-bezier(0.16, 1, 0.3, 1)';
      card.style.transformOrigin = 'center center';
      card.style.transform = 'scale(1)';
      card.style.opacity = '1';
      card.style.zIndex = '';
    });
  }
}

// ===== RADAR MARKER RESIZE HANDLER =====
function onMarkerResize() {
  clearTimeout(_markerResizeTimer);
  _markerResizeTimer = setTimeout(() => {
    if (_radarMarkersVisible) {
      renderMarkers();
    }
  }, 200);
}

