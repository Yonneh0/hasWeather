// ===== NWS API CLIENT =====
// Fetches weather data from api.weather.gov (NWS) and maps it to the app's data model.

const NWS_API = 'https://api.weather.gov';
const NWS_USER_AGENT = 'hasWeather/1.0 (https://github.com/Yonneh0/hasWeather)';

// ===== NWS Fetch Configuration =====
const NWS_FETCH_TIMEOUT_MS = 10000;
const NWS_RATE_LIMIT_RETRIES = 3;
const NWS_RATE_LIMIT_BACKOFF_BASE_MS = 2000;
const NWS_RATE_LIMIT_BACKOFF_EXPONENT = 2;

// NOTE: rate limiting is handled by the global _nwsRateLimiter in cache.js.
// The bounds check in utils.js uses it, so all NWS requests are coordinated
// through a single limiter (1 req/s, burst of 3).

// ===== Duration Constants (milliseconds) =====
const MS_PER_DAY = 86400000;
const MS_PER_HOUR = 3600000;
const MS_PER_MINUTE = 60000;

// ===== Unit Conversion Constants =====
const METERS_PER_MILE = 1609.34;
const CELSIUS_TO_FAHRENHEIT_OFFSET = 32;
const CELSIUS_TO_FAHRENHEIT_FACTOR = 9 / 5;
const MPS_TO_KMH = 3.6;
const MPH_TO_KMH = 1.60934;
const INHG_TO_HPA = 33.8639;
const MM_TO_INCHES = 25.4;
const PA_TO_HPA_DIVISOR = 100;
const METERS_TO_FEET = 3.28084;

// ===== Snowfall Conversion Ratio (mm of precipitation → inches of snow) =====
const SNOWFALL_CONVERSION_FACTOR = 10;

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
    'thunderstorm', 'thunder', 'hail',
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
function nwsGridCacheKey(wfo, x, y, suffix) {
  return `nws_grid_${wfo}_${x}_${y}${suffix ? '_' + suffix : ''}`;
}

