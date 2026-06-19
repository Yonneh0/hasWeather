// ===== OPEN-METEO API CLIENT =====
// Fetches weather data and air quality from Open-Meteo APIs.

// ===== CONSTANTS =====
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 1000;
const BURST_POLL_INTERVAL_MS = 50;
const DEFAULT_FORECAST_DAYS = 2;

// ===== ENDPOINTS =====
const WEATHER_API = 'https://api.open-meteo.com/v1/forecast';
const AIR_QUALITY_API = 'https://air-quality-api.open-meteo.com/v1/air-quality';

// ===== URL QUERY PARAMETERS =====
const WEATHER_CURRENT_PARAMS = 'current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,uv_index,visibility';
const WEATHER_HOURLY_PARAMS = 'hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m';
const WEATHER_OPTIONS_PARAMS = `forecast_days=${DEFAULT_FORECAST_DAYS}&temperature_unit=celsius&wind_speed_unit=kmh&precipitation_unit=mm&timezone=auto`;
const AQI_CURRENT_PARAMS = 'current=us_aqi,pm2_5,european_aqi';

// ===== AIR QUALITY RATE LIMITER =====
const _aqiRateLimiter = {
  lastRequestTime: 0,
  burstCount: 0,
  burstWindow: 0,
  maxBurst: 3,
  burstWindowMs: 1000,
  minIntervalMs: 1000,

  _checkBurst() {
    const now = Date.now();
    if (now - this.burstWindow > this.burstWindowMs) {
      this.burstCount = 0;
      this.burstWindow = now;
    }
    return this.burstCount < this.maxBurst;
  },

  _waitForBurst() {
    return new Promise(resolve => {
      const check = () => {
        if (this._checkBurst()) resolve();
        else setTimeout(check, BURST_POLL_INTERVAL_MS);
      };
      check();
    });
  },

  async waitForSlot() {
    const now = Date.now();
    const timeSinceLast = now - this.lastRequestTime;

    if (timeSinceLast < this.burstWindowMs && !this._checkBurst()) {
      await this._waitForBurst();
    }

    if (timeSinceLast < this.minIntervalMs) {
      await new Promise(r => setTimeout(r, this.minIntervalMs - timeSinceLast));
    }

    this.burstCount++;
    this.burstWindow = Date.now();
    this.lastRequestTime = Date.now();
  },
};

// ===== CROSS-SOURCE LOOKUP FUNCTIONS =====
// Check NWS cache keys for weather data (NWS doesn't provide AQI).

function crossSourceGetWeather(lat, lon) {
  // Check NWS hourly forecast cache — contains the actual forecast data
  const nwsPoint = DataCache.get(nwsPointCacheKey(lat, lon), 'nwsPoint');
  if (nwsPoint && nwsPoint.wfo && nwsPoint.gridX != null && nwsPoint.gridY != null) {
    // We have grid info; check if hourly forecast is cached
    const nwsHourly = DataCache.get(nwsGridCacheKey(nwsPoint.wfo, nwsPoint.gridX, nwsPoint.gridY, 'hourly'), 'nwsHourly');
    if (nwsHourly && Array.isArray(nwsHourly) && nwsHourly.length > 0) {
      return { data: { weather: { hourly: nwsHourly } }, source: 'nws', point: nwsPoint };
    }
  }

  // Check NWS city-level consolidated cache (populated by nwsToAppData callers)
  const nwsCityData = DataCache.get(nwsCacheKey(lat, lon), 'nwsCityData');
  if (nwsCityData && nwsCityData.weather) return { data: nwsCityData, source: 'nws' };

  return null;
}

// ===== CACHE KEY HELPERS =====
// Consolidated cache key for weather + AQI (they share the same TTL and are always fetched together)
function weatherAqiCacheKey(lat, lon) {
  return `weatherAqi_${DataCache._roundCoord(lat)}_${DataCache._roundCoord(lon)}`;
}

// Legacy keys — kept for backward compatibility with existing cache entries
function weatherCacheKey(lat, lon) {
  return `weather_${DataCache._roundCoord(lat)}_${DataCache._roundCoord(lon)}`;
}

