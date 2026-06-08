# Open-Meteo Weather Forecast API — RAG Document

## Endpoint
```
GET https://api.open-meteo.com/v1/forecast?latitude=X&longitude=Y
```

## Authentication & Licensing
- **Non-commercial**: Free, < 10,000 daily API calls
- **Commercial**: Requires `apikey` parameter with `customer-` prefix on server URL
- **Self-hosted**: Available for self-deployment

---

## Parameters

### Required
| Parameter | Type | Description |
|-----------|------|-------------|
| `latitude`, `longitude` | float | WGS84 coordinates (comma-separated for multiple) |

### Optional
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `elevation` | float | auto | Manual elevation for downscaling; use `nan` to disable |
| `hourly` | string[] | — | Weather variables (comma-separated or repeated params) |
| `daily` | string[] | — | Daily aggregated weather variables |
| `current` | string[] | — | Current condition variables |
| `temperature_unit` | string | `celsius` | `fahrenheit` for °F |
| `wind_speed_unit` | string | `kmh` | `ms`, `mph`, `kn` |
| `precipitation_unit` | string | `mm` | `inch` |
| `timeformat` | string | `iso8601` | `unixtime` for epoch seconds (GMT) |
| `timezone` | string | `GMT` | Any IANA timezone; use `auto` for auto-detection |
| `past_days` | int | 0 | Past data: 0–92 days |
| `forecast_days` | int | 7 | Forecast length: 0–16 days |
| `forecast_hours` / `forecast_minutely_15` | int | — | Override forecast reference to current hour/15-min |
| `past_hours` / `past_minutely_15` | int | — | Override past data reference |
| `start_date` / `end_date` | yyyy-mm-dd | — | Date range filter |
| `start_hour` / `end_hour` | yyyy-mm-ddThh:mm | — | Hourly time range |
| `start_minutely_15` / `end_minutely_15` | yyyy-mm-ddThh:mm | — | 15-min time range |
| `models` | string[] | `auto` | Manual model selection (comma-separated) |
| `cell_selection` | string | `land` | `sea`, `nearest` for grid-cell preference |
| `apikey` | string | — | Commercial API key |

---

## Weather Models

| Model | Provider | Country | Resolution | Forecast | Update Freq |
|-------|----------|---------|------------|----------|-------------|
| ICON | DWD | Germany | 2–11 km | 7.5 days | Every 3h |
| GFS & HRRR | NOAA | USA | 3–25 km | **16 days** | Every hour |
| ARPEGE & AROME | Météo-France | France | 1–25 km | 4 days | Every hour |
| IFS & AIFS | ECMWF | EU | 9–25 km | 15 days | Every 6h |
| UKMO | Met Office | UK | 2–10 km | 7 days | Every hour |
| KMA | KMA Korea | Korea | 1.5–13 km | 12 days | Every 6h |
| MSM & GSM | JMA | Japan | 5–55 km | 11 days | Every 3h |
| ICON CH | MeteoSwiss | Switzerland | 1–2 km | 5 days | Every 3h |
| MET Nordic | MET Norway | Norway | 1 km | 2.5 days | Every hour |
| GEM | Canada | Canada | 2.5 km | 10 days | Every 6h |
| ACCESS-G | BOM | Australia | 15 km | 10 days | Every 6h |
| GFS GRAPES | CMA | China | 15 km | 10 days | Every 6h |
| HARMONIE | KNMI/DMI | NL/DK | 2 km | 2.5 days | Every 3h |
| ARPAE | ItaliaMeteo | Italy | 2 km | 3 days | Every 12h |

---

## Hourly Variables (key subset)

### Temperature & Humidity
| Variable | Valid Time | Unit | Description |
|----------|-----------|------|-------------|
| `temperature_2m` | Instant | °C/°F | Air temp at 2m |
| `relative_humidity_2m` | Instant | % | Relative humidity at 2m |
| `dew_point_2m` | Instant | °C/°F | Dew point at 2m |
| `apparent_temperature` | Instant | °C/°F | Feels-like temp (wind chill + humidity + solar) |
| `temperature_80m`, `_120m`, `_180m` | Instant | °C/°F | Temp at altitude levels |

### Pressure & Clouds
| Variable | Valid Time | Unit | Description |
|----------|-----------|------|-------------|
| `pressure_msl` / `surface_pressure` | Instant | hPa | Sea level / surface pressure |
| `cloud_cover` | Instant | % | Total cloud cover |
| `cloud_cover_low`, `_mid`, `_high` | Instant | % | Cloud layers at 0–3km, 3–8km, >8km |

### Wind
| Variable | Valid Time | Unit | Description |
|----------|-----------|------|-------------|
| `wind_speed_10m/80m/120m/180m` | Instant | km/h | Wind speed at height |
| `wind_direction_*` | Instant | ° | Wind direction |
| `wind_gusts_10m` | Preceding hour max | km/h | Max gusts in preceding hour |

### Precipitation
| Variable | Valid Time | Unit | Description |
|----------|-----------|------|-------------|
| `precipitation` | Preceding hour sum | mm | Total (rain + showers + snow) |
| `rain`, `showers`, `snowfall` | Preceding hour sum | mm/cm | Individual components |
| `precipitation_probability` | Preceding hour prob | % | Ensemble probability (>0.1mm) |
| `snow_depth` | Instant | m | Snow depth on ground |

