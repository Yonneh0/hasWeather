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
   
   setTimeout(() => {
     drawAllCharts();
     drawGhostCharts();
   }, 400);
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
  const aqiData = aqiLabel(a?.us_aqi ?? null);

  const curTemp = current?.temperature_2m != null ? convertTemp(current.temperature_2m) :
                  current?.temperature != null ? convertTemp(current.temperature) : '—';
  const curWeatherCode = current?.weather_code ?? current?.weatherCode ?? 0;
  // Field names: both sources use the same field names after nwsToAppData mapping
  const humidity = current?.relative_humidity_2m ?? current?.relativeHumidity ?? '—';
  const windSpeed = current?.wind_speed_10m ?? current?.windSpeed ?? '—';
  const windDir = current?.wind_direction_10m ?? current?.windDirection ?? 0;
  
  // Pressure: always in hPa (NWS converted from inHg, OM already in hPa)
  let pressure = '—';
  if (current?.surface_pressure != null) {
    pressure = current.surface_pressure;
  } else if (current?.pressure != null) {
    pressure = current.pressure;
  }
  
  // UV Index: cross-source from OM cache if available
  const uv = current?.uv_index != null ? current.uv_index : '—';
  
  // Visibility: always in meters, convert to miles for display
  let vis = '—';
  if (current?.visibility != null) {
    if (current.visibilityUnit === 'mi') {
      vis = current.visibility.toFixed(1);
    } else {
      // meters to miles
      vis = (current.visibility / 1609.34).toFixed(1);
    }
  }
  
  // PM2.5: cross-source from OM cache if available
  const pm25 = a && a.pm2_5 !== undefined && a.pm2_5 !== null ? a.pm2_5 : '—';

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
    const hTemp = hourly?.temperature_2m?.[hIdx] != null ? convertTemp(hourly.temperature_2m[hIdx]) :
                  hourly?.temperature?.[hIdx] != null ? convertTemp(hourly.temperature[hIdx]) : 0;
    const precipMM = hourly?.precipitation?.[hIdx] || 0;
    const hPrecip = precipMM > 0.1 ? `${Math.round(precipMM)}mm` : '';
    const hCode = hourly?.weather_code?.[hIdx] ?? hourly?.weatherCode?.[hIdx] ?? 0;
    const isCurrent = i === 0;
    const hHourDecimal = parseDecimalTime(hTime, 12);
    const hIsDay = isDaytime(hHourDecimal, sunriseTime, sunsetTime);
    const hWind = hourly?.wind_speed_10m?.[hIdx] != null ? `${Math.round(hourly.wind_speed_10m[hIdx])} km/h` :
                  hourly?.windSpeed?.[hIdx] != null ? `${Math.round(hourly.windSpeed[hIdx])} km/h` : '';
    hourlyHTML += `<div class="hour-slot${isCurrent ? ' current' : ''}">
      <div class="hour-time">${hTime}</div>
      <div class="hour-icon">${isCurrent ? curIcon : (hIsDay ? getWeatherIcon(hCode) : getMoonIcon(hCode))}</div>
      <div class="hour-temp">${Math.round(hTemp)}°</div>
      ${hWind ? `<div class="hour-wind">${hWind}</div>` : ''}
      ${hPrecip ? `<div class="hour-precip">${hPrecip}</div>` : ''}
    </div>`;
  }

    // NOAA badge — show when NWS data is available for this city
    const hasNwsData = !!data.nwsData;
    const nwsBadge = hasNwsData 
      ? `<span class="nws-badge" title="NWS data available"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 74 74"><path fill="#003087" d="M70.17,20.61c-5.27,7.93-14,19-24.19,22.69l-1.26.53a2.86,2.86,0,0,0,.77.23h1.2c2.58-.1,6.3-1.19,7.06,1.43A30.55,30.55,0,0,0,39,49.41c-4.61,2.53-10.45,4.81-14.27,1.26,3.06-.41,8.71-2.26,10.7-4.07C19.25,46.38,12.06,36.3,7,30.79c-1.82-2.11-3.69-3.88-5.6-4.06a37,37,0,1,0,68.74-6.12Z"/><path fill="#fff" d="M7,30.77c5,5.51,12.22,15.58,28.42,15.81-2,1.8-7.64,3.65-10.7,4.07C28.53,54.22,34.41,52,39,49.39a30.46,30.46,0,0,1,14.69-3.87C53,42.9,49.23,44,46.65,44.08h-1.2a2.63,2.63,0,0,1-.77-.23l1.26-.52C56.1,39.54,64.85,28.54,70.13,20.55a35.57,35.57,0,0,0-3.78-6c-9.52,1.74-12.6,15.68-18,22.59-7.16,10.08-14,7.85-21.27,1.13S14.44,19.61,6.77,15.54A37.06,37.06,0,0,0,1.38,26.72C3.34,26.91,5.21,28.68,7,30.77Z"/><path fill="#003087" d="M27.1,38.26c7.22,6.72,14.11,8.92,21.28-1.14,5.45-6.91,8.5-20.85,18-22.59a37,37,0,0,0-59.58,1C14.49,19.61,19.88,31.65,27.1,38.26Z"/></svg></span>`
      : '<span class="source-badge open-meteo">OM</span>';

  const safeName = data.place_id || suffix;
  const mergedCanvasId = `chart-merged-${safeName}`;
  const combinedCanvasId = `chart-combined-${safeName}`;

  // Slice to 24 hours (current day only) for chart display
  const temps = (hourly?.temperature_2m || hourly?.temperature || []).slice(0, 24);
  const rain = (hourly?.precipitation || []).slice(0, 24);
  const hum = (hourly?.relative_humidity_2m || hourly?.relativeHumidity || []).slice(0, 24);
  const wind = (hourly?.wind_speed_10m || hourly?.windSpeed || []).slice(0, 24);
  const chartStats = (data) => {
    // Filter out null values before computing stats
    const valid = data.filter(v => v != null);
    return valid.length ? {
      min: Math.round(Math.min(...valid)),
      max: Math.round(Math.max(...valid)),
      avg: Math.round(valid.reduce((a, b) => a + b, 0) / valid.length),
    } : { min: '—', max: '—', avg: '—' };
  };

  const humStats = chartStats(hum);
  const windStats = chartStats(wind);
  const rainStats = chartStats(rain);

  // Build ghost overlay HTML when NWS data is available
  let ghostHeaderHTML = '';
  let ghostDetailsHTML = '';
  let ghostHourlyHTML = '';
  if (hasNwsData) {
    const nwsCurrent = data.nwsData?.weather?.current || {};
    const nwsHourly = data.nwsData?.weather?.hourly || {};
    
    // Ghost temperature (offset from OM temp)
    const ghostTemp = nwsCurrent?.temperature_2m != null ? convertTemp(nwsCurrent.temperature_2m) :
                      nwsCurrent?.temperature != null ? convertTemp(nwsCurrent.temperature) : '—';
    
    // Ghost weather icon
    const ghostWeatherCode = nwsCurrent?.weather_code ?? nwsCurrent?.weatherCode ?? 0;
    const isNwsDay = isDaytime(currentHour, sunriseTime, sunsetTime);
    const ghostIcon = isNwsDay ? getWeatherIcon(ghostWeatherCode) : getMoonIcon(ghostWeatherCode);
    
    // Ghost details grid values
    const ghostHumidity = nwsCurrent?.relative_humidity_2m ?? nwsCurrent?.relativeHumidity ?? '—';
    const ghostWindSpeed = nwsCurrent?.wind_speed_10m != null ? `${Math.round(nwsCurrent.wind_speed_10m)} km/h` :
                          nwsCurrent?.windSpeed != null ? `${Math.round(nwsCurrent.windSpeed)} km/h` : '';
    const ghostWindDir = nwsCurrent?.wind_direction_10m ?? nwsCurrent?.windDirection ?? 0;
    let ghostPressure = '—';
    if (nwsCurrent?.surface_pressure != null) {
      ghostPressure = nwsCurrent.surface_pressure;
    } else if (nwsCurrent?.pressure != null) {
      ghostPressure = nwsCurrent.pressure;
    }
    // NWS doesn't provide UV Index
    const ghostUv = '—';
    let ghostVis = '—';
    if (nwsCurrent?.visibility != null) {
      if (nwsCurrent.visibilityUnit === 'mi') {
        ghostVis = nwsCurrent.visibility.toFixed(1);
      } else {
        ghostVis = (nwsCurrent.visibility / 1609.34).toFixed(1);
      }
    }
    
    // Ghost hourly forecast
    const nwsTimeArr = nwsHourly?.time || [];
    const nwsCurrentDay = now.toISOString().split('T')[0];
    const nwsCurrentIdx = nwsTimeArr.findIndex(t => {
      const [datePart, timePart] = t.split('T');
      return datePart === nwsCurrentDay && timePart.startsWith(`T${String(currentHour).padStart(2, '0')}`);
    });
    
    // Build ghost hourly slots
    let ghostHourlySlotsHTML = '';
    for (let i = 0; i < 24; i++) {
      const hIdx = nwsCurrentIdx >= 0 ? nwsCurrentIdx + i : currentHour + i;
      if (hIdx < 0 || hIdx >= nwsTimeArr.length) break;
      const hTime = nwsTimeArr[hIdx]?.split('T')[1]?.split('+')[0]?.slice(0, 5);
      const hTemp = nwsHourly?.temperature_2m?.[hIdx] != null ? convertTemp(nwsHourly.temperature_2m[hIdx]) :
                    nwsHourly?.temperature?.[hIdx] != null ? convertTemp(nwsHourly.temperature[hIdx]) : '—';
      const hCode = nwsHourly?.weather_code?.[hIdx] ?? nwsHourly?.weatherCode?.[hIdx] ?? 0;
      const isGhostCurrent = i === 0;
      const hHourDecimal = parseDecimalTime(hTime, 12);
      const hIsDay = isDaytime(hHourDecimal, sunriseTime, sunsetTime);
      const hWind = nwsHourly?.wind_speed_10m?.[hIdx] != null ? `${Math.round(nwsHourly.wind_speed_10m[hIdx])} km/h` :
                    nwsHourly?.windSpeed?.[hIdx] != null ? `${Math.round(nwsHourly.windSpeed[hIdx])} km/h` : '';
      const hPrecip = nwsHourly?.precipitation?.[hIdx] != null && nwsHourly.precipitation[hIdx] > 0.1 
        ? `${Math.round(nwsHourly.precipitation[hIdx])}mm` : '';
      ghostHourlySlotsHTML += `<div class="nws-ghost-hour-slot${isGhostCurrent ? ' current' : ''}">
        <div class="nws-ghost-hour-icon">${isGhostCurrent ? ghostIcon : (hIsDay ? getWeatherIcon(hCode) : getMoonIcon(hCode))}</div>
        <div class="nws-ghost-hour-temp">${Math.round(hTemp)}°</div>
        ${hWind ? `<div class="nws-ghost-hour-wind">${hWind}</div>` : ''}
        ${hPrecip ? `<div class="nws-ghost-hour-precip">${hPrecip}</div>` : ''}
      </div>`;
    }
    
    // Ghost header elements (positioned relative to city-header)
    ghostHeaderHTML = `
      <div class="nws-ghost nws-ghost-temp">${Math.round(ghostTemp)}°</div>
      <div class="nws-ghost nws-ghost-icon">${ghostIcon}</div>`;
    
    // Ghost details grid (positioned relative to details-grid)
    ghostDetailsHTML = `
      <div class="nws-ghost nws-ghost-details">
        <div class="nws-ghost-detail-cell">
          <span class="nws-ghost-detail-label">Humidity</span>
          <span class="nws-ghost-detail-value">${ghostHumidity}%</span>
        </div>
        <div class="nws-ghost-detail-cell">
          <span class="nws-ghost-detail-label">Wind</span>
          <span class="nws-ghost-detail-value">${ghostWindDir !== 0 ? getWindCompass(ghostWindDir) + ' ' + ghostWindSpeed : '—'}</span>
        </div>
        <div class="nws-ghost-detail-cell">
          <span class="nws-ghost-detail-label">Pressure</span>
          <span class="nws-ghost-detail-value">${ghostPressure} hPa</span>
        </div>
        <div class="nws-ghost-detail-cell">
          <span class="nws-ghost-detail-label">UV Index</span>
          <span class="nws-ghost-detail-value">${ghostUv}</span>
        </div>
        <div class="nws-ghost-detail-cell">
          <span class="nws-ghost-detail-label">Visibility</span>
          <span class="nws-ghost-detail-value">${ghostVis} mi</span>
        </div>
      </div>`;
    
    // Ghost hourly forecast (positioned relative to hourly-section)
    ghostHourlyHTML = `
      <div class="nws-ghost nws-ghost-hourly">
        ${ghostHourlySlotsHTML}
      </div>`;
  }

  // Build ghost merged canvas element if NWS data is available (positioned behind OM chart that spans entire card)
  const ghostMergedCanvasId = hasNwsData ? `chart-ghost-merged-${safeName}` : '';
  const ghostMergedCanvas = hasNwsData
    ? `<canvas class="chart-canvas chart-merged nws-ghost-chart" id="${ghostMergedCanvasId}" style="position:absolute;top:0;left:0;right:0;bottom:0;z-index:-1;pointer-events:none;"></canvas>`
    : '';

  return `
    ${ghostMergedCanvas}
    <canvas class="chart-canvas chart-merged" id="${mergedCanvasId}" style="position:absolute;top:0;left:0;right:0;bottom:0;z-index:0;pointer-events:none;"></canvas>
    <div style="position:relative;z-index:2;">
   <div class="city-header">
       ${ghostHeaderHTML}
       <div class="city-name-wrap">
          <span class="city-name">${escapeHTML(data.name)}${nwsBadge}</span>
         <span class="city-state">${escapeHTML(data.state)}</span>
       </div>
       <span class="current-temp-inline">${Math.round(curTemp)}°</span>
      <div class="current-weather-icon-inline">${curIconLarge}</div>
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
    <div class="details-grid" style="position:relative;">
      ${ghostDetailsHTML}
      <div class="detail-cell"><span class="detail-label">Humidity</span><span class="detail-value">${humidity}%</span></div>
      <div class="detail-cell"><span class="detail-label">Wind</span><span class="detail-value">${windDir !== 0 ? getWindCompass(windDir) + ' ' + windSpeed : '—'}</span></div>
      <div class="detail-cell"><span class="detail-label">Pressure</span><span class="detail-value">${pressure} hPa</span></div>
      <div class="detail-cell"><span class="detail-label">UV Index</span><span class="detail-value">${uv}</span></div>
      <div class="detail-cell"><span class="detail-label">Visibility</span><span class="detail-value">${vis} mi</span></div>
      <div class="detail-cell"><span class="detail-label">AQI (PM2.5)</span><span class="detail-value"><span class="aqi-badge ${aqiData.cls}">${aqiData.label}</span> ${pm25}</span></div>
    </div>
    <div class="hourly-section" style="position:relative;">
      <div class="hourly-title">24-Hour Forecast</div>
      <div class="hourly-row">${hourlyHTML}</div>
      ${ghostHourlyHTML}
      </div>
    </div>`;
}

