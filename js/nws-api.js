// ===== NWS API CLIENT =====
// Fetches weather data from api.weather.gov (NWS) and maps it to the app's data model.

const NWS_API = 'https://api.weather.gov';
const NWS_USER_AGENT = 'hasWeather/1.0 (https://github.com/Yonneh0/hasWeather)';

// NWS forecast period descriptions mapped to WMO weather codes
// Maps shortForecast keywords to WMO codes that drive existing SVG icons
function nwsForecastToWmo(shortForecast) {
  const text = (shortForecast || '').toLowerCase();

  // Clear/sky conditions
  if (/clear|sunny|fair/.test(text)) return 0;
  if (/mainly clear|mostly clear/.test(text)) return 1;
  if (/partly cloudy|partly sunny|mostly sunny/.test(text)) return 2;
  if (/overcast|cloudy/.test(text)) return 3;

  // Fog
  if (/fog|mist|haze/.test(text)) return 45;

  // Drizzle
  if (/drizzle/.test(text)) return 53;

  // Rain
  if (/rain/.test(text)) {
    if (/heavy|violent|intense/.test(text)) return 65;
    if (/moderate/.test(text)) return 63;
    return 61;
  }

  // Freezing rain
  if (/freezing rain|freezing drizzle/.test(text)) return 57;

  // Snow
  if (/snow/.test(text)) {
    if (/heavy|intense/.test(text)) return 75;
    if (/moderate/.test(text)) return 73;
    return 71;
  }

  // Snow grains
  if (/snow grains|snow pellets/.test(text)) return 77;

  // Showers
  if (/shower/.test(text)) {
    if (/heavy|violent|intense/.test(text)) return 82;
    if (/moderate/.test(text)) return 81;
    return 80;
  }

  // Thunderstorm
  if (/thunderstorm|thunder/.test(text)) return 95;

  // Default: overcast
  return 3;
}

// Map NWS weather array items to WMO codes
function nwsWeatherToWmo(weatherArray) {
  if (!weatherArray || !Array.isArray(weatherArray) || weatherArray.length === 0) return 0;

  // Find the most severe weather event
  const priority = [
    'tornado', 'severe thunderstorm', 'severe thunderstorms', 'tstm',
    'thunderstorm', 'thunder', 'hail', 'hail',
    'heavy rain', 'rain', 'heavy showers', 'showers',
    'freezing rain', 'freezing drizzle',
    'snow', 'heavy snow', 'snow showers',
    'drizzle',
    'fog', 'mist', 'haze',
  ];

  for (const condition of priority) {
    if (condition.includes(' ')) {
      // Multi-word condition
      for (const item of weatherArray) {
        const icon = (item.icon || '').toLowerCase();
        if (icon.includes(condition.toLowerCase())) {
          return nwsForecastToWmo(condition);
        }
      }
    }
  }

  // Fallback: check individual weather icon keywords
  for (const item of weatherArray) {
    const icon = (item.icon || '').toLowerCase();
    if (icon.includes('tornado')) return 99;
    if (icon.includes('thunderstorm')) return 95;
    if (icon.includes('rain')) return 63;
    if (icon.includes('snow')) return 73;
    if (icon.includes('drizzle')) return 53;
    if (icon.includes('fog')) return 45;
  }

  return 0;
}

// Build a NWS cache key for a point
function nwsPointCacheKey(lat, lon) {
  return `nws_point_${DataCache._roundCoord(lat)}_${DataCache._roundCoord(lon)}`;
}

// Build a NWS cache key for gridpoint data
function nwsGridCacheKey(wfo, x, y) {
  return `nws_grid_${wfo}_${x}_${y}`;
}

