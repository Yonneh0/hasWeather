// ===== WEATHER.GOV RADAR API CLIENT =====
// Fetches radar imagery from NOAA/NCEP GeoServer WMS service.
// Primary source: MRMS (Multi-Radar-Multi-Sensor) composite radar data.
// Cache: Binary images stored in Browser Cache API (CacheStorage), metadata in localStorage.

// ===== ENDPOINTS & CONSTANTS =====
const RADAR_WMS_BASE = 'https://opengeo.ncep.noaa.gov/geoserver/conus/';
const RADAR_DEFAULT_LAYER = 'conus_bref_qcd';
const RADAR_IMAGE_SIZE = 512;
const RADAR_BBOX_RADIUS_KM = 200;
const RADAR_TTL = 5 * 60 * 1000;
const RADAR_META_TTL = 30 * 60 * 1000;

// Available radar layers
const RADAR_LAYERS = {
  BASE_REFLECTIVITY: 'conus_bref_qcd',
  COMPOSITE_REFLECTIVITY: 'conus_cref_qcd',
  ECHO_TOPS: 'conus_neet_v18',
  PRECIPITATION_TYPE: 'conus_pcpn_typ',
};

// Cache API constants
const RADAR_CACHE_NAME = 'hasw-radar-v1';
// Fake HTTP prefix for cache keys — Cache API only accepts http(s) URLs
const RADAR_FAKE_BASE = 'https://radar.hasweather.local/';
const RADAR_FRAME_PREFIX = `${RADAR_FAKE_BASE}frame/`;
const RADAR_FRAMES_KEY = 'frames';
const RADAR_MAX_CACHE_BYTES = 250 * 1024 * 1024;

// EPSG:3857 / Web Mercator constants
const WEB_MERCATOR_SEMI_MAJOR_AXIS = 20037508.34;
const EARTH_RADIUS_KM = 6371;

// UTM constants (WGS84)
const UTM_SCALE_FACTOR = 0.9996;
const UTM_EASTING_OFFSET = 500000;
const UTM_SOUTH_NORTHING_OFFSET = 10000000;
const UTM_100K_NORTHING_OFFSET = 1000000;
const UTM_MERIDIAN_ARC_POLE = 4000000;
const UTM_SEMI_MAJOR_AXIS = 6378137;
const UTM_ECCENTRICITY_SQUARED = 0.00669437999014;

// WMS fetch settings
const RADAR_WMS_TIMEOUT_MS = 15000;
const RADAR_WMS_MAX_RETRIES = 3;

// Base64 encoding chunk size (avoids stack overflow on large arrays)
const BASE64_CHUNK_SIZE = 8192;

// ===== BBOX CALCULATION =====
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
    lonToX(lon - dLon),   // minx in meters
    latToY(lat - dLat),   // miny in meters
    lonToX(lon + dLon),   // maxx in meters
    latToY(lat + dLat),   // maxy in meters
  ];
}

// ===== ARRAYBUFFER → BASE64 DATA URL =====
function arrayBufferToBase64DataURL(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + BASE64_CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return 'data:image/png;base64,' + btoa(binary);
}

// ===== WMS URL BUILDER =====
function buildRadarImageUrl(lat, lon, layer, timestamp) {
  const bbox = latLonToBboxEPSG3857(lat, lon, RADAR_BBOX_RADIUS_KM);
  const timeStr = timestamp ? new Date(timestamp).toISOString().replace(/\.\d+Z$/, 'Z') : '';

  return `${RADAR_WMS_BASE}${layer}/wms?` +
    `SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&FORMAT=image/png` +
    `&LAYERS=${encodeURIComponent(layer)}` +
    `&TIME=${encodeURIComponent(timeStr)}` +
    `&WIDTH=${RADAR_IMAGE_SIZE}&HEIGHT=${RADAR_IMAGE_SIZE}` +
    `&SRS=EPSG:3857&BBOX=${bbox.join(',')}`;
}

// ===== CACHE KEY GENERATION =====
function radarFrameCacheKey(lat, lon, layer, timestamp) {
  return `${RADAR_FRAME_PREFIX}${lat.toFixed(4)}/${lon.toFixed(4)}/${layer}/frame/${timestamp}`;
}

