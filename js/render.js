// ===== RENDER =====

// Parse time string as decimal hours so minutes are accounted for (e.g., "18:45" → 18.75)
function parseDecimalTime(timeStr, fallback) {
  if (!timeStr) return fallback;
  const [h, m] = timeStr.split(':').map(Number);
  return h + (m / 60);
}

function renderAll() {
  const grid = document.getElementById('city-grid');
  if (!grid) return;

  // De-duplicate weatherData by coordinates before rendering (keep entry with non-null place_id)
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
      if (Math.abs(lat - exLat) < 0.01 && Math.abs(lon - exLon) < 0.01) {
        isDup = true;
        // Prefer the entry with a non-null place_id
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

  grid.innerHTML = '';

  weatherData.forEach((data, i) => {
    const card = document.createElement('div');
    card.className = 'city-card';
    card.dataset.cityName = data.name;
    card.dataset.placeid = data.place_id || '';
    card.dataset.citydist = data.distance != null ? data.distance : '';
    card.dataset.citylat = data.latitude != null ? data.latitude : '';
    card.dataset.citylon = data.longitude != null ? data.longitude : '';
    card.style.animationDelay = `${i * 120}ms`;
    card.style.animationFillMode = 'forwards';
    card.style.overflow = 'visible';
    const suffix = data.latitude != null && data.longitude != null ? `${data.latitude}_${data.longitude}` : undefined;
    card.innerHTML = renderCityCard(data, suffix);
    grid.appendChild(card);
  });

  applyBackgrounds();
  setTimeout(() => drawAllCharts(), 400);
}

function applyBackgrounds() {
  let style = document.getElementById('dynamic-bg');
  if (!style) {
    style = document.createElement('style');
    style.id = 'dynamic-bg';
    document.head.appendChild(style);
  }
  style.textContent = '';
  document.querySelectorAll('.city-card').forEach((card, i) => {
    if (weatherData[i]?.weather) {
      const code = weatherData[i].weather.current?.weather_code;
      const bg = WMO_GRADIENTS[code] || WMO_GRADIENTS[0];
      card.style.background = `linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.04)), ${bg}`;
    }
  });
}

function renderCityCard(data, suffix) {
  const w = data.weather;
  const a = data.aqi;
  if (!w || !w.current) {
    return `<div style="padding:2rem;text-align:center;">Error loading data</div>`;
  }

  const current = w.current || {};
  const hourly = w.hourly || {};
  const aqiData = aqiLabel(a.us_aqi);

  const curTemp = current?.temperature_2m != null ? convertTemp(current.temperature_2m) : '—';
  const curWeatherCode = current?.weather_code ?? 0;
  const humidity = current?.relative_humidity_2m ?? '—';
  const windSpeed = current?.wind_speed_10m ?? '—';
  const windDir = current?.wind_direction_10m ?? 0;
  const pressure = current?.surface_pressure ?? '—';
  const uv = current?.uv_index ?? '—';
  const vis = current?.visibility ? (current.visibility / 1609.34).toFixed(1) : '—';
  const pm25 = a.pm2_5 !== undefined && a.pm2_5 !== null ? a.pm2_5 : '—';

  const now = new Date();
  const currentHour = now.getHours();

  const sunriseTime = current?.sunrise ? parseDecimalTime(current.sunrise.split('T')[1]?.split('+')[0], 6) : 6;
  const sunsetTime = current?.sunset ? parseDecimalTime(current.sunset.split('T')[1]?.split('+')[0], 19) : 19;
  const isDay = isDaytime(currentHour, sunriseTime, sunsetTime);

  const curIcon = isDay ? getWeatherIcon(curWeatherCode) : getMoonIcon(curWeatherCode);
  const curIconLarge = isDay ? getWeatherIcon(curWeatherCode, 80) : getMoonIcon(curWeatherCode, 80);

  const timeArr = hourly?.time || [];
  const currentDay = now.toISOString().split('T')[0];
  const currentIdx = timeArr.findIndex(t => {
    const [datePart, timePart] = t.split('T');
    return datePart === currentDay && timePart.startsWith(`T${String(currentHour).padStart(2, '0')}`);
  });

  let hourlyHTML = '';
  for (let i = 0; i < 24; i++) {
    const hIdx = currentIdx >= 0 ? currentIdx + i : currentHour + i;
    if (hIdx < 0 || hIdx >= timeArr.length) break;
    const hTime = timeArr[hIdx]?.split('T')[1]?.split('+')[0]?.slice(0, 5);
    const hTemp = hourly?.temperature_2m?.[hIdx] != null ? convertTemp(hourly.temperature_2m[hIdx]) : 0;
    const precipMM = hourly?.precipitation?.[hIdx] || 0;
    const hPrecip = precipMM > 0.1 ? `${Math.round(precipMM)}mm` : '';
    const hCode = hourly?.weather_code?.[hIdx] ?? 0;
    const isCurrent = i === 0;
    const hHourDecimal = parseDecimalTime(hTime, 12);
    const hIsDay = isDaytime(hHourDecimal, sunriseTime, sunsetTime);
    const hWind = hourly?.wind_speed_10m?.[hIdx] != null ? `${Math.round(hourly.wind_speed_10m[hIdx])} km/h` : '';
    hourlyHTML += `<div class="hour-slot${isCurrent ? ' current' : ''}">
      <div class="hour-time">${hTime}</div>
      <div class="hour-icon">${isCurrent ? curIcon : (hIsDay ? getWeatherIcon(hCode) : getMoonIcon(hCode))}</div>
      <div class="hour-temp">${Math.round(hTemp)}°</div>
      ${hWind ? `<div class="hour-wind">${hWind}</div>` : ''}
      ${hPrecip ? `<div class="hour-precip">${hPrecip}</div>` : ''}
    </div>`;
  }


  const safeName = data.place_id || suffix;
  const mergedCanvasId = `chart-merged-${safeName}`;
  const combinedCanvasId = `chart-combined-${safeName}`;

  // Slice to 24 hours (current day only) for chart display
  const temps = (hourly?.temperature_2m || []).slice(0, 24);
  const rain = (hourly?.precipitation || []).slice(0, 24);
  const hum = (hourly?.relative_humidity_2m || []).slice(0, 24);
  const wind = (hourly?.wind_speed_10m || []).slice(0, 24);
  const chartStats = (data) => data.length ? {
    min: Math.round(Math.min(...data)),
    max: Math.round(Math.max(...data)),
    avg: Math.round(data.reduce((a, b) => a + b, 0) / data.length),
  } : { min: '—', max: '—', avg: '—' };

  const humStats = chartStats(hum);
  const windStats = chartStats(wind);
  const rainStats = chartStats(rain);

  return `
    <canvas class="chart-canvas chart-merged" id="${mergedCanvasId}" style="position:absolute;top:0;left:0;right:0;bottom:0;z-index:0;pointer-events:none;"></canvas>
    <div style="position:relative;z-index:2;">
    <div class="city-header">
      <div class="city-name-wrap">
        <span class="city-name">${escapeHTML(data.name)}${FavoritesManager.has(data.place_id, data.latitude, data.longitude) ? '<span class="fav-star">★</span>' : ''}</span>
        <span class="city-state">${escapeHTML(data.state)}</span>
      </div>
      <span class="current-temp-inline">${Math.round(curTemp)}°</span>
      <div class="current-weather-icon-inline">${curIconLarge}</div>
    </div>
    <div class="city-compass-row" style="display:flex;align-items:center;gap:0.4rem;margin-top:0.1rem;">
      <span class="compass-heading">${escapeHTML(bearingToCompass(data.bearing))}</span>
      <span class="compass-heading">${Math.round(data.distance)} mi</span>
    </div>
    <div class="combined-chart-row">
      <canvas class="combined-chart-canvas" id="${combinedCanvasId}"></canvas>
      <div class="combined-chart-stats">
        <div class="stat-group">
          <div class="stat-group-title">Humidity</div>
          <div class="stat"><span class="stat-label">CUR</span><span class="stat-val">${humidity}%</span></div>
          <div class="stat"><span class="stat-label">MIN</span><span class="stat-val">${humStats.min}%</span></div>
          <div class="stat"><span class="stat-label">MAX</span><span class="stat-val">${humStats.max}%</span></div>
          <div class="stat"><span class="stat-label">AVG</span><span class="stat-val">${humStats.avg}%</span></div>
        </div>
        <div class="divider"></div>
        <div class="stat-group">
          <div class="stat-group-title">Wind</div>
          <div class="stat"><span class="stat-label">CUR</span><span class="stat-val">${windSpeed}</span></div>
          <div class="stat"><span class="stat-label">MIN</span><span class="stat-val">${windStats.min}</span></div>
          <div class="stat"><span class="stat-label">MAX</span><span class="stat-val">${windStats.max}</span></div>
          <div class="stat"><span class="stat-label">AVG</span><span class="stat-val">${windStats.avg}</span></div>
        </div>
        <div class="divider"></div>
        <div class="stat-group">
          <div class="stat-group-title">Precip</div>
          <div class="stat"><span class="stat-label">CUR</span><span class="stat-val">${rain[0] ?? 0}mm</span></div>
          <div class="stat"><span class="stat-label">MIN</span><span class="stat-val">${rainStats.min}mm</span></div>
          <div class="stat"><span class="stat-label">MAX</span><span class="stat-val">${rainStats.max}mm</span></div>
          <div class="stat"><span class="stat-label">AVG</span><span class="stat-val">${rainStats.avg}mm</span></div>
        </div>
      </div>
    </div>
    <div class="details-grid">
      <div class="detail-cell"><span class="detail-label">Humidity</span><span class="detail-value">${humidity}%</span></div>
      <div class="detail-cell"><span class="detail-label">Wind</span><span class="detail-value">${windDir !== 0 ? getWindCompass(windDir) + ' ' + windSpeed : '—'}</span></div>
      <div class="detail-cell"><span class="detail-label">Pressure</span><span class="detail-value">${pressure} hPa</span></div>
      <div class="detail-cell"><span class="detail-label">UV Index</span><span class="detail-value">${uv}</span></div>
      <div class="detail-cell"><span class="detail-label">Visibility</span><span class="detail-value">${vis} mi</span></div>
      <div class="detail-cell"><span class="detail-label">AQI (PM2.5)</span><span class="detail-value"><span class="aqi-badge ${aqiData.cls}">${aqiData.label}</span> ${pm25}</span></div>
    </div>
    <div class="hourly-section">
      <div class="hourly-title">24-Hour Forecast</div>
      <div class="hourly-row">${hourlyHTML}</div>
    </div>
    </div>`;
}

