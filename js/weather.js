// ===== FETCH WEATHER =====
// Helper to build a unique cache key for weather+AQI per city
function weatherCacheKey(lat, lon) {
  return `weather_${DataCache._roundCoord(lat)}_${DataCache._roundCoord(lon)}`;
}

async function fetchWeatherForCities(cities) {
  // Check cache for each city individually
  const cachedResults = [];
  const uncachedCities = [];
  const cityCacheMap = []; // map city index to its position in uncachedCities

  for (let i = 0; i < cities.length; i++) {
    const ck = weatherCacheKey(cities[i].latitude, cities[i].longitude);
    const cached = DataCache.get(ck, 'weather');
    if (cached) {
      cachedResults.push({ ...cities[i], weather: cached.weather, aqi: cached.aqi });
    } else {
      cityCacheMap.push(i);
      uncachedCities.push(cities[i]);
    }
  }

  // If all cached, return immediately
  if (uncachedCities.length === 0) {
    return cachedResults;
  }

  // Build combined weather + AQI URL for uncached cities only
  try {
    const weatherUrl = `${WEATHER_API}?latitude=${uncachedCities.map(c => c.latitude).join(',')}&longitude=${uncachedCities.map(c => c.longitude).join(',')}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,uv_index,visibility&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,wind_speed_10m_max&forecast_days=${FORECAST_DAYS}&temperature_unit=celsius&wind_speed_unit=kmh&precipitation_unit=mm&timezone=auto`;

    const weatherRes = await fetch(weatherUrl);

    if (!weatherRes.ok) {
      // Fill uncached with null data
      for (const idx of cityCacheMap) {
        cachedResults[idx] = { ...cities[idx], weather: null, aqi: {} };
      }
      return cachedResults;
    }

    const weatherAll = await weatherRes.json();

    const aqiUrl = `${AIR_QUALITY_API}?latitude=${uncachedCities.map(c => c.latitude).join(',')}&longitude=${uncachedCities.map(c => c.longitude).join(',')}&current=us_aqi,pm2_5,european_aqi&timezone=auto`;
    const aqiRes = await fetch(aqiUrl);
    const aqiData = await aqiRes.json();

    const result = new Array(cities.length);

    // First fill cached results (use get directly — it already handles expiration internally)
    for (let i = 0; i < cities.length; i++) {
      const ck = weatherCacheKey(cities[i].latitude, cities[i].longitude);
      const entry = DataCache.get(ck, 'weather');
      if (entry) {
        result[i] = { ...cities[i], weather: entry.weather, aqi: entry.aqi };
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
        const rawHourlyKeys = Object.keys(raw).filter(k => k !== 'latitude' && k !== 'longitude' && k !== 'elevation' && k !== 'generationtime_ms' && k !== 'utc_offset_seconds' && k !== 'timezone' && k !== 'timezone_abbreviation' && k !== 'current' && k !== 'daily');
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
          daily: raw.daily || {},
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
          daily: raw.daily || {},
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
          daily: raw.daily || {},
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

      // Store in cache
      const ck = weatherCacheKey(city.latitude, city.longitude);
      DataCache.set(ck, { weather: cityWeather, aqi: aqiResult }, 'weather');

      result[i] = { ...city, weather: cityWeather, aqi: aqiResult };
    }

    return result;
  } catch {
    // Fill uncached with null data
    const result = new Array(cities.length);
    for (let i = 0; i < cities.length; i++) {
      const ck = weatherCacheKey(cities[i].latitude, cities[i].longitude);
      if (DataCache.has(ck, 'weather')) {
        const entry = DataCache.get(ck, 'weather');
        result[i] = { ...cities[i], weather: entry.weather, aqi: entry.aqi };
      } else {
        result[i] = { ...cities[i], weather: null, aqi: {} };
      }
    }
    return result;
  }
}