function radarFramesCacheKey(lat, lon, layer) {
  return `${RADAR_FAKE_BASE}${lat.toFixed(4)}/${lon.toFixed(4)}/${layer}/${RADAR_FRAMES_KEY}`;
}

function radarLocationPrefix(lat, lon, layer) {
  return `${RADAR_FAKE_BASE}${lat.toFixed(4)}/${lon.toFixed(4)}/${layer}/`;
}

// ===== LATEST RADAR TIMESTAMP CACHE =====
let _latestTimestampCache = null;

// ===== ALL RADAR TIMESTAMPS CACHE =====
let _allTimestampsCache = null;

// Parse all available timestamps from WMS GetCapabilities response
function parseRadarTimestamps(capabilitiesText) {
  const timestamps = [];
  
  const extentRegex = /<Extent[^>]+name="time"[^>]*>([^<]+)<\/Extent>/gi;
  let match;
  while ((match = extentRegex.exec(capabilitiesText)) !== null) {
    const timeValues = match[1].split(/[\s,]+/).map(t => t.trim()).filter(Boolean);
    timestamps.push(...timeValues);
  }
  
  const defaultMatch = capabilitiesText.match(/<Extent[^>]+name="time"[^>]*default="([^"]+)"/i);
  if (defaultMatch && defaultMatch[1] && !timestamps.includes(defaultMatch[1])) {
    timestamps.push(defaultMatch[1]);
  }
  
  const validTimestamps = [];
  for (const ts of timestamps) {
    const date = new Date(ts);
    if (!isNaN(date.getTime())) {
      validTimestamps.push(date.toISOString().replace(/\.\d+Z$/, 'Z'));
    }
  }
  
  return [...new Set(validTimestamps)].sort();
}

// Get ALL available timestamps for a layer
async function getRadarTimestampsForLayer(layer = RADAR_DEFAULT_LAYER) {
  // Return cached timestamps if valid (30 min TTL — metadata rarely changes)
  if (_allTimestampsCache && _allTimestampsCache.layer === layer && Date.now() < _allTimestampsCache.expiresAt) {
    return [..._allTimestampsCache.timestamps];
  }

  try {
    const url = `${RADAR_WMS_BASE}${layer}/wms?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.1.1`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`WMS GetCapabilities failed: ${response.status}`);

    const text = await response.text();
    const timestamps = parseRadarTimestamps(text);
    
    if (timestamps.length > 0) {
      _allTimestampsCache = {
        timestamps,
        layer,
        expiresAt: Date.now() + 30 * 60 * 1000, // 30 min TTL
      };
      return timestamps;
    }

    throw new Error('Could not parse radar timestamps from GetCapabilities');
  } catch (e) {
    console.warn('[Radar] Failed to get radar timestamps:', e);
    return [];
  }
}

// Convenience wrapper — uses same cache as getRadarTimestampsForLayer
async function getLatestRadarTimestamp() {
  // Return cached timestamp if valid (2 min TTL — matches radar update interval)
  if (_latestTimestampCache && Date.now() < _latestTimestampCache.expiresAt) {
    return _latestTimestampCache.timestamp;
  }

  try {
    const url = `${RADAR_WMS_BASE}${RADAR_DEFAULT_LAYER}/wms?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.1.1`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`WMS GetCapabilities failed: ${response.status}`);

    const text = await response.text();
    const timeMatch = text.match(/<Extent[^>]+name="time"[^>]*default="([^"]+)"/i);
    if (timeMatch && timeMatch[1]) {
      _latestTimestampCache = {
        timestamp: timeMatch[1],
        expiresAt: Date.now() + 2 * 60 * 1000, // 2 min TTL
      };
      return timeMatch[1];
    }

    const times = parseRadarTimestamps(text);
    if (times.length > 0) {
      times.sort();
      _latestTimestampCache = {
        timestamp: times[times.length - 1],
        expiresAt: Date.now() + 2 * 60 * 1000,
      };
      return times[times.length - 1];
    }

    throw new Error('Could not parse radar timestamps from GetCapabilities');
  } catch (e) {
    console.warn('[Radar] Failed to get latest timestamp:', e);
    // Return null — WMS will use default (latest) if time is omitted
    return null;
  }
}