// Fetch with User-Agent header and retry logic
async function nwsFetch(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': NWS_USER_AGENT },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`NWS API error: ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

// Step 1: Resolve a lat/lon to a WFO grid
async function resolvePoint(lat, lon) {
  const cacheKey = nwsPointCacheKey(lat, lon);
  const cached = DataCache.get(cacheKey, 'nwsPoint');
  if (cached) return cached;

  const url = `${NWS_API}/points/${lat},${lon}`;
  const data = await nwsFetch(url);

  const props = data?.properties || {};
  const result = {
    wfo: props.gridId || props.cwa,
    gridX: props.gridX,
    gridY: props.gridY,
    forecastZone: props.forecastZone,
    county: props.county,
    fireWeatherZone: props.fireWeatherZone,
    timeZone: props.timeZone,
    radarStation: props.radarStation,
    observationStations: props.observationStations,
    forecast: props.forecast,
    forecastHourly: props.forecastHourly,
    forecastGridData: props.forecastGridData,
  };

  DataCache.set(cacheKey, result, 'nwsPoint');
  return result;
}

// Step 2: Fetch 12-hour forecast
async function fetchForecast(wfo, x, y) {
  const cacheKey = nwsGridCacheKey(wfo, x, y, 'forecast');
  const cached = DataCache.get(cacheKey, 'nwsForecast');
  if (cached) return cached;

  const url = `${NWS_API}/gridpoints/${wfo}/${x},${y}/forecast?units=us`;
  const data = await nwsFetch(url);

  const periods = (data?.properties?.periods || []).map(p => ({
    number: p.number,
    name: p.name,
    startTime: p.startTime,
    endTime: p.endTime,
    isDaytime: p.isDaytime,
    temperature: p.temperature,
    temperatureUnit: p.temperatureUnit,
    temperatureTrend: p.temperatureTrend,
    probabilityOfPrecipitation: p.probabilityOfPrecipitation?.value ?? null,
    dewpoint: p.dewpoint?.value ?? null,
    relativeHumidity: p.relativeHumidity?.value ?? null,
    windSpeed: p.windSpeed,
    windGust: p.windGust ?? null,
    windDirection: p.windDirection,
    shortForecast: p.shortForecast,
    detailedForecast: p.detailedForecast,
  }));

  DataCache.set(cacheKey, periods, 'nwsForecast');
  return periods;
}

// Step 3: Fetch hourly forecast
async function fetchHourlyForecast(wfo, x, y) {
  const cacheKey = nwsGridCacheKey(wfo, x, y, 'hourly');
  const cached = DataCache.get(cacheKey, 'nwsHourly');
  if (cached) return cached;

  const url = `${NWS_API}/gridpoints/${wfo}/${x},${y}/forecast/hourly?units=us`;
  const data = await nwsFetch(url);

  const periods = (data?.properties?.periods || []).map(p => ({
    startTime: p.startTime,
    endTime: p.endTime,
    isDaytime: p.isDaytime,
    temperature: p.temperature,
    temperatureUnit: p.temperatureUnit,
    temperatureTrend: p.temperatureTrend,
    probabilityOfPrecipitation: p.probabilityOfPrecipitation?.value ?? null,
    dewpoint: p.dewpoint?.value ?? null,
    relativeHumidity: p.relativeHumidity?.value ?? null,
    windSpeed: p.windSpeed,
    windGust: p.windGust ?? null,
    windDirection: p.windDirection,
    shortForecast: p.shortForecast,
    detailedForecast: p.detailedForecast,
  }));

  DataCache.set(cacheKey, periods, 'nwsHourly');
  return periods;
}

// Step 4: Fetch raw grid data (current conditions)
async function fetchCurrentConditions(wfo, x, y) {
  const cacheKey = nwsGridCacheKey(wfo, x, y, 'current');
  const cached = DataCache.get(cacheKey, 'nwsCurrent');
  if (cached) return cached;

  const url = `${NWS_API}/gridpoints/${wfo}/${x},${y}`;
  const data = await nwsFetch(url);

  const props = data?.properties || {};
  const current = {
    temperature: props.temperature?.values?.slice(-1)?.[0]?.value ?? null,
    temperatureUnit: props.temperature?.uom ?? 'wmoUnit:degC',
    dewpoint: props.dewpoint?.values?.slice(-1)?.[0]?.value ?? null,
    dewpointUnit: props.dewpoint?.uom ?? 'wmoUnit:degC',
    relativeHumidity: props.relativeHumidity?.values?.slice(-1)?.[0]?.value ?? null,
    relativeHumidityUnit: props.relativeHumidity?.uom ?? 'wmoUnit:percent',
    windSpeed: props.windSpeed?.values?.slice(-1)?.[0]?.value ?? null,
    windSpeedUnit: props.windSpeed?.uom ?? 'wmoUnit:m/s',
    windGust: props.windGust?.values?.slice(-1)?.[0]?.value ?? null,
    windGustUnit: props.windGust?.uom ?? 'wmoUnit:m/s',
    windDirection: props.windDirection?.values?.slice(-1)?.[0]?.value ?? null,
    weather: props.weather?.values?.slice(-1)?.[0]?.value ?? [],
    hazards: props.hazards?.values?.slice(-1)?.[0]?.value ?? [],
    probabilityOfPrecipitation: props.probabilityOfPrecipitation?.values?.slice(-1)?.[0]?.value ?? null,
    quantitativePrecipitation: props.quantitativePrecipitation?.values?.slice(-1)?.[0]?.value ?? null,
    quantitativePrecipitationUnit: props.quantitativePrecipitation?.uom ?? 'wmoUnit:mm',
    iceAccumulation: props.iceAccumulation?.values?.slice(-1)?.[0]?.value ?? null,
    iceAccumulationUnit: props.iceAccumulation?.uom ?? 'wmoUnit:mm',
    snowfallAmount: props.snowfallAmount?.values?.slice(-1)?.[0]?.value ?? null,
    skyCover: props.skyCover?.values?.slice(-1)?.[0]?.value ?? null,
    ceilingHeight: props.ceilingHeight?.values?.slice(-1)?.[0]?.value ?? null,
    visibility: props.visibility?.values?.slice(-1)?.[0]?.value ?? null,
    visibilityUnit: props.visibility?.uom ?? 'wmoUnit:m',
    pressure: props.pressure?.values?.slice(-1)?.[0]?.value ?? null,
    pressureUnit: props.pressure?.uom ?? 'nwsUnit:inHg',
  };

  DataCache.set(cacheKey, current, 'nwsCurrent');
  return current;
}

// Step 5: Fetch nearest observation stations
async function fetchStations(wfo, x, y) {
  const url = `${NWS_API}/gridpoints/${wfo}/${x},${y}/stations`;
  const data = await nwsFetch(url);
  return data?.features || [];
}

// Step 6: Fetch latest observation from a station
async function fetchLatestObservation(stationId) {
  const cacheKey = `nws_obs_${stationId}`;
  const cached = DataCache.get(cacheKey, 'nwsObservation');
  if (cached) return cached;

  const url = `${NWS_API}/stations/${stationId}/observations/latest?require_qc=true`;
  const data = await nwsFetch(url);
  const props = data?.properties || {};

  const obs = {
    temperature: props.temperature?.value ?? null,
    temperatureUnit: props.temperature?.units ?? 'F',
    dewpoint: props.dewpoint?.value ?? null,
    dewpointUnit: props.dewpoint?.units ?? 'F',
    windDirection: props.windDirection?.value ?? null,
    windSpeed: props.windSpeed?.value ?? null,
    windSpeedUnit: props.windSpeed?.units ?? 'mph',
    windGust: props.windGust?.value ?? null,
    windGustUnit: props.windGust?.units ?? 'mph',
    barometricPressure: props.barometricPressure?.value ?? null,
    barometricPressureUnit: props.barometricPressure?.units ?? 'hPa',
    seaLevelPressure: props.seaLevelPressure?.value ?? null,
    seaLevelPressureUnit: props.seaLevelPressure?.units ?? 'hPa',
    visibility: props.visibility?.value ?? null,
    visibilityUnit: props.visibility?.units ?? 'mi',
    relativeHumidity: props.relativeHumidity?.value ?? null,
    relativeHumidityUnit: props.relativeHumidity?.units ?? '%',
    windChill: props.windChill?.value ?? null,
    windChillUnit: props.windChill?.units ?? 'F',
    heatIndex: props.heatIndex?.value ?? null,
    heatIndexUnit: props.heatIndex?.units ?? 'F',
    cloudLayers: props.cloudLayers || [],
    weather: props.presentWeather || [],
    rawMessage: props.rawMessage || '',
  };

  DataCache.set(cacheKey, obs, 'nwsObservation');
  return obs;
}

// Step 7: Fetch active alerts for a zone
async function fetchZoneAlerts(zoneId) {
  const cacheKey = `nws_alerts_${zoneId}`;
  const cached = DataCache.get(cacheKey, 'nwsAlerts');
  if (cached) return cached;

  const url = `${NWS_API}/alerts/active/zone/${zoneId}`;
  const data = await nwsFetch(url);
  const alerts = data?.features || [];

  DataCache.set(cacheKey, alerts, 'nwsAlerts');
  return alerts;
}

// Step 8: Fetch zone forecast
async function fetchZoneForecast(zoneId) {
  const cacheKey = `nws_zoneforecast_${zoneId}`;
  const cached = DataCache.get(cacheKey, 'nwsZoneForecast');
  if (cached) return cached;

  const url = `${NWS_API}/zones/${zoneId}/forecast`;
  const data = await nwsFetch(url);
  const periods = (data?.properties?.periods || []).map(p => ({
    number: p.number,
    name: p.name,
    startTime: p.startTime,
    endTime: p.endTime,
    isDaytime: p.isDaytime,
    temperature: p.temperature,
    temperatureUnit: p.temperatureUnit,
    windSpeed: p.windSpeed,
    windGust: p.windGust ?? null,
    windDirection: p.windDirection,
    shortForecast: p.shortForecast,
    detailedForecast: p.detailedForecast,
  }));

  DataCache.set(cacheKey, periods, 'nwsZoneForecast');
  return periods;
}

// Main orchestrator: fetch all NWS data for a city's coordinates
async function fetchForCity(lat, lon) {
  const point = await resolvePoint(lat, lon);
  if (!point.wfo || !point.gridX || !point.gridY) {
    return null; // NWS doesn't cover this area
  }

  const [current, hourly] = await Promise.all([
    fetchCurrentConditions(point.wfo, point.gridX, point.gridY),
    fetchHourlyForecast(point.wfo, point.gridX, point.gridY),
  ]);

  return { point, current, hourly };
}

// NWS unit code constants
const NWS_UNIT_DEGC = 'wmoUnit:degC';
const NWS_UNIT_DEGF = 'nwsUnit:degF';
const NWS_UNIT_MS = 'wmoUnit:m/s';
const NWS_UNIT_KM_H = 'wmoUnit:km_h-1';
const NWS_UNIT_MPH = 'nwsUnit:mi/h';
const NWS_UNIT_M = 'wmoUnit:m';
const NWS_UNIT_MI = 'nwsUnit:mi';
const NWS_UNIT_HPA = 'wmoUnit:hPa';
const NWS_UNIT_INHG = 'nwsUnit:inHg';
const NWS_UNIT_MM = 'wmoUnit:mm';
const NWS_UNIT_IN = 'nwsUnit:in';
const NWS_UNIT_PERCENT = 'wmoUnit:percent';

// Convert NWS unit code to a boolean for the app's unit preference
function isNwsUnitInMeters(unitCode) {
  return unitCode === NWS_UNIT_M;
}

function isNwsUnitInMetersPerSecond(unitCode) {
  return unitCode === NWS_UNIT_MS || unitCode === NWS_UNIT_KM_H;
}

function isNwsUnitInInches(unitCode) {
  return unitCode === NWS_UNIT_IN;
}

function isNwsUnitInInchesHg(unitCode) {
  return unitCode === NWS_UNIT_INHG;
}

// Convert Celsius to Fahrenheit
function celsiusToFahrenheit(c) {
  if (c == null) return null;
  return Math.round((c * 9 / 5) + 32);
}

// Convert meters to miles
function metersToMiles(m) {
  if (m == null) return null;
  return Math.round(m / 1609.34 * 10) / 10;
}

// Convert m/s to km/h
function mpsToKmh(ms) {
  if (ms == null) return null;
  return Math.round(ms * 3.6);
}

// Convert km/h to km/h (no conversion needed)
function kmhToKmh(kmh) {
  if (kmh == null) return null;
  return Math.round(kmh);
}

// Convert mph to km/h
function mphToKmh(mph) {
  if (mph == null) return null;
  return Math.round(mph * 1.60934);
}

// Convert wind speed to km/h based on unit code
function convertWindSpeedToKmh(speed, unitCode) {
  if (speed == null) return null;
  if (unitCode === NWS_UNIT_MS) return mpsToKmh(speed);
  if (unitCode === NWS_UNIT_KM_H) return kmhToKmh(speed);
  if (unitCode === NWS_UNIT_MPH) return mphToKmh(speed);
  // Default: assume km/h
  return kmhToKmh(speed);
}

// Convert inHg to hPa
function inhgToHpa(inhg) {
  if (inhg == null) return null;
  return Math.round(inhg * 33.8639);
}

// Convert hPa to hPa (no conversion needed)
function hpaToHpa(hpa) {
  if (hpa == null) return null;
  return Math.round(hpa);
}

// Convert pressure to hPa based on unit code
function convertPressureToHpa(pressure, unitCode) {
  if (pressure == null) return null;
  if (unitCode === NWS_UNIT_INHG) return inhgToHpa(pressure);
  if (unitCode === NWS_UNIT_HPA) return hpaToHpa(pressure);
  // Default: assume hPa
  return hpaToHpa(pressure);
}

// Convert mm to inches
function mmToInches(mm) {
  if (mm == null) return null;
  return Math.round(mm / 25.4 * 100) / 100;
}

// Convert mm to inches (for snowfall)
function mmToInchesSnow(mm) {
  if (mm == null) return null;
  // Roughly: 1 inch of rain = ~10 inches of snow
  return Math.round(mm / 25.4 * 10) / 10;
}

// NWS hourly forecast windSpeed is a string like "2 mph" or "10 mph"
// Extract the numeric value
function parseWindSpeedString(windSpeedStr) {
  if (typeof windSpeedStr !== 'string') return windSpeedStr;
  const match = windSpeedStr.match(/^(\d+)\s*mph$/);
  return match ? parseInt(match[1], 10) : null;
}

// Map NWS data to the app's weather data model
function nwsToAppData(city, nwsData) {
  if (!nwsData || !nwsData.current) return null;

  const { current, hourly } = nwsData;

  // Determine if we need to convert units (NWS gridpoint is always metric)
  const needsTempConversion = current.temperatureUnit === NWS_UNIT_DEGC;
  const needsWindConversion = current.windSpeedUnit !== NWS_UNIT_MPH;
  const needsVisConversion = current.visibilityUnit === NWS_UNIT_M;
  const needsPrecipConversion = current.quantitativePrecipitationUnit === NWS_UNIT_MM;

  // Build current conditions object
  // Convert temperature from Celsius to Fahrenheit for the app
  const temp = needsTempConversion ? celsiusToFahrenheit(current.temperature) : current.temperature;

  // Convert wind speed to km/h for the app
  const windSpeed = convertWindSpeedToKmh(current.windSpeed, current.windSpeedUnit);

  // Convert visibility from meters to miles for the app
  const vis = needsVisConversion ? metersToMiles(current.visibility) : current.visibility;

  // Convert quantitative precipitation from mm to inches for the app
  const precip = needsPrecipConversion ? mmToInches(current.quantitativePrecipitation) : current.quantitativePrecipitation;

  // Convert ice accumulation from mm to inches for the app
  const ice = mmToInches(current.iceAccumulation);

  // Convert snowfall from mm to inches for the app
  const snow = mmToInchesSnow(current.snowfallAmount);

  const currentApp = {
    temperature_2m: temp,
    temperatureUnit: 'F', // Always report Fahrenheit for US users
    relative_humidity_2m: current.relativeHumidity,
    wind_speed_10m: windSpeed,
    wind_direction_10m: current.windDirection,
    surface_pressure: convertPressureToHpa(current.pressure, current.pressureUnit),
    weather_code: nwsWeatherToWmo(current.weather),
    probabilityOfPrecipitation: current.probabilityOfPrecipitation,
    skyCover: current.skyCover,
    visibility: vis,
    visibilityUnit: needsVisConversion ? 'mi' : current.visibilityUnit,
    dewpoint: current.dewpoint,
    windGust: current.windGust,
    shortForecast: current.weather?.[0]?.icon || '',
    detailedForecast: '',
    // Keep raw values for reference
    _rawTemp: current.temperature,
    _rawTempUnit: current.temperatureUnit,
    _rawWindSpeed: current.windSpeed,
    _rawWindSpeedUnit: current.windSpeedUnit,
    _rawVisibility: current.visibility,
    _rawVisibilityUnit: current.visibilityUnit,
    _rawPrecip: current.quantitativePrecipitation,
    _rawPrecipUnit: current.quantitativePrecipitationUnit,
    _rawIce: current.iceAccumulation,
    _rawIceUnit: current.iceAccumulationUnit,
    _rawSnow: current.snowfallAmount,
    _rawSnowUnit: current.snowfallAmount?.uom ?? 'wmoUnit:mm',
  };

  // Build hourly forecast array (NWS hourly is already in order)
  const hourlyTimes = hourly.map(p => p.startTime);
  // NWS hourly with units=us returns temperature in Fahrenheit
  const hourlyTemps = hourly.map(p => p.temperature);
  const hourlyHumidity = hourly.map(p => p.relativeHumidity);
  // NWS hourly windSpeed is a string like "2 mph" - extract numeric value
  const hourlyWind = hourly.map(p => parseWindSpeedString(p.windSpeed));
  const hourlyWindDir = hourly.map(p => p.windDirection);
  const hourlyPoP = hourly.map(p => p.probabilityOfPrecipitation);
  const hourlyWeatherCodes = hourly.map(p => nwsForecastToWmo(p.shortForecast));
  // NWS hourly doesn't provide precipitation directly - use PoP as proxy
  const hourlyPrecip = hourly.map(p => {
    return null;
  });

  const hourlyApp = {
    time: hourlyTimes,
    temperature_2m: hourlyTemps,
    relative_humidity_2m: hourlyHumidity,
    wind_speed_10m: hourlyWind,
    wind_direction_10m: hourlyWindDir,
    probabilityOfPrecipitation: hourlyPoP,
    weather_code: hourlyWeatherCodes,
    precipitation: hourlyPrecip,
  };

  // Add sunrise/sunset from point data
  const astroData = nwsData.point?.astronomicalData;
  if (astroData) {
    currentApp.sunrise = astroData.sunrise;
    currentApp.sunset = astroData.sunset;
  }

  return {
    ...city,
    source: 'nws',
    weather: {
      current: currentApp,
      hourly: hourlyApp,
    },
  };
}

// Check if NWS covers a given lat/lon
async function isNwsCoverage(lat, lon) {
  const point = await resolvePoint(lat, lon);
  return !!(point.wfo && point.gridX && point.gridY);
}

// ===== NWS MULTI-CITY FETCH =====
// Build a unique cache key for NWS data per city
function nwsCacheKey(lat, lon) {
  return `nws_${DataCache._roundCoord(lat)}_${DataCache._roundCoord(lon)}`;
}

// ===== NWS AVALABILITY CHECK =====
// Check if NWS covers a given lat/lon (without using cached point data)
async function checkNwsCoverage(lat, lon) {
  // Use direct fetch without caching to get fresh availability
  const url = `${NWS_API}/points/${lat},${lon}`;
  try {
    const data = await nwsFetch(url);
    const props = data?.properties || {};
    return !!(props.gridId || props.cwa) && !!props.gridX && !!props.gridY;
  } catch (e) {
    return false;
  }
}

// Deduplicate city results by coordinate pair (keep first entry per coordinate pair)
// Prefer entries with a non-null place_id when there's a tie
function nwsDeduplicateResults(results) {
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

// Main orchestrator: fetch NWS data for multiple cities
async function fetchNwsForCities(cities) {
  // Check cache for each city individually
  const cachedResults = [];
  const uncachedCities = [];
  const cityCacheMap = []; // map city index to its position in uncachedCities

  for (let i = 0; i < cities.length; i++) {
    const ck = nwsCacheKey(cities[i].latitude, cities[i].longitude);
    const cached = DataCache.get(ck, 'nwsCityData');
    if (cached) {
      cachedResults.push({ ...cities[i], weather: cached.weather, aqi: {} });
    } else {
      cityCacheMap.push(i);
      uncachedCities.push(cities[i]);
    }
  }

  // If all cached, apply deduplication before returning
  if (uncachedCities.length === 0) {
    return nwsDeduplicateResults(cachedResults);
  }

  // Deduplicate BEFORE fetching
  const dedupedUncached = deduplicateCities(uncachedCities);

  // Fetch NWS data for each unique city
  const nwsResults = [];
  for (const city of dedupedUncached) {
    const nwsData = await fetchForCity(city.latitude, city.longitude);
    if (nwsData) {
      const appData = nwsToAppData(city, nwsData);
      if (appData) {
        nwsResults.push(appData);
      }
    }
  }

  const result = new Array(cities.length);

  // Fill cached results first
  for (let i = 0; i < cities.length; i++) {
    const ck = nwsCacheKey(cities[i].latitude, cities[i].longitude);
    const cached = DataCache.get(ck, 'nwsCityData');
    if (cached) {
      result[i] = { ...cities[i], weather: cached.weather, aqi: {} };
    }
  }

  // Fill fetched results
  for (const nwsResult of nwsResults) {
    const ck = nwsCacheKey(nwsResult.latitude, nwsResult.longitude);
    DataCache.set(ck, nwsResult, 'nwsCityData');
    result[cityCacheMap.find(idx => {
      const cityCk = nwsCacheKey(cities[idx].latitude, cities[idx].longitude);
      return cityCk === ck;
    })] = nwsResult;
  }

  // Fill any uncached cities with null data
  for (const idx of cityCacheMap) {
    if (!result[idx]) {
      result[idx] = { ...cities[idx], weather: null, aqi: {} };
    }
  }

  return nwsDeduplicateResults(result);
}

// ===== SOURCE-DEPENDENT DATA FETCH =====
// This is the unified entry point that the app uses to fetch weather data
// It delegates to the appropriate source based on currentSource
async function fetchWeatherForCitiesUnified(cities) {
  if (currentSource === 'nws') {
    return await fetchNwsForCities(cities);
  } else {
    return await fetchWeatherForCities(cities);
  }
}
