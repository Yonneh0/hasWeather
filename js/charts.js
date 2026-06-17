// ===== CHART CONSTANTS =====
const CHART_PAD_MERGED = { top: 6, right: 0, bottom: 6, left: 0 };
const CHART_PAD_COMBINED = { top: 10, right: 10, bottom: 10, left: 10 };

// Grid and layout
const GRID_LINE_COUNT = 3;
const TEMP_LABEL_OFFSET_X = 17;
const TEMP_LABEL_OFFSET_Y = 3;

// Bar dimensions
const BAR_WIDTH_MIN = 2;
const BAR_WIDTH_RATIO = 0.5;
const RAINFOALL_HEIGHT_RATIO = 0.25;
const COMBINED_RAIN_HEIGHT_RATIO = 0.2;

// Line widths
const LINE_WIDTH_GRID = 0.5;
const LINE_WIDTH_TEMP = 2;
const LINE_WIDTH_WIND = 1;
const LINE_WIDTH_HUMIDITY = 1.5;

// Dot radii
const DOT_RADIUS_TEMP = 2.5;
const DOT_RADIUS_WIND = 1.5;

// Wind height ratios
const WIND_HEIGHT_RATIO_MERGED = 0.15;
const WIND_HEIGHT_RATIO_COMBINED = 1.0;

// Humidity scale
const HUMIDITY_SCALE = 100;

// Particle dimensions
const PARTICLE_RADIUS_MIN = 0.5;
const PARTICLE_RADIUS_MAX = 1.5;
const PARTICLE_SPEED_MIN = 0.1;
const PARTICLE_SPEED_MAX = 0.3;
const PARTICLE_OPACITY_MIN = 0.05;
const PARTICLE_OPACITY_MAX = 0.1;
const PARTICLE_PAUSE_Y = -10;
const PARTICLE_RESUME_Y = 10;

// ===== CANVAS SETUP HELPER =====
function setupCanvas(canvasId, pad) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const w = rect.width;
  const h = rect.height;
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;
  return { ctx, canvas, w, h, pad, plotW, plotH };
}

// ===== GRID DRAWING HELPER =====
function drawGrid(ctx, pad, plotW, plotH, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = LINE_WIDTH_GRID;
  for (let i = 0; i <= GRID_LINE_COUNT; i++) {
    const y = pad.top + (plotH / GRID_LINE_COUNT) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + plotW, y);
    ctx.stroke();
  }
}