// ===== CACHE METADATA MANAGEMENT =====
function getRadarMeta(lat, lon, layer) {
  try {
    const key = `hasw_cache_radar_meta_${lat.toFixed(4)}_${lon.toFixed(4)}_${layer}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const meta = JSON.parse(raw);
    if (Date.now() - meta.lastUpdated > RADAR_META_TTL) {
      localStorage.removeItem(key);
      return null;
    }
    return meta;
  } catch {
    return null;
  }
}

function setRadarMeta(lat, lon, layer, timestamp) {
  try {
    const key = `hasw_cache_radar_meta_${lat.toFixed(4)}_${lon.toFixed(4)}_${layer}`;
    let meta = getRadarMeta(lat, lon, layer) || { timestamps: [], layer, lat, lon, lastUpdated: 0 };
    if (!meta.timestamps.includes(timestamp)) {
      meta.timestamps.push(timestamp);
      // Keep only the last 500 timestamps (~16 hours at 2-min intervals)
      if (meta.timestamps.length > 500) {
        meta.timestamps = meta.timestamps.slice(-500);
      }
    }
    meta.lastUpdated = Date.now();
    localStorage.setItem(key, JSON.stringify(meta));
  } catch { /* ignore */ }
}

function invalidateRadarMeta(lat, lon, layer) {
  try {
    const key = `hasw_cache_radar_meta_${lat.toFixed(4)}_${lon.toFixed(4)}_${layer}`;
    localStorage.removeItem(key);
  } catch { /* ignore */ }
}

// ===== CACHE API FUNCTIONS =====
async function getCache() {
  return await caches.open(RADAR_CACHE_NAME);
}

async function cacheRadarFrame(lat, lon, layer, timestamp, arrayBuffer) {
  try {
    const cache = await getCache();
    const key = radarFrameCacheKey(lat, lon, layer, timestamp);
    const response = new Response(new Blob([arrayBuffer], { type: 'image/png' }));
    await cache.put(key, response);
    
    // Update metadata
    setRadarMeta(lat, lon, layer, timestamp);
    
    // Evict if over limit
    await evictCacheIfNecessary(lat, lon, layer);
  } catch (e) {
    console.warn('[Radar] Failed to cache frame:', e);
  }
}

// Get cached radar frame as ArrayBuffer (returns null if not found)
async function getCachedRadarFrame(lat, lon, layer, timestamp) {
  try {
    const cache = await getCache();
    const key = radarFrameCacheKey(lat, lon, layer, timestamp);
    const response = await cache.match(key);
    if (!response) return null;
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

// Get cached radar frame as base64 data URL (returns null if not found)
async function getCachedRadarFrameAsDataURL(lat, lon, layer, timestamp) {
  const arrayBuffer = await getCachedRadarFrame(lat, lon, layer, timestamp);
  return arrayBuffer ? arrayBufferToBase64DataURL(arrayBuffer) : null;
}

// Fetch a range of frames for animation (e.g., last N timestamps in order)
async function getRadarFramesForClip(lat, lon, layer, count = 10) {
  const meta = getRadarMeta(lat, lon, layer);
  if (!meta || !meta.timestamps.length) return null;
  
  const clipTimestamps = meta.timestamps.slice(-count);
  const frames = [];
  
  for (const ts of clipTimestamps) {
    const arrayBuffer = await getCachedRadarFrame(lat, lon, layer, ts);
    if (arrayBuffer) {
      frames.push({ timestamp: ts, dataUrl: arrayBufferToBase64DataURL(arrayBuffer) });
    }
  }
  
  return frames;
}

// Invalidate a single frame from cache
async function invalidateRadarFrame(lat, lon, layer, timestamp) {
  try {
    const cache = await getCache();
    const key = radarFrameCacheKey(lat, lon, layer, timestamp);
    await cache.delete(key);
  } catch { /* ignore */ }
}

// Clear all radar frames for a location/layer
async function clearRadarCacheForLocation(lat, lon) {
  try {
    const cache = await getCache();
    const prefix = `${RADAR_FAKE_BASE}${lat.toFixed(4)}/${lon.toFixed(4)}/`;
    const entries = await cache.keys();
    for (const key of entries) {
      if (key.url.startsWith(prefix)) {
        await cache.delete(key);
      }
    }
    // Also clear metadata for all layers at this location
    const metaPrefix = `hasw_cache_radar_meta_${lat.toFixed(4)}_${lon.toFixed(4)}_`;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(metaPrefix)) {
          localStorage.removeItem(key);
        }
      }
    } catch { /* ignore */ }
  } catch { /* ignore */ }
}

// Clear all radar frames for a specific layer
async function clearRadarCacheForLayer(lat, lon, layer) {
  try {
    const cache = await getCache();
    const prefix = `${RADAR_FAKE_BASE}${lat.toFixed(4)}/${lon.toFixed(4)}/${layer}/`;
    const entries = await cache.keys();
    for (const key of entries) {
      if (key.url.startsWith(prefix)) {
        await cache.delete(key);
      }
    }
    // Also clear metadata
    invalidateRadarMeta(lat, lon, layer);
  } catch { /* ignore */ }
}

// Evict oldest frames when cache exceeds limit
async function evictCacheIfNecessary(lat, lon, layer) {
  try {
    const cache = await getCache();
    const prefix = `${RADAR_FAKE_BASE}${lat.toFixed(4)}/${lon.toFixed(4)}/${layer}/frame/`;
    let totalSize = 0;
    
    // Calculate total size of all radar frames for this location/layer
    const entries = await cache.keys();
    const frameEntries = [];
    for (const key of entries) {
      if (key.url.startsWith(prefix)) {
        const response = await cache.match(key);
        if (response) {
          const arrayBuffer = await response.arrayBuffer();
          totalSize += arrayBuffer.byteLength;
          frameEntries.push({ key: key.url, size: arrayBuffer.byteLength });
        }
      }
    }
    
    // Evict oldest frames if over limit
    if (totalSize > RADAR_MAX_CACHE_BYTES) {
      // Sort by timestamp (oldest first) — extract from key URL (timestamp is after "frame/")
      frameEntries.sort((a, b) => {
        const aParts = a.key.split('/');
        const bParts = b.key.split('/');
        const tsA = parseInt(aParts[aParts.length - 1]);
        const tsB = parseInt(bParts[bParts.length - 1]);
        return tsA - tsB;
      });
      
      for (const entry of frameEntries) {
        if (totalSize <= RADAR_MAX_CACHE_BYTES) break;
        await cache.delete(entry.key);
        totalSize -= entry.size;
      }
    }
  } catch { /* ignore */ }
}

// ===== REQUEST DEDUPLICATION =====
const _pendingRadarFetches = new Map();

function getPendingRadarFetch(cacheKey) {
  if (_pendingRadarFetches.has(cacheKey)) {
    return _pendingRadarFetches.get(cacheKey);
  }
  return null;
}

function setPendingRadarFetch(cacheKey, promise) {
  _pendingRadarFetches.set(cacheKey, promise);
}

// Clean up pending fetch after completion
function clearPendingRadarFetch(cacheKey) {
  _pendingRadarFetches.delete(cacheKey);
}

// ===== RADAR IMAGE FETCH =====
async function fetchRadarImageFromWMS(url, maxRetries = RADAR_WMS_MAX_RETRIES) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
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

      const blob = await response.blob();
      return new Uint8Array(await blob.arrayBuffer());
    } catch (e) {
      clearTimeout(timeout);
      if (attempt === maxRetries) {
        throw e;
      }
      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`[Radar] WMS fetch failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// ===== MAIN ORCHESTRATOR =====
async function fetchRadarImageForLocation(lat, lon, layer = RADAR_DEFAULT_LAYER, timestamp = null) {
  if (!timestamp) {
    timestamp = await getLatestRadarTimestamp();
  }

  const cacheKey = radarFrameCacheKey(lat, lon, layer, timestamp);

  // Check Cache API first
  const cachedDataURL = await getCachedRadarFrameAsDataURL(lat, lon, layer, timestamp);
  if (cachedDataURL) {
    console.log(`[Radar] Cache HIT: ${cacheKey}`);
    return { imageUrl: cachedDataURL, timestamp, cached: true };
  }

  // Check for pending fetch (request deduplication)
  const pending = getPendingRadarFetch(cacheKey);
  if (pending) {
    console.log(`[Radar] Pending fetch exists, waiting...`);
    return pending;
  }

  const imageUrl = buildRadarImageUrl(lat, lon, layer, timestamp);
  console.log(`[Radar] Cache MISS: ${cacheKey}, fetching from WMS`);

  const fetchPromise = (async () => {
    try {
      const arrayBuffer = await fetchRadarImageFromWMS(imageUrl);
      const dataURL = arrayBufferToBase64DataURL(arrayBuffer);

      // Cache the result in Cache API
      await cacheRadarFrame(lat, lon, layer, timestamp, arrayBuffer);

      return { imageUrl: dataURL, timestamp, cached: false };
    } catch (e) {
      console.error('[Radar] Failed to fetch radar image:', e);
      return { error: `Failed to load radar: ${e.message}` };
    } finally {
      clearPendingRadarFetch(cacheKey);
    }
  })();

  setPendingRadarFetch(cacheKey, fetchPromise);
  return fetchPromise;
}

// ===== RADAR CLIP FUNCTIONS =====
async function fetchRadarImageForTimestamp(lat, lon, layer, timestamp) {
  const cachedDataURL = await getCachedRadarFrameAsDataURL(lat, lon, layer, timestamp);
  if (cachedDataURL) {
    return { imageUrl: cachedDataURL, timestamp };
  }

  const imageUrl = buildRadarImageUrl(lat, lon, layer, timestamp);
  try {
    const arrayBuffer = await fetchRadarImageFromWMS(imageUrl);
    await cacheRadarFrame(lat, lon, layer, timestamp, arrayBuffer);
    return { imageUrl: arrayBufferToBase64DataURL(arrayBuffer), timestamp };
  } catch (e) {
    console.error('[Radar] Failed to fetch radar image:', e);
    return { error: `Failed to load radar: ${e.message}` };
  }
}

// ===== RADAR CACHE INVALIDATION =====
// Invalidate radar cache for a location (used during background refresh)
function invalidateRadarCache(lat, lon) {
  // Clear metadata for all layers
  const prefix = `hasw_cache_radar_meta_${lat.toFixed(4)}_${lon.toFixed(4)}_`;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        localStorage.removeItem(key);
      }
    }
  } catch { /* ignore */ }
}

