// ===== RADAR PLAYER ENGINE =====
// Enhanced radar UI with zoom, pan, timeline, and playback state management.
// Canvas-based rendering for smooth interactions.

(function() {
  'use strict';

  // ===== CONSTANTS =====
  const ZOOM_LEVELS = [1, 1.5, 2, 3];
  
  // Canvas/image dimensions
  const CANVAS_BASE_SIZE = 512;
  const VIEWPORT_PADDING = 200;
  
  // Zoom/pan constants
  const MAX_ZOOM = 3;
  const PAN_SPEED = 8;
  const PRE_FETCH_COUNT = 50;
  
  // Pin rendering constants
  const PIN_SIZE_BASE = 16;
  const PIN_SIZE_SCALE = 0.5;
  const MIN_PIN_SIZE = 8;
  const PIN_LABEL_MIN_ZOOM = 1.5;
  const PIN_LABEL_MAX_ZOOM = 3;
  
  // Pin pulse animation constants
  const PIN_PULSE_RADIUS_MULTIPLIER = 2.5;
  const PIN_PULSE_PERIOD_MS = 800; // ~1.25s cycle at 60fps
  const PIN_PULSE_OPACITY_DIVISOR = 2;
  
  // Pin shadow constants
  const PIN_SHADOW_BLUR = 6;
  const PIN_SHADOW_OFFSET_X = 1;
  const PIN_SHADOW_OFFSET_Y = 2;
  
  // Pin shape constants
  const PIN_BORDER_WIDTH = 1.5;
  const PIN_ARC_TAIL_GAP = 0.05; // gap between arc start and end (1/20th of circle)
  const PIN_ARC_START_ANGLE = (1 - PIN_ARC_TAIL_GAP) * Math.PI;
  const PIN_ARC_END_ANGLE = PIN_ARC_TAIL_GAP * Math.PI;
  const PIN_CENTER_OFFSET = 0.2;
  
  // Pin center dot constants
  const MIN_DOT_RADIUS = 2;
  const PIN_DOT_RADIUS_MULTIPLIER = 0.3;
  
  // Pin label constants
  const LABEL_PADDING = 3;
  const LABEL_CORNER_RADIUS = 4;
  const PIN_LABEL_Y_OFFSET = 1.6;
  const BASE_FONT_SIZE = 10;
  const MAX_FONT_SIZE = 14;
  
  // Tooltip positioning constants
  const TOOLTIP_DEFAULT_WIDTH = 150;
  const TOOLTIP_BOTTOM_PADDING = 10;
  
  // Spinner constants
  const SPINNER_RADIUS = 16;
  const SPINNER_LINE_WIDTH = 3;
  const SPINNER_ROTATION_SPEED = 3;
  
  // Expose speed options globally so main.js can use them
  window.SPEED_OPTIONS = [0.5, 1, 2, 4, 8];

  // ===== STATE =====
  let state = {
    lat: null,
    lon: null,
    layer: RADAR_DEFAULT_LAYER,
    zoomLevel: 0, // index into ZOOM_LEVELS
    panX: 0,
    panY: 0,
    isPanning: false,
    panStartX: 0,
    panStartY: 0,
    panStartPanX: 0,
    panStartPanY: 0,
    isPlaying: false,
    currentFrameIndex: -1,
    frames: null, // array of { timestamp, dataUrl }
    speed: 1,
    allTimestamps: [], // all available timestamps for this location/layer
    cachedTimestamps: [], // timestamps that have been fetched
    isPreFetching: false,
    preFetchProgress: 0,
    totalPreFetch: 0,
    isLoading: false,
    isLoaded: false,
    animFrameId: null,
    lastFrameTime: 0,
    isFullscreen: false,
    
    // Coordinate readout state
    coordFormat: 'mgrs', // default format
    
    // Pin state
    pins: [], // array of { lat, lon, label, type, offsetX, offsetY }
    pinOffsetX: 0, // accumulated X offset for panning pins
    pinOffsetY: 0, // accumulated Y offset for panning pins
    showPins: true,
  };

  // ===== CANVAS SETUP =====
  let canvas = null;
  let ctx = null;
  let loadedImage = null;
  let isCurrentImageLoaded = false;
  let canvasWidth = CANVAS_BASE_SIZE;
  let canvasHeight = CANVAS_BASE_SIZE;

  // ===== INITIALIZATION =====
  function initRadarPlayer(lat, lon) {
    state.lat = lat;
    state.lon = lon;
    state.layer = RADAR_DEFAULT_LAYER;
    state.zoomLevel = 0;
    state.panX = 0;
    state.panY = 0;
    state.isPlaying = false;
    state.currentFrameIndex = -1;
    state.frames = null;
    state.speed = 1;
    state.allTimestamps = [];
    state.cachedTimestamps = [];
    state.isPreFetching = false;
    state.preFetchProgress = 0;
    state.totalPreFetch = 0;
    state.isLoading = true;
    state.isLoaded = false;
    state.coordFormat = 'mgrs';

    canvas = document.getElementById('radar-canvas');
    ctx = canvas.getContext('2d');

    // Set canvas size based on zoom level
    updateCanvasSize();

    // Event listeners
    setupCanvasEvents();
    setupKeyboardEvents();
    setupCoordReadout();

    // Load initial data
    setupTimelineScrubbing();
    loadInitialRadarFrame();
  }

  function updateCanvasSize() {
    const container = document.getElementById('radar-canvas-container');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    canvasWidth = Math.min(rect.width, CANVAS_BASE_SIZE);
    canvasHeight = canvasWidth;
    canvas.style.width = canvasWidth + 'px';
    canvas.style.height = canvasHeight + 'px';
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
  }

  // ===== OVERLAY HELPERS =====
  function hideLoadingOverlay() {
    const loadingOverlay = document.getElementById('radar-loading-overlay');
    if (loadingOverlay) {
      loadingOverlay.classList.add('hidden');
    }
  }

  function showLoadingOverlay(text) {
    const loadingOverlay = document.getElementById('radar-loading-overlay');
    if (loadingOverlay) {
      loadingOverlay.classList.remove('hidden');
      const loadingText = document.getElementById('radar-loading-text');
      if (loadingText) {
        loadingText.textContent = text || 'Loading radar...';
      }
    }
  }

  function showErrorOverlay(text) {
    const loadingOverlay = document.getElementById('radar-loading-overlay');
    if (!loadingOverlay) return;
    loadingOverlay.classList.remove('hidden');
    const spinner = loadingOverlay.querySelector('.radar-spinner');
    if (spinner) spinner.style.display = 'none';
    const loadingText = document.getElementById('radar-loading-text');
    if (loadingText) {
      loadingText.textContent = text || 'Error loading radar';
      loadingText.style.color = '#ff4444';
    }
  }

  function hideErrorOverlay() {
    const loadingOverlay = document.getElementById('radar-loading-overlay');
    if (!loadingOverlay) return;
    loadingOverlay.classList.add('hidden');
    const spinner = loadingOverlay.querySelector('.radar-spinner');
    if (spinner) spinner.style.display = '';
    const loadingText = document.getElementById('radar-loading-text');
    if (loadingText) {
      loadingText.textContent = 'Loading radar...';
      loadingText.style.color = '';
    }
  }

  // ===== CANVAS EVENTS =====
  function setupCanvasEvents() {
    if (!canvas) return;

    // Pan start
    canvas.addEventListener('mousedown', (e) => {
      if (state.zoomLevel > 0 && !isImageLoaded()) return;
      state.isPanning = true;
      state.panStartX = e.clientX;
      state.panStartY = e.clientY;
      state.panStartPanX = state.panX;
      state.panStartPanY = state.panY;
      canvas.style.cursor = 'grabbing';
    });

    // Pan move
    window.addEventListener('mousemove', (e) => {
      if (!state.isPanning) return;
      // Pan in canvas pixel space directly - no division by zoom
      // This ensures consistent feel at all zoom levels: 1px mouse movement = 1px pan
      const dx = e.clientX - state.panStartX;
      const dy = e.clientY - state.panStartY;
      state.panX = state.panStartPanX + dx;
      state.panY = state.panStartPanY + dy;
      renderCanvas();
      updateCenterCoordReadout();
    });

    // Pan end
    window.addEventListener('mouseup', () => {
      if (state.isPanning) {
        state.isPanning = false;
        canvas.style.cursor = isImageLoaded() ? 'grab' : 'default';
      }
    });

    // Scroll to zoom (zoom-to-point)
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -1 : 1;
      const newZoom = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, state.zoomLevel + delta));
      if (newZoom !== state.zoomLevel) {
        zoomTo(newZoom, e.clientX, e.clientY);
      }
    }, { passive: false });

    // Double-click to reset view (zoom-to-point for reset)
    canvas.addEventListener('dblclick', (e) => {
      if (isImageLoaded()) {
        // Reset zoom first, then pan at the click point
        const newZoom = 0;
        zoomTo(newZoom, e.clientX, e.clientY);
        state.panX = 0;
        state.panY = 0;
        updateZoomUI();
        renderCanvas();
      } else {
        resetView();
      }
    });

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      updateCanvasSize();
      renderCanvas();
    });
    const container = document.getElementById('radar-canvas-container');
    if (container) resizeObserver.observe(container);
  }

  // ===== KEYBOARD EVENTS =====
  function setupKeyboardEvents() {
    window.addEventListener('keydown', (e) => {
      const radarCard = document.getElementById('radar-player-card');
      if (!radarCard || radarCard.classList.contains('hidden')) return;

      switch (e.key) {
        case ' ':
          e.preventDefault();
          togglePlayback();
          break;
        case '+':
        case '=':
          e.preventDefault();
          zoomIn();
          break;
        case '-':
          e.preventDefault();
          zoomOut();
          break;
        case '0':
          e.preventDefault();
          resetView();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          panFrame(-1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          panFrame(1);
          break;
      }
    });
  }

  // ===== INITIAL LOAD =====
  async function loadInitialRadarFrame() {
    const progressBar = document.getElementById('radar-prefetch-progress');
    const progressText = document.getElementById('radar-frame-count-text');
    if (progressBar) progressBar.style.width = '0%';
    if (progressText) progressText.textContent = 'Loading radar...';

    let meta = getRadarMeta(state.lat, state.lon, state.layer);
    
    if (!meta || !meta.timestamps || meta.timestamps.length === 0) {
      const allTimestamps = await getRadarTimestampsForLayer(state.layer);
      if (allTimestamps && allTimestamps.length > 0) {
        meta = { timestamps: allTimestamps, layer: state.layer, lat: state.lat, lon: state.lon, lastUpdated: Date.now() };
        setRadarMeta(state.lat, state.lon, state.layer, null);
      }
    }

    if (meta && meta.timestamps && meta.timestamps.length > 0) {
      state.allTimestamps = [...meta.timestamps].sort();
    } else {
      const loadingText = document.getElementById('radar-loading-text');
      if (loadingText) loadingText.textContent = 'No radar data available';
      showErrorOverlay('No radar data available for this location');
      return;
    }

    const loadResult = await loadCurrentFrame();
    
    if (!loadResult && state.allTimestamps.length > 0) {
      showErrorOverlay('Failed to load radar image');
      return;
    }

    hideLoadingOverlay();

    if (state.allTimestamps.length > 0 && !state.isPreFetching) {
      await preFetchFrames();
    }

    state.isLoading = false;
    state.isLoaded = true;

    updateTimelineUI();
    updatePrefetchUI();
    renderCanvas();
    
    updateCenterCoordReadout();
  }

  // ===== FRAME LOADING =====
  async function loadCurrentFrame() {
    const timestamp = state.allTimestamps.length > 0
      ? state.allTimestamps[state.allTimestamps.length - 1]
      : null;

    return loadRadarFrameForTimestamp(state.lat, state.lon, state.layer, timestamp);
  }

  async function loadRadarFrameForTimestamp(lat, lon, layer, timestamp) {
    let dataUrl = await getCachedRadarFrameAsDataURL(lat, lon, layer, timestamp);

    if (!dataUrl) {
      const result = await fetchRadarImageForTimestamp(lat, lon, layer, timestamp);
      if (result.error) {
        console.warn('[Radar Player] Failed to load frame:', result.error);
        return null;
      }
      dataUrl = result.imageUrl;
    }

    const currentImg = new Image();
    loadedImage = currentImg;
    isCurrentImageLoaded = false;
    
    return new Promise((resolve) => {
      currentImg.onload = () => {
        if (loadedImage !== currentImg) return;
        isCurrentImageLoaded = true;
        renderCanvas();
        hideLoadingOverlay();
        resolve(dataUrl);
      };
      currentImg.onerror = () => {
        console.warn('[Radar Player] Image failed to load');
        resolve(null);
      };
      currentImg.src = dataUrl;
      
      if (currentImg.complete && currentImg.naturalWidth > 0) {
        isCurrentImageLoaded = true;
        renderCanvas();
        hideLoadingOverlay();
        resolve(dataUrl);
      }
    });
  }

  async function loadFrameByIndex(index) {
    if (!state.allTimestamps.length || index < 0 || index >= state.allTimestamps.length) return null;

    const timestamp = state.allTimestamps[index];
    let dataUrl = await getCachedRadarFrameAsDataURL(state.lat, state.lon, state.layer, timestamp);

    if (!dataUrl) {
      const result = await fetchRadarImageForTimestamp(state.lat, state.lon, state.layer, timestamp);
      if (result.error) return null;
      dataUrl = result.imageUrl;
    }

    const currentImg = new Image();
    loadedImage = currentImg;
    isCurrentImageLoaded = false;
    
    return new Promise((resolve) => {
      currentImg.onload = () => {
        if (loadedImage !== currentImg) return;
        isCurrentImageLoaded = true;
        state.currentFrameIndex = index;
        updateTimestampDisplay(timestamp);
        renderCanvas();
        updateTimelineUI();
        updateCenterCoordReadout();
        resolve(dataUrl);
      };
      currentImg.onerror = () => resolve(null);
      currentImg.src = dataUrl;
    });
  }

  // ===== PRE-FETCHING =====
  async function preFetchFrames() {
    if (!state.allTimestamps.length) return;

    state.isPreFetching = true;
    state.preFetchProgress = 0;

    const startIdx = Math.max(0, state.allTimestamps.length - PRE_FETCH_COUNT);
    state.totalPreFetch = PRE_FETCH_COUNT;

    for (let i = startIdx; i < state.allTimestamps.length; i++) {
      const timestamp = state.allTimestamps[i];
      const cached = await getCachedRadarFrameAsDataURL(state.lat, state.lon, state.layer, timestamp);
      if (!cached) {
        await fetchRadarImageForTimestamp(state.lat, state.lon, state.layer, timestamp);
      }
      state.preFetchProgress++;
      updatePrefetchUI();

      await new Promise(r => setTimeout(r, 10));
    }

    state.isPreFetching = false;
    state.preFetchProgress = state.totalPreFetch;
    updatePrefetchUI();
  }

  function updatePrefetchUI() {
    const progressBar = document.getElementById('radar-prefetch-progress');
    const progressText = document.getElementById('radar-frame-count-text');
    const loadAllBtn = document.getElementById('radar-load-all-btn');

    if (state.allTimestamps.length === 0) {
      if (progressBar) progressBar.style.width = '0%';
      if (progressText) progressText.textContent = '';
      if (loadAllBtn) loadAllBtn.style.display = 'none';
      return;
    }

    const available = state.allTimestamps.length;
    const cached = state.preFetchProgress || 0;

    if (progressText) {
      progressText.textContent = `${cached}/${available} frames`;
    }

    const loadingText = document.getElementById('radar-loading-text');
    if (loadingText && state.isLoading) {
      loadingText.textContent = `${cached}/${available} frames loaded...`;
    }

    if (progressBar) {
      const pct = state.totalPreFetch > 0 ? (state.preFetchProgress / state.totalPreFetch) * 100 : 0;
      progressBar.style.width = `${pct}%`;
    }

    // Show load all button if not all frames are cached
    if (loadAllBtn) {
      const allCached = state.allTimestamps.length <= state.preFetchProgress;
      loadAllBtn.style.display = allCached ? 'none' : 'flex';
      if (allCached) {
        loadAllBtn.innerHTML = '<span class="radar-check-icon">✓</span> All Loaded';
      } else {
        loadAllBtn.innerHTML = 'Load All Frames';
      }
    }
  }

  // ===== ZOOM =====
  function zoomTo(zoomLevel, centerX, centerY) {
    if (zoomLevel < 0 || zoomLevel >= ZOOM_LEVELS.length) return;
    const oldZoom = state.zoomLevel;
    state.zoomLevel = zoomLevel;
    const newZoom = ZOOM_LEVELS[zoomLevel];
    const oldZoomFactor = ZOOM_LEVELS[oldZoom] || 1;

    const container = document.getElementById('radar-canvas-container');
    if (container) {
      const rect = container.getBoundingClientRect();
      canvasWidth = Math.min(rect.width, CANVAS_BASE_SIZE);
      canvasHeight = canvasWidth;
      canvas.style.width = canvasWidth + 'px';
      canvas.style.height = canvasHeight + 'px';
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
    }

    if (centerX != null && centerY != null && isImageLoaded()) {
      const rect = canvas.getBoundingClientRect();
      const mouseX = centerX - rect.left;
      const mouseY = centerY - rect.top;
      
      const scaleOld = (rect.width / CANVAS_BASE_SIZE) * oldZoomFactor;
      const imgW = CANVAS_BASE_SIZE * scaleOld;
      const imgH = CANVAS_BASE_SIZE * scaleOld;
      const imgTopLeftX = (rect.width - imgW) / 2 + state.panX;
      const imgTopLeftY = (rect.height - imgH) / 2 + state.panY;
      
      const pointInImageX = (mouseX - imgTopLeftX) / scaleOld;
      const pointInImageY = (mouseY - imgTopLeftY) / scaleOld;
      
      const scaleNew = (rect.width / CANVAS_BASE_SIZE) * newZoom;
      const newImgW = CANVAS_BASE_SIZE * scaleNew;
      const newImgH = CANVAS_BASE_SIZE * scaleNew;
      
      const newTopLeftX = mouseX - pointInImageX * scaleNew;
      const newTopLeftY = mouseY - pointInImageY * scaleNew;
      
      state.panX = newTopLeftX - (rect.width - newImgW) / 2;
      state.panY = newTopLeftY - (rect.height - newImgH) / 2;
    }

    if (canvas) {
      canvas.style.cursor = isImageLoaded() ? 'grab' : 'default';
    }

    updateZoomUI();
    renderCanvas();
  }

  function zoomIn() {
    const newLevel = Math.min(ZOOM_LEVELS.length - 1, state.zoomLevel + 1);
    if (newLevel !== state.zoomLevel) zoomTo(newLevel);
  }

  function zoomOut() {
    const newLevel = Math.max(0, state.zoomLevel - 1);
    if (newLevel !== state.zoomLevel) zoomTo(newLevel);
  }

  function resetView() {
    state.zoomLevel = 0;
    state.panX = 0;
    state.panY = 0;
    updateZoomUI();
    renderCanvas();
  }

  function updateZoomUI() {
    const zoomLevel = ZOOM_LEVELS[state.zoomLevel];
    const zoomText = document.getElementById('radar-zoom-text');
    if (zoomText) {
      zoomText.textContent = `${Math.round(zoomLevel * 100)}%`;
    }

    // Update zoom level buttons
    document.querySelectorAll('.radar-zoom-level-btn').forEach(btn => {
      const level = parseInt(btn.dataset.zoom);
      btn.classList.toggle('active', level === state.zoomLevel);
    });

    // Update center position readout
    updateCenterCoordReadout();
  }

  // ===== PAN =====
  function panFrame(direction) {
    if (!state.allTimestamps.length) return;
    const newIdx = state.currentFrameIndex + direction;
    if (newIdx < 0 || newIdx >= state.allTimestamps.length) return;

    if (state.isPlaying) togglePlayback();

    loadFrameByIndex(newIdx);
  }

  function panToTimestamp(timestamp) {
    const idx = state.allTimestamps.indexOf(timestamp);
    if (idx === -1) return;
    panFrame(idx - state.currentFrameIndex);
  }

  // ===== PLAYBACK =====
  function togglePlayback() {
    if (!state.allTimestamps.length || !isImageLoaded()) return;

    if (state.isPlaying) {
      stopPlayback();
    } else {
      startPlayback();
    }
  }

  function startPlayback() {
    state.isPlaying = true;
    state.currentFrameIndex = -1;
    state.lastFrameTime = Date.now();

    const playBtn = document.getElementById('radar-play-btn');
    if (playBtn) {
      playBtn.classList.add('active');
      playBtn.textContent = '⏸';
    }

    const timelineContainer = document.getElementById('radar-timeline-container');
    if (timelineContainer) {
      timelineContainer.classList.add('playing');
    }

    const playerHeader = document.getElementById('radar-player-card')?.querySelector('.radar-player-header');
    if (playerHeader) {
      playerHeader.classList.add('playing');
    }

    playbackLoop();
  }

  function stopPlayback() {
    state.isPlaying = false;
    if (state.animFrameId) {
      cancelAnimationFrame(state.animFrameId);
      state.animFrameId = null;
    }

    const playBtn = document.getElementById('radar-play-btn');
    if (playBtn) {
      playBtn.classList.remove('active');
      playBtn.textContent = '▶';
    }

    const timelineContainer = document.getElementById('radar-timeline-container');
    if (timelineContainer) {
      timelineContainer.classList.remove('playing');
    }

    const playerHeader = document.getElementById('radar-player-card')?.querySelector('.radar-player-header');
    if (playerHeader) {
      playerHeader.classList.remove('playing');
    }
  }

  function playbackLoop() {
    if (!state.isPlaying) return;

    const now = Date.now();
    const interval = 1000 / (state.speed * 2);

    if (now - state.lastFrameTime >= interval) {
      state.lastFrameTime = now;

      state.currentFrameIndex++;
      if (state.currentFrameIndex >= state.allTimestamps.length) {
        state.currentFrameIndex = 0;
      }

      loadFrameByIndex(state.currentFrameIndex);

      updateTimelineProgress();
    }

    state.animFrameId = requestAnimationFrame(playbackLoop);
  }

  // ===== TIMELINE =====
  function updateTimelineUI() {
    const timelineContainer = document.getElementById('radar-timeline');
    if (!timelineContainer || !state.allTimestamps.length) return;

    const existingDots = timelineContainer.querySelectorAll('.radar-timeline-dot');
    if (existingDots.length !== state.allTimestamps.length) {
      while (timelineContainer.firstChild) {
        timelineContainer.removeChild(timelineContainer.firstChild);
      }

      state.allTimestamps.forEach((timestamp, idx) => {
        const dot = document.createElement('div');
        dot.className = 'radar-timeline-dot';
        if (idx === state.currentFrameIndex) {
          dot.classList.add('active');
        }

        const hasCache = getCachedRadarFrameAsDataURL(state.lat, state.lon, state.layer, timestamp) !== null;
        if (!hasCache) {
          dot.classList.add('uncached');
        }

        const date = new Date(timestamp);
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        dot.title = `${timeStr}`;
        dot.dataset.timestamp = timestamp;
        dot.dataset.index = idx;

        dot.addEventListener('click', () => {
          if (state.isPlaying) stopPlayback();
          loadFrameByIndex(parseInt(dot.dataset.index));
        });

        timelineContainer.appendChild(dot);
      });
    } else {
      const dots = timelineContainer.querySelectorAll('.radar-timeline-dot');
      dots.forEach((dot, idx) => {
        dot.classList.toggle('active', idx === state.currentFrameIndex);
      });
    }

    const timeRange = document.getElementById('radar-time-range');
    if (timeRange && state.allTimestamps.length > 0) {
      const start = new Date(state.allTimestamps[0]);
      const end = new Date(state.allTimestamps[state.allTimestamps.length - 1]);
      timeRange.textContent = `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
  }

  // ===== TIMELINE SCRUBBING =====
  function setupTimelineScrubbing() {
    const progressBar = document.getElementById('radar-timeline-progress-bar');
    if (!progressBar) return;

    let isScrubbing = false;

    progressBar.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isScrubbing = true;
      scrubToPosition(e);
    });

    window.addEventListener('mousemove', (e) => {
      if (!isScrubbing) return;
      scrubToPosition(e);
    });

    window.addEventListener('mouseup', () => {
      isScrubbing = false;
    });

    progressBar.addEventListener('touchstart', (e) => {
      isScrubbing = true;
      scrubToPosition(e.touches[0]);
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
      if (!isScrubbing) return;
      scrubToPosition(e.touches[0]);
    }, { passive: true });

    window.addEventListener('touchend', () => {
      isScrubbing = false;
    });

    function scrubToPosition(e) {
      const rect = progressBar.getBoundingClientRect();
      let pct = (e.clientX - rect.left) / rect.width;
      pct = Math.max(0, Math.min(1, pct));

      if (!state.allTimestamps.length) return;

      const targetIdx = Math.round(pct * (state.allTimestamps.length - 1));

      if (targetIdx !== state.currentFrameIndex) {
        if (state.isPlaying) stopPlayback();
        loadFrameByIndex(targetIdx);
      }
    }
  }

  function updateTimelineProgress() {
    const progressBar = document.getElementById('radar-timeline-progress');
    if (!progressBar || !state.allTimestamps.length) return;

    const pct = state.currentFrameIndex >= 0
      ? ((state.currentFrameIndex + 1) / state.allTimestamps.length) * 100
      : 0;
    progressBar.style.width = `${pct}%`;

    const timelineContainer = document.getElementById('radar-timeline');
    if (!timelineContainer) return;
    const dots = timelineContainer.querySelectorAll('.radar-timeline-dot');
    dots.forEach((dot, idx) => {
      dot.classList.toggle('active', idx === state.currentFrameIndex);
    });
  }

  function updateTimestampDisplay(timestamp) {
    const timestampEl = document.getElementById('radar-timestamp');
    const loadingOverlay = document.getElementById('radar-loading-overlay');
    if (!timestampEl) return;
    
    if (!timestamp) {
      timestampEl.textContent = '--:--';
      return;
    }
    
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      timestampEl.textContent = '--:--';
      return;
    }
    
    timestampEl.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    if (loadingOverlay) loadingOverlay.classList.add('hidden');
  }

  // ===== CANVAS RENDERING =====
  function isImageLoaded() {
    return isCurrentImageLoaded;
  }

  function renderCanvas() {
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvasHeight);

    ctx.fillStyle = '#0d0d1a';
    ctx.fillRect(0, 0, canvas.width, canvasHeight);

    if (!isImageLoaded()) {
      drawLoadingSpinner(ctx, canvas.width / 2, canvas.height / 2);
      return;
    }

    const zoom = ZOOM_LEVELS[state.zoomLevel] || 1;
    const scale = (canvasWidth / CANVAS_BASE_SIZE) * zoom;
    const imgW = CANVAS_BASE_SIZE * scale;
    const imgH = CANVAS_BASE_SIZE * scale;

    ctx.save();
    ctx.translate(state.panX, state.panY);

    const offsetX = (canvas.width - imgW) / 2;
    const offsetY = (canvas.height - imgH) / 2;
    ctx.drawImage(loadedImage, offsetX, offsetY, imgW, imgH);

    if (state.showPins && state.pins.length > 0) {
      drawPins(ctx, offsetX, offsetY, scale, imgW, imgH);
    }

    ctx.restore();
  }

  // ===== PIN RENDERING =====
  
  function drawPins(ctx, offsetX, offsetY, scale, imgW, imgH) {
    const zoom = ZOOM_LEVELS[state.zoomLevel] || 1;
    const pinSize = PIN_SIZE_BASE + (zoom - 1) * PIN_SIZE_SCALE;
    
    const topLeftX = offsetX;
    const topLeftY = offsetY;
    
    const viewLeft = -VIEWPORT_PADDING;
    const viewRight = canvas.width + VIEWPORT_PADDING;
    const viewTop = -VIEWPORT_PADDING;
    const viewBottom = canvas.height + VIEWPORT_PADDING;

    for (const pin of state.pins) {
      const pixelPos = window.latLonToPixel(pin.lat, pin.lon, state.lat, state.lon, window.RADAR_BBOX_RADIUS_KM);
      
      const pinX = topLeftX + (pixelPos.x / CANVAS_BASE_SIZE) * imgW;
      const pinY = topLeftY + (pixelPos.y / CANVAS_BASE_SIZE) * imgH;
      
      if (pinX < viewLeft || pinX > viewRight || pinY < viewTop || pinY > viewBottom) continue;
      
      const scaledPinSize = Math.max(MIN_PIN_SIZE, pinSize * scale / CANVAS_BASE_SIZE);
      const scaledFontSize = Math.max(BASE_FONT_SIZE - 2, Math.min(MAX_FONT_SIZE, BASE_FONT_SIZE * scale / CANVAS_BASE_SIZE));
      
      drawPin(ctx, pinX, pinY, scaledPinSize, pin.type, pin.label, zoom, scaledFontSize);
    }
  }

  function drawPin(ctx, x, y, size, type, label, zoom, fontSize) {
    const isUser = type === 'user';
    const pinColor = isUser ? '#4a9eff' : '#ff6b6b';
    const pinBorderColor = isUser ? '#2a7edf' : '#e05555';
    
    if (isUser && isImageLoaded()) {
      const pulseRadius = size * PIN_PULSE_RADIUS_MULTIPLIER;
      const pulseOpacity = (Math.sin(Date.now() / PIN_PULSE_PERIOD_MS) + 1) / PIN_PULSE_OPACITY_DIVISOR;
      ctx.beginPath();
      ctx.arc(x, y + size * PIN_CENTER_OFFSET, pulseRadius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(74, 158, 255, ${pulseOpacity})`;
      ctx.lineWidth = PIN_BORDER_WIDTH;
      ctx.stroke();
    }
    
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = PIN_SHADOW_BLUR;
    ctx.shadowOffsetX = PIN_SHADOW_OFFSET_X;
    ctx.shadowOffsetY = PIN_SHADOW_OFFSET_Y;
    
    const r = size;
    const topY = y - r * 1.5;
    
    ctx.beginPath();
    ctx.moveTo(x, topY);
    ctx.quadraticCurveTo(x - r, y - r * 0.3, x - r, y + r * PIN_CENTER_OFFSET);
    ctx.arc(x, y + r * PIN_CENTER_OFFSET, r, PIN_ARC_START_ANGLE, PIN_ARC_END_ANGLE, true);
    ctx.quadraticCurveTo(x + r, y - r * 0.3, x, topY);
    
    ctx.fillStyle = pinColor;
    ctx.fill();
    ctx.strokeStyle = pinBorderColor;
    ctx.lineWidth = PIN_BORDER_WIDTH;
    ctx.stroke();
    ctx.restore();
    
    ctx.beginPath();
    ctx.arc(x, y + r * PIN_CENTER_OFFSET, Math.max(MIN_DOT_RADIUS, r * PIN_DOT_RADIUS_MULTIPLIER), 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    
    const showLabel = zoom >= PIN_LABEL_MIN_ZOOM && zoom <= PIN_LABEL_MAX_ZOOM;
    if (showLabel && label) {
      ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      
      const textMetrics = ctx.measureText(label);
      const bgW = textMetrics.width + LABEL_PADDING * 2;
      const bgH = fontSize + LABEL_PADDING * 2;
      const bgX = x - bgW / 2;
      const bgY = y + r * PIN_LABEL_Y_OFFSET;
      
      ctx.fillStyle = 'rgba(13, 13, 26, 0.85)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      const cornerRadius = LABEL_CORNER_RADIUS;
      
      ctx.beginPath();
      ctx.moveTo(bgX + cornerRadius, bgY);
      ctx.lineTo(bgX + bgW - cornerRadius, bgY);
      ctx.quadraticCurveTo(bgX + bgW, bgY, bgX + bgW, bgY + cornerRadius);
      ctx.lineTo(bgX + bgW, bgY + bgH - cornerRadius);
      ctx.quadraticCurveTo(bgX + bgW, bgY + bgH, bgX + bgW - cornerRadius, bgY + bgH);
      ctx.lineTo(bgX + cornerRadius, bgY + bgH);
      ctx.quadraticCurveTo(bgX, bgY + bgH, bgX, bgY + bgH - cornerRadius);
      ctx.lineTo(bgX, bgY + cornerRadius);
      ctx.quadraticCurveTo(bgX, bgY, bgX + cornerRadius, bgY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      
      ctx.fillStyle = isUser ? '#4a9eff' : '#fff';
      ctx.fillText(label, x, bgY + LABEL_PADDING);
    }
  }

  // ===== PIN UPDATE =====
  function updatePins(weatherDataList, userLoc) {
    if (!weatherDataList) return;
    
    state.pins = [];
    
    // Start pin animation loop if radar is loaded
    if (isImageLoaded() && !state.pinAnimFrameId) {
      startPinAnimation();
    }
    
    // Add user location pin
    if (userLoc && userLoc.lat != null && userLoc.lon != null) {
      state.pins.push({
        lat: userLoc.lat,
        lon: userLoc.lon,
        label: 'You',
        type: 'user',
      });
    }
    
    // Add city pins from weather data
    for (const city of weatherDataList) {
      if (city.latitude != null && city.longitude != null) {
        const cityName = city.name ? city.name.substring(0, 3).toUpperCase() : '??';
        state.pins.push({
          lat: city.latitude,
          lon: city.longitude,
          label: cityName,
          type: 'city',
        });
      }
    }
    
    renderCanvas();
  }

  // ===== PIN TOGGLE =====
  function togglePins() {
    state.showPins = !state.showPins;
    const pinBtn = document.getElementById('radar-pins-btn');
    if (pinBtn) {
      pinBtn.classList.toggle('active', state.showPins);
      pinBtn.title = state.showPins ? 'Hide pins' : 'Show pins';
      pinBtn.dataset.tooltip = state.showPins ? 'Hide pins' : 'Show pins';
    }
    
    if (isImageLoaded() && !state.pinAnimFrameId) {
      startPinAnimation();
    } else if (!state.showPins && state.pinAnimFrameId) {
      cancelAnimationFrame(state.pinAnimFrameId);
      state.pinAnimFrameId = null;
    }
    
    renderCanvas();
  }

  // ===== PIN ANIMATION LOOP =====
  function startPinAnimation() {
    if (state.pinAnimFrameId) return;
    
    function animatePins() {
      if (!isImageLoaded() || !state.showPins || state.pins.length === 0) {
        state.pinAnimFrameId = null;
        return;
      }
      renderCanvas();
      state.pinAnimFrameId = requestAnimationFrame(animatePins);
    }
    
    animatePins();
  }

  function drawLoadingSpinner(ctx, cx, cy) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = SPINNER_LINE_WIDTH;
    ctx.beginPath();
    ctx.arc(cx, cy, SPINNER_RADIUS, 0, Math.PI * 2);
    ctx.stroke();

    const time = Date.now() / 1000;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = SPINNER_LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, SPINNER_RADIUS, -Math.PI / 2 + time * SPINNER_ROTATION_SPEED, Math.PI / 2 + time * SPINNER_ROTATION_SPEED);
    ctx.stroke();
  }

  // ===== LAYER SWITCHING =====
  async function switchLayer(layer) {
    if (layer === state.layer) return;

    const oldLayer = state.layer;
    state.layer = layer;

    // Stop playback
    if (state.isPlaying) stopPlayback();

    // Clear state for new layer
    state.allTimestamps = [];
    state.cachedTimestamps = [];
    state.currentFrameIndex = -1;
    state.frames = null;
    loadedImage = null;

    // Get timestamps for new layer from WMS (not just metadata) — use all timestamps, not just latest
    const allTimestamps = await getRadarTimestampsForLayer(layer);
    if (allTimestamps && allTimestamps.length > 0) {
      state.allTimestamps = [...allTimestamps].sort();
    } else {
      // Fallback: try metadata cache, then latest timestamp
      const meta = getRadarMeta(state.lat, state.lon, state.layer);
      if (meta && meta.timestamps && meta.timestamps.length > 0) {
        state.allTimestamps = [...meta.timestamps].sort();
      } else {
        const latestTimestamp = await getLatestRadarTimestamp();
        if (latestTimestamp) {
          state.allTimestamps = [latestTimestamp];
        }
      }
    }

    // Update UI - set layer select value WITHOUT triggering another change event
    const layerSelect = document.getElementById('radar-layer-select');
    if (layerSelect) {
      layerSelect.value = layer;
    }

    updateZoomUI();

    // Show loading overlay for layer switch
    state.isLoading = true;
    showLoadingOverlay('Switching layer...');
    
    const loadResult = await loadCurrentFrame();
    if (!loadResult && state.allTimestamps.length > 0) {
      showErrorOverlay('Failed to load radar image');
      hideErrorOverlay();
      return;
    }
    
    hideLoadingOverlay();
    state.isLoading = false;
    state.isLoaded = true;

    updateTimelineUI();
    updatePrefetchUI();
    renderCanvas();
    
    // Update center coordinate readout after layer switch
    updateCenterCoordReadout();
  }

  // ===== FULLSCREEN =====
  function toggleFullscreen() {
    const card = document.getElementById('radar-player-card');
    if (!card) return;

    if (state.isFullscreen) {
      exitFullscreen();
    } else {
      enterFullscreen();
    }
  }

  function enterFullscreen() {
    state.isFullscreen = true;
    const card = document.getElementById('radar-player-card');
    const fsBtn = document.getElementById('radar-fullscreen-btn');
    if (card) card.classList.add('fullscreen');
    if (fsBtn) {
      fsBtn.classList.add('active');
      fsBtn.textContent = '⛶';
    }

    if (card) {
      card.style.position = 'fixed';
      card.style.inset = '0';
      card.style.zIndex = '999';
      card.style.margin = '0';
      card.style.borderRadius = '0';
      card.style.maxWidth = '100%';
      card.style.width = '100%';
    }

    setTimeout(() => {
      updateCanvasSize();
      renderCanvas();
    }, 100);
  }

  function exitFullscreen() {
    state.isFullscreen = false;
    const card = document.getElementById('radar-player-card');
    const fsBtn = document.getElementById('radar-fullscreen-btn');
    if (card) {
      card.classList.remove('fullscreen');
      card.style.position = '';
      card.style.inset = '';
      card.style.zIndex = '';
      card.style.margin = '';
      card.style.borderRadius = '';
      card.style.maxWidth = '';
      card.style.width = '';
    }
    if (fsBtn) {
      fsBtn.classList.remove('active');
      fsBtn.textContent = '⛶';
    }

    setTimeout(() => {
      updateCanvasSize();
      renderCanvas();
    }, 100);
  }

  // ===== COORDINATE READOUT =====
  function setupCoordReadout() {
    const container = document.getElementById('radar-canvas-container');
    if (!container) return;

    const coordReadout = document.createElement('div');
    coordReadout.id = 'radar-coord-readout';
    coordReadout.className = 'radar-header-coord-readout';
    
    const coordText = document.createElement('span');
    coordText.id = 'radar-center-coords';
    coordText.textContent = '---';
    
    const formatSelect = document.createElement('select');
    formatSelect.id = 'radar-coord-format-select';
    formatSelect.className = 'coord-format-select';
    
    COORD_FORMATS.forEach(fmt => {
      const option = document.createElement('option');
      option.value = fmt.value;
      option.textContent = fmt.label;
      if (fmt.value === state.coordFormat) option.selected = true;
      formatSelect.appendChild(option);
    });
    
    formatSelect.addEventListener('mousedown', (e) => e.stopPropagation());
    formatSelect.addEventListener('click', (e) => e.stopPropagation());
    
    formatSelect.addEventListener('change', () => {
      state.coordFormat = formatSelect.value;
      updateCenterCoordReadout();
    });
    
    const zoomLevel = document.createElement('span');
    zoomLevel.id = 'radar-zoom-readout';
    zoomLevel.className = 'zoom-level';
    zoomLevel.textContent = `${Math.round((ZOOM_LEVELS[state.zoomLevel] || 1) * 100)}%`;
    
    coordReadout.appendChild(coordText);
    coordReadout.appendChild(formatSelect);
    coordReadout.appendChild(zoomLevel);
    
    const headerSection = document.getElementById('radar-coord-readout-section');
    if (headerSection) {
      headerSection.appendChild(coordReadout);
    }

    const mouseTooltip = document.createElement('div');
    mouseTooltip.id = 'radar-mouse-coord-tooltip';
    mouseTooltip.className = 'radar-mouse-coord-tooltip';
    container.appendChild(mouseTooltip);

    canvas.addEventListener('mouseenter', () => {
      mouseTooltip.style.display = 'block';
    });
    
    canvas.addEventListener('mouseleave', () => {
      mouseTooltip.style.display = 'none';
    });
    
    canvas.addEventListener('mousemove', (e) => {
      updateMouseCoordTooltip(e);
    });
  }

  function updateCenterCoordReadout() {
    const centerCoordsEl = document.getElementById('radar-center-coords');
    const zoomReadoutEl = document.getElementById('radar-zoom-readout');
    
    if (!centerCoordsEl || !zoomReadoutEl) return;
    
    const zoomLevel = ZOOM_LEVELS[state.zoomLevel] || 1;
    zoomReadoutEl.textContent = `${Math.round(zoomLevel * 100)}%`;
    
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;
    const centerPos = pixelToLatLon(centerX, centerY);
    
    if (centerPos.lat != null && centerPos.lon != null) {
      centerCoordsEl.textContent = formatCoordinate(centerPos.lat, centerPos.lon, state.coordFormat);
    } else {
      centerCoordsEl.textContent = '---';
    }
  }

  function updateMouseCoordTooltip(e) {
    const mouseTooltip = document.getElementById('radar-mouse-coord-tooltip');
    if (!mouseTooltip) return;
    
    if (state.isPanning) return;
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const centerPos = pixelToLatLon(mouseX, mouseY);
    
    if (centerPos.lat != null && centerPos.lon != null) {
      const coordText = formatCoordinate(centerPos.lat, centerPos.lon, state.coordFormat);
      mouseTooltip.textContent = coordText;
      
      let tooltipX = e.clientX - rect.left + 12;
      let tooltipY = e.clientY - rect.top - 30;
      
      const tooltipWidth = mouseTooltip.offsetWidth || TOOLTIP_DEFAULT_WIDTH;
      if (tooltipX + tooltipWidth > canvasWidth) {
        tooltipX = e.clientX - rect.left - tooltipWidth - TOOLTIP_BOTTOM_PADDING;
      }
      
      const tooltipHeight = mouseTooltip.offsetHeight || 24;
      if (tooltipY + tooltipHeight > canvasHeight) {
        tooltipY = e.clientY - rect.top - tooltipHeight - TOOLTIP_BOTTOM_PADDING;
      }
      
      mouseTooltip.style.left = tooltipX + 'px';
      mouseTooltip.style.top = tooltipY + 'px';
    }
  }

  // ===== INVERSE: PIXEL → LAT/LON =====
  function pixelToLatLon(pixelX, pixelY) {
    const zoom = ZOOM_LEVELS[state.zoomLevel] || 1;
    const scale = (canvasWidth / CANVAS_BASE_SIZE) * zoom;
    const imgW = CANVAS_BASE_SIZE * scale;
    const imgH = CANVAS_BASE_SIZE * scale;
    
    const offsetX = (canvasWidth - imgW) / 2 + state.panX;
    const offsetY = (canvasHeight - imgH) / 2 + state.panY;
    
    const imageX = ((pixelX - offsetX) / scale);
    const imageY = ((pixelY - offsetY) / scale);
    
    const bbox = window.latLonToBboxEPSG3857(state.lat, state.lon, window.RADAR_BBOX_RADIUS_KM);
    const [minx, miny, maxx, maxy] = bbox;
    
    const x = minx + (imageX / CANVAS_BASE_SIZE) * (maxx - minx);
    const y = maxy - (imageY / CANVAS_BASE_SIZE) * (maxy - miny);
    
    const latFromY = (360 * Math.atan(Math.exp(y * Math.PI / 20037508.34)) / Math.PI) - 90;
    
    const lon = x * 180 / 20037508.34;
    
    return { lat: latFromY, lon };
  }

  // ===== CENTER POSITION CALCULATION =====
  function getCenterLatLon() {
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;
    return pixelToLatLon(centerX, centerY);
  }

  // ===== UTILITY =====
  function getZoomPercent() {
    return Math.round((ZOOM_LEVELS[state.zoomLevel] || 1) * 100);
  }

  // ===== PUBLIC API =====
  const RadarPlayer = {
    init: initRadarPlayer,
    togglePlayback,
    stopPlayback,
    zoomIn,
    zoomOut,
    resetView,
    switchLayer,
    panFrame,
    toggleFullscreen,
    togglePins,
    updatePins,
    getZoomPercent,
    getState: () => ({ ...state }),
  };

  window.RADAR_PLAYER = RadarPlayer;

})();
