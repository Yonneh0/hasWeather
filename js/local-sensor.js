// ===== LOCAL SENSOR BAR =====
// Reads sensor values from weather-local.js and displays them in a bar below the header.
// Only sensors with non-null values are shown.
// Respects the existing unit toggle (°F/°C) for temperature, speed, pressure, etc.

(function () {
  'use strict';

  // === Sensor definitions: maps config keys to display metadata ===
  const SENSOR_DEFS = [
    { key: 'LOCAL_SENSOR_TEMPERATURE_FAHRENHEIT', label: 'Temp', unit: '\u00B0F', type: 'temp' },
    { key: 'LOCAL_SENSOR_TEMPERATURE_CELSIUS',     label: 'Temp', unit: '\u00B0C', type: 'temp' },
    { key: 'LOCAL_SENSOR_WIND_SPEED_MPH',          label: 'Wind', unit: 'mph', type: 'wind-speed' },
    { key: 'LOCAL_SENSOR_WIND_SPEED_KMH',          label: 'Wind', unit: 'km/h', type: 'wind-speed' },
    { key: 'LOCAL_SENSOR_WIND_GUST_MPH',           label: 'Gust', unit: 'mph', type: 'wind-gust' },
    { key: 'LOCAL_SENSOR_WIND_GUST_KMH',           label: 'Gust', unit: 'km/h', type: 'wind-gust' },
    { key: 'LOCAL_SENSOR_WIND_DIRECTION_DEGREES',  label: 'Wind Dir', unit: '\u00B0', type: 'wind-dir' },
    { key: 'LOCAL_SENSOR_HUMIDITY_PERCENT',        label: 'Humidity', unit: '%', type: 'humidity' },
    { key: 'LOCAL_SENSOR_PRESSURE_INHG',           label: 'Pressure', unit: 'inHg', type: 'pressure' },
    { key: 'LOCAL_SENSOR_PRESSURE_HPA',            label: 'Pressure', unit: 'hPa', type: 'pressure' },
    { key: 'LOCAL_SENSOR_LATITUDE',                label: 'Location', unit: '', type: 'location' },
    { key: 'LOCAL_SENSOR_LONGITUDE',               label: 'Location', unit: '', type: 'location' },
    { key: 'LOCAL_SENSOR_DEWPOINT_CELSIUS',        label: 'Dew Pt', unit: '\u00B0C', type: 'temp' },
    { key: 'LOCAL_SENSOR_DEWPOINT_FAHRENHEIT',     label: 'Dew Pt', unit: '\u00B0F', type: 'temp' },
    { key: 'LOCAL_SENSOR_UV_INDEX',                label: 'UV Index', unit: '', type: 'uv' },
    { key: 'LOCAL_SENSOR_VISIBILITY_MI',           label: 'Vis', unit: 'mi', type: 'visibility' },
    { key: 'LOCAL_SENSOR_VISIBILITY_KM',           label: 'Vis', unit: 'km', type: 'visibility' },
    { key: 'LOCAL_SENSOR_RAINFALL_INCHES',         label: 'Rainfall', unit: 'in', type: 'rainfall' },
    { key: 'LOCAL_SENSOR_RAINFALL_MM',             label: 'Rainfall', unit: 'mm', type: 'rainfall' },
    { key: 'LOCAL_SENSOR_FEELSLIKE_FAHRENHEIT',    label: 'Feels Like', unit: '\u00B0F', type: 'temp' },
    { key: 'LOCAL_SENSOR_FEELSLIKE_CELSIUS',       label: 'Feels Like', unit: '\u00B0C', type: 'temp' },
    { key: 'LOCAL_SENSOR_SOLARRADIATION',          label: 'Solar', unit: 'W/m\u00B2', type: 'solar' },
    { key: 'LOCAL_SENSOR_SOIL_MOISTURE_PERCENT',   label: 'Soil Moisture', unit: '%', type: 'soil-moisture' },
  ];

  // === Current sensor state (tracks which sensors are active) ===
  let _activeSensors = [];
  let _sensorValues = {};
  let _refreshIntervalId = null;
  let _ttlCheckTimer = null;

  // === Unit conversion helpers ===
  function toF(c) { return c * 9 / 5 + 32; }
  function toC(f) { return (f - 32) * 5 / 9; }

  function getUnit() {
    if (typeof unit === 'string') return unit;
    return 'F';
  }

  // Pressure: inHg <-> hPa (1 inHg = 33.8639 hPa)
  function convertPressure(value, fromUnit) {
    if (value == null || value !== value) return NaN;
    if (fromUnit === 'inHg') {
      return getUnit() === 'F' ? (value * 33.8639).toFixed(1) : (value * 33.8639).toFixed(0);
    }
    const inHg = value / 33.8639;
    return getUnit() === 'F' ? inHg.toFixed(2) : Math.round(inHg * 33.8639).toString();
  }

  // Wind speed: mph <-> km/h (1 mph = 1.60934 km/h)
  function convertWindSpeed(value, fromUnit) {
    if (value == null || value !== value) return NaN;
    if (fromUnit === 'mph') {
      return getUnit() === 'F' ? (value * 1.60934).toFixed(1) : Math.round(value * 1.60934).toString();
    }
    const mph = value / 1.60934;
    return getUnit() === 'F' ? mph.toFixed(1) : Math.round(mph * 1.60934).toString();
  }

  // Visibility: mi <-> km (1 mi = 1.60934 km)
  function convertVisibility(value, fromUnit) {
    if (value == null || value !== value) return NaN;
    if (fromUnit === 'mi') {
      return getUnit() === 'F' ? (value * 1.60934).toFixed(1) : Math.round(value * 1.60934).toString();
    }
    const mi = value / 1.60934;
    return getUnit() === 'F' ? mi.toFixed(1) : Math.round(mi * 1.60934).toString();
  }

  // Rainfall: inches <-> mm (1 in = 25.4 mm)
  function convertRainfall(value, fromUnit) {
    if (value == null || value !== value) return NaN;
    if (fromUnit === 'in') {
      return getUnit() === 'F' ? (value * 25.4).toFixed(1) : Math.round(value * 25.4).toString();
    }
    const inVal = value / 25.4;
    return getUnit() === 'F' ? inVal.toFixed(2) : Math.round(inVal * 25.4).toString();
  }

  // === Format a sensor value for display ===
  function formatSensorValue(def, rawValue) {
    if (rawValue == null || rawValue !== rawValue) return '\u2014';

    let displayVal = rawValue;
    let displayUnit = def.unit;

    switch (def.type) {
      case 'temp':
        // Temperature unit depends on the config key suffix
        if (def.key.includes('FAHRENHEIT')) {
          displayUnit = getUnit() === 'F' ? '\u00B0F' : '\u00B0C';
          if (getUnit() === 'F') {
            displayVal = Number.isInteger(rawValue) ? rawValue : rawValue.toFixed(1);
          } else {
            displayVal = toC(rawValue).toFixed(1);
          }
        } else {
          displayUnit = getUnit() === 'F' ? '\u00B0F' : '\u00B0C';
          if (getUnit() === 'F') {
            displayVal = toF(rawValue).toFixed(1);
          } else {
            displayVal = Number.isInteger(rawValue) ? rawValue : rawValue.toFixed(1);
          }
        }
        break;

      case 'wind-speed':
        if (def.key.includes('MPH')) {
          displayUnit = getUnit() === 'F' ? 'mph' : 'km/h';
          if (getUnit() === 'F') {
            displayVal = Number.isInteger(rawValue) ? rawValue : rawValue.toFixed(1);
          } else {
            displayVal = convertWindSpeed(rawValue, 'mph');
          }
        } else {
          displayUnit = getUnit() === 'F' ? 'km/h' : 'mph';
          if (getUnit() === 'F') {
            displayVal = rawValue; // already in km/h
          } else {
            displayVal = convertWindSpeed(rawValue, 'km/h');
          }
        }
        break;

      case 'wind-gust':
        if (def.key.includes('MPH')) {
          displayUnit = getUnit() === 'F' ? 'mph' : 'km/h';
          if (getUnit() === 'F') {
            displayVal = Number.isInteger(rawValue) ? rawValue : rawValue.toFixed(1);
          } else {
            displayVal = convertWindSpeed(rawValue, 'mph');
          }
        } else {
          displayUnit = getUnit() === 'F' ? 'km/h' : 'mph';
          if (getUnit() === 'F') {
            displayVal = rawValue; // already in km/h
          } else {
            displayVal = convertWindSpeed(rawValue, 'km/h');
          }
        }
        break;

      case 'pressure':
        if (def.key.includes('INHG')) {
          displayUnit = getUnit() === 'F' ? 'inHg' : 'hPa';
          if (getUnit() === 'F') {
            displayVal = rawValue.toFixed(2);
          } else {
            displayVal = (rawValue * 33.8639).toFixed(0);
          }
        } else {
          displayUnit = getUnit() === 'F' ? 'hPa' : 'inHg';
          if (getUnit() === 'F') {
            displayVal = rawValue; // already in hPa
          } else {
            displayVal = (rawValue / 33.8639).toFixed(2);
          }
        }
        break;

      case 'visibility':
        if (def.key.includes('MI')) {
          displayUnit = getUnit() === 'F' ? 'mi' : 'km';
          if (getUnit() === 'F') {
            displayVal = Number.isInteger(rawValue) ? rawValue : rawValue.toFixed(1);
          } else {
            displayVal = convertVisibility(rawValue, 'mi');
          }
        } else {
          displayUnit = getUnit() === 'F' ? 'km' : 'mi';
          if (getUnit() === 'F') {
            displayVal = rawValue; // already in km
          } else {
            displayVal = convertVisibility(rawValue, 'km');
          }
        }
        break;

      case 'rainfall':
        if (def.key.includes('INCHES')) {
          displayUnit = getUnit() === 'F' ? 'in' : 'mm';
          if (getUnit() === 'F') {
            displayVal = Number.isInteger(rawValue) ? rawValue : rawValue.toFixed(2);
          } else {
            displayVal = convertRainfall(rawValue, 'in');
          }
        } else {
          displayUnit = getUnit() === 'F' ? 'mm' : 'in';
          if (getUnit() === 'F') {
            displayVal = rawValue; // already in mm
          } else {
            displayVal = convertRainfall(rawValue, 'mm');
          }
        }
        break;

      case 'wind-dir':
        displayVal = Math.round(rawValue);
        break;

      default:
        // No conversion needed for GPS, UV, solar, soil moisture
        if (typeof rawValue === 'number') {
          displayVal = Number.isInteger(rawValue) ? rawValue : rawValue.toFixed(1);
        } else {
          displayVal = String(rawValue);
        }
    }

    return displayVal + (displayUnit !== '' ? ' ' + displayUnit : '');
  }

  // === Format a location value from lat/lng into a combined display ===
  function formatLocation(lat, lon) {
    if (lat == null || lon == null || lat !== lat || lon !== lon) return '\u2014';
    const latDir = lat >= 0 ? '\u2191' : '\u2193';
    const lonDir = lon >= 0 ? '\u2192' : '\u2190';
    return latDir + ' ' + Math.abs(lat).toFixed(2) + '\u00B0' + latDir + ', ' + lonDir + ' ' + Math.abs(lon).toFixed(2) + '\u00B0' + lonDir;
  }

  // === Get a human-readable label for the sensor (picks the right one based on current unit) ===
  function getSensorLabel(def) {
    if (def.type === 'temp') {
      if (getUnit() === 'F' && !def.key.includes('FAHRENHEIT')) return null;
      if (getUnit() === 'C' && !def.key.includes('CELSIUS')) return null;
      if (getUnit() === 'F') {
        return def.label + ' (\u00B0F)';
      } else {
        return def.label + ' (\u00B0C)';
      }
    }

    if (def.type === 'wind-speed') {
      const speedUnit = getUnit() === 'F' ? 'mph' : 'km/h';
      if (getUnit() === 'F' && !def.key.includes('MPH')) return null;
      if (getUnit() === 'C' && !def.key.includes('KMH')) return null;
      return def.label + ' (' + speedUnit + ')';
    }

    if (def.type === 'wind-gust') {
      const gustUnit = getUnit() === 'F' ? 'mph' : 'km/h';
      if (getUnit() === 'F' && !def.key.includes('MPH')) return null;
      if (getUnit() === 'C' && !def.key.includes('KMH')) return null;
      return def.label + ' (' + gustUnit + ')';
    }

    if (def.type === 'pressure') {
      const pressureUnit = getUnit() === 'F' ? 'inHg' : 'hPa';
      if (getUnit() === 'F' && !def.key.includes('INHG')) return null;
      if (getUnit() === 'C' && !def.key.includes('HPA')) return null;
      return def.label + ' (' + pressureUnit + ')';
    }

    if (def.type === 'visibility') {
      const visUnit = getUnit() === 'F' ? 'mi' : 'km';
      if (getUnit() === 'F' && !def.key.includes('MI')) return null;
      if (getUnit() === 'C' && !def.key.includes('KM')) return null;
      return def.label + ' (' + visUnit + ')';
    }

    if (def.type === 'rainfall') {
      const rainUnit = getUnit() === 'F' ? 'in' : 'mm';
      if (getUnit() === 'F' && !def.key.includes('INCHES')) return null;
      if (getUnit() === 'C' && !def.key.includes('MM')) return null;
      return def.label + ' (' + rainUnit + ')';
    }

    return def.label;
  }

  // === Determine which sensors are currently active (non-null value) ===
  function getActiveSensors() {
    const active = [];
    for (const def of SENSOR_DEFS) {
      const val = window[def.key];
      if (val !== null && val !== undefined) {
        // Check if the sensor's label is valid (unit preference match)
        const label = getSensorLabel(def);
        if (label) {
          active.push({ def, value: val, label });
        }
      }
    }
    return active;
  }

  // === Get relative time string from ISO timestamp ===
  function getRelativeTime(isoString) {
    if (!isoString || typeof isoString !== 'string') return '';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    const diffMs = Date.now() - date.getTime();
    const absDiff = Math.abs(diffMs);
    const seconds = Math.floor(absDiff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return seconds + 's ago';
    if (minutes < 60) return minutes + 'm ago';
    if (hours < 24) return hours + 'h ago';
    return days + 'd ago';
  }

  // === Check TTL and return whether data is still valid ===
  function checkTTL() {
    var ttl = window.LOCAL_SENSOR_TTL;
    if (!ttl || typeof ttl !== 'string') return true; // null or not set = no expiry
    const date = new Date(ttl);
    if (isNaN(date.getTime())) return true; // invalid timestamp = no expiry
    return Date.now() < date.getTime();
  }

  // === Build HTML for a single sensor item ===
  function renderSensorItem(item) {
    var displayVal = formatSensorValue(item.def, item.value);
    var icon = getSensorIcon(item.def.type);
    var safeLabel = escapeHTML(item.label);
    return '<div class="sensor-item"><span class="sensor-icon">' + icon + '</span><span class="sensor-label">' + safeLabel + '</span><span class="sensor-value">' + displayVal + '</span></div>';
  }

  // === Get an icon for the sensor type ===
  function getSensorIcon(type) {
    var icons = {
      'temp': '\uD83C\uDF21',
      'wind-speed': '\uD83D\uDCA8',
      'wind-gust': '\uD83D\uDCA8',
      'wind-dir': '\uD83E\uDDED',
      'humidity': '\uD83D\uDCA7',
      'pressure': '\u23F1',
      'location': '\uD83D\uDCCD',
      'uv': '\u2600',
      'visibility': '\uD83D\uDC41',
      'rainfall': '\uD83C\uDF27',
      'solar': '\u2600\uFE0F',
      'soil-moisture': '\uD83C\uDF31',
    };
    return icons[type] || '';
  }

  // === Build info line HTML (note + timestamp + source) ===
  function buildInfoLine() {
    var html = '';
    var note = window.LOCAL_SENSOR_NOTE;
    var source = window.LOCAL_SENSOR_DATA_SOURCE;
    var timestamp = window.LOCAL_SENSOR_TIMESTAMP;

    if (note) {
      html += '<span class="sensor-info-note">\u{1F4DD} ' + escapeHTML(note) + '</span>';
    }
    if (timestamp) {
      var relTime = getRelativeTime(timestamp);
      if (relTime) {
        html += '<span class="sensor-info-timestamp">\u23F1 Updated ' + relTime + '</span>';
      }
    }
    if (source) {
      html += '<span class="sensor-info-source">\u{1F50C} ' + escapeHTML(source) + '</span>';
    }
    return html;
  }

  // === Check TTL and build expiry warning ===
  function buildExpiryWarning() {
    if (checkTTL()) return '';
    var ttl = window.LOCAL_SENSOR_TTL;
    var msg = 'Data expired';
    if (ttl) {
      var date = new Date(ttl);
      msg += ' (' + date.toLocaleString() + ')';
    }
    return '<span class="sensor-expiry-warning">\u26A0 ' + escapeHTML(msg) + '</span>';
  }

  // === Render the full sensor bar ===
  function renderSensorBar() {
    var bar = document.getElementById('local-sensor-bar');
    if (!bar) return;

    // Check TTL first - hide entire bar if expired
    if (!checkTTL()) {
      bar.innerHTML = buildExpiryWarning();
      _activeSensors = [];
      return;
    }

    var active = getActiveSensors();

    // If no sensors are active, hide the bar
    if (active.length === 0) {
      bar.innerHTML = '';
      _activeSensors = [];
      return;
    }

    // Build HTML for info line + sensor items
    var html = buildInfoLine();

    // Group location sensors together
    var hasLocation = false;
    var latVal = null, lonVal = null;
    for (var i = 0; i < active.length; i++) {
      if (active[i].def.key === 'LOCAL_SENSOR_LATITUDE') {
        hasLocation = true;
        latVal = active[i].value;
      } else if (active[i].def.key === 'LOCAL_SENSOR_LONGITUDE') {
        hasLocation = true;
        lonVal = active[i].value;
      }
    }

    // Build sensor items HTML
    var itemsHtml = '';
    for (i = 0; i < active.length; i++) {
      // Skip individual lat/lng if we have a combined location
      if (active[i].def.key === 'LOCAL_SENSOR_LATITUDE' || active[i].def.key === 'LOCAL_SENSOR_LONGITUDE') {
        continue;
      }
      itemsHtml += renderSensorItem(active[i]);
    }

    // Add combined location item if both lat and lon are present
    if (hasLocation && latVal !== null && lonVal !== null) {
      var locDisplay = formatLocation(latVal, lonVal);
      itemsHtml += '<div class="sensor-item sensor-location"><span class="sensor-icon">\uD83D\uDCCD</span><span class="sensor-label">Location</span><span class="sensor-value">' + locDisplay + '</span></div>';
    }

    html += '<div class="sensor-items">' + itemsHtml + '</div>';
    bar.innerHTML = html;
    _activeSensors = active;
  }

  // === Re-insert weather-local.js with a cache-bust query param and re-render ===
  function refreshConfig() {
    var oldScript = document.querySelector('script[src="weather-local.js"]');
    if (oldScript) {
      oldScript.parentNode.removeChild(oldScript);
    }

    var newScript = document.createElement('script');
    newScript.src = 'weather-local.js?t=' + Date.now();
    newScript.onload = function () {
      renderSensorBar();
    };
    newScript.onerror = function () {
      console.error('[local-sensor] Failed to load weather-local.js');
    };
    document.head.appendChild(newScript);
  }

  // === Start the auto-refresh timer ===
  function startAutoRefresh() {
    var interval = 0;
    if (typeof LOCAL_CONFIG_REFRESH_INTERVAL_SECONDS === 'number' && !isNaN(LOCAL_CONFIG_REFRESH_INTERVAL_SECONDS)) {
      interval = LOCAL_CONFIG_REFRESH_INTERVAL_SECONDS;
    }
    if (interval > 0) {
      _refreshIntervalId = setInterval(refreshConfig, interval * 1000);
    }
  }

  // === Start the TTL check timer ===
  function startTTLCheck() {
    var ttl = window.LOCAL_SENSOR_TTL;
    if (!ttl || typeof ttl !== 'string') return; // no TTL set = no need to check
    var date = new Date(ttl);
    if (isNaN(date.getTime())) return; // invalid timestamp

    var timeUntilExpiry = date.getTime() - Date.now();
    if (timeUntilExpiry <= 0) {
      renderSensorBar(); // Already expired
      return;
    }

    _ttlCheckTimer = setTimeout(function () {
      renderSensorBar(); // TTL expired, hide bar
    }, timeUntilExpiry);
  }

  // === Escape HTML for safe DOM insertion ===
  function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // === Initialize immediately (local-sensor.js is loaded at end of body, so DOM is ready) ===
  renderSensorBar();
  startAutoRefresh();
  startTTLCheck();

  // === Re-render when unit toggle changes ===
  if (typeof toggleUnit === 'function') {
    window.addEventListener('unitChanged', function () {
      renderSensorBar();
    });
  }

})();