// ===== COORDINATE CONVERSION FOR PINS =====
function latLonToPixel(lat, lon, latCenter, lonCenter, radiusKm) {
  const bbox = latLonToBboxEPSG3857(latCenter, lonCenter, radiusKm);
  const [minx, miny, maxx, maxy] = bbox;
  
  const x = lonToX(lon);
  const y = latToY(lat);
  
  // Convert to pixel position (inverted Y for canvas)
  const pixelX = ((x - minx) / (maxx - minx)) * RADAR_IMAGE_SIZE;
  const pixelY = RADAR_IMAGE_SIZE - ((y - miny) / (maxy - miny)) * RADAR_IMAGE_SIZE;
  
  return { x: pixelX, y: pixelY };
}

function latLonInBounds(lat, lon, latCenter, lonCenter, radiusKm) {
  const bbox = latLonToBboxEPSG3857(latCenter, lonCenter, radiusKm);
  const [minx, miny, maxx, maxy] = bbox;
  
  const x = lonToX(lon);
  const y = latToY(lat);
  
  return x >= minx && x <= maxx && y >= miny && y <= maxy;
}

async function clearRadarCache() {
  try {
    const cache = await getCache();
    const entries = await cache.keys();
    for (const key of entries) {
      if (key.url.startsWith(RADAR_FRAME_PREFIX)) {
        await cache.delete(key);
      }
    }
    // Also clear all radar metadata from localStorage
    const prefix = 'hasw_cache_radar_meta_';
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        localStorage.removeItem(key);
      }
    }
    console.log('[Radar] All radar cache cleared');
  } catch { /* ignore */ }
}

