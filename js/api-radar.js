// ===== WEATHER.GOV RADAR API CLIENT =====
// Fetches radar imagery from NOAA/NCEP GeoServer WMS service.
// Primary source: MRMS (Multi-Radar-Multi-Sensor) composite radar data.
// Cache: Binary images stored in Browser Cache API (CacheStorage), metadata in localStorage.

// ===== ENDPOINTS & CONSTANTS =====
const RADAR_WMS_BASE = 'https://opengeo.ncep.noaa.gov/geoserver/conus/';
const RADAR_DEFAULT_LAYER = 'conus_bref_qcd'; // MRMS Base Reflectivity (quality controlled, shows all radar returns)
const RADAR_IMAGE_SIZE = 512;                  // Image dimension in pixels
const RADAR_BBOX_RADIUS_KM = 200;              // Area around user location to capture (km)
const RADAR_TTL = 5 * 60 * 1000;               // 5 minutes (radar updates every ~2 min)
const RADAR_META_TTL = 30 * 60 * 1000;         // 30 minutes (metadata doesn't change often)

// Available radar layers
const RADAR_LAYERS = {
  BASE_REFLECTIVITY: 'conus_bref_qcd',      // Quality Controlled 1km Base Reflectivity (MRMS)
  COMPOSITE_REFLECTIVITY: 'conus_cref_qcd',  // Composite Reflectivity
  ECHO_TOPS: 'conus_neet_v18',              // Echo Tops
  PRECIPITATION_TYPE: 'conus_pcpn_typ',      // Precipitation Type
};

// Cache API constants
const RADAR_CACHE_NAME = 'hasw-radar-v1';
// Fake HTTP prefix for cache keys — required because Cache API only accepts http(s) URLs
const RADAR_FAKE_BASE = 'https://radar.hasweather.local/';
const RADAR_FRAME_PREFIX = `${RADAR_FAKE_BASE}frame/`;
const RADAR_FRAMES_KEY = 'frames';
const RADAR_MAX_CACHE_BYTES = 250 * 1024 * 1024; // ~250MB total limit

// ===== BBOX CALCULATION =====
// Convert lon to EPSG:3857 meters
function lonToX(lon) {
  return lon * 20037508.34 / 180;
}

// Convert lat to EPSG:3857 meters
function latToY(lat) {
  const y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
  return y * 20037508.34 / 180;
}

// Calculate bounding box in EPSG:3857 meters around a lat/lon point
function latLonToBboxEPSG3857(lat, lon, radiusKm) {
  const R = 6371; // Earth radius in km
  const dLat = (radiusKm / R) * (180 / Math.PI);
  const dLon = (radiusKm / R) * (180 / Math.PI) / Math.cos(lat * Math.PI / 180);

  return [
    lonToX(lon - dLon),   // minx in meters
    latToY(lat - dLat),   // miny in meters
    lonToX(lon + dLon),   // maxx in meters
    latToY(lat + dLat),   // maxy in meters
  ];
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
// Build a fake HTTP URL as the cache key — Cache API only accepts http(s) URLs
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
// Cache the latest radar timestamp to avoid repeated GetCapabilities calls
let _latestTimestampCache = null; // { timestamp: string, expiresAt: number }

// ===== ALL RADAR TIMESTAMPS CACHE =====
// Cache all available timestamps from GetCapabilities to populate the timeline
let _allTimestampsCache = null; // { timestamps: string[], layer: string, expiresAt: number }

// Parse all available timestamps from WMS GetCapabilities response
function parseRadarTimestamps(capabilitiesText) {
  const timestamps = [];
  
  // Parse all <Extent> elements with name="time" to find time values
  const extentRegex = /<Extent[^>]+name="time"[^>]*>([^<]+)<\/Extent>/gi;
  let match;
  while ((match = extentRegex.exec(capabilitiesText)) !== null) {
    // Timestamps can be comma-separated or space-separated
    const timeValues = match[1].split(/[\s,]+/).map(t => t.trim()).filter(Boolean);
    timestamps.push(...timeValues);
  }
  
  // Also check for default attribute (most recent timestamp)
  const defaultMatch = capabilitiesText.match(/<Extent[^>]+name="time"[^>]*default="([^"]+)"/i);
  if (defaultMatch && defaultMatch[1] && !timestamps.includes(defaultMatch[1])) {
    timestamps.push(defaultMatch[1]);
  }
  
  // Validate and deduplicate timestamps
  const validTimestamps = [];
  for (const ts of timestamps) {
    // Validate ISO8601 format
    const date = new Date(ts);
    if (!isNaN(date.getTime())) {
      // Normalize to consistent ISO8601 format
      validTimestamps.push(date.toISOString().replace(/\.\d+Z$/, 'Z'));
    }
  }
  
  // Deduplicate
  return [...new Set(validTimestamps)].sort();
}

