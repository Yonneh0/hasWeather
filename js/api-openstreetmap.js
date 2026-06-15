// OpenStreetMap / Nominatim API client — fetches nearby city data from Nominatim/OSM.

// ===== ENDPOINT =====
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

// ===== NOMINATIM CONSTANTS =====
const NOMINATIM_CLOSE_RADIUS = 0.45;
const NOMINATIM_WIDE_RADIUS = 1.0;

// ===== FETCH LIMITS =====
const NOMINATIM_CLOSE_LIMIT = 30;
const NOMINATIM_WIDE_LIMIT = 50;

// ===== BEARING =====
const BEARING_WRAP_AROUND = 180;

// ===== DEDUPLICATION =====
const DEDUP_COORD_TOLERANCE = 0.01;
const BOUNDARY_RANK_THRESHOLD = 4;

function scaleViewbox(lat, lon, radiusDeg) {
  const south = (lat - radiusDeg).toFixed(4);
  const north = (lat + radiusDeg).toFixed(4);
  const west = (lon - radiusDeg).toFixed(4);
  const east = (lon + radiusDeg).toFixed(4);
  return `${west},${north},${east},${south}`;
}

async function findNearbyCities(lat, lon) {
  if (_maxCities === 0) return [];

  // Check in-memory cache first
  if (_nearbyCache && Date.now() - _nearbyCacheTime < NEARBY_CACHE_TTL_MS) {
    return _nearbyCache;
  }

  const cacheKey = `nearby_${DataCache._roundCoord(lat)}_${DataCache._roundCoord(lon)}`;
  const cached = DataCache.get(cacheKey, 'nearby');
  if (cached) {
    _nearbyCache = cached;
    _nearbyCacheTime = Date.now();
    return cached;
  }

  // Fetch a larger set first so we can filter and still have enough
  let viewbox = scaleViewbox(lat, lon, NOMINATIM_CLOSE_RADIUS);
  let url = `${NOMINATIM}?q=city&format=jsonv2&viewbox=${viewbox}&bounded=1&limit=${NOMINATIM_CLOSE_LIMIT}&addressdetails=1`;

  let results;
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Nominatim ${resp.status}`);
    results = await resp.json();
  } catch {
    results = [];
  }

  // Filter: keep only towns/cities/villages/hamlets/localities, reject boundary/fuel/street/country
  if (results.length > 0) {
    const acceptableTypes = ['city','town','village','hamlet','suburb','quarter','neighbourhood','locality','isolated_dwelling','farmhouse','county','administrative'];
    results = results.filter(r => {
      const type = (r.type || '').toLowerCase();
      const cls = (r.class || '').toLowerCase();
      if (cls === 'boundary' && r.place_rank >= BOUNDARY_RANK_THRESHOLD) return false;
      if (type === 'country' || type === 'state' || type === 'administrative') return false;
      if (type === 'fuel' || type === 'street' || type === 'residential') return false;
      if (r.place_rank >= 10 && r.place_rank <= 16) return true;
      return acceptableTypes.includes(type);
    });
  }

  if (results.length < _maxCities) {
    viewbox = scaleViewbox(lat, lon, NOMINATIM_WIDE_RADIUS);
    url = `${NOMINATIM}?q=city&format=jsonv2&viewbox=${viewbox}&bounded=1&limit=${NOMINATIM_WIDE_LIMIT}&addressdetails=1`;
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        const extra = await resp.json();
        const existingIds = new Set(results.map(r => r.place_id));
        const existingNames = new Set(results.map(r => (r.name || '').toLowerCase().trim()));
        extra.forEach(r => {
          // Skip if same place_id OR same name at same coordinates (dedup by name+coords)
          if (existingIds.has(r.place_id)) return;
          const latMatch = Math.abs(parseFloat(r.lat) - parseFloat(results[0]?.lat || 0)) < DEDUP_COORD_TOLERANCE;
          const sameName = existingNames.has((r.name || '').toLowerCase().trim()) && latMatch;
          if (sameName) return;
          const type = (r.type || '').toLowerCase();
          const cls = (r.class || '').toLowerCase();
          if (cls === 'boundary' && r.place_rank >= BOUNDARY_RANK_THRESHOLD) return;
          if (type === 'country' || type === 'state' || type === 'administrative') return;
          if (type === 'fuel' || type === 'street' || type === 'residential') return;
          if (r.place_rank >= 10 && r.place_rank <= 16) {
            results.push(r);
            existingIds.add(r.place_id);
            existingNames.add((r.name || '').toLowerCase().trim());
          }
        });
      }
    } catch {
      // silently ignore
    }
  }

  if (results.length === 0) {
    if (_maxCities > 0) showLocationPrompt();
    return [];
  }

  const cities = results.map(item => {
    const address = item.address || {};
    let name = item.name || address.city || '';
    // International region fallback chain
    let state = address.state || address.state_district || address.region || address.county || '';
    let country = address.country || '';
    name = name.replace(/^City of\s+/i, '');

    return {
      place_id: String(item.place_id),
      name,
      latitude: parseFloat(item.lat),
      longitude: parseFloat(item.lon),
      state,
      country,
      distance: haversine(lat, lon, parseFloat(item.lat), parseFloat(item.lon)),
      bearing: bearing(lat, lon, parseFloat(item.lat), parseFloat(item.lon)),
    };
  });

  // Deduplicate by place_id AND by name+coordinate proximity (within DEDUP_COORD_TOLERANCE ≈ 1km)
  const seen = new Set();
  const deduped = cities.filter(c => {
    if (seen.has(c.place_id)) return false;
    const nameKey = c.name.toLowerCase().trim();
    const coordKey = `${DataCache._roundCoord(c.latitude)},${DataCache._roundCoord(c.longitude)}`;
    for (const existing of seen) {
      if (existing.name === nameKey && existing.coordKey === coordKey) {
        return false;
      }
    }
    seen.add({ name: nameKey, coordKey });
    return true;
  });

  deduped.sort((a, b) => a.distance - b.distance);

  // Select cities with bearing diversity and min distance
  const selected = [deduped[0]];
  const used = new Set([0]);
  const remaining = deduped.filter((_, i) => !used.has(i));
  remaining.sort((a, b) => {
    const aMinDiff = Math.min(...selected.map(s => {
      let diff = Math.abs(a.bearing - s.bearing);
      return diff > BEARING_WRAP_AROUND ? 360 - diff : diff;
    }));
    const bMinDiff = Math.min(...selected.map(s => {
      let diff = Math.abs(b.bearing - s.bearing);
      return diff > BEARING_WRAP_AROUND ? 360 - diff : diff;
    }));
    return bMinDiff - aMinDiff;
  });

  for (const city of remaining) {
    if (selected.length >= _maxCities) break;
    if (selected.some(sel => haversine(city.latitude, city.longitude, sel.latitude, sel.longitude) < MIN_CITY_DISTANCE_MI)) continue;
    selected.push(city);
    used.add(deduped.indexOf(city));
  }

  // Fill remaining slots if we still need more
  for (let i = 0; i < deduped.length && selected.length < _maxCities; i++) {
    if (!used.has(i)) selected.push(deduped[i]);
  }

  _nearbyCache = selected;
  _nearbyCacheTime = Date.now();

  // Store in localStorage cache
  DataCache.set(cacheKey, selected, 'nearby');

  return selected;
}