async function getRadarCacheSize() {
  try {
    const cache = await getCache();
    let totalSize = 0;
    const entries = await cache.keys();
    for (const key of entries) {
      if (key.url.startsWith(RADAR_FRAME_PREFIX)) {
        const response = await cache.match(key);
        if (response) {
          const arrayBuffer = await response.arrayBuffer();
          totalSize += arrayBuffer.byteLength;
        }
      }
    }
    return totalSize;
  } catch {
    return 0;
  }
}

async function prefetchFramesInRange(lat, lon, layer, startIdx, endIdx) {
  const meta = getRadarMeta(lat, lon, layer);
  if (!meta || !meta.timestamps.length) return;

  const results = [];
  for (let i = Math.max(0, startIdx); i <= Math.min(endIdx, meta.timestamps.length - 1); i++) {
    const timestamp = meta.timestamps[i];
    // Check cache first
    const cached = await getCachedRadarFrameAsDataURL(lat, lon, layer, timestamp);
    if (cached) continue; // Already cached

    // Fetch from WMS
    const result = await fetchRadarImageForTimestamp(lat, lon, layer, timestamp);
    if (!result.error) {
      results.push({ index: i, timestamp, dataUrl: result.imageUrl });
    }
  }
  return results;
}

async function getFramesInRange(lat, lon, layer, startTimestamp, endTimestamp) {
  const meta = getRadarMeta(lat, lon, layer);
  if (!meta || !meta.timestamps.length) return [];

  // Filter timestamps within range
  const filtered = meta.timestamps.filter(ts => ts >= startTimestamp && ts <= endTimestamp);
  const frames = [];

  for (const ts of filtered) {
    const dataUrl = await getCachedRadarFrameAsDataURL(lat, lon, layer, ts);
    if (dataUrl) {
      frames.push({ timestamp: ts, dataUrl });
    }
  }

  return frames;
}