// Get ALL available timestamps for a layer (not just the latest)
async function getRadarTimestampsForLayer(layer = RADAR_DEFAULT_LAYER) {
  const cacheKey = `${layer}`;
  
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

// Get the latest radar timestamp (convenience wrapper, uses same cache as getRadarTimestampsForLayer)
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
    // Parse the time extent from GetCapabilities response
    const timeMatch = text.match(/<Extent[^>]+name="time"[^>]*default="([^"]+)"/i);
    if (timeMatch && timeMatch[1]) {
      _latestTimestampCache = {
        timestamp: timeMatch[1],
        expiresAt: Date.now() + 2 * 60 * 1000, // 2 min TTL
      };
      return timeMatch[1];
    }

    // If no default, parse the available times and use the last one
    const times = parseRadarTimestamps(text);
    if (times.length > 0) {
      // Sort and use the latest timestamp
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
    // Check if metadata is stale (older than TTL — use longer TTL for metadata)
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
    // Add timestamp if not already present
    if (!meta.timestamps.includes(timestamp)) {
      meta.timestamps.push(timestamp);
      // Keep only the last 500 timestamps (about 16 hours of radar data at 2-min intervals)
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

// Store a single radar frame as ArrayBuffer
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
  if (!arrayBuffer) return null;
  
  // Convert ArrayBuffer to base64
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return 'data:image/png;base64,' + btoa(binary);
}

// Fetch a range of frames for animation (e.g., last N timestamps in order)
async function getRadarFramesForClip(lat, lon, layer, count = 10) {
  const meta = getRadarMeta(lat, lon, layer);
  if (!meta || !meta.timestamps.length) return null;
  
  // Get the last `count` timestamps (oldest first for animation)
  const clipTimestamps = meta.timestamps.slice(-count);
  const frames = [];
  
  for (const ts of clipTimestamps) {
    const arrayBuffer = await getCachedRadarFrame(lat, lon, layer, ts);
    if (arrayBuffer) {
      // Convert to base64 data URL for display
      let binary = '';
      for (let i = 0; i < arrayBuffer.length; i++) {
        binary += String.fromCharCode(arrayBuffer[i]);
      }
      frames.push({ timestamp: ts, dataUrl: 'data:image/png;base64,' + btoa(binary) });
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
// Prevent duplicate radar fetches for the same location at the same time
const _pendingRadarFetches = new Map(); // cacheKey → Promise

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
async function fetchRadarImageFromWMS(url, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15s timeout

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`WMS GetMap failed: ${response.status}`);
      }

      // Validate content type (should be an image)
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
// Fetch radar image for user location and return base64 data URL.
// Returns { imageUrl: 'data:image/png;base64,...', timestamp: string, cached: boolean } or { error: string } on failure.
async function fetchRadarImageForLocation(lat, lon, layer = RADAR_DEFAULT_LAYER, timestamp = null) {
  // Get the latest radar timestamp if none specified
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

  // Build WMS URL and initiate fetch
  const imageUrl = buildRadarImageUrl(lat, lon, layer, timestamp);
  console.log(`[Radar] Cache MISS: ${cacheKey}, fetching from WMS`);

  const fetchPromise = (async () => {
    try {
      // Fetch the radar image
      const arrayBuffer = await fetchRadarImageFromWMS(imageUrl);

      // Convert to base64 data URL
      let binary = '';
      for (let i = 0; i < arrayBuffer.length; i++) {
        binary += String.fromCharCode(arrayBuffer[i]);
      }
      const dataURL = 'data:image/png;base64,' + btoa(binary);

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

  // Store pending fetch for deduplication
  setPendingRadarFetch(cacheKey, fetchPromise);
  return fetchPromise;
}

// ===== RADAR CLIP FUNCTIONS =====
// Fetch radar image for a specific timestamp (for clip playback)
async function fetchRadarImageForTimestamp(lat, lon, layer, timestamp) {
  // Check cache first
  const cachedDataURL = await getCachedRadarFrameAsDataURL(lat, lon, layer, timestamp);
  if (cachedDataURL) {
    return { imageUrl: cachedDataURL, timestamp };
  }

  // Fetch from WMS
  const imageUrl = buildRadarImageUrl(lat, lon, layer, timestamp);
  try {
    const arrayBuffer = await fetchRadarImageFromWMS(imageUrl);
    
    // Cache the result
    await cacheRadarFrame(lat, lon, layer, timestamp, arrayBuffer);

    // Convert to base64 data URL
    let binary = '';
    for (let i = 0; i < arrayBuffer.length; i++) {
      binary += String.fromCharCode(arrayBuffer[i]);
    }
    const dataURL = 'data:image/png;base64,' + btoa(binary);

    return { imageUrl: dataURL, timestamp };
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
// Convert lat/lon to pixel position within the radar image (512x512 canvas)
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

// Check if a lat/lon point is within the radar image bounds
function latLonInBounds(lat, lon, latCenter, lonCenter, radiusKm) {
  const bbox = latLonToBboxEPSG3857(latCenter, lonCenter, radiusKm);
  const [minx, miny, maxx, maxy] = bbox;
  
  const x = lonToX(lon);
  const y = latToY(lat);
  
  return x >= minx && x <= maxx && y >= miny && y <= maxy;
}

// ===== RADAR CACHE CLEAR =====
// Clear all radar cache entries (used during manual refresh or storage cleanup)
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

// ===== RADAR CACHE SIZE =====
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

// ===== BATCH PRE-FETCH FOR A RANGE OF FRAMES =====
// Fetch a contiguous range of frames for the radar player timeline
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

// ===== GET FRAME RANGE FOR PLAYBACK =====
// Get frames within a time range for the radar player
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

// ===== CHECK IF ALL FRAMES IN RANGE ARE CACHED =====
async function areFramesCachedInRange(lat, lon, layer, startIdx, endIdx) {
  const meta = getRadarMeta(lat, lon, layer);
  if (!meta || !meta.timestamps.length) return false;

  for (let i = Math.max(0, startIdx); i <= Math.min(endIdx, meta.timestamps.length - 1); i++) {
    const cached = await getCachedRadarFrameAsDataURL(lat, lon, layer, meta.timestamps[i]);
    if (!cached) return false;
  }
  return true;
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
