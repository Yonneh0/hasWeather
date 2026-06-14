# Public Weather Forecast APIs — No API Key Required (2026)

This document catalogs public weather APIs that provide live hourly forecast data **without requiring an API key or pre-registration**. Verified as of June 2026.

---

## Table of Contents

1. [Verified APIs (Confirmed Working in 2026)](#verified-apis)
2. [Region-Specific APIs (No Key Required)](#region-specific-apis)
3. [Commercial APIs with Free Tier (Key Required)](#commercial-apis)
4. [Deprecated/Defunct APIs](#deprecated)
5. [Summary Comparison](#comparison)

---

## Verified APIs

### 1. Open-Meteo

**Endpoint:** `https://api.open-meteo.com/v1/forecast`

**Hourly Forecast:** Up to 16 days (up to 72 hours for hourly data)

**Coverage:** Worldwide

**Data Available:**
- Temperature (multiple levels: 2m, 80m, 120m, 180m)
- Apparent temperature
- Humidity, dew point
- Wind speed/direction/gusts (multiple heights)
- Precipitation (rain, showers, snowfall, probability)
- Cloud cover (total, low, mid, high)
- Pressure (MSL and surface)
- Solar radiation (shortwave, direct, diffuse, tilted irradiance)
- Visibility
- Soil temperature/moisture
- UV index
- Weather codes (WMO)
- 15-minute resolution for HRRR/ICON-D2/AROME models

**Authentication:** None required

**Rate Limit:** < 10,000 daily API calls (non-commercial), no strict per-second limit

**Commercial Use:** Requires `apikey` parameter with `customer-` prefix

**Self-hosted:** Available

**Weather Models Aggregated:** ICON, GFS, HRRR, ARPEGE, AROME, IFS, AIFS, UKMO, KMA, MSM/GSM, ICON CH, MET Nordic, GEM, ACCESS-G, GFS GRAPES, HARMONIE, ARPAE

**Example Request:**
```
GET https://api.open-meteo.com/v1/forecast?latitude=40.7128&longitude=-74.0060&hourly=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m&forecast_days=3
```

**Documentation:** https://open-meteo.com/en/docs

---

### 2. Weather.gov (NWS API)

**Endpoint:** `https://api.weather.gov`

**Hourly Forecast:** Up to ~48 hours hourly, via `/gridpoints/{wfo}/{x},{y}/forecast/hourly`

**Coverage:** United States only

**Data Available:**
- Temperature (hourly, with trends)
- Dewpoint, relative humidity
- Wind speed/direction/gust (including 20-foot wind)
- Sky cover, cloud layers
- Weather phenomena with coverage and intensity
- Probability of precipitation
- Quantitative precipitation forecast
- Ice accumulation, snowfall amount
- Visibility, ceiling height
- Lightning activity level
- Haines index
- Atmospheric dispersion index

**Authentication:** User-Agent header required (no API key)

**Rate Limit:** No strict limit for well-behaved clients; each User-Agent tracked separately

**Caching:** Responses include `Cache-Control: private, no-cache`; cache for 10+ minutes

**Content Negotiation:** GeoJSON, JSON-LD, CAP XML, Atom XML, SSML, DWML

**Example Request:**
```
GET /gridpoints/OKX/73,77/forecast/hourly
Accept: application/geo+json
User-Agent: MyApp/1.0 (dev@example.com)
```

**Documentation:** https://weather-gov.github.io/api/

---

### 3. MET Norway WeatherAPI

**Endpoint:** `https://api.met.no`

**Hourly Forecast:** Up to 14 days hourly (LocationForecast 2.0), up to 10 days medium-range

**Coverage:** Worldwide (best accuracy for Nordic/Arctic regions)

**Data Available:**
- Air temperature at various heights (2m, 10m, 80m, etc.)
- Wind speed/direction at multiple levels (including gusts)
- Precipitation amount (1-hour intervals with probability of precipitation)
- Cloud area fraction (total, low, mid, high)
- Relative humidity, dew point
- Air pressure at sea level and surface
- Solar radiation / UV index
- Fog indicator
- Symbol codes (weather classification: partlycloudy_day, rain, snow, etc.)
- Min/max temperature for period intervals
- Probability of thunder

**Authentication:** None required (User-Agent header **REQUIRED** per terms)

**Rate Limit:** Under 20 requests/second requires no special agreement. Mobile apps count total traffic from ALL installations. Over 20 req/s needs special agreement.

**Caching:** Respects `Expires` and `If-Modified-Since` headers; recommended cache for 10+ minutes

**Weather Models by Region:**
- **Nordic:** MEPS model, 2.5km resolution, updated every hour (short-term), ECMWF ensemble for medium-range
- **Arctic:** AROME-Arctic model, 2.5km resolution, updated 4x/day
- **Rest of World:** ECMWF model, ~9km resolution, updated 4x/day

**Additional Endpoints:**
- **Sunrise/Sunset:** `GET https://api.met.no/weatherapi/sunrise/3.0/sun.json?lat={LAT}&lon={LON}` — sunrise, sunset, twilight, moon events
- **Weather Alerts:** `GET https://api.met.no/weatherapi/metalerts/2.0/geojson?lat={LAT}&lon={LON}` — Nordic weather alerts (GeoJSON)
- **Marine Forecast:** `GET https://api.met.no/weatherapi/oceanforecast/2.0/compact?lat={LAT}&lon={LON}` — ocean/wave/current data
- **Nowcast:** `GET https://api.met.no/weatherapi/nowcast/1.0/compact?lat={LAT}&lon={LON}` — short-term Nordic nowcast

**Important Notes:**
- Missing or generic User-Agent (e.g., "wget/1.12") will result in 403 Forbidden
- Truncate coordinates to max 4 decimals; more precision triggers 403 errors
- CORS is supported (`Access-Control-Allow-Origin: *`)
- Data licensed under CC BY 4.0 and NLOD 2.0

**Example Request:**
```
GET https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=40.7128&lon=-74.0060
User-Agent: MyApp/1.0 (dev@example.com)
```

**Documentation:** https://docs.api.met.no/doc/

**Full Implementation Guide:** rag-docs/MET_Norway-api.md

---

### 4. ECCC — HRDPS Realtime Forecast (Environment and Climate Change Canada)

**Endpoint:** `https://api.weather.gc.ca`

**Hourly Forecast:** Up to ~72 hours hourly (HRDPS model, Canada-specific)

**Coverage:** Canada only

**Data Available:**
- Temperature at multiple levels
- Wind speed/direction at multiple levels
- Precipitation amount
- Cloud cover
- Relative humidity
- Pressure at sea level
- Visibility
- Weather codes
- Symbol codes (weather classification)

**Authentication:** None required

**Format:** GeoJSON (OGC API - Features compliant)

**Rate Limit:** No strict limit documented; recommended caching for 10+ minutes

**Example Request:**
```
GET https://api.weather.gc.ca/collections/prognos-hrdps-realtime/items?limit=1
Accept: application/geo+json
```

**Note:** This is an OGC API - Features endpoint. You can query by bbox, datetime, and other spatial-temporal parameters. The HRDPS model provides high-resolution forecasts for Canada.

**Documentation:** https://api.weather.gc.ca/collections/prognos-hrdps-realtime

---

## Region-Specific APIs

### 5. ECCC — Climate Hourly (Canada)

**Endpoint:** `https://api.weather.gc.ca`

**Hourly Forecast:** Up to ~48 hours hourly

**Coverage:** Canada only

**Data Available:**
- Temperature
- Dewpoint
- Wind speed/direction
- Humidity
- Pressure
- Precipitation

**Authentication:** None required

**Format:** GeoJSON (OGC API - Features)

**Example Request:**
```
GET https://api.weather.gc.ca/collections/climate-hourly/items?limit=1
Accept: application/geo+json
```

---

### 6. ECCC — City Page Weather Realtime (Canada)

**Endpoint:** `https://api.weather.gc.ca`

**Hourly Forecast:** Up to ~48 hours hourly for major Canadian cities

**Coverage:** Canada only (major cities)

**Data Available:**
- Temperature, feels-like
- Humidity
- Wind speed/direction/gusts
- Precipitation amount and type
- Cloud cover
- Visibility
- Weather conditions with text descriptions

**Authentication:** None required

**Format:** GeoJSON (OGC API - Features)

**Example Request:**
```
GET https://api.weather.gc.ca/collections/citypageweather-realtime/items?limit=1
Accept: application/geo+json
```

---

### 7. ECCC — Marine Weather Realtime (Canada)

**Endpoint:** `https://api.weather.gc.ca`

**Hourly Forecast:** Up to ~48 hours hourly for marine areas

**Coverage:** Canada only (marine/coastal zones)

**Data Available:**
- Temperature, feels-like
- Wind speed/direction/gusts (including wave height)
- Wave height and period
- Precipitation
- Visibility
- Fog conditions
- Weather conditions with text descriptions

**Authentication:** None required

**Format:** GeoJSON (OGC API - Features)

**Example Request:**
```
GET https://api.weather.gc.ca/collections/marineweather-realtime/items?limit=1
Accept: application/geo+json
```

---

### 8. Australian Bureau of Meteorology (BoM) — GridPoint Forecast

**Endpoint:** `https://www.bom.gov.au/fwo/`

**Hourly Forecast:** Up to 7 days hourly for Australian grid points

**Coverage:** Australia only

**Data Available:**
- Temperature (max/min/mean)
- Rainfall
- Wind speed/direction/gusts
- Relative humidity
- Evaporation
- Sunshine duration
- Cloud cover
- Weather codes

**Authentication:** None required — data is open under Creative Commons Attribution 4.0

**Format:** XML, JSON, CSV (varies by endpoint)

**Example Request:**
```
GET https://www.bom.gov.au/fwo/IDV60901/IDV60901.94783.json
```

**Documentation:** https://www.bom.gov.au/info/json/

---

### 9. ECCC — Weather Alerts (Canada)

**Endpoint:** `https://api.weather.gc.ca`

**Coverage:** Canada only

**Data Available:**
- Active weather alerts
- Watch/warning/advisory text
- Affected zones
- Effective/end times
- Severity, certainty, urgency

**Authentication:** None required

**Format:** GeoJSON (OGC API - Features)

**Example Request:**
```
GET https://api.weather.gc.ca/collections/weather-alerts/items?limit=1
Accept: application/geo+json
```

---

### 10. ECCC — AQHI Forecasts (Canada)

**Endpoint:** `https://api.weather.gc.ca`

**Hourly Forecast:** Up to 72 hours hourly

**Coverage:** Canada only

**Data Available:**
- Air Quality Health Index values
- Pollutant concentrations (O3, NO2, PM2.5)
- Health risk categories

**Authentication:** None required

**Format:** GeoJSON (OGC API - Features)

**Example Request:**
```
GET https://api.weather.gc.ca/collections/aqhi-forecasts-realtime/items?limit=1
Accept: application/geo+json
```

---

## Commercial APIs with Free Tier (Key Required)

These require an API key but have generous free tiers — included for reference.

### 11. WeatherAPI.com

**Endpoint:** `https://api.weatherapi.com/v1/forecast.json`

**Hourly Forecast:** Up to 72 hours hourly, up to 16 days daily

**Coverage:** Worldwide

**Data Available:**
- Temperature, feels-like
- Humidity, dew point
- Wind speed/direction/gusts
- Precipitation (amount + probability)
- Pressure, visibility
- UV index, cloud cover
- Air quality (AQI)
- Astronomy (sunrise/sunset/moon phase)

**Authentication:** API key required

**Free Tier:** 1 million calls/month

**Rate Limit:** 1000 calls/minute on free tier

**Documentation:** https://www.weatherapi.com/docs/

---

### 12. Tomorrow.io

**Endpoint:** `https://api.tomorrow.io/v4/timelines`

**Hourly Forecast:** Up to 10 days hourly

**Coverage:** Worldwide

**Data Available:**
- Temperature, feels-like
- Humidity, dew point
- Wind speed/direction/gusts
- Precipitation (amount + probability)
- Pressure, visibility
- UV index, cloud cover
- Air quality (AQI, pollutants)
- Lightning activity

**Authentication:** API key required

**Free Tier:** 500 calls/day

**Rate Limit:** Varies by plan

**Documentation:** https://docs.tomorrow.io/

---

### 13. OpenWeatherMap — One Call API

**Endpoint:** `https://api.openweathermap.org/data/3.0/onecall`

**Hourly Forecast:** Up to 7 days hourly

**Coverage:** Worldwide

**Data Available:**
- Temperature, feels-like
- Humidity, dew point
- Wind speed/direction/gusts
- Precipitation (amount + probability)
- Pressure, visibility
- UV index, ozone
- Cloud cover
- Weather codes

**Authentication:** API key required

**Free Tier:** One Call API requires paid plan — 60,000 calls/month

**Rate Limit:** Varies by plan

**Documentation:** https://openweathermap.org/api/one-call-3

---

### 14. WeatherBit.io

**Endpoint:** `https://api.weatherbit.io/v2.0/forecast/hourly`

**Hourly Forecast:** Up to 48 hours hourly, up to 16 days daily

**Coverage:** Worldwide

**Data Available:**
- Temperature, feels-like
- Humidity, dew point
- Wind speed/direction/gusts
- Precipitation (amount + probability)
- Pressure, visibility
- UV index, cloud cover
- Weather codes

**Authentication:** API key required

**Free Tier:** 200 calls/day

**Rate Limit:** Varies by plan

**Documentation:** https://www.weatherbit.io/api

---

## Deprecated/Defunct APIs

### Dark Sky API

**Status:** **DEPRECATED** — Shut down by Apple in March 2023. Legacy keys may still work but the service is no longer maintained.

---

## Summary Comparison

| API                   | Key Required?   | Coverage  | Hourly Duration | Data Richness | Rate Limit |
|-----------------------|-----------------|-----------|-----------------|---------------|------------|
| **Open-Meteo**        | No              | Worldwide | 72 hours hourly / 16 days daily | Very High | < 10,000/day |
| **Weather.gov (NWS)** | No (User-Agent) | US        | ~48 hours                       | Very High | No strict limit |
| **MET Norway**        | No (User-Agent) | Worldwide | 14 days hourly                  | High | 1 req/sec |
| **ECCC HRDPS**        | No              | Canada    | ~72 hours                       | High | Recommended cache |
| **ECCC Climate Hourly** | No            | Canada    | ~48 hours                       | Medium | Recommended cache |
| **BoM GridPoint**     | No              | Australia | 7 days hourly                   | High | None documented |
| WeatherAPI.com        | Yes             | Worldwide | 72 hours hourly                 | Very High | 1M/month free |
| Tomorrow.io           | Yes             | Worldwide | 10 days hourly                  | Very High | 500/day free |
| OpenWeatherMap One Call | Yes           | Worldwide | 7 days hourly                   | Very High | Paid only |
| WeatherBit.io        | Yes              | Worldwide | 48 hours hourly                 | Medium | 200/day free |

---

## Notes

- All verified APIs were tested and confirmed working as of June 14, 2026.
- The ECCC OGC API endpoint supports spatial-temporal filtering via query parameters (`bbox`, `datetime`). See the [OGC API - Features specification](https://docs.ogc.org/is/17-069r4/17-069r4.html) for details.
- Open-Meteo remains the most comprehensive keyless option with the widest coverage and data richness.
- For US-only applications, Weather.gov provides the richest data with no rate limits for well-behaved clients.
- For worldwide applications without API keys, Open-Meteo + MET Norway together provide complementary global coverage.