// Fetch with User-Agent header, rate limiting, and retry logic
async function nwsFetch(url, maxRetries = 3) {
  // Rate limit through the global limiter in cache.js
  await _nwsRateLimiter.waitForSlot();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), NWS_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': NWS_USER_AGENT },
      signal: controller.signal,
    });

    // Handle 429 rate limiting with exponential backoff
    if (response.status === 429) {
      if (maxRetries <= 0) throw new Error('NWS API rate limited (429)');
      const waitMs = Math.pow(NWS_RATE_LIMIT_BACKOFF_EXPONENT, NWS_RATE_LIMIT_RETRIES - maxRetries) * NWS_RATE_LIMIT_BACKOFF_BASE_MS; // 16s, 8s, 4s
      console.log(`[NWS] Rate limited, waiting ${waitMs}ms before retry`);
      await new Promise(r => setTimeout(r, waitMs));
      return await nwsFetch(url, maxRetries - 1);
    }

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
    // NWS returns dewpoint in Celsius even with units=us
    dewpoint: p.dewpoint?.value != null ? convertObsTempToF(p.dewpoint.value, p.dewpoint.unitCode) : null,
    dewpointUnit: p.dewpoint?.unitCode == null ? 'F' : p.dewpoint.unitCode,
    windSpeed: parseWindSpeedString(p.windSpeed),
    windSpeedUnit: 'mph',
    windGust: parseWindSpeedString(p.windGust),
    windGustUnit: 'mph',
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
    // NWS returns dewpoint in Celsius even with units=us
    dewpoint: p.dewpoint?.value != null ? convertObsTempToF(p.dewpoint.value, p.dewpoint.unitCode) : null,
    dewpointUnit: p.dewpoint?.unitCode == null ? 'F' : p.dewpoint.unitCode,
    windSpeed: parseWindSpeedString(p.windSpeed),
    windSpeedUnit: 'mph',
    windGust: parseWindSpeedString(p.windGust),
    windGustUnit: 'mph',
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
  const now = new Date();

  // Find the value whose validTime covers the current time
  const findCurrent = (propName) => {
    const values = props[propName]?.values;
    if (!values || !Array.isArray(values) || values.length === 0) return null;
    const found = findCurrentNwsValue(values, now);
    if (!found) return null;
    return { value: found.value, uom: props[propName]?.uom };
  };

  const temp = findCurrent('temperature');
  const dew = findCurrent('dewpoint');
  const rh = findCurrent('relativeHumidity');
  const ws = findCurrent('windSpeed');
  const wg = findCurrent('windGust');
  const wd = findCurrent('windDirection');
  const vis = findCurrent('visibility');
  // NWS gridpoint uses 'surfacePressure' or 'surface_pressure' for surface-level pressure
  const pr = findCurrent('surfacePressure') ?? findCurrent('surface_pressure') ?? findCurrent('pressure');
  const ch = findCurrent('ceilingHeight');

  // Weather and hazards have a different structure (array of objects)
  const weatherValues = props.weather?.values;
  const weather = weatherValues && weatherValues.length > 0 ? findCurrentNwsValue(weatherValues, now)?.value ?? [] : [];
  const hazardsValues = props.hazards?.values;
  const hazards = hazardsValues && hazardsValues.length > 0 ? findCurrentNwsValue(hazardsValues, now)?.value ?? [] : [];

  // PoP has a different structure - find the closest value
  const popValues = props.probabilityOfPrecipitation?.values;
  let pop = null;
  if (popValues && popValues.length > 0) {
    const foundPop = findCurrentNwsValue(popValues, now);
    pop = foundPop?.value ?? null;
  }

  // QPE has a different structure - find the closest value
  const qpeValues = props.quantitativePrecipitation?.values;
  let qpe = null;
  let qpeUnit = null;
  if (qpeValues && qpeValues.length > 0) {
    const foundQpe = findCurrentNwsValue(qpeValues, now);
    qpe = foundQpe?.value ?? null;
    qpeUnit = props.quantitativePrecipitation?.uom ?? 'wmoUnit:mm';
  }

  // Ice accumulation - find the closest value
  const iceValues = props.iceAccumulation?.values;
  let ice = null;
  let iceUnit = null;
  if (iceValues && iceValues.length > 0) {
    const foundIce = findCurrentNwsValue(iceValues, now);
    ice = foundIce?.value ?? null;
    iceUnit = props.iceAccumulation?.uom ?? 'wmoUnit:mm';
  }

  // Snowfall - find the closest value
  const snowValues = props.snowfallAmount?.values;
  let snow = null;
  let snowUnit = null;
  if (snowValues && snowValues.length > 0) {
    const foundSnow = findCurrentNwsValue(snowValues, now);
    snow = foundSnow?.value ?? null;
    snowUnit = props.snowfallAmount?.uom ?? 'wmoUnit:mm';
  }

  // Sky cover - find the closest value
  const skyCoverValues = props.skyCover?.values;
  let skyCover = null;
  let skyCoverUnit = null;
  if (skyCoverValues && skyCoverValues.length > 0) {
    const foundSky = findCurrentNwsValue(skyCoverValues, now);
    skyCover = foundSky?.value ?? null;
    skyCoverUnit = props.skyCover?.uom ?? 'wmoUnit:percent';
  }

  const current = {
    temperature: temp?.value ?? null,
    temperatureUnit: temp?.uom ?? 'wmoUnit:degC',
    dewpoint: dew?.value ?? null,
    dewpointUnit: dew?.uom ?? 'wmoUnit:degC',
    relativeHumidity: rh?.value ?? null,
    relativeHumidityUnit: rh?.uom ?? 'wmoUnit:percent',
    windSpeed: ws?.value ?? null,
    windSpeedUnit: ws?.uom ?? 'wmoUnit:m/s',
    windGust: wg?.value ?? null,
    windGustUnit: wg?.uom ?? 'wmoUnit:m/s',
    windDirection: wd?.value ?? null,
    windDirectionUnit: wd?.uom ?? 'wmoUnit:degree_(angle)',
    weather: weather,
    hazards: hazards,
    probabilityOfPrecipitation: pop,
    quantitativePrecipitation: qpe,
    quantitativePrecipitationUnit: qpeUnit,
    iceAccumulation: ice,
    iceAccumulationUnit: iceUnit,
    snowfallAmount: snow,
    snowfallAmountUnit: snowUnit,
    skyCover: skyCover,
    skyCoverUnit: skyCoverUnit,
    ceilingHeight: ch?.value ?? null,
    ceilingHeightUnit: ch?.uom ?? 'wmoUnit:m',
    visibility: vis?.value ?? null,
    visibilityUnit: vis?.uom ?? 'wmoUnit:m',
    // Use surfacePressure if available (NWS gridpoint), fallback to pressure
    pressure: pr?.value ?? null,
    pressureUnit: pr?.uom ?? 'nwsUnit:inHg',
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
    // Temperature is in Celsius (wmoUnit:degC), convert to Fahrenheit
    temperature: props.temperature?.value != null ? convertObsTempToF(props.temperature.value, props.temperature.unitCode) : null,
    temperatureUnit: props.temperature?.unitCode == null ? 'F' : props.temperature.unitCode,
    // Dewpoint is in Celsius (wmoUnit:degC), convert to Fahrenheit
    dewpoint: props.dewpoint?.value != null ? convertObsTempToF(props.dewpoint.value, props.dewpoint.unitCode) : null,
    dewpointUnit: props.dewpoint?.unitCode == null ? 'F' : props.dewpoint.unitCode,
    windDirection: props.windDirection?.value ?? null,
    // Wind speed is in km/h (wmoUnit:km_h-1), convert to mph
    windSpeed: props.windSpeed?.value != null ? convertObsWindToMph(props.windSpeed.value, props.windSpeed.unitCode) : null,
    windSpeedUnit: props.windSpeed?.unitCode == null ? 'mph' : props.windSpeed.unitCode,
    // Wind gust is in km/h (wmoUnit:km_h-1), convert to mph
    windGust: props.windGust?.value != null ? convertObsWindToMph(props.windGust.value, props.windGust.unitCode) : null,
    windGustUnit: props.windGust?.unitCode == null ? 'mph' : props.windGust.unitCode,
    // Barometric pressure is in Pa (wmoUnit:Pa), convert to hPa
    barometricPressure: props.barometricPressure?.value != null ? paToHpa(props.barometricPressure.value) : null,
    barometricPressureUnit: props.barometricPressure?.unitCode == null ? 'hPa' : props.barometricPressure.unitCode,
    seaLevelPressure: props.seaLevelPressure?.value != null ? paToHpa(props.seaLevelPressure.value) : null,
    seaLevelPressureUnit: props.seaLevelPressure?.unitCode == null ? 'hPa' : props.seaLevelPressure.unitCode,
    // Visibility is in meters (wmoUnit:m), convert to miles
    visibility: props.visibility?.value != null ? metersToMiles(props.visibility.value) : null,
    visibilityUnit: props.visibility?.unitCode == null ? 'mi' : props.visibility.unitCode,
    relativeHumidity: props.relativeHumidity?.value ?? null,
    relativeHumidityUnit: props.relativeHumidity?.unitCode == null ? '%' : props.relativeHumidity.unitCode,
    // Wind chill is in Celsius (wmoUnit:degC), convert to Fahrenheit
    windChill: props.windChill?.value != null ? convertObsTempToF(props.windChill.value, props.windChill.unitCode) : null,
    windChillUnit: props.windChill?.unitCode == null ? 'F' : props.windChill.unitCode,
    // Heat index is in Celsius (wmoUnit:degC), convert to Fahrenheit
    heatIndex: props.heatIndex?.value != null ? convertObsTempToF(props.heatIndex.value, props.heatIndex.unitCode) : null,
    heatIndexUnit: props.heatIndex?.unitCode == null ? 'F' : props.heatIndex.unitCode,
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

// Main orchestrator: fetch all NWS data for a city's coordinates.
// Retries once on transient failure (network blip, brief rate limit).
async function fetchForCity(lat, lon) {
  try {
    const point = await resolvePoint(lat, lon);
    if (!point.wfo || !point.gridX || !point.gridY) {
      return null; // NWS doesn't cover this area
    }

    const [current, hourly] = await Promise.all([
      fetchCurrentConditions(point.wfo, point.gridX, point.gridY),
      fetchHourlyForecast(point.wfo, point.gridX, point.gridY),
    ]);

    return { point, current, hourly };
  } catch (err) {
    console.warn(`[NWS fetchForCity] First attempt failed for ${lat},${lon}: ${err.message}, retrying...`);
    // Retry once — clear the potentially stale point cache so resolvePoint re-requests
    const pointKey = nwsPointCacheKey(lat, lon);
    DataCache.invalidate(pointKey);
    try {
      const point = await resolvePoint(lat, lon);
      if (!point.wfo || !point.gridX || !point.gridY) {
        return null;
      }

      const [current, hourly] = await Promise.all([
        fetchCurrentConditions(point.wfo, point.gridX, point.gridY),
        fetchHourlyForecast(point.wfo, point.gridX, point.gridY),
      ]);

      return { point, current, hourly };
    } catch (err2) {
      console.error(`[NWS fetchForCity] Retry failed for ${lat},${lon}: ${err2.message}`);
      return null;
    }
  }
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
  return Math.round((c * CELSIUS_TO_FAHRENHEIT_FACTOR) + CELSIUS_TO_FAHRENHEIT_OFFSET);
}

// Convert meters to miles
function metersToMiles(m) {
  if (m == null) return null;
  return Math.round(m / METERS_PER_MILE * 10) / 10;
}

// Convert meters per second to km/h
function mpsToKmh(ms) {
  if (ms == null) return null;
  return Math.round(ms * MPS_TO_KMH);
}

// Return km/h value unchanged
function kmhToKmh(kmh) {
  if (kmh == null) return null;
  return Math.round(kmh);
}

// Convert mph to km/h
function mphToKmh(mph) {
  if (mph == null) return null;
  return Math.round(mph * MPH_TO_KMH);
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
  return Math.round(inhg * INHG_TO_HPA);
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
  return Math.round(mm / MM_TO_INCHES * 100) / 100;
}

// Convert mm precipitation to inches of snowfall (~10:1 ratio)
function mmToInchesSnow(mm) {
  if (mm == null) return null;
  return Math.round(mm / MM_TO_INCHES * SNOWFALL_CONVERSION_FACTOR) / 10;
}

// Convert pascals to hPa
function paToHpa(pa) {
  if (pa == null) return null;
  return Math.round(pa / PA_TO_HPA_DIVISOR);
}

// Convert meters to feet
function metersToFeet(m) {
  if (m == null) return null;
  return Math.round(m * METERS_TO_FEET);
}

// Parse a NWS validTime string like "2026-06-13T06:00:00+00:00/PT2H" into start/end timestamps
function parseNwsValidTime(vt) {
  if (!vt) return null;
  const slashIdx = vt.indexOf('/');
  if (slashIdx === -1) return null;
  const startStr = vt.substring(0, slashIdx);
  const durationStr = vt.substring(slashIdx + 1);
  const start = new Date(startStr).getTime();

  // Parse duration like PT2H, PT1H, P1DT6H etc.
  let durationMs = 0;
  const dMatch = durationStr.match(/P(?:(\d+)D)?(?:(\d+)H)?(?:(\d+)M)?/);
  if (dMatch) {
    if (dMatch[1]) durationMs += parseInt(dMatch[1]) * MS_PER_DAY;
    if (dMatch[2]) durationMs += parseInt(dMatch[2]) * MS_PER_HOUR;
    if (dMatch[3]) durationMs += parseInt(dMatch[3]) * MS_PER_MINUTE;
  }
  return { start, end: start + durationMs };
}

// Find the value whose validTime covers the current time
function findCurrentNwsValue(values, now) {
  if (!values || !Array.isArray(values) || values.length === 0) return null;
  const nowMs = now.getTime();
  let best = null;
  let bestDiff = Infinity;
  for (const v of values) {
    const range = parseNwsValidTime(v.validTime);
    if (!range) continue;
    // Check if current time falls within this range
    if (nowMs >= range.start && nowMs < range.end) {
      return v;
    }
    // If not within range, find the closest one
    const diff = Math.min(Math.abs(nowMs - range.start), Math.abs(nowMs - range.end));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = v;
    }
  }
  return best;
}

