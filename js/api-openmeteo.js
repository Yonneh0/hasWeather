// ===== OPEN-METEO API CLIENT =====
// Fetches weather data and air quality from Open-Meteo APIs.

// ===== ENDPOINTS =====
const WEATHER_API = 'https://api.open-meteo.com/v1/forecast';
const AIR_QUALITY_API = 'https://air-quality-api.open-meteo.com/v1/air-quality';

// ===== CROSS-SOURCE LOOKUP FUNCTIONS =====
// These functions allow fetching data from alternate source caches when needed.

function crossSourceGetWeather(lat, lon) {
  // Try OM weather key
  const omWeather = DataCache.get(weatherCacheKey(lat, lon), 'weather');
  if (omWeather) return { data: omWeather, source: 'open-meteo' };

  // Try NWS city data key (which contains full weather object)
  const nwsCityData = DataCache.get(nwsCacheKey(lat, lon), 'nwsCityData');
  if (nwsCityData && nwsCityData.weather) return { data: nwsCityData, source: 'nws' };

  // Try NWS point cache key (which contains full weather object)
  const nwsPoint = DataCache.get(nwsPointCacheKey(lat, lon), 'nwsPoint');
  if (nwsPoint && nwsPoint.weather) return { data: nwsPoint, source: 'nws' };

  return null;
}

function crossSourceGetAQI(lat, lon) {
  // Try OM AQI key
  const omAqi = DataCache.get(aqiCacheKey(lat, lon), 'airQuality');
  if (omAqi) return { data: omAqi, source: 'open-meteo' };

  // Try NWS city data key (which may have AQI)
  const nwsCityData = DataCache.get(nwsCacheKey(lat, lon), 'nwsCityData');
  if (nwsCityData && nwsCityData.aqi) return { data: nwsCityData.aqi, source: 'nws' };

  return null;
}

// ===== CACHE KEY HELPERS =====
function weatherCacheKey(lat, lon) {
  return `weather_${DataCache._roundCoord(lat)}_${DataCache._roundCoord(lon)}`;
}

function aqiCacheKey(lat, lon) {
  return `airQuality_${DataCache._roundCoord(lat)}_${DataCache._roundCoord(lon)}`;
}