async function areFramesCachedInRange(lat, lon, layer, startIdx, endIdx) {
  const meta = getRadarMeta(lat, lon, layer);
  if (!meta || !meta.timestamps.length) return false;

  for (let i = Math.max(0, startIdx); i <= Math.min(endIdx, meta.timestamps.length - 1); i++) {
    const cached = await getCachedRadarFrameAsDataURL(lat, lon, layer, meta.timestamps[i]);
    if (!cached) return false;
  }
  return true;
}

// ===== COORDINATE FORMAT OPTIONS =====
const COORD_FORMATS = [
  { value: 'mgrs', label: 'MGRS' },
  { value: 'latlng', label: 'Lat/Lng' },
  { value: 'utm', label: 'UTM' },
  { value: 'dms', label: 'DMS' },
  { value: 'geohash', label: 'Geohash' },
];

// ===== MGRS CONVERSION =====
const MGRS_ZONE_ROWS = 'CDEFGHJKLMNPQRSTUVWX';
const MGRS_100K_SQUARES = [
  'ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ',   // even zone, even hemisphere
  'BCDEFGH', 'CDEFGH', 'DEFGH',         // shifted for odd zones
];

const MGRS_100K_SQUARES_TABLE = [
  ['ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ'],   // Zone even, Hemisphere N
  ['BCDEFGH', 'CDEFGH', 'DEFGH'],         // Zone odd, Hemisphere N (shifted)
  ['JKLMNOPQ', 'RSTUVWXY', 'ABCDEFGH'],   // Zone even, Hemisphere S
  ['KLMNPQR', 'MNOPQR', 'NOPQR'],         // Zone odd, Hemisphere S (shifted)
];

const MGRS_COL_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function latLonToMGRS(lat, lon) {
  const zone = getUTMZone(lat, lon);
  const hemisphere = lat >= 0 ? 'N' : 'S';
  
  const utm = latLonToUTMLatLon(lat, lon);
  const [easting, northing] = utm;
  
  const colIndex = Math.floor((easting % 5000000) / 100000);
  const rowIndex = Math.floor(((hemisphere === 'N' ? northing : northing - UTM_100K_NORTHING_OFFSET) % UTM_MERIDIAN_ARC_POLE) / 100000);
  
  const colLetter = MGRS_COL_LETTERS[colIndex];
  const rowLetter = 'ABCDEFGH'[rowIndex % 8];
  
  const hundredKmSquare = `${colLetter}${rowLetter}`;
  
  // 5 digits = ~1m accuracy
  const precisionDigits = 5;
  const precisionFactor = Math.pow(10, precisionDigits);
  
  const eastingStr = String(Math.round(((easting % 100000) / 100000) * precisionFactor)).padStart(precisionDigits, '0');
  const northingStr = String(Math.round(((northing % 100000) / 100000) * precisionFactor)).padStart(precisionDigits, '0');
  
  return `${zone}${hemisphere} ${hundredKmSquare} ${eastingStr} ${northingStr}`;
}