// ===== CLEAN CANVAS CHART =====
function drawMergedChart(canvasId, cityData, dayHigh, dayLow, startIndex = 0) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const w = rect.width;
  const h = rect.height;
  const pad = CHART_PAD_MERGED;

  ctx.clearRect(0, 0, w, h);

  const hourly = cityData.hourly || {};
  // Slice to 24 hours starting from startIndex, convert temps to current unit
  const temps = (hourly.temperature_2m || []).slice(startIndex, startIndex + 24).map(v => convertTemp(v));
  const rain = (hourly.precipitation || []).slice(startIndex, startIndex + 24);
  const wind = (hourly.wind_speed_10m || []).slice(startIndex, startIndex + 24);

  if (temps.length === 0) return;

  const n = temps.length;
  const stepX = w / (n - 1 || 1);

  // Temp range - use day high/low when available
  const tempMin = (dayLow != null ? dayLow : Math.min(...temps)) - 2;
  const tempMax = (dayHigh != null ? dayHigh : Math.max(...temps)) + 2;
  const tempRange = tempMax - tempMin || 1;

  // Rain max
  const rainMax = Math.max(...rain, 0.5);

  // Wind max
  const windMax = Math.max(...wind, 1);

  // Draw grid lines
  drawGrid(ctx, pad, w, h, 'rgba(255,255,255,0.04)');

  // Temperature area fill
  const tempFillGrad = ctx.createLinearGradient(0, pad.top, 0, pad.top + h);
  tempFillGrad.addColorStop(0, 'rgba(255,140,66,0.25)');
  tempFillGrad.addColorStop(1, 'rgba(255,140,66,0.02)');

  ctx.beginPath();
  temps.forEach((v, i) => {
    const x = pad.left + i * stepX;
    const y = pad.top + (1 - (v - tempMin) / tempRange) * h;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(pad.left + (n - 1) * stepX, pad.top + h);
  ctx.lineTo(pad.left, pad.top + h);
  ctx.closePath();
  ctx.fillStyle = tempFillGrad;
  ctx.fill();

  // Temperature line
  ctx.beginPath();
  temps.forEach((v, i) => {
    const x = pad.left + i * stepX;
    const y = pad.top + (1 - (v - tempMin) / tempRange) * h;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#ff8c42';
  ctx.lineWidth = LINE_WIDTH_TEMP;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  // Temperature dots
  temps.forEach((v, i) => {
    const x = pad.left + i * stepX;
    const y = pad.top + (1 - (v - tempMin) / tempRange) * h;
    ctx.beginPath();
    ctx.arc(x, y, DOT_RADIUS_TEMP, 0, Math.PI * 2);
    ctx.fillStyle = '#ff8c42';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = LINE_WIDTH_WIND;
    ctx.stroke();
  });

  // Rain bars (bottom)
  const rainH = h * RAINFOALL_HEIGHT_RATIO;
  const rainY = pad.top + h - rainH;
  const barW = Math.max(BAR_WIDTH_MIN, stepX * BAR_WIDTH_RATIO);
  rain.forEach((v, i) => {
    const x = pad.left + i * stepX + (stepX - barW) / 2;
    const barH = (v / rainMax) * rainH;
    ctx.fillStyle = `rgba(77,166,255,${0.15 + (v / rainMax) * 0.35})`;
    ctx.fillRect(x, rainY + rainH - barH, barW, barH);
  });

  // Wind line (subtle)
  ctx.beginPath();
  wind.forEach((v, i) => {
    const x = pad.left + i * stepX;
    const y = pad.top + h - (v / windMax) * (h * WIND_HEIGHT_RATIO_MERGED);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = 'rgba(125,217,160,0.3)';
  ctx.lineWidth = LINE_WIDTH_WIND;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Temp labels on left
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '9px -apple-system, sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= GRID_LINE_COUNT; i++) {
    const val = tempMax - (tempRange / GRID_LINE_COUNT) * i;
    const y = pad.top + (h / GRID_LINE_COUNT) * i;
    ctx.fillText(Math.round(val) + '°', pad.left + TEMP_LABEL_OFFSET_X, y + TEMP_LABEL_OFFSET_Y);
  }

}

// ===== GHOST MERGED CHART (NWS overlay under OM) =====
function drawGhostMergedChart(canvasId, cityData, dayHigh, dayLow, currentIdx = 0) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const w = rect.width;
  const h = rect.height;
  const pad = CHART_PAD_MERGED;

  ctx.clearRect(0, 0, w, h);

  const hourly = cityData.hourly || {};
  // Use NWS data for ghost chart, slice from currentIdx to align with OM chart's time window
  const temps = (hourly.temperature_2m || hourly.temperature || []).slice(currentIdx, currentIdx + 24).map(v => convertTemp(v));
  const rain = (hourly.precipitation || []).slice(currentIdx, currentIdx + 24);
  const wind = (hourly.wind_speed_10m || hourly.windSpeed || []).slice(currentIdx, currentIdx + 24);

  if (temps.length === 0) return;

  const n = temps.length;
  const stepX = w / (n - 1 || 1);

  // Temp range - use day high/low when available
  const tempMin = (dayLow != null ? dayLow : Math.min(...temps)) - 2;
  const tempMax = (dayHigh != null ? dayHigh : Math.max(...temps)) + 2;
  const tempRange = tempMax - tempMin || 1;

  // Rain max
  const rainMax = Math.max(...rain, 0.5);

  // Wind max
  const windMax = Math.max(...wind, 1);

  // Draw grid lines (ghost)
  drawGrid(ctx, pad, w, h, 'rgba(0,48,135,0.06)');

  // Temperature area fill (ghost - blue tones)
  const tempFillGrad = ctx.createLinearGradient(0, pad.top, 0, pad.top + h);
  tempFillGrad.addColorStop(0, 'rgba(0,48,135,0.15)');
  tempFillGrad.addColorStop(1, 'rgba(0,48,135,0.02)');

  ctx.beginPath();
  temps.forEach((v, i) => {
    const x = pad.left + i * stepX;
    const y = pad.top + (1 - (v - tempMin) / tempRange) * h;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(pad.left + (n - 1) * stepX, pad.top + h);
  ctx.lineTo(pad.left, pad.top + h);
  ctx.closePath();
  ctx.fillStyle = tempFillGrad;
  ctx.fill();

  // Temperature line (ghost - blue tones)
  ctx.beginPath();
  temps.forEach((v, i) => {
    const x = pad.left + i * stepX;
    const y = pad.top + (1 - (v - tempMin) / tempRange) * h;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = 'rgba(0,48,135,0.35)';
  ctx.lineWidth = LINE_WIDTH_TEMP;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  // Temperature dots (ghost - blue tones)
  temps.forEach((v, i) => {
    const x = pad.left + i * stepX;
    const y = pad.top + (1 - (v - tempMin) / tempRange) * h;
    ctx.beginPath();
    ctx.arc(x, y, DOT_RADIUS_TEMP, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,48,135,0.35)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,48,135,0.6)';
    ctx.lineWidth = LINE_WIDTH_WIND;
    ctx.stroke();
  });

  // Rain bars (ghost - blue tones)
  const rainH = h * RAINFOALL_HEIGHT_RATIO;
  const rainY = pad.top + h - rainH;
  const barW = Math.max(BAR_WIDTH_MIN, stepX * BAR_WIDTH_RATIO);
  rain.forEach((v, i) => {
    const x = pad.left + i * stepX + (stepX - barW) / 2;
    const barH = (v / rainMax) * rainH;
    ctx.fillStyle = `rgba(77,166,255,${0.08 + (v / rainMax) * 0.2})`;
    ctx.fillRect(x, rainY + rainH - barH, barW, barH);
  });

  // Wind line (ghost - blue tones)
  ctx.beginPath();
  wind.forEach((v, i) => {
    const x = pad.left + i * stepX;
    const y = pad.top + h - (v / windMax) * (h * WIND_HEIGHT_RATIO_MERGED);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = 'rgba(125,217,160,0.2)';
  ctx.lineWidth = LINE_WIDTH_WIND;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Temp labels on left (ghost - blue tones)
  ctx.fillStyle = 'rgba(0,48,135,0.4)';
  ctx.font = '9px -apple-system, sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= GRID_LINE_COUNT; i++) {
    const val = tempMax - (tempRange / GRID_LINE_COUNT) * i;
    const y = pad.top + (h / GRID_LINE_COUNT) * i;
    ctx.fillText(Math.round(val) + '°', pad.left + TEMP_LABEL_OFFSET_X, y + TEMP_LABEL_OFFSET_Y);
  }

}

// ===== COMBINED CHART =====
function drawCombinedChart(canvasId, cityData, startIndex = 0) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const w = rect.width;
  const h = rect.height;
  const pad = CHART_PAD_COMBINED;

  ctx.clearRect(0, 0, w, h);

  const hourly = cityData.hourly || {};
  // Slice to 24 hours starting from startIndex for consistent alignment
  const hum = (hourly.relative_humidity_2m || []).slice(startIndex, startIndex + 24);
  const wind = (hourly.wind_speed_10m || []).slice(startIndex, startIndex + 24);
  const rain = (hourly.precipitation || []).slice(startIndex, startIndex + 24);

  if (hum.length === 0) return;

  const n = hum.length;
  const stepX = w / (n - 1 || 1);
  const windMax = Math.max(...wind, 1);
  const rainMax = Math.max(...rain, 0.5);

  // Humidity gradient fill
  const humGrad = ctx.createLinearGradient(0, pad.top, 0, pad.top + h);
  humGrad.addColorStop(0, 'rgba(77,166,255,0.05)');
  humGrad.addColorStop(1, 'rgba(77,166,255,0.3)');
  ctx.beginPath();
  hum.forEach((v, i) => {
    const x = pad.left + i * stepX;
    const y = pad.top + h - (v / HUMIDITY_SCALE) * h;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(pad.left + (n - 1) * stepX, pad.top + h);
  ctx.lineTo(pad.left, pad.top + h);
  ctx.closePath();
  ctx.fillStyle = humGrad;
  ctx.fill();

  // Humidity line
  ctx.beginPath();
  hum.forEach((v, i) => {
    const x = pad.left + i * stepX;
    const y = pad.top + h - (v / HUMIDITY_SCALE) * h;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = 'rgba(77,166,255,0.7)';
  ctx.lineWidth = LINE_WIDTH_HUMIDITY;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  // Wind line
  ctx.beginPath();
  wind.forEach((v, i) => {
    const x = pad.left + i * stepX;
    const y = pad.top + h - (v / windMax) * (h * WIND_HEIGHT_RATIO_COMBINED);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = 'rgba(125,217,160,0.6)';
  ctx.lineWidth = LINE_WIDTH_HUMIDITY;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  // Wind dots
  wind.forEach((v, i) => {
    const x = pad.left + i * stepX;
    const y = pad.top + h - (v / windMax) * (h * WIND_HEIGHT_RATIO_COMBINED);
    ctx.beginPath();
    ctx.arc(x, y, DOT_RADIUS_WIND, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(125,217,160,0.8)';
    ctx.fill();
  });

  // Rain bars (bottom)
  const rainH = h * COMBINED_RAIN_HEIGHT_RATIO;
  const rainY = pad.top + h - rainH;
  const barW = Math.max(BAR_WIDTH_MIN, stepX * BAR_WIDTH_RATIO);
  rain.forEach((v, i) => {
    const x = pad.left + i * stepX + (stepX - barW) / 2;
    const barH = (v / rainMax) * rainH;
    ctx.fillStyle = `rgba(77,166,255,${0.15 + (v / rainMax) * 0.35})`;
    ctx.fillRect(x, rainY + rainH - barH, barW, barH);
  });

  // Labels
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '9px -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('100%', pad.left + 2, pad.top + 4);
  ctx.fillText('0%', pad.left + 2, pad.top + h);
  ctx.fillText(Math.round(windMax) + ' km/h', pad.left + 2, pad.top + h - 2);
}

// ===== CANVAS CHARTS =====
function drawAllCharts() {
  const now = new Date();
  weatherData.forEach((data) => {
    if (!data.weather) return;
    const hourly = data.weather.hourly || {};
    const safeName = data.place_id || `${data.latitude || 0}_${data.longitude || 0}`;
    if (Object.keys(hourly).length === 0) return;

    // Find current hour index using Date comparison for consistent alignment with ghost charts
    let startIdx = 0;
    const timeArr = hourly.time || [];
    for (let i = 0; i < timeArr.length; i++) {
      const ts = new Date(timeArr[i]);
      if (Math.abs(ts.getTime() - now.getTime()) <= 3600000) {
        startIdx = i;
        break;
      }
    }

    drawMergedChart(`chart-merged-${safeName}`, data.weather, data.highTemp, data.lowTemp, startIdx);
    drawCombinedChart(`chart-combined-${safeName}`, data.weather, startIdx);
  });
}

// ===== PARTICLE CANVAS =====
function initParticles() {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  let particles = [];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: Math.random() * (PARTICLE_RADIUS_MAX - PARTICLE_RADIUS_MIN) + PARTICLE_RADIUS_MIN,
      speed: Math.random() * (PARTICLE_SPEED_MAX - PARTICLE_SPEED_MIN) + PARTICLE_SPEED_MIN,
      opacity: Math.random() * (PARTICLE_OPACITY_MAX - PARTICLE_OPACITY_MIN) + PARTICLE_OPACITY_MIN,
    });
  }

  // Pause particles when the donkey runner game is active (reduces GPU compositing load)
  let animId = null;

  function animate() {
    if (animId) cancelAnimationFrame(animId);
    animId = null;

    function step() {
      animId = requestAnimationFrame(step);

      // Check if game is active — pause particles when game is running
      const isGameActive = typeof DONKEY_RUNNER !== 'undefined' && DONKEY_RUNNER && DONKEY_RUNNER.gameRunning;
      if (!isGameActive) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(p => {
          p.y -= p.speed;
          if (p.y < PARTICLE_PAUSE_Y) { p.y = canvas.height + PARTICLE_RESUME_Y; p.x = Math.random() * canvas.width; }
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255,255,255,${p.opacity})`;
          ctx.fill();
        });
      } else {
        // Clear canvas when paused to keep it clean (no particles drawn)
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
    step();
  }
  animate();
}

// ===== LOCATION PROMPT =====