// ===== RETRY HELPER =====
// Retry a fetch with exponential backoff
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return result;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`[retry] Attempt ${attempt + 1}/${maxRetries + 1} failed, retrying in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// ===== OPEN-METEO SPECIFIC HELPERS =====
// Known keys that are NOT hourly variable data
const KNOWN_NON_HOURLY_KEYS = new Set([
  'latitude', 'longitude', 'elevation',
  'generationtime_ms', 'utc_offset_seconds',
  'timezone', 'timezone_abbreviation',
  'current', 'hourly'
]);

// Helper: extract hourly variable keys from a raw response object
function extractHourlyKeys(raw) {
  return Object.keys(raw).filter(k =>
    KNOWN_NON_HOURLY_KEYS.has(k) === false &&
    Array.isArray(raw[k]) &&
    raw[k].length > 0 &&
    typeof raw[k][0] !== 'object'
  );
}

// ===== DEDUPLICATION =====
// Deduplicate city results by coordinate pair (keep first entry per coordinate pair)
// Prefer entries with a non-null place_id when there's a tie
function deduplicateResults(results) {
  const seenCoords = new Map();
  const deduped = [];
  for (const entry of results) {
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
  return deduped;
}

// Deduplicate cities by coordinate pair (for deduplication BEFORE the API call)
function deduplicateCities(cities) {
  const seenCoords = new Set();
  const deduped = [];
  for (const city of cities) {
    const lat = city.latitude != null ? DataCache._roundCoord(city.latitude) : null;
    const lon = city.longitude != null ? DataCache._roundCoord(city.longitude) : null;
    if (lat == null || lon == null) {
      deduped.push(city);
      continue;
    }
    const coordKey = `${lat},${lon}`;
    if (!seenCoords.has(coordKey)) {
      seenCoords.add(coordKey);
      deduped.push(city);
    }
  }
  return deduped;
}

// ===== FETCH WEATHER FOR CITIES =====
async function fetchWeatherForCities(cities) {
  // Check cache for each city individually — use cross-source lookup
  const cachedResults = [];
  const uncachedCities = [];
  const cityCacheMap = []; // map city index to its position in uncachedCities

  for (let i = 0; i < cities.length; i++) {
    const weatherCk = weatherCacheKey(cities[i].latitude, cities[i].longitude);
    const aqiCk = aqiCacheKey(cities[i].latitude, cities[i].longitude);
    const cachedWeather = DataCache.get(weatherCk, 'weather');
    const cachedAqi = DataCache.get(aqiCk, 'airQuality');
    // Cross-source: also check NWS keys for OM lookup
    const crossSource = crossSourceGetWeather(cities[i].latitude, cities[i].longitude);
    if (cachedWeather) {
      cachedResults.push({ ...cities[i], source: 'open-meteo', weather: cachedWeather, aqi: cachedAqi || {} });
    } else if (crossSource && crossSource.data.weather) {
      // NWS data can serve as OM weather data (it has the same structure)
      const crossAqi = crossSourceGetAQI(cities[i].latitude, cities[i].longitude);
      cachedResults.push({ ...cities[i], source: crossSource.source, weather: crossSource.data.weather, aqi: crossAqi?.data || {} });
    } else {
      cityCacheMap.push(i);
      uncachedCities.push(cities[i]);
    }
  }

  // If all cached, apply deduplication before returning
  if (uncachedCities.length === 0) {
    return deduplicateResults(cachedResults);
  }

  // ===== FIX #1: Deduplicate BEFORE caching =====
  // Only unique coordinate pairs should be fetched from the API
  const dedupedUncached = deduplicateCities(uncachedCities);

  // Build combined weather + AQI URL for deduplicated uncached cities only
  try {
    const weatherUrl = `${WEATHER_API}?latitude=${dedupedUncached.map(c => c.latitude).join(',')}&longitude=${dedupedUncached.map(c => c.longitude).join(',')}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,uv_index,visibility&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&forecast_days=2&temperature_unit=celsius&wind_speed_unit=kmh&precipitation_unit=mm&timezone=auto`;

    // ===== FIX #5: Retry logic for weather API =====
    const weatherRes = await retryWithBackoff(() => fetch(weatherUrl));

    if (!weatherRes.ok) {
      // Fill uncached with null data
      for (const idx of cityCacheMap) {
        cachedResults[idx] = { ...cities[idx], weather: null, aqi: {} };
      }
      return deduplicateResults(cachedResults);
    }

    const weatherAll = await weatherRes.json();

    const aqiUrl = `${AIR_QUALITY_API}?latitude=${dedupedUncached.map(c => c.latitude).join(',')}&longitude=${dedupedUncached.map(c => c.longitude).join(',')}&current=us_aqi,pm2_5,european_aqi&timezone=auto`;
    // ===== FIX #5: Retry logic for AQI API =====
    const aqiRes = await retryWithBackoff(() => fetch(aqiUrl));
    const aqiData = await aqiRes.json();

    const result = new Array(cities.length);

    // First fill cached results (use get directly — it already handles expiration internally)
    for (let i = 0; i < cities.length; i++) {
      const weatherCk = weatherCacheKey(cities[i].latitude, cities[i].longitude);
      const aqiCk = aqiCacheKey(cities[i].latitude, cities[i].longitude);
      const entryWeather = DataCache.get(weatherCk, 'weather');
      const entryAqi = DataCache.get(aqiCk, 'airQuality');
      if (entryWeather) {
        result[i] = { ...cities[i], source: 'open-meteo', weather: entryWeather, aqi: entryAqi || {} };
      }
    }

    // Parse weather response — Open-Meteo returns a flat object when single lat/lon,
    // or an object with 'results' array when multiple lat/lon values are provided.
    const hasResultsArray = weatherAll && Array.isArray(weatherAll.results);

    // Parse AQI response — same pattern: flat for single, 'results' array for multiple
    const hasAqiResultsArray = aqiData && Array.isArray(aqiData.results);

    let wIdx = 0; // index into weatherAll.results / aqiData.results
    for (let i = 0; i < cities.length; i++) {
      // Skip already-cached
      if (result[i]) continue;

      const city = cities[i];
      let cityWeather;
      let aqiResult;

      if (hasResultsArray) {
        const raw = weatherAll.results[wIdx] || {};
        // ===== FIX #4: Clean up hourly variable extraction =====
        const rawHourlyKeys = extractHourlyKeys(raw);
        const mergedHourly = raw.hourly ? { ...raw.hourly } : { time: [] };
        rawHourlyKeys.forEach(k => {
          const val = raw[k];
          if (Array.isArray(val) && val.length > 0 && typeof val[0] !== 'object') {
            mergedHourly[k] = val;
          }
        });
        cityWeather = {
          current: raw.current || {},
          hourly: mergedHourly,
        };

        // AQI from results array
        if (hasAqiResultsArray) {
          const aqiRaw = aqiData.results[wIdx] || {};
          aqiResult = {
            us_aqi: aqiRaw.current?.us_aqi ?? aqiRaw.us_aqi ?? null,
            pm2_5: aqiRaw.current?.pm2_5 ?? aqiRaw.pm2_5 ?? null,
            european_aqi: aqiRaw.current?.european_aqi ?? aqiRaw.european_aqi ?? null,
          };
        } else {
          aqiResult = { us_aqi: null, pm2_5: null, european_aqi: null };
        }

        wIdx++;
      } else if (Array.isArray(weatherAll)) {
        // Fallback: weatherAll is an array of individual results
        const raw = weatherAll[i] || {};
        cityWeather = {
          current: raw.current || {},
          hourly: raw.hourly || { time: [] },
        };
        if (Array.isArray(aqiData)) {
          const aqiRaw = aqiData[i] || {};
          aqiResult = {
            us_aqi: aqiRaw.current?.us_aqi ?? aqiRaw.us_aqi ?? null,
            pm2_5: aqiRaw.current?.pm2_5 ?? aqiRaw.pm2_5 ?? null,
            european_aqi: aqiRaw.current?.european_aqi ?? aqiRaw.european_aqi ?? null,
          };
        } else {
          aqiResult = { us_aqi: null, pm2_5: null, european_aqi: null };
        }
      } else {
        // Single result (no results array)
        const raw = weatherAll;
        cityWeather = {
          current: raw.current || {},
          hourly: raw.hourly || { time: [] },
        };
        if (aqiData && !hasAqiResultsArray) {
          aqiResult = {
            us_aqi: aqiData.current?.us_aqi ?? aqiData.us_aqi ?? null,
            pm2_5: aqiData.current?.pm2_5 ?? aqiData.pm2_5 ?? null,
            european_aqi: aqiData.current?.european_aqi ?? aqiData.european_aqi ?? null,
          };
        } else {
          aqiResult = { us_aqi: null, pm2_5: null, european_aqi: null };
        }
      }

      // Use separate cache keys for weather and AQI
      const weatherCk = weatherCacheKey(city.latitude, city.longitude);
      const aqiCk = aqiCacheKey(city.latitude, city.longitude);
      DataCache.set(weatherCk, cityWeather, 'weather');
      DataCache.set(aqiCk, aqiResult, 'airQuality');

      result[i] = { ...city, source: 'open-meteo', weather: cityWeather, aqi: aqiResult };
    }

    return deduplicateResults(result);
  } catch {
    // Fill uncached with null data
    const result = new Array(cities.length);
    for (let i = 0; i < cities.length; i++) {
      const weatherCk = weatherCacheKey(cities[i].latitude, cities[i].longitude);
      const aqiCk = aqiCacheKey(cities[i].latitude, cities[i].longitude);
      if (DataCache.has(weatherCk, 'weather')) {
        const entryWeather = DataCache.get(weatherCk, 'weather');
        const entryAqi = DataCache.get(aqiCk, 'airQuality');
        result[i] = { ...cities[i], source: 'open-meteo', weather: entryWeather, aqi: entryAqi || {} };
      } else {
        result[i] = { ...cities[i], source: 'open-meteo', weather: null, aqi: {} };
      }
    }
    return result;
  }
}