function getUTMZone(lat, lon) {
  const zoneNum = Math.floor((lon + 180) / 6) + 1;
  
  // Special cases for Norway and Svalbard
  if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) return 32;
  if (lat >= 72 && lat < 84 && lon >= 0 && lon < 42) {
    if (lon < 9) return 31;
    if (lon < 21) return 32;
    if (lon < 33) return 33;
    return 35;
  }
  
  return zoneNum;
}

// ===== UTM CONVERSION =====
function latLonToUTMLatLon(lat, lon) {
  const zone = getUTMZone(lat, lon);
  const hemisphere = lat >= 0 ? 'N' : 'S';
  
  const lonOrigin = (zone - 1) * 6 - 180 + 3;
  
  const phi = lat * Math.PI / 180;
  const lam = (lon - lonOrigin) * Math.PI / 180;
  
  const N = UTM_SEMI_MAJOR_AXIS / Math.sqrt(1 - UTM_ECCENTRICITY_SQUARED * Math.sin(phi) * Math.sin(phi));
  
  const A = lam * Math.cos(phi);
  
  const M = UTM_SEMI_MAJOR_AXIS * (
    (1 - UTM_ECCENTRICITY_SQUARED/4 - 3*UTM_ECCENTRICITY_SQUARED*UTM_ECCENTRICITY_SQUARED/64 - 5*UTM_ECCENTRICITY_SQUARED**3/256) * phi
    - (3*UTM_ECCENTRICITY_SQUARED/8 + 3*UTM_ECCENTRICITY_SQUARED**2/32 + 45*UTM_ECCENTRICITY_SQUARED**3/1024) * Math.sin(2*phi)
    + (15*UTM_ECCENTRICITY_SQUARED**2/256 + 45*UTM_ECCENTRICITY_SQUARED**3/1024) * Math.sin(4*phi)
    - (35*UTM_ECCENTRICITY_SQUARED**3/3072) * Math.sin(6*phi)
  );
  
  const T = Math.tan(phi) * Math.tan(phi);
  const C = UTM_ECCENTRICITY_SQUARED / (1 - UTM_ECCENTRICITY_SQUARED) * Math.cos(phi) * Math.cos(phi);
  const R = UTM_SEMI_MAJOR_AXIS * (1 - UTM_ECCENTRICITY_SQUARED) / Math.pow(1 - UTM_ECCENTRICITY_SQUARED * Math.sin(phi) * Math.sin(phi), 1.5);
  
  let easting = UTM_SCALE_FACTOR * N * (A + (1 - T + C) * A**3/6 + (5 - 18*T + T**2 + 72*C - 58*UTM_ECCENTRICITY_SQUARED/(1-UTM_ECCENTRICITY_SQUARED)) * A**5/120) + UTM_EASTING_OFFSET;
  
  let northing;
  if (hemisphere === 'N') {
    northing = UTM_SCALE_FACTOR * (M + N * Math.tan(phi) * (A**2/2 + (5 - T + 9*C + 4*C**2) * A**4/24 + (61 - 58*T + T**2 + 600*C - 330*UTM_ECCENTRICITY_SQUARED/(1-UTM_ECCENTRICITY_SQUARED)) * A**6/720));
  } else {
    northing = UTM_SCALE_FACTOR * (M + N * Math.tan(phi) * (A**2/2 + (5 - T + 9*C + 4*C**2) * A**4/24 + (61 - 58*T + T**2 + 600*C - 330*UTM_ECCENTRICITY_SQUARED/(1-UTM_ECCENTRICITY_SQUARED)) * A**6/720)) + UTM_SOUTH_NORTHING_OFFSET;
  }
  
  return [easting, northing];
}

// ===== DMS CONVERSION =====
function latLngToDMS(lat, lng) {
  return `${toDMSType(lat, 'lat')}, ${toDMSType(lng, 'lng')}`;
}

