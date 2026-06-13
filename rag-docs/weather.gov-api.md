# NWS API (api.weather.gov) — Complete Reference

## Table of Contents
1. [Overview](#overview)
2. [Base URLs](#base-urls)
3. [Authentication & Headers](#authentication--headers)
4. [Content Negotiation](#content-negotiation)
5. [Point Resolution Workflow](#point-resolution-workflow)
6. [Endpoints](#endpoints)
   - [Points](#points)
   - [Gridpoint Forecast Data](#gridpoint-forecast-data)
   - [Zone Forecast Data](#zone-forecast-data)
   - [Alerts](#alerts)
   - [Observations](#observations)
   - [Stations](#stations)
   - [Products](#products)
   - [Offices](#offices)
   - [Aviation](#aviation)
   - [Radar](#radar)
   - [Radio (NWR)](#radio-nwr)
   - [Glossary](#glossary)
7. [Data Models](#data-models)
8. [Units of Measure](#units-of-measure)
9. [Date/Time Formats](#datetime-formats)
10. [Pagination](#pagination)
11. [Error Handling](#error-handling)
12. [Rate Limiting](#rate-limiting)
13. [Code Examples](#code-examples)
14. [Related Resources](#related-resources)

---

## Overview

The NWS API is a [linked data](https://www.weather.gov/documentation/services-web-api) RESTful API built on OpenAPI 3.1.2. It returns weather data in multiple formats and provides a discovery mechanism — each response includes links to related resources, enabling clients to navigate the API without hardcoding URLs.

**API Version:** 3.9.2  
**Base URL:** `https://api.weather.gov`  
**OpenAPI Spec:** `https://api.weather.gov/openapi.json`

---

## Base URLs

| Purpose | URL |
|---------|-----|
| API Root | `https://api.weather.gov/` |
| OpenAPI JSON | `https://api.weather.gov/openapi.json` |
| API Documentation | `https://www.weather.gov/documentation/services-web-api` |
| GitHub API Docs | `https://weather-gov.github.io/api/` |
| Specification (Swagger UI) | `https://api.weather.gov/` (serves Swagger UI) |

---

## Authentication & Headers

### User-Agent (Required)

All requests **must** include a `User-Agent` header. This is the **primary identification mechanism** — requests without a valid User-Agent may be rejected or rate-limited.

**Format:** `User-Agent: <app-name>/<version> (<contact>)`

```
User-Agent: MyWeatherApp/1.0 (dev@example.com)
```

**Requirements:**
- Must be a non-empty string
- Include your application name and version
- Include a contact email in parentheses
- Each distinct User-Agent string is tracked **separately** for rate limiting
- Abusive behavior from a specific User-Agent will be addressed for that User-Agent only
- If you notice unusual behavior, contact NWS at your provided email

**Recommended User-Agent patterns:**
```
User-Agent: MyApp/1.0 (contact: dev@example.com)
User-Agent: PythonWeather/2.1 (https://github.com/user/weather-app)
User-Agent: curl/8.0 (https://example.com)
```

### API Key (Testing)

A traditional API key system is being tested via the `API-Key` header:

```
API-Key: your-api-key-here
```

### Correlation & Request IDs

Every response includes these debugging headers:

| Header | Description |
|--------|-------------|
| `X-Request-Id` | Unique request identifier |
| `X-Correlation-Id` | Correlation identifier |
| `X-Server-Id` | Server that generated the response |

Include these in any correspondence with NWS.

---

## Content Negotiation

Most endpoints support multiple content types. The API uses HTTP content negotiation.

| Format | Media Type | Use Case |
|--------|-----------|----------|
| GeoJSON | `application/geo+json` | JavaScript/web clients, GIS data |
| JSON-LD | `application/ld+json` | Linked data, semantic web |
| CAP XML | `application/cap+xml` | Common Alerting Protocol |
| Atom XML | `application/atom+xml` | Alert feeds |
| SSML | `application/ssml+xml` | NOAA Weather Radio (speech synthesis) |
| DWML | `application/vnd.noaa.dwml+xml` | Digital Weather Markup Language |
| METAR | `application/vnd.noaa.obs+xml` | Observations |
| Binary | `image/png`, `image/jpeg` | Icons, satellite thumbnails, briefing PDFs |

### Example: Requesting GeoJSON

```
GET /points/39.0,-77.0 HTTP/1.1
Accept: application/geo+json
```

---

## Point Resolution Workflow

The `/points` endpoint is the **central discovery mechanism**. Given any latitude/longitude, it returns:

- The forecast office (`WFO`) and grid coordinates (`x`, `y`)
- Links to the forecast, hourly forecast, and grid data
- The forecast zone and county
- Observation stations
- Time zone
- Radar station
- Astronomical data (sunrise/sunset)
- NOAA Weather Radio info

### Workflow

```
1. GET /points/{lat},{lon}
   → Returns: { forecast: "/gridpoints/OKX/73,77/forecast",
                  forecastGridData: "/gridpoints/OKX/73,77",
                  forecastHourly: "/gridpoints/OKX/73,77/forecast/hourly",
                  observationStations: "...",
                  forecastZone: "...",
                  county: "...",
                  fireWeatherZone: "...",
                  radarStation: "...",
                  timeZone: "...",
                  ... }

2. GET /gridpoints/OKX/73,77/forecast
   → Returns: 12-hour forecast periods

3. GET /gridpoints/OKX/73,77/forecast/hourly
   → Returns: hourly forecast periods

4. GET /gridpoints/OKX/73,77
   → Returns: raw numerical data layers (temperature, dewpoint, wind, etc.)

5. GET /gridpoints/OKX/73,77/stations
   → Returns: nearest observation stations
```

### Point Endpoint

```
GET /points/{latitude},{longitude}
```

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `latitude` | number | Yes | Latitude (-90 to 90), precision 0.0001 |
| `longitude` | number | Yes | Longitude (-180 to 180), precision 0.0001 |

**Response fields of interest:**
- `cwa` — NWS warning forecast office (3-letter code)
- `forecastOffice` — API URI to the forecast office
- `gridId` — Grid identifier (same as WFO code)
- `gridX`, `gridY` — Grid coordinates
- `forecast` — URI to zone forecast
- `forecastHourly` — URI to hourly forecast
- `forecastGridData` — URI to raw grid data
- `observationStations` — URI to nearby stations
- `forecastZone` — UGC forecast zone ID
- `county` — UGC county zone ID
- `fireWeatherZone` — UGC fire weather zone ID
- `timeZone` — IANA time zone identifier
- `radarStation` — Primary radar station ID
- `astronomicalData` — Sunrise, sunset, twilight data
- `nwr` — NOAA Weather Radio transmitter info
- `type` — `"land"` or `"marine"`

---

## Endpoints

### Points

#### `GET /points/{lat},{lon}`

Returns metadata about a geographic point.

#### `GET /points/{lat},{lon}/radio`

Returns NOAA Weather Radio broadcast script in SSML format. Useful for TTS (text-to-speech) applications.

#### `GET /points/{lat},{lon}/stations` (deprecated)

Returns observation stations for a point. Redirects to `/gridpoints/{wfo}/{x},{y}/stations`.

---

### Gridpoint Forecast Data

#### `GET /gridpoints/{wfo}/{x},{y}`

Returns raw numerical forecast data for a 2.5 km grid square. Contains 30+ data layers.

**Data layers include:**
- `temperature`, `dewpoint`, `maxTemperature`, `minTemperature`
- `relativeHumidity`, `apparentTemperature`, `heatIndex`, `windChill`, `wetBulbGlobeTemperature`
- `skyCover`, `windDirection`, `windSpeed`, `windGust`
- `weather` — Weather phenomena with coverage, intensity, visibility
- `hazards` — Watches and advisories
- `probabilityOfPrecipitation`, `quantitativePrecipitation`
- `iceAccumulation`, `snowfallAmount`, `snowLevel`
- `ceilingHeight`, `visibility`
- `transportWindSpeed`, `transportWindDirection`, `mixingHeight`
- `hainesIndex`, `lightningActivityLevel`
- `twentyFootWindSpeed`, `twentyFootWindDirection`
- `waveHeight`, `wavePeriod`, `waveDirection`
- `pressure`, `graslandFireDangerIndex`
- `probabilityOfThunder`, `davisStabilityIndex`
- `atmosphericDispersionIndex`, `stability`, `redFlagThreatIndex`

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `Feature-Flags` (header) | string[] | Enable features: `forecast_temperature_qv`, `forecast_wind_speed_qv` |

#### `GET /gridpoints/{wfo}/{x},{y}/forecast`

Returns a 12-hour textual forecast.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `units` | `us` or `si` | `us` | US customary or SI (metric) units |
| `Feature-Flags` (header) | string[] | — | Feature flags |

**Response:** Array of `Gridpoint12hForecastPeriod` objects:
- `number` — Sequential period number
- `name` — e.g., "Tuesday Night"
- `startTime`, `endTime` — ISO 8601 datetime
- `isDaytime` — Boolean
- `temperature` — High/low temperature
- `temperatureUnit` — `"F"` or `"C"` (deprecated)
- `temperatureTrend` — `"rising"` or `"falling"`
- `probabilityOfPrecipitation` — Quantitative value
- `dewpoint` — Hourly only
- `relativeHumidity` — Hourly only
- `windSpeed` — e.g., "10 to 15 mph"
- `windGust` — e.g., "25 mph"
- `windDirection` — 16-point compass
- `shortForecast` — e.g., "Mostly Sunny"
- `detailedForecast` — Full paragraph forecast

#### `GET /gridpoints/{wfo}/{x},{y}/forecast/hourly`

Same as `/forecast` but with 1-hour periods.

#### `GET /gridpoints/{wfo}/{x},{y}/stations`

Returns observation stations usable for the grid area.

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | int | 500 | Max results (1–500) |

---

### Zone Forecast Data

#### `GET /zones/{type}/{zoneId}`

Returns metadata about a zone.

**Zone types:** `forecast`, `public`, `coastal`, `offshore`, `fire`, `county`, `marine`, `land`

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `effective` | datetime | Effective date/time |
| `include_geometry` | boolean | Include GeoJSON geometry |

#### `GET /zones/{type}/{zoneId}/forecast`

Returns the current zone forecast.

#### `GET /zones/{type}/{zoneId}/observations`

Returns observations for a zone.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `start` | datetime | Start date/time |
| `end` | datetime | End date/time |
| `limit` | int | Max results (1–500) |

#### `GET /zones/{type}/{zoneId}/stations`

Returns observation stations for a zone.

#### `GET /zones`

Returns a list of zones.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string[] | Zone IDs |
| `area` | string[] | State/marine area codes |
| `region` | string[] | Region codes |
| `type` | string[] | Zone types |
| `point` | string | Point (lat,lon) |
| `include_geometry` | boolean | Include geometry |
| `limit` | int | Max results |
| `effective` | datetime | Effective date/time |

#### `GET /zones/{type}`

Returns zones of a specific type.

---

### Alerts

#### `GET /alerts`

Returns all alerts with extensive filtering.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `active` | boolean | List only active alerts (deprecated; use `/alerts/active`) |
| `start` | datetime | Start time |
| `end` | datetime | End time |
| `status` | string[] | Status: `actual`, `exercise`, `system`, `test`, `draft` |
| `message_type` | string[] | Type: `alert`, `update`, `cancel` |
| `event` | string[] | Event name |
| `code` | string[] | Event code (3-letter) |
| `area` | string[] | State/marine area codes |
| `point` | string | Point (lat,lon) |
| `region` | string[] | Marine region codes |
| `region_type` | string | `land` or `marine` |
| `zone` | string[] | UGC zone IDs |
| `urgency` | string[] | Urgency: `immediate`, `expected`, `future`, `past`, `unknown` |
| `severity` | string[] | Severity: `extreme`, `severe`, `moderate`, `minor`, `unknown` |
| `certainty` | string[] | Certainty: `observed`, `likely`, `possible`, `unlikely`, `unknown` |
| `limit` | int | Max results (1–500) |
| `cursor` | string | Pagination cursor |

#### `GET /alerts/active`

Returns currently active alerts. Returns a **FeatureCollection** (not a ProblemDetails object).

**Query Parameters:** Same as `/alerts`, with one important caveat:
- The `limit` parameter is **NOT** supported on `/alerts/active` (returns `400 BadRequest`). Use `/alerts` with `active=true` and `limit` instead.
- The response does **NOT** include a `pagination` object (no cursor-based pagination).

**Important Notes:**
- `/alerts/active` redirects internally to `/alerts?active=true`
- `/alerts` and `/alerts/active` do **NOT** contain SPC's SEL product for Tornado Watches
- Tornado Watch alerts are derived from the local WFO's WCN product
- See [Alerts Geolocation Guide](https://www.weather.gov/media/documentation/docs/NWS_Geolocation.pdf) for UGC-based filtering details

#### `GET /alerts/active/count`

Returns counts of active alerts by category. Response format:
```json
{
  "total": 317,
  "land": 141,
  "marine": 176,
  "regions": { "AL": 150, "AT": 6, "GL": 10, "PA": 10 },
  "areas": { "AK": 4, "CA": 23, "FL": 1, ... },
  "zones": { "AKC070": 1, "AKC185": 1, "OKC029": 2, ... }
}
```
- `total` — Total active alerts
- `land` — Alerts affecting land zones
- `marine` — Alerts affecting marine zones
- `regions` — Alerts by marine region (AL, AT, GL, GM, PA, PI)
- `areas` — Alerts by state/territory/marine area code
- `zones` — Alerts by NWS public zone or county code (keyed by UGC code)

#### `GET /alerts/active/zone/{zoneId}`

Active alerts for a specific NWS public zone or county.

#### `GET /alerts/active/area/{area}`

Active alerts for a state/marine area.

#### `GET /alerts/active/region/{region}`

Active alerts for a marine region.

#### `GET /alerts/types`

Returns a list of recognized event types.

#### `GET /alerts/{id}`

Returns a specific alert by ID.

**Important Notes:**
- `/alerts/active` redirects internally to `/alerts?active=true`
- `/alerts` and `/alerts/active` do **NOT** contain SPC's SEL product for Tornado Watches
- Tornado Watch alerts are derived from the local WFO's WCN product
- See [Alerts Geolocation Guide](https://www.weather.gov/media/documentation/docs/NWS_Geolocation.pdf) for UGC-based filtering details

---

### Observations

#### `GET /stations/{stationId}/observations`

Returns a list of observations for a station.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `start` | datetime | Start time |
| `end` | datetime | End time |
| `limit` | int | Max results (1–500) |
| `cursor` | string | Pagination cursor |

#### `GET /stations/{stationId}/observations/latest`

Returns the latest observation.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `require_qc` | boolean | Require quality control |

#### `GET /stations/{stationId}/observations/{time}`

Returns a specific historical observation.

**Parameter:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `time` | datetime | Timestamp of requested observation |

#### `GET /stations`

Returns a list of observation stations.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string[] | Filter by station ID |
| `state` | string[] | Filter by state/marine area |
| `limit` | int | Max results |
| `cursor` | string | Pagination cursor |

#### `GET /stations/{stationId}`

Returns metadata about a station.

**Response fields:**
- `stationIdentifier` — e.g., "KOKC"
- `name` — Station name
- `timeZone` — IANA time zone
- `provider` — Data provider (e.g., "ASOS", "MesoWest")
- `subProvider` — Sub-provider (e.g., "FAA")
- `forecast` — Link to forecast zone
- `county` — Link to county zone
- `fireWeatherZone` — Link to fire weather zone
- `distance`, `bearing` — Relative to query point
- `elevation` — Station elevation

---

### Products

#### `GET /products`

Returns a list of text products.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `location` | string[] | Location ID |
| `start` | datetime | Start time |
| `end` | datetime | End time |
| `office` | string[] | Issuing office (4-letter codes) |
| `wmoid` | string[] | WMO ID code |
| `type` | string[] | Product code (3-letter) |
| `limit` | int | Max results (1–500) |

#### `GET /products/locations`

Returns valid text product issuance locations.

#### `GET /products/types`

Returns valid text product types and codes.

#### `GET /products/{productId}`

Returns a specific text product.

#### `GET /products/types/{typeId}`

Returns products of a given type.

#### `GET /products/types/{typeId}/locations`

Returns locations that issue a given product type.

#### `GET /products/locations/{locationId}/types`

Returns product types for a given location.

#### `GET /products/types/{typeId}/locations/{locationId}`

Returns products of a type from a specific location.

#### `GET /products/types/{typeId}/locations/{locationId}/latest`

Returns the latest product of a type from a location.

**Key product types:**
| Code | Name |
|------|------|
| `SEL` | SPC SEL Product (Tornado Watches) |
| `WCN` | WFO Watch Confirmation Notice |
| `FFA` | Flash Flood Watch |
| `FFW` | Flash Flood Warning |
| `SVR` | Severe Thunderstorm Warning |
| `TOR` | Tornado Warning |
| `WSW` | Winter Storm Warning |
| `HWO` | Hazardous Weather Outlook |
| `ZFP` | Zone Forecast Product |

---

### Offices

#### `GET /offices/{officeId}`

Returns metadata about a NWS forecast office.

**Response fields:**
- `id` — 3-letter office code
- `name` — Office name
- `address` — Street address
- `telephone`, `faxNumber`, `email`
- `sameAs` — Website URL
- `nwsRegion` — NWS region (AR, CR, ER, PR, SR, WR)
- `parentOrganization` — Parent org link
- `responsibleCounties` — County zones
- `responsibleForecastZones` — Forecast zones
- `responsibleFireZones` — Fire zones
- `approvedObservationStations` — Station list

#### `GET /offices/{officeId}/briefing`

Returns active briefing for an office.

#### `GET /offices/{officeId}/briefing/download/latest`

Returns the latest briefing (redirect to PDF).

#### `GET /offices/{officeId}/briefing/download/{briefingId}`

Returns a specific briefing PDF.

#### `GET /offices/{officeId}/headlines`

Returns news headlines for an office.

#### `GET /offices/{officeId}/headlines/{headlineId}`

Returns a specific headline.

#### `GET /offices/{officeId}/weatherstories`

Returns active weather stories.

#### `GET /offices/{officeId}/weatherstories/download/{imageId}`

Returns a weather story image.

---

### Aviation

#### `GET /aviation/sigmets`

Returns SIGMET/AIRMETs.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `start` | datetime | Start time |
| `end` | datetime | End time |
| `date` | date | Date (YYYY-MM-DD) |
| `atsu` | string | ATSU identifier |
| `sequence` | string | SIGMET sequence number |

#### `GET /aviation/sigmets/{atsu}`

SIGMETs for a specific ATSU.

#### `GET /aviation/sigmets/{atsu}/{date}`

SIGMETs for a specific ATSU on a date.

#### `GET /aviation/sigmets/{atsu}/{date}/{time}`

A specific SIGMET/AIRMET.

**Parameter:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `time` | string | Time in HHMM UTC |

#### `GET /aviation/cwsus/{cwsuId}`

Returns metadata about a Center Weather Service Unit.

#### `GET /aviation/cwsus/{cwsuId}/cwas`

Returns Center Weather Advisories from a CWSU.

#### `GET /aviation/cwsus/{cwsuId}/cwas/{date}/{sequence}`

A specific CWA.

**CWSU codes:** ZAB, ZAN, ZAU, ZBW, ZDC, ZDV, ZFA, ZFW, ZHU, ZID, ZJX, ZKC, ZLA, ZLC, ZMA, ZME, ZMP, ZNY, ZOA, ZOB, ZSE, ZTL

#### `GET /stations/{stationId}/tafs`

Returns Terminal Aerodrome Forecasts.

#### `GET /stations/{stationId}/tafs/{date}/{time}`

A specific TAF.

---

### Radar

#### `GET /radar/servers`

Returns radar servers.

**Query Parameter:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `reportingHost` | string | Show records from specific host |

#### `GET /radar/servers/{id}`

Metadata about a radar server.

#### `GET /radar/stations`

Returns radar stations.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `stationType` | string[] | Station types |
| `reportingHost` | string | Reporting host |
| `host` | string | LDM host |

#### `GET /radar/stations/{stationId}`

Metadata about a radar station.

#### `GET /radar/stations/{stationId}/alarms`

Radar station alarms.

#### `GET /radar/queues/{host}`

Radar queue data.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | int | Record limit (1–50000) |
| `arrived` | interval | Arrival time range |
| `created` | interval | Creation time range |
| `published` | interval | Publish time range |
| `station` | string | Station identifier |
| `type` | string | Record type |
| `feed` | string | Originating product feed |
| `resolution` | int | Resolution version |

#### `GET /radar/profilers/{stationId}`

Radar wind profiler data.

---

### Radio (NOAA Weather Radio)

#### `GET /radio/{callSign}/broadcast`

Returns NWR broadcast script for a transmitter in SSML format.

---

### Glossary

#### `GET /glossary`

Returns glossary terms.

---

## Data Models

### Alert

A public alert message conforming to NWS CAP v1.2 specification.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Alert identifier |
| `areaDesc` | string | Affected area description |
| `geocode.UGC` | string[] | NWS zone/county codes |
| `geocode.SAME` | string[] | SAME codes (6-digit) |
| `affectedZones` | string[] | API links to affected zones |
| `references` | object[] | Prior alerts this updates |
| `sent` | datetime | Origination time |
| `effective` | datetime | Effective time |
| `onset` | datetime | Expected start time |
| `expires` | datetime | Expiry time |
| `ends` | datetime | Expected end time |
| `status` | string | `actual`, `exercise`, `system`, `test`, `draft` |
| `messageType` | string | `alert`, `update`, `cancel`, `ack`, `error` |
| `category` | string | `Met`, `Geo`, `Safety`, `Security`, `Rescue`, `Fire`, `Health`, `Env`, `Transport`, `Infra`, `CBRNE`, `Other` |
| `severity` | string | `extreme`, `severe`, `moderate`, `minor`, `unknown` |
| `certainty` | string | `observed`, `likely`, `possible`, `unlikely`, `unknown` |
| `urgency` | string | `immediate`, `expected`, `future`, `past`, `unknown` |
| `event` | string | Event type name |
| `sender` | string | Email of NWS webmaster |
| `senderName` | string | Originator name |
| `headline` | string | Alert headline |
| `description` | string | Event description |
| `instruction` | string | Recommended action |
| `note` | string | Notes (for test alerts) |
| `response` | string | `Shelter`, `Evacuate`, `Prepare`, `Execute`, `Avoid`, `Monitor`, `Assess`, `AllClear`, `None` |
| `parameters` | object | Additional parameters |
| `scope` | string | `Public`, `Restricted`, `Private` |
| `code` | string | Special handling code |
| `language` | string | Language code |
| `web` | string | Link to additional info |
| `eventCode` | object | Event codes |

### Observation

| Field | Type | Description |
|-------|------|-------------|
| `temperature` | QuantitativeValue | Air temperature |
| `dewpoint` | QuantitativeValue | Dewpoint temperature |
| `windDirection` | QuantitativeValue | Wind direction in degrees |
| `windSpeed` | QuantitativeValue | Wind speed |
| `windGust` | QuantitativeValue | Wind gust speed |
| `barometricPressure` | QuantitativeValue | Barometric pressure |
| `seaLevelPressure` | QuantitativeValue | Sea level pressure |
| `visibility` | QuantitativeValue | Visibility distance |
| `maxTemperatureLast24Hours` | QuantitativeValue | Max temp (24h) |
| `minTemperatureLast24Hours` | QuantitativeValue | Min temp (24h) |
| `precipitationLastHour` | QuantitativeValue | Precipitation (1h) |
| `precipitationLast3Hours` | QuantitativeValue | Precipitation (3h) |
| `precipitationLast6Hours` | QuantitativeValue | Precipitation (6h) |
| `relativeHumidity` | QuantitativeValue | Relative humidity |
| `windChill` | QuantitativeValue | Wind chill |
| `heatIndex` | QuantitativeValue | Heat index |
| `cloudLayers` | object[] | Cloud layers (amount + base) |
| `presentWeather` | MetarPhenomenon[] | Current weather phenomena |
| `rawMessage` | string | Raw METAR string |
| `textDescription` | string | Textual weather description |
| `icon` | string | Icon URL (deprecated) |

### Zone

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | UGC zone ID (e.g., "OKC027") |
| `type` | string | Zone type |
| `name` | string | Zone name |
| `effectiveDate` | datetime | Effective date |
| `expirationDate` | datetime | Expiration date |
| `state` | string | State code |
| `forecastOffice` | string | Office API URI |
| `gridIdentifier` | string | Grid ID |
| `awipsLocationIdentifier` | string | AWIPS location ID |
| `cwa` | string[] | Warning forecast office |
| `timeZone` | string[] | Time zones |
| `observationStations` | string[] | Station URIs |
| `radarStation` | string | Radar station |
| `geometry` | string | WKT geometry |

### Point

| Field | Type | Description |
|-------|------|-------------|
| `cwa` | string | Warning forecast office |
| `type` | string | `land` or `marine` |
| `forecastOffice` | string | Forecast office URI |
| `gridId` | string | Grid ID |
| `gridX`, `gridY` | int | Grid coordinates |
| `forecast` | string | Forecast URI |
| `forecastHourly` | string | Hourly forecast URI |
| `forecastGridData` | string | Grid data URI |
| `observationStations` | string | Stations URI |
| `relativeLocation` | object | Nearest city/state |
| `forecastZone` | string | Forecast zone URI |
| `county` | string | County zone URI |
| `fireWeatherZone` | string | Fire weather zone URI |
| `timeZone` | string | IANA time zone |
| `radarStation` | string | Radar station |
| `astronomicalData` | object | Sunrise/sunset data |
| `nwr` | object | NWR transmitter info |

### Gridpoint

Raw numerical forecast data with layers:
- `updateTime` — Last update time
- `validTimes` — ISO 8601 interval
- `elevation` — Elevation
- `forecastOffice` — Office URI
- `gridId`, `gridX`, `gridY` — Grid location
- `weather` — Weather phenomena data
- `hazards` — Watch/advisory data
- Plus all quantitative layers (temperature, dewpoint, wind, etc.)

---

## Units of Measure

Units follow the format `{namespace}:{unit}` or just `{unit}`.

| Namespace | Source |
|-----------|--------|
| `wmo` / `wmoUnit` | WMO Codes Registry (http://codes.wmo.int/common/unit/{unit}) |
| `nwsUnit` | Custom NWS units |
| `uc` / none | Unified Code for Units of Measure (https://unitsofmeasure.org/) |

Common units:
- `m/s` — Meters per second
- `km/h` — Kilometers per hour
- `degC` / `degF` — Temperature
- `mm` / `in` — Millimeters / inches
- `hPa` / `inHg` — Pressure
- `km` / `mi` — Distance
- `%` — Percentage
- `deg` — Degrees

---

## Date/Time Formats

### ISO 8601 Interval

Used extensively in gridpoint data and queries:

```
2007-03-01T13:00:00Z/2008-05-11T15:30:00Z    # Start and end
2007-03-01T13:00:00Z/P1Y2M10DT2H30M           # Start and duration
P1Y2M10DT2H30M/2008-05-11T15:30:00Z           # Duration and end
NOW/P1D                                          # Now for 1 day
P1D/NOW                                          # 1 day from now
```

### Date

`YYYY-MM-DD` format.

### Time

`HHMM` in UTC (Zulu time). Example: `1430` = 14:30 UTC.

### Date-Time

ISO 8601 datetime. Example: `2026-06-12T23:30:00Z`

---

## Pagination

The API uses cursor-based pagination.

### How It Works

1. Response includes a `pagination` object with a `next` field
2. `next` contains the URI for the next page
3. Some endpoints also accept a `cursor` query parameter

### Example

```
GET /alerts?limit=10
Response:
{
  "pagination": {
    "next": "https://api.weather.gov/alerts?cursor=abc123&limit=10"
  },
  "features": [...]
}
```

### Limit Parameter

Most endpoints support `limit` (1–500, default 500).

---

## Error Handling

The API uses [RFC 7807](https://datatracker.ietf.org/doc/html/rfc7807) Problem Details format:

```json
{
  "type": "urn:noaa:nws:api:UnexpectedProblem",
  "title": "Unexpected Problem",
  "status": 500,
  "detail": "An unexpected problem has occurred.",
  "instance": "urn:noaa:nws:api:request:493c3a1d-f87e-407f-ae2c-24483f5aab63",
  "correlationId": "493c3a1d-f87e-407f-ae2c-24483f5aab63"
}
```

Common status codes:
- `200` — Success
- `301` — Redirect (common for filtered alerts)
- `302` — Redirect (briefing downloads)
- `400` — Bad request
- `404` — Not found
- `500` — Internal server error

---

## Rate Limiting & Throttling

The API imposes **no strict rate limits** for well-behaved clients. The primary mechanisms are:

### User-Agent Tracking
- Each distinct `User-Agent` string is tracked separately
- Abusive behavior from a specific User-Agent is addressed independently
- Use a meaningful User-Agent so NWS can contact you

### Caching
- Responses include `Cache-Control: private, no-cache` headers
- Responses include an `Expires` header (typically ~1 hour ahead)
- The API uses **conditional caching** — responses may be cached by intermediate proxies
- **Recommendation:** Cache responses for at least **10 minutes** for stable data (zones, stations, offices), **1-5 minutes** for dynamic data (forecasts, alerts, observations)
- Use `If-Modified-Since` / `304` responses where supported to reduce bandwidth
- Gridpoint data expires when forecasts are updated (~hourly)

### Known Data Issues
| Issue | Description | Status |
|-------|-------------|--------|
| MADIS 24h temps | Stations outside central time zone show missing (null) 24h max/min temperatures | Ongoing |
| Observation delays | Observations may be delayed up to 20 minutes from MADIS due to QC processing | Ongoing |
| Precipitation rounding | Values < 0.4" may be rounded down to 0 in observations | Resolved (Dec 2025) |
| Variable wind XML | XML requests to `/observations/latest` failed for VRB winds | Resolved (May 2025) |
| PoP null values | PoP < 20% in 12h forecast showed null | Resolved (May 2025) |
| Ellipsis in ZFP | Extra ellipses in forecast zone text product | Resolved (May 2025) |

### Throttling Guidelines
| Scenario | Recommendation |
|----------|---------------|
| Typical usage | No throttling expected |
| High-frequency polling | Use 10+ second intervals |
| Bulk fetching (stations, zones) | Use `limit` parameter to reduce request count |
| Concurrent requests | No hard limit; use reasonable concurrency |
| Alert monitoring | Poll `/alerts/active` every 30-60 seconds |
| Gridpoint data | Cache for 10+ minutes (data updates ~hourly) |

### Rate Limit Details (from live testing)
- Exceeding the rate limit returns a **400 error** (not 429)
- Retry after the limit clears (typically within **5 seconds**)
- **Proxies are more likely to hit the limit** than direct client requests
- Each distinct `User-Agent` is tracked separately

### API Key (Testing)
A traditional API key system is being tested via the `API-Key` header. It may become the primary identification mechanism in the future.

```
API-Key: your-api-key-here
```

### Response Headers
Every response includes these debugging headers — include them in any correspondence with NWS:

| Header | Description |
|--------|-------------|
| `X-Request-Id` | Unique request identifier |
| `X-Correlation-Id` | Correlation identifier |
| `X-Server-Id` | Server that generated the response |

### Best Practices
1. **Always include a User-Agent** — required, not optional
2. **Cache aggressively** — most data is valid for minutes to hours
3. **Use `limit` parameter** — reduce request count when fetching lists
4. **Follow links** — use the API's discovery mechanism instead of hardcoding URLs
5. **Contact NWS** — if you notice unusual behavior, email your contact address

### Outage Information
Outage information is communicated via NCEP Senior Duty Meteorologist (SDM) administrative messages:
- **WMO ID:** `NOUS42 KWNO`
- **Product Identifier:** `ADASDM`
- **Status page:** https://www.nco.ncep.noaa.gov/status/messages/

---

## Code Examples

### JavaScript/TypeScript

```typescript
// Get forecast for a location
const point = await fetch('https://api.weather.gov/points/39.0,-77.0').then(r => r.json());
const forecast = await fetch(point.properties.forecast).then(r => r.json());
const hourly = await fetch(point.properties.forecastHourly).then(r => r.json());

// Get current observations
const stations = point.properties.observationStations;
const latestObs = await fetch(`${stations}/stations/KOKC/observations/latest`).then(r => r.json());

// Get active alerts
const alerts = await fetch('https://api.weather.gov/alerts?active=true&severity=severe').then(r => r.json());

// Get zone forecast
const zoneForecast = await fetch('https://api.weather.gov/zones/forecast/OKC027/forecast').then(r => r.json());
```

### cURL Examples

```bash
# Point resolution
curl -H "User-Agent: MyApp/1.0 (dev@example.com)" \
  "https://api.weather.gov/points/39.0,-77.0"

# 12-hour forecast
curl -H "User-Agent: MyApp/1.0 (dev@example.com)" \
  "https://api.weather.gov/gridpoints/OKX/73,77/forecast?units=us"

# Hourly forecast
curl -H "User-Agent: MyApp/1.0 (dev@example.com)" \
  "https://api.weather.gov/gridpoints/OKX/73,77/forecast/hourly"

# Latest observation
curl -H "User-Agent: MyApp/1.0 (dev@example.com)" \
  "https://api.weather.gov/stations/KOKC/observations/latest"

# Active severe alerts
curl -H "User-Agent: MyApp/1.0 (dev@example.com)" \
  "https://api.weather.gov/alerts/active?severity=severe"

# Zone forecast
curl -H "User-Agent: MyApp/1.0 (dev@example.com)" \
  "https://api.weather.gov/zones/forecast/OKC027/forecast"

# All stations in a state
curl -H "User-Agent: MyApp/1.0 (dev@example.com)" \
  "https://api.weather.gov/stations?state=OK&limit=50"

# Products by type
curl -H "User-Agent: MyApp/1.0 (dev@example.com)" \
  "https://api.weather.gov/products/types/HWO?limit=10"

# Aviation SIGMETs
curl -H "User-Agent: MyApp/1.0 (dev@example.com)" \
  "https://api.weather.gov/aviation/sigmets?start=2026-06-12T00:00:00Z"

# NWR broadcast (SSML)
curl -H "User-Agent: MyApp/1.0 (dev@example.com)" \
  "https://api.weather.gov/radio/KTLX/broadcast"
```

### Python Example

```python
import requests

# Point resolution
point = requests.get('https://api.weather.gov/points/39.0,-77.0').json()
forecast = requests.get(point['properties']['forecast']).json()
hourly = requests.get(point['properties']['forecastHourly']).json()

# Active alerts
alerts = requests.get('https://api.weather.gov/alerts/active?severity=severe').json()

# Latest observation
obs = requests.get('https://api.weather.gov/stations/KOKC/observations/latest').json()
```

---

## Data Discovery (Linked Data)

Every response contains links to related resources:

```json
{
  "properties": {
    "@context": "https://geojson.org/geojson-ld/geojson-context.jsonld",
    "@id": "https://api.weather.gov/gridpoints/OKX/73,77",
    "forecastOffice": "https://api.weather.gov/offices/OKX",
    "forecast": "https://api.weather.gov/zones/forecast/OKC027",
    "county": "https://api.weather.gov/county/OKC027",
    "fireWeatherZone": "https://api.weather.gov/fire/OKC027",
    "observationStations": "https://api.weather.gov/stations"
  }
}
```

Follow the `@id` and other link fields to discover related resources without hardcoding paths.

---

## Related Resources

- **Alerts Geolocation Guide:** [https://www.weather.gov/media/documentation/docs/NWS_Geolocation.pdf](https://www.weather.gov/media/documentation/docs/NWS_Geolocation.pdf)
- **SCN 25-44 (Latest API Changes):** [https://www.weather.gov/media/notification/pdf_2025/scn25-44_API_latest_changesmay22_2025.pdf](https://www.weather.gov/media/notification/pdf_2025/scn25-44_API_latest_changesmay22_2025.pdf)
- **API GitHub:** [https://weather-gov.github.io/api/](https://weather-gov.github.io/api/)
- **Service Change Notices:** [https://www.weather.gov/notification/](https://www.weather.gov/notification/)
- **Glossary:** [https://api.weather.gov/glossary](https://api.weather.gov/glossary)
- **Radar Display:** [https://radar.weather.gov](https://radar.weather.gov)

---

## Key Zone/State/Marine Codes

### State/Territory Codes
AL, AK, AZ, AR, CA, CO, CT, DE, DC, FL, GA, HI, ID, IL, IN, IA, KS, KY, LA, ME, MD, MA, MI, MN, MS, MO, MT, NE, NV, NH, NJ, NM, NY, NC, ND, OH, OK, OR, PA, RI, SC, SD, TN, TX, UT, VT, VA, WA, WV, WI, WY, PR, VI, GU, AS, MP, FM, MH, PW

### Marine Area Codes
AM, AN, GM, LC, LE, LH, LM, LO, LS, PH, PK, PM, PS, PZ, SL

### Land Region Codes
AR (Alaska), CR (Central), ER (Eastern), PR (Pacific), SR (Southern), WR (Western)

### Marine Region Codes
AL (Alaska), AT (Atlantic), GL (Great Lakes), GM (Gulf of Mexico), PA (Eastern Pacific), PI (Central/Western Pacific)

### Zone ID Format
`{AREA}{TYPE}{NNN}` — e.g., `OKC027`, `OKZ027`
- First 2 letters: State or marine area code
- 3rd letter: `Z` = public/fire zone, `C` = county
- Last 3 digits: Zone number

---

## Coverage & Scope

### Geographic Coverage

The API covers **the entire United States and its territories**, plus marine areas:

- **Land zones** — All 50 states + DC, Puerto Rico, US Virgin Islands, Guam, American Samoa, Northern Mariana Islands, Federated States of Micronesia, Marshall Islands, Palau
- **Marine zones** — Atlantic (AT), Pacific (PA, PI), Gulf of Mexico (GM), Great Lakes (GL), Arctic (AN), Pacific (PK, PZ)
- **Alaska** — Covered via the AFG (Alaska Forecast Office) grid system; coordinates follow the same `/gridpoints/{wfo}/{x},{y}` pattern

### Grid System

- Uses a **2.5 km grid** with WFO-based coordinates
- Grid coordinates are **NOT** lat/lon — they are specific to the WFO's projection
- Grid IDs match the WFO code (e.g., `OKX`, `KEY`, `AFG`)
- Grid coordinates can be large numbers for Alaska (e.g., `AFG 376 347`)

### Data Limitations

- No strict global rate limits (User-Agent tracking)
- `limit` parameter: **1–500** on most endpoints (default 500)
- `limit` on `/radar/queues` accepts **1–50,000**
- `/alerts/active` does **NOT** support `limit` parameter
- `/alerts/active` does **NOT** return `pagination` in response
- `/alerts/active` returns a **FeatureCollection** directly
- Tornado Watches (SPC SEL) are **NOT** in `/alerts` — derived from WCN product
- Some endpoints may redirect (301/302) internally
