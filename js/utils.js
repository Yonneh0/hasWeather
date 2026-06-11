// ===== UTILITY FUNCTIONS =====
function toF(c) { return c * 9 / 5 + 32; }
function toC(f) { return (f - 32) * 5 / 9; }
function convertTemp(celsius) {
  if (celsius == null || celsius !== celsius) return NaN;
  return unit === 'F' ? toF(celsius) : toC(celsius);
}
function tempUnit() { return unit === 'F' ? '°F' : '°C'; }

function escapeHTML(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, '\u0026amp;')
    .replace(/</g, '\u0026lt;')
    .replace(/>/g, '\u0026gt;')
    .replace(/"/g, '\u0026quot;')
    .replace(/'/g, '\u0026#039;');
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = EARTH_RADIUS_MI;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearing(lat1, lon1, lat2, lon2) {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
  let b = Math.atan2(y, x) * 180 / Math.PI;
  return (b + 360) % 360;
}

function bearingToCompass(deg) {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

function aqiLabel(aqi) {
  if (aqi === null || aqi === undefined || aqi === false || aqi !== aqi) return { label: '—', cls: '' };
  if (aqi <= 50) return { label: 'Good', cls: 'aqi-good' };
  if (aqi <= 100) return { label: 'Moderate', cls: 'aqi-moderate' };
  return { label: 'Unhealthy', cls: 'aqi-unhealthy' };
}

function sanitizeId(str, suffix) {
  const base = str.replace(/[^a-zA-Z0-9]/g, '_');
  return suffix ? `${base}_${suffix}` : base;
}
