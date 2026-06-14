# MET Norway Weather API - Complete Implementation Guide

## Overview

The MET Norway API (api.met.no) is a free, open-source weather data API operated by The Norwegian Meteorological Institute. It was approved as a [Digital Public Good](https://www.met.no/en/archive/weather-data-from-met-norway-approved-as-digital-public-goods) by the UN-led Digital Public Goods Alliance.

**API Base URL:** `https://api.met.no`

**Documentation:** https://docs.api.met.no/doc/

**License:** Data licensed under CC BY 4.0 and NLOD 2.0. Weather icons licensed under MIT.

---

## Prerequisites - Required Headers

### User-Agent (REQUIRED)
All requests MUST include a descriptive User-Agent header with your application name, contact info, or URL. Requests without proper identification will be blocked (403 Forbidden).

```
User-Agent: hasWeather/1.0 (https://github.com/Yonneh0/hasWeather)
```

**Valid examples:**
- `"acmeweathersite.com support@acmaweathersite.com"`
- `"AcmeWeatherApp/0.9 github.com/acmeweatherapp"`

### HTTPS Only
Only HTTPS is supported. HTTP requests are redirected but may eventually be blocked.

---

## Endpoints

### 1. LocationForecast 2.0 (Main Weather Forecast) - VERIFIED WORKING

The primary endpoint for hourly weather forecasts. Returns comprehensive weather data including temperature, precipitation, wind, cloud cover, and more.

#### Compact Format
```
GET https://api.met.no/weatherapi/locationforecast/2.0/compact?lat={LAT}&lon={LON}
```

**Parameters:**
- `lat` - Latitude (truncate to max 4 decimals)
- `lon` - Longitude (truncate to max 4 decimals)

**Response Format:** JSON with both `compact.json` (core fields) and `complete.json` (all fields) data.

**Cache Headers:** Respects `Expires`, `Last-Modified`, and `If-Modified-Since` headers.

#### Complete Format
```
GET https://api.met.no/weatherapi/locationforecast/2.0/complete?lat={LAT}&lon={LON}
```

Returns the same data structure but includes all available variables (including percentile data).

**Data Sources by Region:**
- **Nordic:** MEPS model, 2.5km resolution, updated every hour (short-term), ECMWF ensemble for medium-range
- **Arctic:** AROME-Arctic model, 2.5km resolution, updated 4x/day
- **Rest of World:** ECMWF model, ~9km resolution, updated 4x/day

---

### 2. Sunrise 3.0 (Sun/Moon Events)

Returns sunrise, sunset, twilight, and moon events for a given location and date.

#### Sun Events
```
GET https://api.met.no/weatherapi/sunrise/3.0/sun.json?lat={LAT}&lon={LON}
```

**Parameters:**
- `lat` - Latitude (required)
- `lon` - Longitude (required)
- `date` - Date in ISO format YYYY-MM-DD (optional, defaults to today)
- `offset` - Timezone offset +/-HH:MM (optional, defaults to UTC)

#### Moon Events
```
GET https://api.met.no/weatherapi/sunrise/3.0/moon.json?lat={LAT}&lon={LON}
```

**Response Format:** GeoJSON with sun and moon events including:
- `sunrise` - Sun rise time
- `sunset` - Sun set time
- Various twilight periods (civil, nautical, astronomical)
- Moon phases and positions

---

### 3. MetAlerts 2.0 (Weather Alerts)

Returns weather alerts for a given location in GeoJSON format.

#### GeoJSON Format
```
GET https://api.met.no/weatherapi/metalerts/2.0/geojson?lat={LAT}&lon={LON}
```

**Parameters:**
- `lat` - Latitude (required)
- `lon` - Longitude (required)

#### CAP Format
```
GET https://api.met.no/weatherapi/metalerts/2.0/cap?lat={LAT}&lon={LON}
```

Returns alerts in Common Alerting Protocol format.

**Note:** Alerts are only available for the Nordic region and nearby areas.

---

### 4. OceanForecast 2.0 (Marine Weather)

Returns ocean/marine weather data including waves, currents, and sea ice.

```
GET https://api.met.no/weatherapi/oceanforecast/2.0/compact?lat={LAT}&lon={LON}
```

**Parameters:**
- `lat` - Latitude (required)
- `lon` - Longitude (required)

**Note:** Marine data is only available for ocean locations, not land coordinates.

---

### 5. Nowcast Data Model

Short-term nowcast data for the Nordic region.

```
GET https://api.met.no/weatherapi/nowcast/1.0/compact?lat={LAT}&lon={LON}
```

---

### 6. Subseasonal Forecast

Medium-range subseasonal forecast data.

```
GET https://api.met.no/weatherapi/subseasonal/1.0/compact?lat={LAT}&lon={LON}
```

---

### 7. WMS Maps (Weather Map Images)

Access weather map overlays via WMS protocol for use in mapping applications.

```
GET https://api.met.no/weatherapi/maps.html
```

Available layers include temperature, precipitation, wind, cloud cover, and more.

---

## Key Data Variables

### Instant Variables (Current Conditions)
| Variable | XML Tag | Unit | Description |
|----------|---------|------|-------------|
| air_pressure_at_sea_level | pressure | hPa | Sea level pressure |
| air_temperature | temperature | °C | Air temp at 2m |
| cloud_area_fraction | cloudiness | % | Total cloud cover |
| relative_humidity | humidity | % | Relative humidity at 2m |
| wind_from_direction | windDirection | degrees | Wind direction (0=North) |
| wind_speed | windSpeed | m/s | Wind speed at 10m (10min avg) |
| wind_speed_of_gust | windGust | m/s | Max gust at 10m (3s avg) |

### Period Variables (Forecast Intervals)
| Variable | XML Tag | Unit | Description |
|----------|---------|------|-------------|
| symbol_code | symbol | string | Weather icon code |
| precipitation_amount | precipitation | mm | Expected precipitation |
| air_temperature_max | maxTemperature | °C | Max temp for period |
| air_temperature_min | minTemperature | °C | Min temp for period |

### Availability by Region
- **Nordic:** All variables, short-term (1h steps) + medium-range (6h steps)
- **Global:** Core variables only, no percentile data
- **Arctic:** Similar to Nordic but updated 4x/day

---

## Rate Limits and Best Practices

### Traffic Limits
- **Under 20 requests/second:** No special agreement needed (total across all clients)
- **Over 20 requests/second:** Requires special agreement from MET Norway
- **Mobile apps:** Total traffic from ALL installations counts toward limit

### Best Practices
1. **Always include a descriptive User-Agent** - Missing or generic User-Agents get blocked
2. **Cache responses locally** - Use `Expires` and `If-Modified-Since` headers
3. **Don't request at exact intervals** - Add random jitter to avoid synchronized traffic spikes
4. **Truncate coordinates to 4 decimals** - More precision is unnecessary and may trigger 403 errors
5. **Use a proxy for mobile apps** - Don't call API directly from apps to protect user IPs
6. **Don't request continuously on mobile** - Only fetch when the app is in use
7. **Support gzip compression** - Set `Accept-Encoding: gzip, deflate`

### Error Codes to Handle
- **429 Too Many Requests:** You're being throttled (old products) or blocked (new products)
- **403 Forbidden:** Missing User-Agent, blacklisted IP, or coordinate precision issue
- **405 Method Not Allowed:** POST requests not supported
- **203 Non-Authoritative Information:** Deprecated API version

---

## Example Request

```bash
curl -s -H "User-Agent: hasWeather/1.0 (https://github.com/Yonneh0/hasWeather)" \
  "https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=40.7128&lon=-74.0060"
```

---

## Comparison with Other Free APIs

| Feature | MET Norway | Open-Meteo | Weather.gov |
|---------|------------|------------|-------------|
| Hourly forecasts | Yes (1-6h intervals) | Yes (1-3h intervals) | Yes (3h intervals) |
| Multi-day forecasts | Yes (up to 10 days) | Yes (up to 16 days) | Yes (7 days) |
| No API key needed | Yes | Yes | Yes |
| Global coverage | Yes | Yes | US only |
| Nordic accuracy | Best (2.5km) | Good | N/A |
| Marine data | Yes | Yes | No |
| Weather alerts | Yes (Nordic only) | Yes | Yes (US only) |
| Sunrise/sunset | Yes | Yes | No |
| CORS support | Yes | Yes | Limited |
| Rate limit info | ~20 req/s without agreement | ~60 req/min for free tier | Not specified |

---

## Resources

- **API Documentation:** https://docs.api.met.no/doc/
- **Getting Started:** https://docs.api.met.no/doc/GettingStarted.html
- **Terms of Service:** https://api.met.no/doc/TermsOfService.html
- **Licensing:** https://api.met.no/doc/License.html
- **FAQ:** https://api.met.no/doc/FAQ.html
- **Developer Mailing List:** https://api.met.no/doc/support.html
- **Product Changelog RSS:** https://api.met.no/feed/changelog
- **News RSS:** https://api.met.no/feed/news