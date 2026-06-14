// ===== RADAR PLAYER ENGINE =====
// Enhanced radar UI with zoom, pan, timeline, and playback state management.
// Canvas-based rendering for smooth interactions.

(function() {
  'use strict';

  // ===== CONSTANTS =====
  const ZOOM_LEVELS = [1, 1.5, 2, 3];
  // Expose speed options globally so main.js can use them
  window.SPEED_OPTIONS = [0.5, 1, 2, 4, 8];
  const MAX_ZOOM = 3;
  const PAN_SPEED = 8; // pixels per frame at zoom 1
  const ZOOM_DURATION_MS = 300;
  const PRE_FETCH_COUNT = 50; // frames to pre-fetch on load

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
  };

  // ===== CANVAS SETUP =====
  let canvas = null;
  let ctx = null;
  let loadedImage = null;
  let isCurrentImageLoaded = false; // tracks the current image's load state independently
  let canvasWidth = 512;
  let canvasHeight = 512;

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

    canvas = document.getElementById('radar-canvas');
    ctx = canvas.getContext('2d');

    // Set canvas size based on zoom level
    updateCanvasSize();

    // Event listeners
    setupCanvasEvents();
    setupKeyboardEvents();

    // Load initial data
    setupTimelineScrubbing();
    loadInitialRadarFrame();
  }

  function updateCanvasSize() {
    const container = document.getElementById('radar-canvas-container');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    canvasWidth = Math.min(rect.width, 512);
    canvasHeight = canvasWidth;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
  }

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
      const zoom = ZOOM_LEVELS[state.zoomLevel];
      const dx = (e.clientX - state.panStartX) / zoom;
      const dy = (e.clientY - state.panStartY) / zoom;
      state.panX = state.panStartPanX + dx;
      state.panY = state.panStartPanY + dy;
      renderCanvas();
    });

    // Pan end
    window.addEventListener('mouseup', () => {
      if (state.isPanning) {
        state.isPanning = false;
        canvas.style.cursor = isImageLoaded() ? 'grab' : 'default';
      }
    });

    // Scroll to zoom
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -1 : 1;
      const newZoom = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, state.zoomLevel + delta));
      if (newZoom !== state.zoomLevel) {
        zoomTo(newZoom);
      }
    }, { passive: false });

    // Double-click to reset view
    canvas.addEventListener('dblclick', () => {
      resetView();
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
      // Only handle when radar player is visible
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

    // First, get the latest timestamp from WMS to initialize the timeline
    const latestTimestamp = await getLatestRadarTimestamp();
    if (latestTimestamp) {
      state.allTimestamps = [latestTimestamp];
    }

    // Try to load cached timestamps from metadata
    const meta = getRadarMeta(state.lat, state.lon, state.layer);
    if (meta && meta.timestamps && meta.timestamps.length > 0) {
      state.allTimestamps = [...meta.timestamps].sort();
    }

    // Fetch the latest frame first
    await loadCurrentFrame();

    // Hide loading overlay after initial frame loads
    hideLoadingOverlay();

    // Start pre-fetching adjacent frames
    if (state.allTimestamps.length > 0 && !state.isPreFetching) {
      await preFetchFrames();
    }

    state.isLoading = false;
    state.isLoaded = true;

    // Update UI
    updateTimelineUI();
    updatePrefetchUI();
    renderCanvas();
  }

  // ===== FRAME LOADING =====
  async function loadCurrentFrame() {
    const timestamp = state.allTimestamps.length > 0
      ? state.allTimestamps[state.allTimestamps.length - 1] // latest timestamp
      : null;

    return loadRadarFrameForTimestamp(state.lat, state.lon, state.layer, timestamp);
  }

  async function loadRadarFrameForTimestamp(lat, lon, layer, timestamp) {
    // Check cache first
    let dataUrl = await getCachedRadarFrameAsDataURL(lat, lon, layer, timestamp);

    if (!dataUrl) {
      // Fetch from WMS
      const result = await fetchRadarImageForTimestamp(lat, lon, layer, timestamp);
      if (result.error) {
        console.warn('[Radar Player] Failed to load frame:', result.error);
        return null;
      }
      dataUrl = result.imageUrl;
    }

    // Load image into canvas
    const currentImg = new Image();
    loadedImage = currentImg;
    isCurrentImageLoaded = false;
    
    return new Promise((resolve) => {
      // Set onload before setting src to avoid race conditions with cached images
      currentImg.onload = () => {
        // Ensure this is still the current image (not overwritten by a newer request)
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
      // Now set src - if the image is cached, onload may fire immediately
      currentImg.src = dataUrl;
      
      // If the image is already complete (cached), render immediately
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

    // Pre-fetch frames around the current position (last N frames)
    const startIdx = Math.max(0, state.allTimestamps.length - PRE_FETCH_COUNT);
    state.totalPreFetch = PRE_FETCH_COUNT;

    for (let i = startIdx; i < state.allTimestamps.length; i++) {
      const timestamp = state.allTimestamps[i];
      // Skip if already cached
      const cached = await getCachedRadarFrameAsDataURL(state.lat, state.lon, state.layer, timestamp);
      if (!cached) {
        await fetchRadarImageForTimestamp(state.lat, state.lon, state.layer, timestamp);
      }
      state.preFetchProgress++;
      updatePrefetchUI();

      // Yield to avoid blocking UI
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

    // Also update loading overlay text
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
  function zoomTo(zoomLevel) {
    if (zoomLevel < 0 || zoomLevel >= ZOOM_LEVELS.length) return;
    const oldZoom = state.zoomLevel;
    state.zoomLevel = zoomLevel;
    const newZoom = ZOOM_LEVELS[zoomLevel];
    const oldZoomFactor = ZOOM_LEVELS[oldZoom] || 1;

    // Update canvas size based on zoom
    const container = document.getElementById('radar-canvas-container');
    if (container) {
      const rect = container.getBoundingClientRect();
      canvasWidth = Math.min(rect.width, 512);
      canvasHeight = canvasWidth;
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
    }

    // Update cursor
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
  }

  // ===== PAN =====
  function panFrame(direction) {
    // Pan to adjacent frame in the timeline
    if (!state.allTimestamps.length) return;
    const newIdx = state.currentFrameIndex + direction;
    if (newIdx < 0 || newIdx >= state.allTimestamps.length) return;

    // Stop playback if active
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

    // Update UI
    const playBtn = document.getElementById('radar-play-btn');
    if (playBtn) {
      playBtn.classList.add('active');
      playBtn.textContent = '⏸';
    }

    // Show timeline progress during playback
    const timelineContainer = document.getElementById('radar-timeline-container');
    if (timelineContainer) {
      timelineContainer.classList.add('playing');
    }

    // Highlight play button in titlebar
    const playerHeader = document.getElementById('radar-player-card')?.querySelector('.radar-player-header');
    if (playerHeader) {
      playerHeader.classList.add('playing');
    }

    // Start playback loop
    playbackLoop();
  }

  function stopPlayback() {
    state.isPlaying = false;
    if (state.animFrameId) {
      cancelAnimationFrame(state.animFrameId);
      state.animFrameId = null;
    }

    // Update UI
    const playBtn = document.getElementById('radar-play-btn');
    if (playBtn) {
      playBtn.classList.remove('active');
      playBtn.textContent = '▶';
    }

    // Hide timeline progress during playback
    const timelineContainer = document.getElementById('radar-timeline-container');
    if (timelineContainer) {
      timelineContainer.classList.remove('playing');
    }

    // Remove highlight from play button in titlebar
    const playerHeader = document.getElementById('radar-player-card')?.querySelector('.radar-player-header');
    if (playerHeader) {
      playerHeader.classList.remove('playing');
    }
  }

  function playbackLoop() {
    if (!state.isPlaying) return;

    const now = Date.now();
    const interval = 1000 / (state.speed * 2); // base: 2 fps at 1x speed

    if (now - state.lastFrameTime >= interval) {
      state.lastFrameTime = now;

      // Move to next frame
      state.currentFrameIndex++;
      if (state.currentFrameIndex >= state.allTimestamps.length) {
        state.currentFrameIndex = 0; // loop back to start
      }

      // Load and render frame
      loadFrameByIndex(state.currentFrameIndex);

      // Update timeline progress
      updateTimelineProgress();
    }

    state.animFrameId = requestAnimationFrame(playbackLoop);
  }

  // ===== TIMELINE =====
  function updateTimelineUI() {
    const timelineContainer = document.getElementById('radar-timeline');
    const loadingOverlay = document.getElementById('radar-loading-overlay');
    if (!timelineContainer || !state.allTimestamps.length) return;

    // Clear existing dots
    while (timelineContainer.firstChild) {
      timelineContainer.removeChild(timelineContainer.firstChild);
    }

    // Create dots for each timestamp
    state.allTimestamps.forEach((timestamp, idx) => {
      const dot = document.createElement('div');
      dot.className = 'radar-timeline-dot';
      if (idx === state.currentFrameIndex) {
        dot.classList.add('active');
      }

      // Check if frame is cached
      const isCached = getCachedRadarFrameAsDataURL(state.lat, state.lon, state.layer, timestamp) !== null;
      if (!isCached) {
        dot.classList.add('uncached');
      }

      // Format time for tooltip
      const date = new Date(timestamp);
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      dot.title = `${timeStr}`;
      dot.dataset.timestamp = timestamp;
      dot.dataset.index = idx;

      // Click to seek
      dot.addEventListener('click', () => {
        if (state.isPlaying) stopPlayback();
        loadFrameByIndex(parseInt(dot.dataset.index));
      });

      timelineContainer.appendChild(dot);
    });

    // Update time range display
    const timeRange = document.getElementById('radar-time-range');
    if (timeRange && state.allTimestamps.length > 0) {
      const start = new Date(state.allTimestamps[0]);
      const end = new Date(state.allTimestamps[state.allTimestamps.length - 1]);
      timeRange.textContent = `${start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — ${end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }

    // Update timeline progress bar
    updateTimelineProgress();
  }

  // ===== TIMELINE SCRUBBING =====
  function setupTimelineScrubbing() {
    const progressBar = document.getElementById('radar-timeline-progress-bar');
    if (!progressBar) return;

    let isScrubbing = false;

    // Mouse down - start scrubbing
    progressBar.addEventListener('mousedown', (e) => {
      e.preventDefault();
      isScrubbing = true;
      scrubToPosition(e);
    });

    // Mouse move - continue scrubbing
    window.addEventListener('mousemove', (e) => {
      if (!isScrubbing) return;
      scrubToPosition(e);
    });

    // Mouse up - stop scrubbing
    window.addEventListener('mouseup', () => {
      isScrubbing = false;
    });

    // Touch events for mobile
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

      // Calculate which frame index to seek to
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

    // Update active dot
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
    if (!timestampEl || !timestamp) return;
    const date = new Date(timestamp);
    timestampEl.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    // Hide loading overlay when timestamp is set
    if (loadingOverlay) loadingOverlay.classList.add('hidden');
  }

  // ===== CANVAS RENDERING =====
  function isImageLoaded() {
    return isCurrentImageLoaded;
  }

  function renderCanvas() {
    if (!ctx || !canvas) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvasHeight);

    // Background
    ctx.fillStyle = '#0d0d1a';
    ctx.fillRect(0, 0, canvas.width, canvasHeight);

    if (!isImageLoaded()) {
      // Draw loading spinner
      drawLoadingSpinner(ctx, canvas.width / 2, canvas.height / 2);
      return;
    }

    const zoom = ZOOM_LEVELS[state.zoomLevel] || 1;
    const scale = (canvasWidth / 512) * zoom;
    const imgW = 512 * scale;
    const imgH = 512 * scale;

    ctx.save();

    // Apply pan offset
    ctx.translate(state.panX, state.panY);

    // Draw the image centered
    const offsetX = (canvas.width - imgW) / 2;
    const offsetY = (canvas.height - imgH) / 2;
    ctx.drawImage(loadedImage, offsetX, offsetY, imgW, imgH);

    ctx.restore();
  }

  function drawLoadingSpinner(ctx, cx, cy) {
    const radius = 16;
    const lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Spinning arc
    const time = Date.now() / 1000;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, radius, -Math.PI / 2 + time * 3, Math.PI / 2 + time * 3);
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

    // Get timestamps for new layer from WMS (not just metadata)
    const newTimestamp = await getLatestRadarTimestamp();
    if (newTimestamp) {
      state.allTimestamps = [newTimestamp];
    }
    const meta = getRadarMeta(state.lat, state.lon, state.layer);
    if (meta && meta.timestamps && meta.timestamps.length > 0) {
      state.allTimestamps = [...meta.timestamps].sort();
    }

    // Update UI
    const layerSelect = document.getElementById('radar-layer-select');
    if (layerSelect) {
      const option = layerSelect.querySelector(`option[value="${layer}"]`);
      if (option) option.selected = true;
    }

    updateZoomUI();

    // Show loading overlay for layer switch
    state.isLoading = true;
    showLoadingOverlay('Switching layer...');
    await loadCurrentFrame();
    hideLoadingOverlay();
    state.isLoading = false;
    state.isLoaded = true;

    updateTimelineUI();
    updatePrefetchUI();
    renderCanvas();
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
      fsBtn.textContent = '⛶'; // exit fullscreen icon
    }

    // Make card fixed overlay
    if (card) {
      card.style.position = 'fixed';
      card.style.inset = '0';
      card.style.zIndex = '999';
      card.style.margin = '0';
      card.style.borderRadius = '0';
      card.style.maxWidth = '100%';
      card.style.width = '100%';
    }

    // Update canvas size for fullscreen
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
      fsBtn.textContent = '⛶'; // enter fullscreen icon
    }

    setTimeout(() => {
      updateCanvasSize();
      renderCanvas();
    }, 100);
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
    getZoomPercent,
    getState: () => ({ ...state }),
  };

  // Expose globally
  window.RADAR_PLAYER = RadarPlayer;

})();