// ===== WEATHER.GOV RADAR API CLIENT (SIMPLIFIED) =====
// Fetches the current radar image from NOAA/NCEP GeoServer WMS service.
// Caches multiple overlays in localStorage by location + layer.

const RADAR_WMS_BASE = 'https://opengeo.ncep.noaa.gov/geoserver/conus/';
const RADAR_IMAGE_SIZE = 512;
const RADAR_BBOX_RADIUS_KM = 200;

// EPSG:3857 / Web Mercator constants
const WEB_MERCATOR_SEMI_MAJOR_AXIS = 20037508.34;
const EARTH_RADIUS_KM = 6371;

// WMS fetch settings
const RADAR_WMS_TIMEOUT_MS = 15000;

// Cache TTL — radar updates every ~2 minutes, so 5 min is safe
const RADAR_CACHE_TTL = 5 * 60 * 1000;

// Available radar overlays
const RADAR_LAYERS = {
  'base':         { wmsLayer: 'conus_bref_qcd',  label: 'Base Reflectivity' },
  'qcd-composite':    { wmsLayer: 'conus_cref_qcd',   label: 'Composite Reflectivity (QCD)' },
  'echo_tops':    { wmsLayer: 'conus_neet_v18',   label: 'Echo Tops' },
  'precip_type':  { wmsLayer: 'conus_pcpn_typ',   label: 'Precipitation Type' },
};

const RADAR_DEFAULT_OVERLAY = 'qcd-composite'; // Default: QCD Composite Reflectivity

// ===== GetCapabilities cache key =====
function getCapabilitiesCacheKey(lat, lon) {
  return `hasw_radar_capabilities_${lat.toFixed(4)}_${lon.toFixed(4)}`;
}

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

function buildRadarImageUrl(lat, lon, layer) {
  const bbox = latLonToBboxEPSG3857(lat, lon, RADAR_BBOX_RADIUS_KM);

  return `${RADAR_WMS_BASE}${layer}/wms?` +
    'SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&FORMAT=image/png' +
    `&LAYERS=${encodeURIComponent(layer)}` +
    `&WIDTH=${RADAR_IMAGE_SIZE}&HEIGHT=${RADAR_IMAGE_SIZE}` +
    '&SRS=EPSG:3857&BBOX=' + bbox.join(',');
}

/**
 * Fetch available radar layers using WMS GetCapabilities.
 * Returns an array of layer objects: { name, label }
 */
async function fetchAvailableRadarLayers(lat, lon) {
  const cacheKey = getCapabilitiesCacheKey(lat, lon);
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const entry = JSON.parse(raw);
      if (Date.now() - entry.timestamp < RADAR_CACHE_TTL * 10) { // cache GetCaps for 50 min
        return entry.data;
      }
    }
  } catch {}

  const capsUrl = `${RADAR_WMS_BASE}conus_bref_qcd/wms?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.1.1`;
  try {
    const resp = await fetch(capsUrl);
    const text = await resp.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/xml');
    const layers = [];

    for (const layerEl of doc.querySelectorAll('Layer')) {
      const nameEl = layerEl.querySelector('Name');
      const titleEl = layerEl.querySelector('Title');
      if (nameEl) {
        const name = nameEl.textContent.trim();
        if (name.startsWith('conus_') && !name.includes('_anl')) {
          layers.push({
            name: name,
            label: titleEl ? titleEl.textContent.trim() : name,
          });
        }
      }
    }

    // Save to cache
    localStorage.setItem(cacheKey, JSON.stringify({
      data: layers,
      timestamp: Date.now(),
    }));

    return layers;
  } catch (e) {
    console.warn('[Radar] GetCapabilities failed:', e);
    return Object.entries(RADAR_LAYERS).map(([key, val]) => ({ name: val.wmsLayer, label: val.label }));
  }
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

/**
 * Fetch radar image for a specific overlay layer.
 * @param {string} lat
 * @param {string} lon
 * @param {string} layer - WMS layer name (e.g., 'conus_bref_qcd')
 * @returns {Promise<string|null>} data URL string
 */
async function fetchRadarImageForOverlay(lat, lon, layer) {
  // Check overlay-specific cache
  const cached = getCachedRadarOverlay(lat, lon, layer);
  if (cached) {
    console.log(`[Radar] Cache HIT for ${layer}`);
    return cached;
  }

  const imageUrl = buildRadarImageUrl(lat, lon, layer);
  console.log(`[Radar] Fetching overlay: ${layer}`);

  try {
    const blob = await fetchRadarImageFromWMS(imageUrl);
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
    cacheRadarOverlay(lat, lon, layer, dataUrl);
    return dataUrl;
  } catch (e) {
    console.error(`[Radar] Failed to fetch ${layer}:`, e);
    return null;
  }
}

// ===== Overlay-specific cache =====
function getRadarOverlayCacheKey(lat, lon, layer) {
  return `hasw_radar_overlay_${layer}_${lat.toFixed(4)}_${lon.toFixed(4)}`;
}

function getCachedRadarOverlay(lat, lon, layer) {
  try {
    const key = getRadarOverlayCacheKey(lat, lon, layer);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > RADAR_CACHE_TTL) {
      localStorage.removeItem(key);
      return null;
    }
    return entry.dataUrl;
  } catch {
    return null;
  }
}

function cacheRadarOverlay(lat, lon, layer, dataUrl) {
  try {
    const key = getRadarOverlayCacheKey(lat, lon, layer);
    localStorage.setItem(key, JSON.stringify({ dataUrl, timestamp: Date.now() }));
  } catch {}
}

// Legacy: keep fetchCurrentRadarImage for backward compat — uses 'base' layer
async function fetchCurrentRadarImage(lat, lon) {
  return await fetchRadarImageForOverlay(lat, lon, 'conus_bref_qcd');
}

// Make available globally
window.fetchRadarImageForOverlay = fetchRadarImageForOverlay;
window.fetchAvailableRadarLayers = fetchAvailableRadarLayers;
window.fetchCurrentRadarImage = fetchCurrentRadarImage;
window.RADAR_LAYERS = RADAR_LAYERS;
window.RADAR_DEFAULT_OVERLAY = RADAR_DEFAULT_OVERLAY;
