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

// ===== NWS RATE LIMITER =====
// NWS API limit: 1 request/second, burst of 3
const _nwsRateLimiter = {
  queue: [],
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
        else setTimeout(check, 50);
      };
      check();
    });
  },

  async waitForSlot() {
    const now = Date.now();
    const timeSinceLast = now - this.lastRequestTime;

    // If we're within the burst window and at max burst, wait
    if (timeSinceLast < this.burstWindowMs && !this._checkBurst()) {
      await this._waitForBurst();
    }

    // Ensure minimum interval between requests
    if (timeSinceLast < this.minIntervalMs) {
      await new Promise(r => setTimeout(r, this.minIntervalMs - timeSinceLast));
    }

    this.burstCount++;
    this.burstWindow = Date.now();
    this.lastRequestTime = Date.now();
  },
};

// Fetch with User-Agent header, rate limiting, and retry logic
async function nwsFetch(url, maxRetries = 3) {
  // Rate limit: wait for available slot
  await _nwsRateLimiter.waitForSlot();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': NWS_USER_AGENT },
      signal: controller.signal,
    });

    // Handle 429 rate limiting with exponential backoff
    if (response.status === 429) {
      if (maxRetries <= 0) throw new Error('NWS API rate limited (429)');
      const waitMs = Math.pow(2, 3 - maxRetries) * 2000; // 16s, 8s, 4s
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
    // windSpeed is a string like "10 mph" - parse to number
    windSpeed: parseWindSpeedString(p.windSpeed),
    windSpeedUnit: 'mph',
    // windGust is a string like "20 mph" - parse to number
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
    // windSpeed is a string like "10 mph" - parse to number
    windSpeed: parseWindSpeedString(p.windSpeed),
    windSpeedUnit: 'mph',
    // windGust is a string like "20 mph" - parse to number
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

// Convert Pa to hPa
function paToHpa(pa) {
  if (pa == null) return null;
  return Math.round(pa / 100);
}

// Convert meters to feet
function metersToFeet(m) {
  if (m == null) return null;
  return Math.round(m * 3.28084);
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
    if (dMatch[1]) durationMs += parseInt(dMatch[1]) * 86400000;
    if (dMatch[2]) durationMs += parseInt(dMatch[2]) * 3600000;
    if (dMatch[3]) durationMs += parseInt(dMatch[3]) * 60000;
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
  if (unitCode === NWS_UNIT_KM_H) return Math.round(speed * 0.621371);
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

  // Build current conditions object
  // Temperature is already in Celsius (NWS gridpoint always returns Celsius)
  // Store as Celsius so convertTemp() can convert to F or C based on user preference
  const temp = current.temperature;

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

  // Dewpoint is already in Celsius (NWS gridpoint always returns Celsius)
  // Store as Celsius so convertTemp() can convert to F or C based on user preference
  const dewpoint = current.dewpoint;

  // Convert wind gust from m/s to km/h for the app (same as wind speed conversion)
  const windGust = convertWindSpeedToKmh(current.windGust, current.windGustUnit);

  // Check if NWS fields are missing — we'll try to cross-source them from OM cache
  const nwsHasPressure = current.pressure != null;
  const nwsHasVisibility = current.visibility != null;
  const nwsHasUvIndex = false; // NWS never provides UV Index

  const currentApp = {
    temperature_2m: temp,
    temperatureUnit: 'C', // Always store Celsius — convertTemp() converts from Celsius
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

  // Cross-source missing fields from OM cache (pressure, visibility, UV Index)
  const omWeather = DataCache.get(weatherCacheKey(city.latitude, city.longitude), 'weather');
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

  // Build hourly forecast array (NWS hourly is already in order)
  const hourlyTimes = hourly.map(p => p.startTime);
  // NWS hourly with units=us returns temperature in Fahrenheit — convert to Celsius
  // convertTemp() always converts from Celsius, so we must store in Celsius
  const hourlyTemps = hourly.map(p => {
    const f = p.temperature;
    return f != null ? (f - 32) * 5 / 9 : null;
  });
  const hourlyHumidity = hourly.map(p => p.relativeHumidity);
  // NWS hourly windSpeed is a string like "2 mph" - extract numeric value and convert mph → km/h
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
// Check if NWS covers a given lat/lon (cached)
const _nwsCoverageCache = {}; // { lat,lon: boolean | Promise<boolean> }

async function checkNwsCoverage(lat, lon) {
  const key = `${DataCache._roundCoord(lat)},${DataCache._roundCoord(lon)}`;
  // Check cache first
  if (key in _nwsCoverageCache) {
    const cached = _nwsCoverageCache[key];
    // If it's a Promise, return it (concurrent request dedup)
    if (cached instanceof Promise) return cached;
    return cached;
  }
  // Check if we have a pending request for this key
  if (_nwsCoverageCache[key] instanceof Promise) {
    return _nwsCoverageCache[key];
  }
  // Create a promise and cache it to deduplicate concurrent requests
  const promise = (async () => {
    try {
      const url = `${NWS_API}/points/${lat},${lon}`;
      const data = await nwsFetch(url);
      const props = data?.properties || {};
      const result = !!(props.gridId || props.cwa) && !!props.gridX && !!props.gridY;
      _nwsCoverageCache[key] = result;
      return result;
    } catch (e) {
      delete _nwsCoverageCache[key];
      return false;
    }
  })();
  _nwsCoverageCache[key] = promise;
  const result = await promise;
  return result;
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

// Cross-source cache lookup for NWS: try NWS keys first (current source), then OM keys (cross-source)
function crossSourceGetNws(lat, lon) {
  // Try NWS city data key FIRST (current source priority)
  const nwsCityData = DataCache.get(nwsCacheKey(lat, lon), 'nwsCityData');
  if (nwsCityData && nwsCityData.weather) return { data: nwsCityData, source: 'nws' };

  // Try NWS point cache key (current source priority)
  const nwsPoint = DataCache.get(nwsPointCacheKey(lat, lon), 'nwsPoint');
  if (nwsPoint && nwsPoint.weather) return { data: nwsPoint, source: 'nws' };

  // Try OM weather key (cross-source fallback)
  const omWeather = DataCache.get(weatherCacheKey(lat, lon), 'weather');
  if (omWeather) return { data: omWeather, source: 'open-meteo' };

  // Try OM AQI key (cross-source fallback for AQI)
  const omAqi = DataCache.get(aqiCacheKey(lat, lon), 'airQuality');
  if (omAqi) return { data: omAqi, source: 'open-meteo' };

  return null;
}

// Cross-source AQI lookup for NWS: try NWS city data first, then OM AQI key
function crossSourceGetAQI(lat, lon) {
  // Try NWS city data key (current source priority)
  const nwsCityData = DataCache.get(nwsCacheKey(lat, lon), 'nwsCityData');
  if (nwsCityData && nwsCityData.aqi) return { data: nwsCityData.aqi, source: 'nws' };

  // Try OM AQI key (cross-source fallback)
  const omAqi = DataCache.get(aqiCacheKey(lat, lon), 'airQuality');
  if (omAqi) return { data: omAqi, source: 'open-meteo' };

  return null;
}

// Main orchestrator: fetch NWS data for multiple cities
async function fetchNwsForCities(cities) {
  // Check cache for each city individually — use cross-source lookup
  const cachedResults = [];
  const uncachedCities = [];
  const cityCacheMap = []; // map city index to its position in uncachedCities

  for (let i = 0; i < cities.length; i++) {
    const ck = nwsCacheKey(cities[i].latitude, cities[i].longitude);
    const cached = DataCache.get(ck, 'nwsCityData');
    // Cross-source: also check OM keys for NWS lookup
    const crossSource = crossSourceGetNws(cities[i].latitude, cities[i].longitude);
    if (cached) {
      // Cross-source AQI from OM cache if NWS doesn't have it
      const crossAqi = crossSourceGetAQI(cities[i].latitude, cities[i].longitude);
      const aqiData = crossAqi?.data || cached.aqi || {};
      cachedResults.push({ ...cities[i], source: 'nws', weather: cached.weather, aqi: aqiData });
    } else if (crossSource && crossSource.data.weather) {
      // OM data can serve as NWS weather data (it has the same structure)
      const crossAqi = crossSourceGetAQI(cities[i].latitude, cities[i].longitude);
      cachedResults.push({ ...cities[i], source: crossSource.source, weather: crossSource.data.weather, aqi: crossAqi?.data || {} });
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

  // Fetch NWS data for each unique city, and fall back to OM for cities outside NWS coverage
  const nwsResults = [];
  const omFallbackResults = [];
  for (const city of dedupedUncached) {
    const nwsData = await fetchForCity(city.latitude, city.longitude);
    if (nwsData) {
      const appData = nwsToAppData(city, nwsData);
      if (appData) {
        nwsResults.push(appData);
      }
    } else {
      // NWS doesn't cover this city — fall back to OM data
      omFallbackResults.push(city);
    }
  }

  const result = new Array(cities.length);

  // Fill cached results first (with source: 'nws' to ensure badge updates on toggle)
  for (let i = 0; i < cities.length; i++) {
    const ck = nwsCacheKey(cities[i].latitude, cities[i].longitude);
    const cached = DataCache.get(ck, 'nwsCityData');
    if (cached) {
      // Cross-source AQI from OM cache if NWS doesn't have it
      const crossAqi = crossSourceGetAQI(cities[i].latitude, cities[i].longitude);
      const aqiData = crossAqi?.data || cached.aqi || {};
      result[i] = { ...cities[i], source: 'nws', weather: cached.weather, aqi: aqiData };
    }
  }

  // Fill fetched NWS results using coordinate-based matching instead of cache key string comparison
  for (const nwsResult of nwsResults) {
    const ck = nwsCacheKey(nwsResult.latitude, nwsResult.longitude);
    DataCache.set(ck, nwsResult, 'nwsCityData');
    // Find the city by matching coordinates instead of cache key strings
    for (const idx of cityCacheMap) {
      const cityLat = cities[idx].latitude;
      const cityLon = cities[idx].longitude;
      if (cityLat != null && cityLon != null) {
        const resultLat = nwsResult.latitude;
        const resultLon = nwsResult.longitude;
        if (Math.abs(resultLat - cityLat) < 0.01 && Math.abs(resultLon - cityLon) < 0.01) {
          result[idx] = nwsResult;
          break;
        }
      }
    }
  }

  // Fill OM fallback results for cities outside NWS coverage
  const omCities = await fetchWeatherForCities(omFallbackResults);
  for (const omResult of omCities) {
    // Find the city by matching coordinates
    for (const idx of cityCacheMap) {
      const cityLat = cities[idx].latitude;
      const cityLon = cities[idx].longitude;
      if (cityLat != null && cityLon != null) {
        const resultLat = omResult.latitude;
        const resultLon = omResult.longitude;
        if (Math.abs(resultLat - cityLat) < 0.01 && Math.abs(resultLon - cityLon) < 0.01) {
          // Use OM data for cities outside NWS coverage
          result[idx] = { ...omResult, source: 'open-meteo' };
          break;
        }
      }
    }
  }

  // Fill any uncached cities with null data
  for (const idx of cityCacheMap) {
    if (!result[idx]) {
      result[idx] = { ...cities[idx], weather: null, aqi: {} };
    }
  }

  return nwsDeduplicateResults(result);
}

// Merge NWS supplemental fields into OM base data
// NWS current conditions replace OM current conditions (NWS is more accurate for current state)
// NWS hourly replaces OM hourly (but keep OM precipitation since NWS hourly doesn't have it)
function mergeNwsWithOM(omEntry, nwsEntry) {
  const merged = { ...omEntry };

  // Merge weather data
  if (nwsEntry.weather && omEntry.weather) {
    const nwsCurrent = nwsEntry.weather.current || {};
    const omCurrent = omEntry.weather.current || {};

    // Replace current conditions with NWS data (NWS is more accurate for current state)
    merged.weather = {
      current: {
        ...omCurrent,
        ...nwsCurrent,
      },
      hourly: nwsEntry.weather.hourly || omEntry.weather.hourly,
    };
  }

  // Update source to 'enhanced' (OM base + NWS supplemental)
  merged.source = 'enhanced';

  return merged;
}

// ===== SOURCE-DEPENDENT DATA FETCH =====
// This is the unified entry point that the app uses to fetch weather data.
// OM is always the base for all cities; NWS is fetched only where available as supplemental.
async function fetchWeatherForCitiesUnified(cities) {
  // Always fetch OM weather + AQI for ALL cities first
  const omResults = await fetchWeatherForCities(cities);

  // Check which cities have NWS coverage and fetch NWS data for those
  const nwsFetches = [];

  for (const city of cities) {
    const hasNws = await checkNwsCoverage(city.latitude, city.longitude);
    if (hasNws) {
      const nwsData = await fetchForCity(city.latitude, city.longitude);
      if (nwsData) {
        nwsFetches.push({ city, nwsData });
      }
    }
  }

  // Merge NWS supplemental data into OM base data
  const mergedResults = new Array(cities.length);

  // First, fill with OM base data
  for (let i = 0; i < cities.length; i++) {
    const omEntry = omResults.find(r => r && Math.abs(r.latitude - cities[i].latitude) < 0.01 && Math.abs(r.longitude - cities[i].longitude) < 0.01);
    if (omEntry) {
      mergedResults[i] = { ...omEntry, source: 'open-meteo' };
    } else {
      mergedResults[i] = { ...cities[i], weather: null, aqi: {} };
    }
  }

  // Then, merge NWS supplemental data into OM base data for cities with coverage
  for (const { city, nwsData } of nwsFetches) {
    const appData = nwsToAppData(city, nwsData);
    if (!appData) continue;

    // Find the OM entry for this city
    const omEntryIdx = mergedResults.findIndex(r => r && Math.abs(r.latitude - city.latitude) < 0.01 && Math.abs(r.longitude - city.longitude) < 0.01);
    if (omEntryIdx === -1) continue;

    // Merge NWS supplemental fields into OM base data
    const merged = mergeNwsWithOM(mergedResults[omEntryIdx], appData);
    mergedResults[omEntryIdx] = merged;

    // Cache the NWS city data for future use
    const ck = nwsCacheKey(city.latitude, city.longitude);
    DataCache.set(ck, appData, 'nwsCityData');
  }

  return nwsDeduplicateResults(mergedResults);
}