function toDMSType(value, type) {
  const direction = value < 0 ? (type === 'lat' ? 'S' : 'W') : (type === 'lat' ? 'N' : 'E');
  const absValue = Math.abs(value);
  
  const degrees = Math.floor(absValue);
  const minutesFloat = (absValue - degrees) * 60;
  const minutes = Math.floor(minutesFloat);
  const seconds = Math.round((minutesFloat - minutes) * 60);
  
  return `${degrees}°${String(minutes).padStart(2, '0')}'${String(seconds).padStart(2, '0')}\"${direction}`;
}

// ===== GEOHASH CONVERSION =====
function latLngToGeohash(lat, lon, precision = 6) {
  const base32 = '0123456789bcdefghjkmnpqrstuvwxyz';
  let latRange = [-90, 90];
  let lonRange = [-180, 180];
  let isLon = true;
  let charIndex = 0;
  let bit = 0;
  let geohash = '';
  
  while (geohash.length < precision) {
    let mid;
    
    if (isLon) {
      mid = (lonRange[0] + lonRange[1]) / 2;
      if (lon > mid) {
        charIndex |= (1 << (4 - bit));
        lonRange[0] = mid;
      } else {
        lonRange[1] = mid;
      }
    } else {
      mid = (latRange[0] + latRange[1]) / 2;
      if (lat > mid) {
        charIndex |= (1 << (4 - bit));
        latRange[0] = mid;
      } else {
        latRange[1] = mid;
      }
    }
    
    isLon = !isLon;
    bit++;
    
    if (bit === 5) {
      geohash += base32[charIndex];
      charIndex = 0;
      bit = 0;
    }
  }
  
  return geohash;
}

// ===== GLOBAL EXPORTS =====
// Make all radar functions and constants available globally for non-module scripts
window.RADAR_DEFAULT_LAYER = RADAR_DEFAULT_LAYER;
window.RADAR_LAYERS = RADAR_LAYERS;
window.RADAR_BBOX_RADIUS_KM = RADAR_BBOX_RADIUS_KM;
window.latLonToPixel = latLonToPixel;
window.latLonInBounds = latLonInBounds;
window.fetchRadarImageForLocation = fetchRadarImageForLocation;
window.fetchRadarImageForTimestamp = fetchRadarImageForTimestamp;
window.getCachedRadarFrameAsDataURL = getCachedRadarFrameAsDataURL;
window.getRadarFramesForClip = getRadarFramesForClip;
window.prefetchFramesInRange = prefetchFramesInRange;
window.getFramesInRange = getFramesInRange;
window.areFramesCachedInRange = areFramesCachedInRange;
window.clearRadarCacheForLocation = clearRadarCacheForLocation;
window.clearRadarCacheForLayer = clearRadarCacheForLayer;
window.clearRadarCache = clearRadarCache;
window.invalidateRadarCache = invalidateRadarCache;
window.getRadarMeta = getRadarMeta;
window.getRadarCacheSize = getRadarCacheSize;
window.getRadarTimestampsForLayer = getRadarTimestampsForLayer;
// Coordinate conversion exports
window.COORD_FORMATS = COORD_FORMATS;
window.latLonToMGRS = latLonToMGRS;
window.latLonToUTMLatLon = latLonToUTMLatLon;
window.latLngToDMS = latLngToDMS;
window.latLngToGeohash = latLngToGeohash;

// ===== COORDINATE FORMATTER =====
function formatCoordinate(lat, lon, format) {
  switch (format) {
    case 'mgrs': return latLonToMGRS(lat, lon);
    case 'latlng': return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    case 'utm': {
      const utm = latLonToUTMLatLon(lat, lon);
      const [easting, northing] = utm;
      const zone = getUTMZone(lat, lon);
      const hemisphere = lat >= 0 ? 'N' : 'S';
      return `Zone ${zone}${hemisphere} ${easting.toFixed(1)}E ${northing.toFixed(1)}N`;
    }
    case 'dms': return latLngToDMS(lat, lon);
    case 'geohash': return latLngToGeohash(lat, lon);
    default: return latLonToMGRS(lat, lon);
  }
}
