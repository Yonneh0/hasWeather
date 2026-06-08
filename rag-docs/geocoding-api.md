# Open-Meteo Geocoding API — RAG Document

## Endpoint
```
GET https://geocoding-api.open-meteo.com/v1/search?name=Berlin&count=10
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
| `name` | string | Search term (location name or postal code). Empty or single character returns empty result `{}`. 2 characters = exact match only. 3+ characters = fuzzy matching. |

### Optional
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `count` | int | 10 | Results to return (max: 100). Returns error if outside range. |
| `format` | string | `json` | Output format: `json`, `protobuf` |
| `language` | string | `en` | Result language code (lowercase). Returns localized names for country, admin areas, and location names when translation is available. |
| `countryCode` | string | — | ISO-3166-1 alpha2 filter (e.g., "US", "DE") |
| `apikey` | string | — | Commercial API key |

---

## Response JSON Schema
```json
{
  "results": [
    {
      "id": 2950159,
      "name": "Berlin",
      "latitude": 52.52437,
      "longitude": 13.41053,
      "elevation": 74.0,
      "feature_code": "PPLC",
      "country_code": "DE",
      "admin1_id": 2950157,
      "admin3_id": 6547383,
      "admin4_id": 6547539,
      "timezone": "Europe/Berlin",
      "population": 3426354,
      "postcodes": ["10967", "13347"],
      "country_id": 2921044,
      "country": "Germany",
      "admin1": "State of Berlin",
      "admin3": "Berlin, Stadt",
      "admin4": "Berlin"
    }
  ],
  "generationtime_ms": 0.5426407
}
```

## Response Fields
| Field | Type | Description |
|-------|------|-------------|
| `id` | int | Unique location ID (use with `/v1/get?id=X`) |
| `name` | string | Location name (localized per `language` param) |
| `latitude`, `longitude` | float | WGS84 coordinates of grid-cell center |
| `elevation` | float | Elevation above mean sea level |
| `feature_code` | string | GeoNames feature code (see below) |
| `country_code` | string | ISO-3166-1 alpha2 country code |
| `country` | string | Country name (localized per `language` param) |
| `country_id` | int | Unique country ID |
| `population` | int | Number of inhabitants |
| `postcodes` | string[] | List of postal codes for this location |
| `admin1–4` | string | Hierarchical admin area names (empty string if N/A; localized per `language` param) |
| `admin1_id–4_id` | int | Unique IDs for admin areas. `admin2_id` and `admin4_id` may be absent if that level doesn't exist for the location. |
| `timezone` | string | IANA timezone identifier |
| `generationtime_ms` | float | Server processing time in milliseconds |

---

## GeoNames Feature Codes (subset)
| Code | Meaning | Code | Meaning |
|------|---------|------|---------|
| PPLC | Capital of political entity | PPL | Populated place |
| PPLX | Seat of a second-order admin division | PPLW | Wadi |
| PPLH | Hilltop populated place | PPLR | Ruined populated place |
| PPLA | Administrative seat | PPLA2 | Second-order administrative seat |
| PPLA3 | Third-order administrative seat | PPLA4 | Fourth-order administrative seat |
| PPLX | Seat of a second-order admin division | — | — |

Full list: https://www.geonames.org/codes/

---

## Resolution Endpoint (for IDs)
```
GET https://geocoding-api.open-meteo.com/v1/get?id=2950159
```
Returns full details for a specific location ID, including all admin levels.

---

## Error Response
Returns HTTP 400:
```json
{
  "error": true,
  "reason": "Parameter count must be between 1 and 100."
}
```

---

## Implementation Notes
- Search by **postal code**: pass the postal code as `name` parameter (e.g., `?name=10967` returns Berlin)
- Multiple results for same name: use `countryCode` to filter or sort by relevance
- Admin levels are hierarchical: admin1 = state/province, admin2 = county/district, etc.
- Empty `adminN` fields mean that level doesn't exist for the location
- IDs can be resolved via `/v1/get?id=X` endpoint
- Country flags available from HatScripts/circle-flags (for UI display)
- `admin1`, `admin2`, `admin3`, `admin4` fields are localized based on the `language` parameter
- Empty result returns `{}` (no `results` key) instead of `{results: []}`
- Attribution: Location data based on GeoNames

## Example Queries
```
# Search Berlin in Germany
https://geocoding-api.open-meteo.com/v1/search?name=Berlin&countryCode=DE

# Search by postal code
https://geocoding-api.open-meteo.com/v1/search?name=10967

# Fuzzy search with language (Russian)
https://geocoding-api.open-meteo.com/v1/search?name=Moscow&language=ru

# Get top 5 results in French
https://geocoding-api.open-meteo.com/v1/search?name=Lyon&count=5&language=fr