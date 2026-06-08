# Open-Meteo Air Quality API — RAG Document

## Endpoint
```
GET https://air-quality-api.open-meteo.com/v1/air-quality?latitude=X&longitude=Y
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
| `hourly` | string[] | — | Air quality variables (comma-separated or repeated params) |
| `current` | string[] | — | Current condition variables |
| `domains` | string | `auto` | `cams_europe`, `cams_global`, or combined |
| `timeformat` | string | `iso8601` | `unixtime` for epoch seconds (GMT) |
| `timezone` | string | `GMT` | Any IANA timezone; use `auto` for auto-detection |
| `past_days` | int | 0 | Past data: 0–92 days |
| `forecast_days` | int | 5 | Forecast length: 0–7 days |
| `forecast_hours` / `past_hours` | int | — | Override reference to current hour |
| `start_date` / `end_date` | yyyy-mm-dd | — | Date range filter |
| `start_hour` / `end_hour` | yyyy-mm-ddThh:mm | — | Hourly time range |
| `cell_selection` | string | `nearest` | Grid-cell selection preference |
| `apikey` | string | — | Commercial API key |

---

## Data Sources

### CAMS European Air Quality Forecast
- **Region**: Europe
- **Resolution**: 0.1° (~11 km)
- **Temporal**: Hourly
- **Availability**: October 2023 onwards
- **Update**: Every 24 hours, 4-day forecast

### CAMS Global Atmospheric Composition Forecasts
- **Region**: Global
- **Resolution**: 0.4° (~45 km)
- **Temporal**: 3-Hourly
- **Availability**: August 2022 onwards
- **Update**: Every 12 hours, 5-day forecast

### CAMS Global Greenhouse Gas Forecast
- **Region**: Global
- **Resolution**: 0.1° (~11 km)
- **Temporal**: 3-Hourly
- **Availability**: November 2024 onwards
- **Update**: Every 24 hours, 5-day forecast

### CAMS European Air Quality Reanalysis
- **Region**: Europe
- **Resolution**: 0.1° (~11 km)
- **Temporal**: Hourly
- **Availability**: 2013 onwards

---

## Hourly Variables

### Particulate Matter
| Variable | Valid Time | Unit | Description |
|----------|-----------|------|-------------|
| `pm10` | Instant | μg/m³ | PM10 near surface (10m) |
| `pm2_5` | Instant | μg/m³ | PM2.5 near surface (10m) |

### Gases
| Variable | Valid Time | Unit | Description |
|----------|-----------|------|-------------|
| `carbon_monoxide` | Instant | μg/m³ | CO near surface |
| `nitrogen_dioxide` | Instant | μg/m³ | NO₂ near surface |
| `sulphur_dioxide` | Instant | μg/m³ | SO₂ near surface |
| `ozone` | Instant | μg/m³ | O₃ near surface |
| `carbon_dioxide` | Instant | ppm | CO₂ near surface |
| `ammonia` | Instant | μg/m³ | NH₃ (Europe only) |
| `methane` | Instant | μg/m³ | CH₄ near surface |

### Other Pollutants
| Variable | Valid Time | Unit | Description |
|----------|-----------|------|-------------|
| `aerosol_optical_depth` | Instant | dimless | AOD at 550nm (entire atmosphere) |
| `dust` | Instant | μg/m³ | Saharan dust near surface |

### UV Index
| Variable | Valid Time | Unit | Description |
|----------|-----------|------|-------------|
| `uv_index` | Instant | index | UV index considering clouds |
| `uv_index_clear_sky` | Instant | index | Clear sky UV index |

### Pollen (Europe only, 4-day forecast during pollen season)
| Variable | Valid Time | Unit | Description |
|----------|-----------|------|-------------|
| `alder_pollen` | Instant | grains/m³ | Alder pollen count |
| `birch_pollen` | Instant | grains/m³ | Birch pollen count |
| `grass_pollen` | Instant | grains/m³ | Grass pollen count |
| `mugwort_pollen` | Instant | grains/m³ | Mugwort (wormwood) pollen |
| `olive_pollen` | Instant | grains/m³ | Olive pollen count |
| `ragweed_pollen` | Instant | grains/m³ | Ragweed pollen count |

---

## Air Quality Indexes

### European AQI
| Variable | Range | Meaning |
|----------|-------|---------|
| `european_aqi` | 0–20 (max of all) | Consolidated index |
| `european_aqi_pm2_5`, `_pm10`, `_nitrogen_dioxide`, `_ozone`, `_sulphur_dioxide` | — | Individual pollutant indices |

**Scale**: 0=good, 20=fair, 40=moderate, 60=poor, 80=very poor, >100=extremely poor

### US AQI
| Variable | Range | Meaning |
|----------|-------|---------|
| `us_aqi` | 0–500 (max of all) | Consolidated index |
| `us_aqi_pm2_5`, `_pm10`, `_nitrogen_dioxide`, `_ozone`, `_sulphur_dioxide`, `_carbon_monoxide` | — | Individual pollutant indices |

**Scale**: 0–50=good, 51–100=moderate, 101–150=unhealthy for sensitive groups, 151–200=unhealthy, 201–300=very unhealthy, 301–500=hazardous

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
  "current": { /* key-value pairs */ },
  "hourly": {
    "time": ["2024-01-01T00:00", ...],
    "pm10": [1, 1.7, 1.7, ...],
    "pm2_5": [0.5, 0.8, ...],
    // ... other variables
  },
  "hourly_units": { "pm10": "μg/m³" }
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
- `domains=auto` combines CAMS Europe + global domains (may show different forecasts where they don't overlap)
- Multiple coordinates: comma-separated lat/lon → JSON list of structures, CSV/XLSX add `location_id` column
- Unix timestamps need `utc_offset_seconds` applied for correct local dates
- Pollen data only available in Europe during pollen season with 4-day forecast window
- Attribution required: METEO FRANCE, INERIS, Aarhus University, MET Norway, Jülich IEK, IEP-NRI, KNMI, TNO, SMHI, FMI, ENEA, BSC (2022)