// ===== DRAW GHOST CHARTS =====
function drawGhostCharts() {
  weatherData.forEach((data) => {
    if (!data.weather || !data.nwsData) return;
    const hourly = data.nwsData.weather.hourly || {};
    const safeName = data.place_id || `${data.latitude || 0}_${data.longitude || 0}`;
    if (Object.keys(hourly).length === 0) return;

    // Find current hour index in NWS hourly data to align with OM chart's time window
    const nwsTimeArr = hourly.time || [];
    const nwsCurrentDay = new Date().toISOString().split('T')[0];
    const currentHour = new Date().getHours();
    let currentIdx = -1;
    if (nwsTimeArr.length > 0) {
      // Find the index where the date matches current day and time starts with current hour
      for (let i = 0; i < nwsTimeArr.length; i++) {
        const t = nwsTimeArr[i];
        const [datePart, timePart] = t.split('T');
        if (datePart === nwsCurrentDay && timePart.startsWith(`T${String(currentHour).padStart(2, '0')}`)) {
          currentIdx = i;
          break;
        }
      }
    }

    // If no exact match found, fall back to first hour of current day
    if (currentIdx === -1) {
      for (let i = 0; i < nwsTimeArr.length; i++) {
        const t = nwsTimeArr[i];
        const [datePart] = t.split('T');
        if (datePart === nwsCurrentDay) {
          currentIdx = i;
          break;
        }
      }
    }

    drawGhostMergedChart(`chart-ghost-merged-${safeName}`, data.nwsData.weather, data.highTemp, data.lowTemp, currentIdx >= 0 ? currentIdx : 0);
  });
}