function aqiCacheKey(lat, lon) {
  return `airQuality_${DataCache._roundCoord(lat)}_${DataCache._roundCoord(lon)}`;
}

// ===== RETRY HELPER =====
// Retry a fetch with exponential backoff. Handles HTTP 429 (rate limit) specially.
async function retryWithBackoff(fn, maxRetries = MAX_RETRIES, baseDelay = BASE_RETRY_DELAY_MS) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      // If result is a Response with 429, retry
      if (result && typeof result.status === 'number' && result.status === 429) {
        if (attempt === maxRetries) throw new Error('Rate limited after retries');
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`[retry] Attempt ${attempt + 1}/${maxRetries + 1} failed with 429, retrying in ${delay}ms`);
        await new Promise(r => setTimeout(r, delay));
      } else {
        return result;
      }
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`[retry] Attempt ${attempt + 1}/${maxRetries + 1} failed, retrying in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// ===== OPEN-METEO SPECIFIC HELPERS =====

// Parse AQI fields from a response object, handling both flat and nested (current) formats.
function parseAqiFields(raw) {
  return {
    us_aqi: raw?.current?.us_aqi ?? raw?.us_aqi ?? null,
    pm2_5: raw?.current?.pm2_5 ?? raw?.pm2_5 ?? null,
    european_aqi: raw?.current?.european_aqi ?? raw?.european_aqi ?? null,
  };
}

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
    if (seenCoords.has(coordKey)) {
      // Prefer the entry with a non-null place_id
      const existingEntry = seenCoords.get(coordKey);
      if (!existingEntry.place_id && entry.place_id) {
        const dupIdx = deduped.findIndex(d => d === existingEntry);
        if (dupIdx !== -1) deduped[dupIdx] = entry;
        seenCoords.set(coordKey, entry);
      }
    } else {
      seenCoords.set(coordKey, entry);
      deduped.push(entry);
    }
  }
  return deduped;
}

// Deduplicate cities by coordinate pair (before the API call).
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

// ===== REQUEST DEDUPLICATION =====
// Prevent duplicate bulk fetches for the same city set.
const _pendingWeatherFetch = new Map();

function getPendingWeatherFetch(cities) {
  const key = cities.map(c => `${DataCache._roundCoord(c.latitude)},${DataCache._roundCoord(c.longitude)}`).sort().join('|');
  if (_pendingWeatherFetch.has(key)) {
    return _pendingWeatherFetch.get(key);
  }
  return null;
}

function setPendingWeatherFetch(key, promise) {
  _pendingWeatherFetch.set(key, promise);
}

// Clean up pending fetch after completion
function clearPendingWeatherFetch(key) {
  _pendingWeatherFetch.delete(key);
}

// ===== PER-CITY WEATHER FETCH (for incremental updates) =====
async function fetchWeatherForCity(city) {
  const cacheKey = weatherAqiCacheKey(city.latitude, city.longitude);
  const cached = DataCache.get(cacheKey, 'weatherAqi');
  if (cached) {
    return { ...city, source: 'open-meteo', weather: cached.weather, aqi: cached.aqi };
  }
  const crossSource = crossSourceGetWeather(city.latitude, city.longitude);
  if (crossSource && crossSource.data.weather) {
    return { ...city, source: crossSource.source, weather: crossSource.data.weather, aqi: {} };
  }
  try {
    // Note: no rate limiter needed for weather API — the AQI rate limiter is only for air-quality-api.open-meteo.com
    const weatherUrl = `${WEATHER_API}?latitude=${city.latitude}&longitude=${city.longitude}&${WEATHER_CURRENT_PARAMS}&${WEATHER_HOURLY_PARAMS}&${WEATHER_OPTIONS_PARAMS}`;
    const weatherRes = await retryWithBackoff(() => fetch(weatherUrl));
    if (!weatherRes.ok) {
      // Don't cache null results — return them without caching so re-fetch happens next time
      return { ...city, source: 'open-meteo', weather: null, aqi: {} };
    }
    const weatherAll = await weatherRes.json();

    const cityWeather = {
      current: weatherAll.current || {},
      hourly: weatherAll.hourly || { time: [] },
    };
    await _aqiRateLimiter.waitForSlot();
    const aqiUrl = `${AIR_QUALITY_API}?latitude=${city.latitude}&longitude=${city.longitude}&${AQI_CURRENT_PARAMS}&timezone=auto`;
    const aqiRes = await retryWithBackoff(() => fetch(aqiUrl));
    const aqiData = await aqiRes.json();

    const cityAqi = parseAqiFields(aqiData);
    DataCache.set(cacheKey, { weather: cityWeather, aqi: cityAqi }, 'weatherAqi');
    return { ...city, source: 'open-meteo', weather: cityWeather, aqi: cityAqi };
  } catch (err) {
    console.error(`[fetchWeatherForCity] Failed for ${city.name}:`, err);
    // Don't cache null results on error — leave them uncached so next refresh re-fetches
    return { ...city, source: 'open-meteo', weather: null, aqi: {} };
  }
}

// ===== FETCH WEATHER FOR CITIES (BATCH) =====
async function fetchWeatherForCities(cities) {
  // De-duplicate input cities by coordinate pair BEFORE any processing
  const dedupedInput = deduplicateCities(cities);

  // Check cache for each city individually — use cross-source lookup
  const cachedResults = [];
  const uncachedCities = [];
  const cityCacheMap = []; // map city index to its position in uncachedCities

  for (let i = 0; i < dedupedInput.length; i++) {
    // Check consolidated cache first
    const cacheKey = weatherAqiCacheKey(dedupedInput[i].latitude, dedupedInput[i].longitude);
    const cached = DataCache.get(cacheKey, 'weatherAqi');
    if (cached) {
      cachedResults.push({ ...dedupedInput[i], source: 'open-meteo', weather: cached.weather, aqi: cached.aqi });
      continue;
    }

    // Cross-source: also check NWS keys for OM lookup
    const crossSource = crossSourceGetWeather(dedupedInput[i].latitude, dedupedInput[i].longitude);
    if (crossSource && crossSource.data.weather) {
      cachedResults.push({ ...dedupedInput[i], source: crossSource.source, weather: crossSource.data.weather, aqi: {} });
      continue;
    }

    cityCacheMap.push(i);
    uncachedCities.push(dedupedInput[i]);
  }

  // If all cached, apply deduplication before returning
  if (uncachedCities.length === 0) {
    return deduplicateResults(cachedResults);
  }

  // Check for pending fetch (request deduplication)
  const pendingKey = getPendingWeatherFetch(uncachedCities);
  if (pendingKey) {
    return pendingKey;
  }

  // ===== Deduplicate BEFORE caching =====
  // Only unique coordinate pairs should be fetched from the API
  const dedupedUncached = deduplicateCities(uncachedCities);

  // Build combined weather + AQI URL for deduplicated uncached cities only
  try {
    const weatherUrl = `${WEATHER_API}?latitude=${dedupedUncached.map(c => c.latitude).join(',')}&longitude=${dedupedUncached.map(c => c.longitude).join(',')}&${WEATHER_CURRENT_PARAMS}&${WEATHER_HOURLY_PARAMS}&${WEATHER_OPTIONS_PARAMS}`;

    // Retry logic for weather API (handles 429)
    const weatherRes = await retryWithBackoff(() => fetch(weatherUrl));

    if (!weatherRes.ok) {
      // Fill uncached with null data
      for (const idx of cityCacheMap) {
        cachedResults[idx] = { ...dedupedInput[idx], source: 'open-meteo', weather: null, aqi: {} };
      }
      return deduplicateResults(cachedResults);
    }

    const weatherAll = await weatherRes.json();

    // Rate-limit the AQI request too
    await _aqiRateLimiter.waitForSlot();
    const aqiUrl = `${AIR_QUALITY_API}?latitude=${dedupedUncached.map(c => c.latitude).join(',')}&longitude=${dedupedUncached.map(c => c.longitude).join(',')}&${AQI_CURRENT_PARAMS}&timezone=auto`;
    const aqiRes = await retryWithBackoff(() => fetch(aqiUrl));
    const aqiData = await aqiRes.json();

      const result = new Array(dedupedInput.length);

    // First fill cached results (use get directly — it already handles expiration internally)
    for (let i = 0; i < dedupedInput.length; i++) {
      const cKey = weatherAqiCacheKey(dedupedInput[i].latitude, dedupedInput[i].longitude);
      const cached = DataCache.get(cKey, 'weatherAqi');
      if (cached) {
        // Don't use cached null data — force re-fetch
        if (!cached.weather || !cached.weather.current || Object.keys(cached.weather.current).length === 0) {
          continue;
        }
        result[i] = { ...dedupedInput[i], source: 'open-meteo', weather: cached.weather, aqi: cached.aqi };
      }
    }

    // Parse weather response — Open-Meteo returns a flat object when single lat/lon,
    // or an object with 'results' array when multiple lat/lon values are provided.
    const hasResultsArray = weatherAll && Array.isArray(weatherAll.results);

    // Parse AQI response — same pattern: flat for single, 'results' array for multiple
    const hasAqiResultsArray = aqiData && Array.isArray(aqiData.results);

    let wIdx = 0; // index into weatherAll.results / aqiData.results
    for (let i = 0; i < dedupedInput.length; i++) {
      // Skip already-cached (and not null)
      if (result[i]) continue;

      const city = dedupedInput[i];
      let cityWeather;
      let aqiResult;

      if (hasResultsArray) {
        const raw = weatherAll.results[wIdx] || {};
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

        // AQI from results array — use same wIdx
        if (hasAqiResultsArray) {
          const aqiRaw = aqiData.results[wIdx] || {};
          aqiResult = parseAqiFields(aqiRaw);
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
          aqiResult = parseAqiFields(aqiRaw);
        } else {
          aqiResult = { us_aqi: null, pm2_5: null, european_aqi: null };
        }
      } else {
        // Single result (no results array) — apply to all uncached cities
        const raw = weatherAll;
        cityWeather = {
          current: raw.current || {},
          hourly: raw.hourly || { time: [] },
        };
        if (aqiData && !hasAqiResultsArray) {
          aqiResult = parseAqiFields(aqiData);
        } else {
          aqiResult = { us_aqi: null, pm2_5: null, european_aqi: null };
        }
      }

      // Store consolidated cache (weather + AQI together)
      const cKey = weatherAqiCacheKey(city.latitude, city.longitude);
      // Only cache non-null weather data
      if (cityWeather && cityWeather.current && Object.keys(cityWeather.current).length > 0) {
        DataCache.set(cKey, { weather: cityWeather, aqi: aqiResult }, 'weatherAqi');
      }

      result[i] = { ...city, source: 'open-meteo', weather: cityWeather, aqi: aqiResult };
    }

    return deduplicateResults(result);
  } catch (err) {
    console.error('[fetchWeatherForCities] Failed:', err);
    // Fill uncached with null data
    const result = new Array(dedupedInput.length);
    for (let i = 0; i < dedupedInput.length; i++) {
      const cKey = weatherAqiCacheKey(dedupedInput[i].latitude, dedupedInput[i].longitude);
      const cached = DataCache.get(cKey, 'weatherAqi');
      if (cached) {
        // Don't use cached null data — force re-fetch
        if (!cached.weather || !cached.weather.current || Object.keys(cached.weather.current).length === 0) {
          result[i] = { ...dedupedInput[i], source: 'open-meteo', weather: null, aqi: {} };
        } else {
          result[i] = { ...dedupedInput[i], source: 'open-meteo', weather: cached.weather, aqi: cached.aqi };
        }
      } else {
        result[i] = { ...dedupedInput[i], source: 'open-meteo', weather: null, aqi: {} };
      }
    }
    return result;
  } finally {
    // Clean up pending fetch regardless of success/failure
    const key = getPendingWeatherFetch(uncachedCities);
    if (key) clearPendingWeatherFetch(key);
  }
}