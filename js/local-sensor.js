// ===== LOCAL SENSOR BAR =====
// Reads sensor values from weather-local.js and displays them in a bar below the header.
// Only sensors with non-null values are shown.
// Respects the existing unit toggle (°F/°C) for temperature, speed, pressure, etc.
// Supports flexible input formats: plain numbers default to US customary units, or
// strings can include explicit units like "19km/h", "47kph", "1017hPa", "0.002\"", "0.002ft", etc.

(function () {
  'use strict';

  // === Sensor definitions: maps config keys to display metadata ===
  const SENSOR_DEFS = [
    { key: 'LOCAL_SENSOR_TEMPERATURE',          label: 'Temp', unit: '\u00B0F', type: 'temp' },
    { key: 'LOCAL_SENSOR_FEELSLIKE',            label: 'Feels Like', unit: '\u00B0F', type: 'temp' },
    { key: 'LOCAL_SENSOR_DEWPOINT',             label: 'Dew Pt', unit: '\u00B0F', type: 'temp' },
    { key: 'LOCAL_SENSOR_WIND_SPEED',           label: 'Wind', unit: 'mph', type: 'wind-speed' },
    { key: 'LOCAL_SENSOR_WIND_GUST',            label: 'Gust', unit: 'mph', type: 'wind-gust' },
    { key: 'LOCAL_SENSOR_WIND_DIRECTION_DEGREES', label: 'Wind Dir', unit: '\u00B0', type: 'wind-dir' },
    { key: 'LOCAL_SENSOR_HUMIDITY_PERCENT',     label: 'Humidity', unit: '%', type: 'humidity' },
    { key: 'LOCAL_SENSOR_PRESSURE',             label: 'Pressure', unit: 'inHg', type: 'pressure' },
    { key: 'LOCAL_SENSOR_LATITUDE',             label: 'Location', unit: '', type: 'location' },
    { key: 'LOCAL_SENSOR_LONGITUDE',            label: 'Location', unit: '', type: 'location' },
    { key: 'LOCAL_SENSOR_UV_INDEX',             label: 'UV Index', unit: '', type: 'uv' },
    { key: 'LOCAL_SENSOR_VISIBILITY',           label: 'Vis', unit: 'mi', type: 'visibility' },
    { key: 'LOCAL_SENSOR_RAINFALL',             label: 'Rainfall', unit: 'in', type: 'rainfall' },
    { key: 'LOCAL_SENSOR_SOLARRADIATION',       label: 'Solar', unit: 'W/m\u00B2', type: 'solar' },
    { key: 'LOCAL_SENSOR_SOIL_MOISTURE_PERCENT', label: 'Soil Moisture', unit: '%', type: 'soil-moisture' },
  ];

  // === Current sensor state (tracks which sensors are active) ===
  let _activeSensors = [];
  let _sensorValues = {};
  let _refreshIntervalId = null;
  let _ttlCheckTimer = null;
  let _hiddenRefreshInterval = null;
  let _configLoadSuccess = true;
  let _lastSuccessTime = Date.now();
  let _retryCount = 0;

  // === Unit conversion helpers ===
  function toF(c) { return c * 9 / 5 + 32; }
  function toC(f) { return (f - 32) * 5 / 9; }

  function getUnit() {
    if (typeof unit === 'string') return unit;
    return 'F';
  }

  // === Converters (used by formatSensorValue) ===
  // Each converter takes (value, fromUnit, toUnit) and returns a formatted string or NaN.
  function convertPressure(value, fromUnit, toUnit) {
    if (value == null || value !== value || isNaN(value)) return NaN;
    if (fromUnit === 'inHg' && toUnit === 'hPa') {
      return (value * 33.8639).toFixed(1);
    }
    if (fromUnit === 'hPa' && toUnit === 'inHg') {
      return (value / 33.8639).toFixed(2);
    }
    // Same unit, no conversion needed
    return Number.isInteger(value) ? value : value.toFixed(2);
  }

  function convertWindSpeed(value, fromUnit, toUnit) {
    if (value == null || value !== value || isNaN(value)) return NaN;
    if (fromUnit === 'mph' && toUnit === 'km/h') {
      return (value * 1.60934).toFixed(1);
    }
    if (fromUnit === 'km/h' && toUnit === 'mph') {
      const mph = value / 1.60934;
      return mph.toFixed(1);
    }
    // Same unit, no conversion needed
    return Number.isInteger(value) ? value : value.toFixed(1);
  }

  function convertVisibility(value, fromUnit, toUnit) {
    if (value == null || value !== value || isNaN(value)) return NaN;
    if (fromUnit === 'mi' && toUnit === 'km') {
      return (value * 1.60934).toFixed(1);
    }
    if (fromUnit === 'km' && toUnit === 'mi') {
      const mi = value / 1.60934;
      return mi.toFixed(1);
    }
    // Same unit, no conversion needed
    return Number.isInteger(value) ? value : value.toFixed(1);
  }

  function convertRainfall(value, fromUnit, toUnit) {
    if (value == null || value !== value || isNaN(value)) return NaN;
    if (fromUnit === 'in' && toUnit === 'mm') {
      return (value * 25.4).toFixed(1);
    }
    if (fromUnit === 'mm' && toUnit === 'in') {
      const inVal = value / 25.4;
      return inVal.toFixed(2);
    }
    if (fromUnit === 'ft' && toUnit === 'in') {
      return (value * 12).toFixed(3);
    }
    if (fromUnit === 'in' && toUnit === 'ft') {
      return (value / 12).toFixed(4);
    }
    // Same unit, no conversion needed
    return Number.isInteger(value) ? value : value.toFixed(2);
  }

  function convertWindDir(value, fromUnit, toUnit) {
    if (value == null || value !== value || isNaN(value)) return NaN;
    // Wind direction is always in degrees; no conversion needed
    return Math.round(value);
  }

  // === Unit parsing: converts flexible input strings into a value and unit string ===
  // Supported formats:
  //   "12" → [12, 'mph'] (wind speed default) or [12, 'inHg'] (pressure default) etc.
  //   "19km/h", "19kph", "19k" → [19, 'km/h']
  //   "1017hPa", "1017hpa" → [1017, 'hPa']
  //   "47m", "47mph" → [47, 'mph']
  //   "10mi" → [10, 'mi']
  //   "16km" → [16, 'km']
  //   "0.15in", "0.15\"" → [0.15, 'in']
  //   "4mm" → [4, 'mm']
  //   "22.5C", "22.5c" → [22.5, 'C']
  //   "72.5F", "72.5f" → [72.5, 'F']
  //   "0.002\"", "0.002in" → [0.002, 'in'] (rainfall)
  //   "0.002ft", "0.002ft" → [0.002, 'ft'] (rainfall in feet)
  function parseSensorValue(rawValue, defaultUnit) {
    if (rawValue == null || rawValue !== rawValue) return { value: NaN, unit: '' };

    // If it's already a number, use the default unit
    if (typeof rawValue === 'number') {
      return { value: rawValue, unit: defaultUnit };
    }

    // Parse string input like "19km/h", "47mph", "22.5C"
    const str = String(rawValue).trim();
    if (!str) return { value: NaN, unit: '' };

    // Robust regex to extract number and unit suffix, handling backslashes before quotes.
    // Pattern matches: optional sign, digits with optional decimal, optional whitespace,
    // optional trailing quote (for inches like "0.002\""), then optional unit suffix.
    const match = str.match(/^([+-]?\d+\.?\d*)\s*(?:"|\u0022)?\s*([a-zA-Z\/°]+)?$/);
    if (!match) {
      // Fallback: try simpler pattern for edge cases
      const simpleMatch = str.match(/^([+-]?\d+\.?\d*)/);
      if (simpleMatch) {
        return { value: parseFloat(simpleMatch[1]), unit: defaultUnit };
      }
      return { value: NaN, unit: '' };
    }

    const numVal = parseFloat(match[1]);
    let suffix = (match[2] || '').toLowerCase();

    if (!suffix) {
      // No suffix → use default unit
      return { value: numVal, unit: defaultUnit };
    }

    // Resolve suffix to a standard unit string
    const unitMap = {
      // Wind speed units
      'km/h': 'km/h', 'kph': 'km/h', 'k': 'km/h',
      'mph': 'mph', 'm': 'mph',
      // Pressure units
      'hpa': 'hPa',
      'inhg': 'inHg', 'inh': 'inHg', 'in': 'inHg',
      // Visibility units
      'mi': 'mi',
      'km': 'km',
      // Rainfall units
      'mm': 'mm',
      'ft': 'ft', 'feet': 'ft', 'foot': 'ft',
      // Temperature units
      'c': 'C', '°c': 'C',
      'f': 'F', '°f': 'F',
    };

    const resolvedUnit = unitMap[suffix] || suffix;

    // For wind speed, normalize to mph or km/h
    if (defaultUnit === 'mph') {
      if (resolvedUnit === 'km/h') {
        return { value: numVal, unit: 'km/h' };
      }
      return { value: numVal, unit: 'mph' };
    }

    // For pressure, normalize to inHg or hPa
    if (defaultUnit === 'inHg') {
      if (resolvedUnit === 'hPa') {
        return { value: numVal, unit: 'hPa' };
      }
      return { value: numVal, unit: 'inHg' };
    }

    // For visibility, normalize to mi or km
    if (defaultUnit === 'mi') {
      if (resolvedUnit === 'km') {
        return { value: numVal, unit: 'km' };
      }
      return { value: numVal, unit: 'mi' };
    }

    // For rainfall, normalize to in or mm or ft
    if (defaultUnit === 'in') {
      if (resolvedUnit === 'mm') {
        return { value: numVal, unit: 'mm' };
      }
      if (resolvedUnit === 'ft') {
        return { value: numVal, unit: 'ft' };
      }
      return { value: numVal, unit: 'in' };
    }

    // For temperature, normalize to F or C
    if (defaultUnit === '\u00B0F') {
      if (resolvedUnit === 'C') {
        return { value: numVal, unit: 'C' };
      }
      return { value: numVal, unit: '\u00B0F' };
    }

    // For temperature with Celsius default
    if (defaultUnit === '\u00B0C') {
      if (resolvedUnit === 'F') {
        return { value: numVal, unit: 'F' };
      }
      return { value: numVal, unit: 'C' };
    }

    // Fallback: use the resolved unit as-is
    return { value: numVal, unit: resolvedUnit };
  }

  // === Get the current refresh interval from config ===
  function getConfigInterval() {
    if (typeof LOCAL_CONFIG_REFRESH_INTERVAL_SECONDS === 'number' && !isNaN(LOCAL_CONFIG_REFRESH_INTERVAL_SECONDS)) {
      return LOCAL_CONFIG_REFRESH_INTERVAL_SECONDS;
    }
    return 0; // disabled
  }

  // === Get the preferred display unit for a sensor type based on current unit preference ===
  function getPreferredUnit(def) {
    const u = getUnit();
    switch (def.type) {
      case 'wind-speed':
      case 'wind-gust':
        return u === 'F' ? 'mph' : 'km/h';
      case 'pressure':
        return u === 'F' ? 'inHg' : 'hPa';
      case 'visibility':
        return u === 'F' ? 'mi' : 'km';
      case 'rainfall':
        return u === 'F' ? 'in' : 'mm';
      case 'temp':
        return u === 'F' ? '\u00B0F' : '\u00B0C';
      default:
        return null; // No unit preference for this type — use def.unit instead
    }
  }

  // === Get the display unit for a sensor (preferred unit if available, else definition default) ===
  function getDisplayUnit(def) {
    const preferred = getPreferredUnit(def);
    return preferred !== null ? preferred : def.unit;
  }

  // === Format a sensor value for display ===
  function formatSensorValue(def, rawValue) {
    if (rawValue == null || rawValue !== rawValue) return '\u2014';

    let displayVal;
    let displayUnit = getDisplayUnit(def);

    switch (def.type) {
      case 'temp': {
        const parsed = parseSensorValue(rawValue, '\u00B0F');
        const value = parsed.value;
        if (isNaN(value)) return '\u2014';

        const preferredUnit = getPreferredUnit(def);
        // Determine native unit from parsed value
        let nativeIsCelsius = false;
        if (typeof rawValue === 'number') {
          // Default to Fahrenheit for plain numbers
          nativeIsCelsius = false;
        } else {
          nativeIsCelsius = parsed.unit === 'C';
        }

        if (nativeIsCelsius) {
          // Convert Celsius → Fahrenheit if preferred unit is °F, else keep Celsius
          const targetUnit = getDisplayUnit(def);
          displayVal = targetUnit === '\u00B0F' ? toF(value).toFixed(1) : value.toFixed(1);
          displayUnit = targetUnit;
        } else {
          // nativeUnit is °F — convert to preferred unit if needed
          const targetUnit = getDisplayUnit(def);
          displayVal = targetUnit === '\u00B0F' ? (Number.isInteger(value) ? value : value.toFixed(1)) : toC(value).toFixed(1);
          displayUnit = targetUnit;
        }
        break;
      }

      case 'wind-speed':
      case 'wind-gust': {
        const parsed = parseSensorValue(rawValue, 'mph');
        const value = parsed.value;
        if (isNaN(value)) return '\u2014';

        const preferredUnit = getPreferredUnit(def);
        const nativeUnit = parsed.unit; // 'mph' or 'km/h'
        displayUnit = preferredUnit || 'mph';

        if (nativeUnit === 'km/h') {
          displayVal = convertWindSpeed(value, 'km/h', preferredUnit);
        } else {
          displayVal = convertWindSpeed(value, 'mph', preferredUnit);
        }
        break;
      }

      case 'pressure': {
        const parsed = parseSensorValue(rawValue, 'inHg');
        const value = parsed.value;
        if (isNaN(value)) return '\u2014';

        const preferredUnit = getPreferredUnit(def);
        const nativeUnit = parsed.unit; // 'inHg' or 'hPa'
        displayUnit = preferredUnit || 'inHg';

        if (nativeUnit === 'hPa') {
          displayVal = convertPressure(value, 'hPa', preferredUnit);
        } else {
          displayVal = convertPressure(value, 'inHg', preferredUnit);
        }
        break;
      }

      case 'visibility': {
        const parsed = parseSensorValue(rawValue, 'mi');
        const value = parsed.value;
        if (isNaN(value)) return '\u2014';

        const preferredUnit = getPreferredUnit(def);
        const nativeUnit = parsed.unit; // 'mi' or 'km'
        displayUnit = preferredUnit || 'mi';

        if (nativeUnit === 'km') {
          displayVal = convertVisibility(value, 'km', preferredUnit);
        } else {
          displayVal = convertVisibility(value, 'mi', preferredUnit);
        }
        break;
      }

      case 'rainfall': {
        const parsed = parseSensorValue(rawValue, 'in');
        const value = parsed.value;
        if (isNaN(value)) return '\u2014';

        const preferredUnit = getPreferredUnit(def);
        const nativeUnit = parsed.unit; // 'in' or 'mm' or 'ft'
        displayUnit = preferredUnit || 'in';

        if (nativeUnit === 'mm') {
          displayVal = convertRainfall(value, 'mm', preferredUnit);
        } else if (nativeUnit === 'ft') {
          displayVal = convertRainfall(value, 'ft', preferredUnit);
        } else {
          displayVal = convertRainfall(value, 'in', preferredUnit);
        }
        break;
      }

      case 'wind-dir': {
        const value = typeof rawValue === 'number' ? rawValue : parseFloat(rawValue);
        if (isNaN(value)) return '\u2014';
        displayVal = convertWindDir(value, '', '');
        break;
      }

      case 'humidity':
      case 'uv':
      case 'solar':
      case 'soil-moisture': {
        const value = typeof rawValue === 'number' ? rawValue : parseFloat(rawValue);
        if (isNaN(value)) return '\u2014';
        displayVal = Number.isInteger(value) ? value : value.toFixed(1);
        break;
      }

      case 'location': {
        // Location is handled separately by formatLocation()
        displayVal = String(rawValue);
        break;
      }

      default:
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
      const preferredUnit = getPreferredUnit(def);
      return preferredUnit === '\u00B0F' ? def.label + ' (\u00B0F)' : def.label + ' (\u00B0C)';
    }

    // For sensor types with unit preferences, show the label with preferred unit
    const preferredUnit = getPreferredUnit(def);
    if (preferredUnit !== null) {
      return def.label + ' (' + preferredUnit + ')';
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
      var expiryHtml = buildExpiryWarning();
      if (bar.innerHTML !== expiryHtml) {
        bar.innerHTML = expiryHtml;
      }
      _activeSensors = [];
      return;
    }

    var active = getActiveSensors();

    // If no sensors are active, hide the bar
    if (active.length === 0) {
      if (bar.innerHTML !== '') {
        bar.innerHTML = '';
      }
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

    // Only update DOM if content has actually changed (change detection)
    if (bar.innerHTML !== html) {
      bar.innerHTML = html;
    }

    _activeSensors = active;
  }

  // === Track the current pending script element to avoid memory leaks and race conditions ===
  let _currentScriptElement = null;

  // === Clear all sensor variable keys from window before reloading config.
  // This ensures that deleted variables are not left behind on the window object,
  // which would cause stale sensors to appear in the UI after a reload. ===
  function clearConfigVars() {
    SENSOR_DEFS.forEach(def => {
      try { window[def.key] = undefined; } catch(e) {} // var declarations may be non-configurable (can't delete, but can overwrite)
    });
    // Also clear meta/config variables (may also be non-configurable)
    try { window.LOCAL_SENSOR_NOTE = undefined; } catch(e) {}
    try { window.LOCAL_SENSOR_DATA_SOURCE = undefined; } catch(e) {}
    try { window.LOCAL_SENSOR_TIMESTAMP = undefined; } catch(e) {}
    try { window.LOCAL_SENSOR_TTL = undefined; } catch(e) {}
    try { window.LOCAL_CONFIG_REFRESH_INTERVAL_SECONDS = undefined; } catch(e) {}
  }

  // === Load weather-local.js via DOM script injection (required for file:// protocol) ===
  function loadConfig() {
    return new Promise(function(resolve) {
      // Clear all existing sensor variable keys from window before loading new config
      clearConfigVars();

      // If there's a previous script still loading, remove it to avoid memory leaks and race conditions
      if (_currentScriptElement && _currentScriptElement.parentNode) {
        _currentScriptElement.parentNode.removeChild(_currentScriptElement);
      }

      // Create and inject the script element
      var script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = 'weather-local.js?t=' + Date.now();
      
      // Timeout after 10 seconds to prevent hanging loads
      var timeoutId = setTimeout(function() {
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
        _configLoadSuccess = false;
        resolve(false);
      }, 10000);

      script.onload = function() {
        clearTimeout(timeoutId);
        _configLoadSuccess = true;
        // Remove the script element after successful load to free memory
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
        _currentScriptElement = null;
        resolve(true);
      };

      script.onerror = function() {
        clearTimeout(timeoutId);
        _configLoadSuccess = false;
        // Remove the script element on error to free memory
        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }
        _currentScriptElement = null;
        resolve(false);
      };

      // Keep reference so we can clean up on next load or page unload
      _currentScriptElement = script;
      document.body.appendChild(script);
    });
  }

  // === Clean up the current script element when it's no longer needed (e.g., on page unload) ===
  function cleanupScriptElement() {
    if (_currentScriptElement && _currentScriptElement.parentNode) {
      _currentScriptElement.parentNode.removeChild(_currentScriptElement);
    }
    _currentScriptElement = null;
  }

  window.addEventListener('unload', cleanupScriptElement);

  // === Refresh config with exponential backoff on failure ===
  async function refreshConfig() {
    const success = await loadConfig();

    if (success) {
      renderSensorBar();
      _lastSuccessTime = Date.now();
      _retryCount = 0;

      // Always restart interval with current config value (handles changes to LOCAL_CONFIG_REFRESH_INTERVAL_SECONDS)
      startAutoRefresh();
    } else {
      _retryCount++;
      const backoffMs = Math.min(1000 * Math.pow(2, _retryCount), 300000); // Cap at 5 min
      console.warn(`[local-sensor] Config load failed (${_retryCount}), retrying in ${backoffMs/1000}s`);

      // Use setTimeout for exponential backoff instead of setInterval
      _refreshIntervalId = setTimeout(refreshConfig, backoffMs);
    }
  }

  // === Start the auto-refresh timer ===
  function startAutoRefresh() {
    // Always clear existing interval first
    clearInterval(_refreshIntervalId);
    clearTimeout(_refreshIntervalId);
    _refreshIntervalId = null;

    var interval = getConfigInterval();
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

  // === Page visibility awareness - slow down refresh when tab is hidden ===
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      // Stop normal interval and start a slower one when hidden
      clearInterval(_refreshIntervalId);
      clearTimeout(_refreshIntervalId);
      _refreshIntervalId = null;
      _hiddenRefreshInterval = setInterval(refreshConfig, 60000); // Every minute when hidden
    } else {
      // Restore normal refresh when tab is visible again
      clearInterval(_hiddenRefreshInterval);
      clearTimeout(_hiddenRefreshInterval);
      _hiddenRefreshInterval = null;
      startAutoRefresh();
    }
  });

  // === Periodic health check - detect and recover from stuck states ===
  function startHealthCheck() {
    setInterval(function() {
      if (_configLoadSuccess) return; // Already handling failed state via backoff

      const timeSinceLastSuccess = Date.now() - _lastSuccessTime;
      const interval = getConfigInterval() * 1000 || 60000; // Default to 1 min if unknown
      if (timeSinceLastSuccess > interval * 3) {
        console.warn('[local-sensor] No config success in ' + Math.round(timeSinceLastSuccess/60000) + ' minutes, forcing refresh');
        _configLoadSuccess = false; // Force a fresh attempt
        refreshConfig();
      }
    }, 300000); // Check every 5 minutes
  }

  // === Escape HTML for safe DOM insertion ===
  function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str
      .replace(/\u0026/g, '\u0026amp\u003B')
      .replace(/\u003c/g, '\u0026lt\u003B')
      .replace(/\u003e/g, '\u0026gt\u003B')
      .replace(/\u0022/g, '\u0026quot\u003B')
      .replace(/\u0027/g, '\u0026#039');
  }

  // === Initialize immediately (local-sensor.js is loaded at end of body, so DOM is ready) ===
  renderSensorBar();
  startAutoRefresh();
  startTTLCheck();
  startHealthCheck();

  // === Re-render when unit toggle changes ===
  if (typeof toggleUnit === 'function') {
    window.addEventListener('unitChanged', function () {
      renderSensorBar();
    });
  }

})();