// Convert Celsius to Fahrenheit for observation station data
function convertObsTempToF(c, unitCode) {
  if (c == null) return null;
  if (unitCode === NWS_UNIT_DEGC) return celsiusToFahrenheit(c);
  return c;
}

// Convert observation station wind speed to mph based on unit code
function convertObsWindToMph(speed, unitCode) {
  if (speed == null) return null;
  // km/h → mph: multiply by 0.621371
  if (unitCode === NWS_UNIT_KM_H) return Math.round(speed * 0.621371);
  // m/s → mph: multiply by 2.23694
  if (unitCode === NWS_UNIT_MS) return Math.round(speed * 2.23694);
  // Default: assume mph
  return Math.round(speed);
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

  // Build current conditions object (NWS always returns Celsius)
  const temp = current.temperature;

  // Convert wind speed from m/s to km/h for the app
  const windSpeed = convertWindSpeedToKmh(current.windSpeed, current.windSpeedUnit);

  // Convert visibility from meters to miles for the app
  const vis = needsVisConversion ? metersToMiles(current.visibility) : current.visibility;

  // Convert quantitative precipitation from mm to inches for the app
  const precip = needsPrecipConversion ? mmToInches(current.quantitativePrecipitation) : current.quantitativePrecipitation;

  // Convert ice accumulation from mm to inches for the app
  const ice = mmToInches(current.iceAccumulation);

  // Convert snowfall from mm to inches for the app
  const snow = mmToInchesSnow(current.snowfallAmount);

  // Store dewpoint as Celsius — convertTemp() handles conversion to F or C
  const dewpoint = current.dewpoint;

  // Convert wind gust from m/s to km/h for the app
  const windGust = convertWindSpeedToKmh(current.windGust, current.windGustUnit);

  // Check if NWS fields are missing — we'll try to cross-source them from OM cache
  const nwsHasPressure = current.pressure != null;
  const nwsHasVisibility = current.visibility != null;
  const nwsHasUvIndex = false; // NWS never provides UV Index

  const currentApp = {
    temperature_2m: temp,
    temperatureUnit: 'C', // Always store Celsius — convertTemp() handles conversion to F or C
    relative_humidity_2m: current.relativeHumidity,
    wind_speed_10m: windSpeed,
    wind_direction_10m: current.windDirection,
    surface_pressure: nwsHasPressure ? convertPressureToHpa(current.pressure, current.pressureUnit) : null,
    weather_code: nwsWeatherToWmo(current.weather),
    probabilityOfPrecipitation: current.probabilityOfPrecipitation,
    skyCover: current.skyCover,
    visibility: nwsHasVisibility ? vis : null,
    visibilityUnit: needsVisConversion ? 'mi' : (nwsHasVisibility ? current.visibilityUnit : null),
    uv_index: null, // NWS doesn't provide UV Index — will be cross-sourced below
    dewpoint: dewpoint,
    windGust: windGust,
    shortForecast: current.weather?.[0]?.icon || '',
    detailedForecast: '',
  };

  // Cross-source missing fields from OM cache (pressure, visibility, UV Index)
  // Try consolidated cache key first, then fall back to legacy weather key
  const omWeather = DataCache.get(weatherAqiCacheKey(city.latitude, city.longitude), 'weatherAqi')?.weather 
    || DataCache.get(weatherCacheKey(city.latitude, city.longitude), 'weather');
  if (omWeather && omWeather.current) {
    // Merge missing pressure from OM
    if (!nwsHasPressure && omWeather.current.surface_pressure != null) {
      currentApp.surface_pressure = omWeather.current.surface_pressure;
    }
    // Merge missing visibility from OM (OM returns meters, convert to miles)
    if (!nwsHasVisibility && omWeather.current.visibility != null) {
      currentApp.visibility = metersToMiles(omWeather.current.visibility);
      currentApp.visibilityUnit = 'mi';
    }
    // Merge UV Index from OM (NWS doesn't provide it)
    if (omWeather.current.uv_index != null) {
      currentApp.uv_index = omWeather.current.uv_index;
    }
  }

  // Build hourly forecast array (NWS hourly is already sorted)
  // NWS returns timestamps with explicit timezone offset (e.g. "2026-06-17T03:00:00-04:00").
  // Keep the offset so new Date() parses correctly regardless of browser timezone.
  const hourlyTimes = hourly.map(p => p.startTime);
  // NWS hourly with units=us returns Fahrenheit — convert to Celsius for storage
  const hourlyTemps = hourly.map(p => {
    const f = p.temperature;
    return f != null ? (f - CELSIUS_TO_FAHRENHEIT_OFFSET) * CELSIUS_TO_FAHRENHEIT_FACTOR : null;
  });
  const hourlyHumidity = hourly.map(p => p.relativeHumidity);
  // Parse windSpeed strings ("2 mph", "10 mph") and convert mph → km/h
  const hourlyWind = hourly.map(p => {
    const mphVal = parseWindSpeedString(p.windSpeed);
    return mphVal != null ? mphToKmh(mphVal) : null;
  });
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

