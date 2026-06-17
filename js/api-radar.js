// ===== WEATHER.GOV RADAR API CLIENT (SIMPLIFIED) =====
// Fetches the current radar image from NOAA/NCEP GeoServer WMS service.
// Caches only the single latest image in localStorage by location.

const RADAR_WMS_BASE = 'https://opengeo.ncep.noaa.gov/geoserver/conus/';
const RADAR_DEFAULT_LAYER = 'conus_bref_qcd';
const RADAR_IMAGE_SIZE = 512;
const RADAR_BBOX_RADIUS_KM = 200;

// EPSG:3857 / Web Mercator constants
const WEB_MERCATOR_SEMI_MAJOR_AXIS = 20037508.34;
const EARTH_RADIUS_KM = 6371;

// WMS fetch settings
const RADAR_WMS_TIMEOUT_MS = 15000;

// Cache TTL — radar updates every ~2 minutes, so 5 min is safe
const RADAR_CACHE_TTL = 5 * 60 * 1000;

function lonToX(lon) {
  return lon * WEB_MERCATOR_SEMI_MAJOR_AXIS / 180;
}

function latToY(lat) {
  const y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
  return y * WEB_MERCATOR_SEMI_MAJOR_AXIS / 180;
}

function latLonToBboxEPSG3857(lat, lon, radiusKm) {
  const dLat = (radiusKm / EARTH_RADIUS_KM) * (180 / Math.PI);
  const dLon = (radiusKm / EARTH_RADIUS_KM) * (180 / Math.PI) / Math.cos(lat * Math.PI / 180);

  return [
    lonToX(lon - dLon),
    latToY(lat - dLat),
    lonToX(lon + dLon),
    latToY(lat + dLat),
  ];
}

function buildRadarImageUrl(lat, lon) {
  const bbox = latLonToBboxEPSG3857(lat, lon, RADAR_BBOX_RADIUS_KM);
  // Omit TIME param — WMS returns the latest image by default

  return `${RADAR_WMS_BASE}${RADAR_DEFAULT_LAYER}/wms?` +
    `SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&FORMAT=image/png` +
    `&LAYERS=${encodeURIComponent(RADAR_DEFAULT_LAYER)}` +
    `&WIDTH=${RADAR_IMAGE_SIZE}&HEIGHT=${RADAR_IMAGE_SIZE}` +
    `&SRS=EPSG:3857&BBOX=${bbox.join(',')}`;
}

// ===== SINGLE-IMAGE CACHE (localStorage) =====
function getRadarCacheKey(lat, lon) {
  return `hasw_radar_current_${lat.toFixed(4)}_${lon.toFixed(4)}`;
}

function getCachedRadarImage(lat, lon) {
  try {
    const key = getRadarCacheKey(lat, lon);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    // Check TTL
    if (Date.now() - entry.timestamp > RADAR_CACHE_TTL) {
      localStorage.removeItem(key);
      return null;
    }
    return entry.dataUrl;
  } catch {
    return null;
  }
}

function cacheRadarImage(lat, lon, dataUrl) {
  try {
    const key = getRadarCacheKey(lat, lon);
    localStorage.setItem(key, JSON.stringify({
      dataUrl,
      timestamp: Date.now(),
    }));
  } catch { /* storage full — ignore */ }
}

// ===== FETCH =====
async function fetchRadarImageFromWMS(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RADAR_WMS_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`WMS GetMap failed: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('image/')) {
      throw new Error(`Unexpected content type: ${contentType}`);
    }

    return await response.blob();
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

// Fetch the current radar image — returns a data URL string.
// Uses cache on page load, fetches fresh on refresh.
async function fetchCurrentRadarImage(lat, lon) {
  // Check cache first
  const cached = getCachedRadarImage(lat, lon);
  if (cached) {
    console.log('[Radar] Cache HIT for current image');
    return cached;
  }

  const imageUrl = buildRadarImageUrl(lat, lon);
  console.log('[Radar] Fetching current radar image from WMS');

  try {
    const blob = await fetchRadarImageFromWMS(imageUrl);
    // Convert blob to data URL for caching and display
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });

    cacheRadarImage(lat, lon, dataUrl);
    return dataUrl;
  } catch (e) {
    console.error('[Radar] Failed to fetch radar image:', e);
    return null;
  }
}

// Make available globally
window.fetchCurrentRadarImage = fetchCurrentRadarImage;