### Solar Radiation
| Variable | Valid Time | Unit | Description |
|----------|-----------|------|-------------|
| `shortwave_radiation` | Preceding hour mean | W/m² | Total solar radiation |
| `direct_radiation`, `direct_normal_irradiance` | Preceding hour mean | W/m² | Direct component (horizontal / normal) |
| `diffuse_radiation` | Preceding hour mean | W/m² | Diffused component |
| `global_tilted_irradiance` | Preceding hour mean | W/m² | Tilted surface radiation (requires tilt/azimuth params) |

### Soil Variables
| Variable | Valid Time | Unit | Description |
|----------|-----------|------|-------------|
| `soil_temperature_0cm/6cm/18cm/54cm` | Instant | °C/°F | Soil temp at depth |
| `soil_moisture_0_to_1cm/.../_27_to_81cm` | Instant | m³/m³ | Volumetric soil water content |

### Additional Variables
| Variable | Valid Time | Unit | Description |
|----------|-----------|------|-------------|
| `visibility` | Instant | m | Viewing distance |
| `vapour_pressure_deficit` | Instant | kPa | VPD (high >1.6 = high transpiration) |
| `cape` | Instant | J/kg | Convective available potential energy |
| `evapotranspiration` | Preceding hour sum | mm/h | ET from land/plants |
| `et0_fao_evapotranspiration` | Preceding hour sum | mm/h | Reference ET (FAO-56 Penman-Monteith) |
| `is_day` | Instant | dimless | 1=daylight, 0=night |

### Pressure Level Variables
Available for levels: 1000, 975, 950, 925, 900, 850, 800, 700, 600, 500, 400, 300, 250, 200, 150, 100, 70, 50, 30 hPa.

Variables: `temperature_*hPa`, `relative_humidity_*hPa`, `dew_point_*hPa`, `cloud_cover_*hPa`, `wind_speed_*hPa`, `wind_direction_*hPa`, `geopotential_height_*hPa`.

---

## Daily Variables (aggregated from hourly)
| Variable | Unit | Description |
|----------|------|-------------|
| `temperature_2m_max/mean/min` | °C/°F | Max, mean, min daily temp |
| `apparent_temperature_*` | °C/°F | Apparent temperature aggregations |
| `precipitation_sum`, `rain_sum`, `showers_sum`, `snowfall_sum` | mm/cm | Daily sums |
| `precipitation_hours` | h | Hours with precipitation |
| `precipitation_probability_max/mean/min` | % | Probability stats |
| `wind_speed_10m_max`, `wind_gusts_10m_max` | km/h | Max wind/gusts |
| `wind_direction_10m_dominant` | ° | Dominant direction |
| `sunrise`, `sunset` | iso8601 | Sun times |
| `daylight_duration`, `sunshine_duration` | s | Daylight / sunshine seconds |
| `uv_index_max`, `uv_index_clear_sky_max` | index | UV index (WMO scale) |
| `shortwave_radiation_sum` | MJ/m² | Daily solar radiation |

---

## 15-Minutely Variables (HRRR/ICON-D2/AROME models)
Available for: `temperature_2m`, `relative_humidity_2m`, `dew_point_2m`, `apparent_temperature`, `shortwave_radiation`, `direct_radiation`, `global_tilted_irradiance`, `diffuse_radiation`, `sunshine_duration`, `lightning_potential`, `precipitation`, `snowfall`, `rain`, `showers`, `wind_speed_10m/80m`, `wind_direction_*`, `visibility`, `weather_code`.

---

## WMO Weather Codes
| Code | Meaning | Code | Meaning |
|------|---------|------|---------|
| 0 | Clear sky | 1,2,3 | Mainly clear → overcast |
| 45,48 | Fog + rime fog | 51–55 | Drizzle (light→dense) |
| 56,57 | Freezing drizzle | 61–65 | Rain (slight→heavy) |
| 66,67 | Freezing rain | 71–75 | Snow (slight→heavy) |
| 77 | Snow grains | 80–82 | Showers (slight→violent) |
| 85,86 | Snow showers | 95 | Thunderstorm |
| 96,99 | Thunderstorm + hail | — | — |

---

## Response JSON Schema
```json
{
  "latitude": 52.52,
  "longitude": 13.419,
  "elevation": 44.812,
  "generationtime_ms": 2.2119,
  "utc_offset_seconds": 0,
  "timezone": "Europe/Berlin",
  "timezone_abbreviation": "CEST",
  "current": { /* key-value pairs for each current variable */ },
  "hourly": {
    "time": ["2024-01-01T00:00", ...],
    "temperature_2m": [13, 12.7, ...],
    // ... other hourly variables
  },
  "hourly_units": { "temperature_2m": "°C" },
  "daily": {
    "time": ["2024-01-01", ...],
    "temperature_2m_max": [15, ...]
  },
  "daily_units": { "temperature_2m_max": "°C" }
}
```

## Error Response (HTTP 400)
```json
{
  "error": true,
  "reason": "Cannot initialize WeatherVariable from invalid String value tempeture_2m for key hourly"
}
```

## Implementation Notes
- Multiple coordinates: comma-separate lat/lon → JSON becomes list of structures + `location_id` column in CSV/XLSX
- Daily data requires `timezone` parameter
- Unix timestamps need `utc_offset_seconds` applied for correct local dates
- Ensemble precipitation probability uses 30 model simulations at 0.25° resolution
- Tilted irradiance: tilt=0–90°, azimuth=-180 to +180 (0=south, ±90=east/west)