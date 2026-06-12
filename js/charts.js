// ===== CLEAN CANVAS CHART =====
function drawMergedChart(canvasId, cityData, dayHigh, dayLow) {
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
  const pad = { top: 6, right: 0, bottom: 6, left: 0 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);

  const hourly = cityData.hourly || {};
  // Slice to 24 hours (current day only), convert temps to current unit
  const temps = (hourly.temperature_2m || []).slice(0, 24).map(v => convertTemp(v));
  const rain = (hourly.precipitation || []).slice(0, 24);
  const wind = (hourly.wind_speed_10m || []).slice(0, 24);

  if (temps.length === 0) return;

  const n = temps.length;
  const stepX = plotW / (n - 1 || 1);

  // Temp range - use day high/low when available
  const tempMin = (dayLow != null ? dayLow : Math.min(...temps)) - 2;
  const tempMax = (dayHigh != null ? dayHigh : Math.max(...temps)) + 2;
  const tempRange = tempMax - tempMin || 1;

  // Rain max
  const rainMax = Math.max(...rain, 0.5);

  // Wind max
  const windMax = Math.max(...wind, 1);

  // Draw grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 3; i++) {
    const y = pad.top + (plotH / 3) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + plotW, y);
    ctx.stroke();
  }

  // Temperature area fill
  const tempFillGrad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
  tempFillGrad.addColorStop(0, 'rgba(255,140,66,0.25)');
  tempFillGrad.addColorStop(1, 'rgba(255,140,66,0.02)');

  ctx.beginPath();
  temps.forEach((v, i) => {
    const x = pad.left + i * stepX;
    const y = pad.top + (1 - (v - tempMin) / tempRange) * plotH;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(pad.left + (n - 1) * stepX, pad.top + plotH);
  ctx.lineTo(pad.left, pad.top + plotH);
  ctx.closePath();
  ctx.fillStyle = tempFillGrad;
  ctx.fill();

  // Temperature line
  ctx.beginPath();
  temps.forEach((v, i) => {
    const x = pad.left + i * stepX;
    const y = pad.top + (1 - (v - tempMin) / tempRange) * plotH;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#ff8c42';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  // Temperature dots
  temps.forEach((v, i) => {
    const x = pad.left + i * stepX;
    const y = pad.top + (1 - (v - tempMin) / tempRange) * plotH;
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ff8c42';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // Rain bars (bottom)
  const rainH = plotH * 0.25;
  const rainY = pad.top + plotH - rainH;
  const barW = Math.max(2, stepX * 0.5);
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
    const y = pad.top + plotH - (v / windMax) * (plotH * 0.15);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = 'rgba(125,217,160,0.3)';
  ctx.lineWidth = 1;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Temp labels on left
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '9px -apple-system, sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= 3; i++) {
    const val = tempMax - (tempRange / 3) * i;
    const y = pad.top + (plotH / 3) * i;
    ctx.fillText(Math.round(val) + '°', pad.left + 17, y + 3);
  }

}

// ===== COMBINED CHART =====
function drawCombinedChart(canvasId, cityData) {
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
  const pad = { top: 10, right: 10, bottom: 10, left: 10 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  ctx.clearRect(0, 0, w, h);

  const hourly = cityData.hourly || {};
  // Slice to 24 hours (current day only)
  const hum = (hourly.relative_humidity_2m || []).slice(0, 24);
  const wind = (hourly.wind_speed_10m || []).slice(0, 24);
  const rain = (hourly.precipitation || []).slice(0, 24);

  if (hum.length === 0) return;

  const n = hum.length;
  const stepX = plotW / (n - 1 || 1);
  const windMax = Math.max(...wind, 1);
  const rainMax = Math.max(...rain, 0.5);

  // Humidity gradient fill
  const humGrad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
  humGrad.addColorStop(0, 'rgba(77,166,255,0.05)');
  humGrad.addColorStop(1, 'rgba(77,166,255,0.3)');
  ctx.beginPath();
  hum.forEach((v, i) => {
    const x = pad.left + i * stepX;
    const y = pad.top + plotH - (v / 100) * plotH;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(pad.left + (n - 1) * stepX, pad.top + plotH);
  ctx.lineTo(pad.left, pad.top + plotH);
  ctx.closePath();
  ctx.fillStyle = humGrad;
  ctx.fill();

  // Humidity line
  ctx.beginPath();
  hum.forEach((v, i) => {
    const x = pad.left + i * stepX;
    const y = pad.top + plotH - (v / 100) * plotH;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = 'rgba(77,166,255,0.7)';
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  // Wind line
  ctx.beginPath();
  wind.forEach((v, i) => {
    const x = pad.left + i * stepX;
    const y = pad.top + plotH - (v / windMax) * plotH;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = 'rgba(125,217,160,0.6)';
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  // Wind dots
  wind.forEach((v, i) => {
    const x = pad.left + i * stepX;
    const y = pad.top + plotH - (v / windMax) * plotH;
    ctx.beginPath();
    ctx.arc(x, y, 1.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(125,217,160,0.8)';
    ctx.fill();
  });

  // Rain bars (bottom)
  const rainH = plotH * 0.2;
  const rainY = pad.top + plotH - rainH;
  const barW = Math.max(2, stepX * 0.5);
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
  ctx.fillText('0%', pad.left + 2, pad.top + plotH);
  ctx.fillText(Math.round(windMax) + ' km/h', pad.left + 2, pad.top + plotH - 2);
}

// ===== CANVAS CHARTS =====
function drawAllCharts() {
  weatherData.forEach((data) => {
    if (!data.weather) return;
    const hourly = data.weather.hourly || {};
    const safeName = data.place_id || `${data.latitude || 0}_${data.longitude || 0}`;
    if (Object.keys(hourly).length === 0) return;
    drawMergedChart(`chart-merged-${safeName}`, data.weather, data.highTemp, data.lowTemp);
    drawCombinedChart(`chart-combined-${safeName}`, data.weather);
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
      r: Math.random() * 1.5 + 0.5,
      speed: Math.random() * 0.3 + 0.1,
      opacity: Math.random() * 0.1 + 0.05,
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
          if (p.y < -10) { p.y = canvas.height + 10; p.x = Math.random() * canvas.width; }
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
