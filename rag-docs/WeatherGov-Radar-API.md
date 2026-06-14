# Weather.gov Radar Endpoints - Complete Reference

## Overview

The NWS API provides radar metadata endpoints that return information about the NEXRAD radar network, station status, and operational data. **Radar imagery (actual images) is NOT served through the main API** — it's served from separate systems at `radar.weather.gov`.

**API Base URL:** `https://api.weather.gov/radar`

**Important Note:** The radar imagery endpoints are **NOT part of the OpenAPI spec**. They serve raw radar images (PNG/JPEG) from the NEXDB/Ridge system. These are static image URLs, not API endpoints with query parameters.

---

## Radar Metadata Endpoints

### 1. Radar Stations - VERIFIED WORKING

Returns a list of all radar stations in the NEXRAD network.

```
GET /radar/stations
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `stationType` | string[] | Limit results to specific station types (e.g., WSR-88D, TDWR) |
| `reportingHost` | string | Show RDA and latency info from specific reporting host |
| `host` | string | Show latency info from specific LDM host |

**Response Format:** GeoJSON FeatureCollection with radar station metadata including:
- Station ID (e.g., "KOKX")
- Name (e.g., "Brookhaven")
- Station type (WSR-88D, TDWR, etc.)
- Location coordinates
- Elevation
- Latency data (current, average, max)
- RDA status and operational details

### 2. Individual Radar Station - VERIFIED WORKING

Returns detailed metadata about a specific radar station.

```
GET /radar/stations/{stationId}
```

**Path Parameter:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `stationId` | string | Yes | Radar station ID (e.g., "KOKX", "KOKX") |

**Response Fields:**
- `id` — Station identifier
- `name` — Station name
- `stationType` — WSR-88D, TDWR, etc.
- `elevation` — Station elevation
- `latency.current` — Current latency in seconds
- `latency.average` — Average latency
- `latency.max` — Maximum latency
- `latency.levelTwoLastReceivedTime` — Last Level II data received time
- `rda.timestamp` — RDA status timestamp
- `rda.operabilityStatus` — Operational status
- `rda.mode` — Operational mode
- `rda.controlStatus` — Control status (Remote/Local)
- `performance` — Detailed performance metrics:
  - `radomeAirTemperature`
  - `transmitterPeakPower`
  - `horizontalNoiseTemperature`
  - `dynamicRange`
  - `powerSource`
  - `fuelLevel`
- `adaptation` — Adaptation parameters:
  - `transmitterFrequency`
  - `pulseWidthTransmitterOutputShortPulse`
  - `pulseWidthTransmitterOutputLongPulse`

### 3. Radar Servers

Returns a list of radar servers.

```
GET /radar/servers
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `reportingHost` | string | Show records from specific reporting host |

### 4. Radar Server Metadata

Returns metadata about a specific radar server.

```
GET /radar/servers/{id}
```

### 5. Radar Station Alarms

Returns alarm status for a radar station.

```
GET /radar/stations/{stationId}/alarms
```

### 6. Radar Queues

Returns data from the LDM (Local Data Manager) queue.

```
GET /radar/queues/{host}
```

**Path Parameter:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `host` | string | Yes | LDM host (enum: "rds" or "tds") |

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | int | Record limit (1–50000) |
| `arrived` | interval | Range for arrival time |
| `created` | interval | Range for creation time |
| `published` | interval | Range for publish time |
| `station` | string | Station identifier |
| `type` | string | Record type |
| `feed` | string | Originating product feed |
| `resolution` | int | Resolution version |

### 7. Radar Wind Profilers

Returns radar wind profiler data.

```
GET /radar/profilers/{stationId}
```

**Path Parameter:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `stationId` | string | Yes | Profiler station ID |

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `time` | interval | Time interval |
| `interval` | duration | Averaging interval |

### 8. Radar SPGDS

Returns a list of radar SPGDS (Station Product Gateway Data Services).

```
GET /radar/spgds
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `published` | interval | Range for publish time |

---

## Radar Imagery - WMS Endpoints (VERIFIED WORKING)

### NOAA/NCEP GeoServer MRMS Radar Composite - PRIMARY RADAR SOURCE

**This is the best source for live NEXRAD radar imagery.** It provides quality-controlled composite radar data from the Multi-Radar-Multi-Sensor (MRMS) algorithm, combining all NEXRAD stations into a single product.

**API Base URL:** `https://opengeo.ncep.noaa.gov/geoserver/conus/`

**Important:** This is an OGC WMS service — not part of the OpenAPI spec. It uses standard WMS GetMap requests.

#### Available Layers

| Layer | Description |
|-------|-------------|
| `conus_bref_qcd` | Quality Controlled 1km Base Reflectivity (MRMS) - **most useful for precipitation** |
| `conus_cref_qcd` | Composite Reflectivity - highest reflectivity at any altitude |
| `conus_neet_v18` | Echo Tops - height of radar echoes |
| `conus_pcpn_typ` | Precipitation Type - rain, snow, sleet, hail |

#### WMS GetMap Request Format

```
https://opengeo.ncep.noaa.gov/geoserver/conus/{layer}/wms?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&FORMAT=image/png&LAYERS={layer}&TIME={timestamp}&WIDTH={width}&HEIGHT={height}&SRS=EPSG:3857&BBOX={bbox}
```

#### WMS Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| `SERVICE` | WMS | Web Map Service |
| `REQUEST` | GetMap | Fetch a map image |
| `VERSION` | 1.1.1 | OGC WMS version |
| `FORMAT` | image/png, image/jpeg, etc. | Output format |
| `LAYERS` | Layer name (e.g., conus_bref_qcd) | Radar layer to display |
| `TIME` | ISO8601 timestamp (e.g., 2026-06-14T04:50:08Z) | Time of radar data (~2 min update interval) |
| `WIDTH` | 256-1024+ | Image width in pixels |
| `HEIGHT` | 256-1024+ | Image height in pixels |
| `SRS` | EPSG:3857, EPSG:4326 | Coordinate reference system |
| `BBOX` | minx,miny,maxx,maxy | Bounding box in selected CRS |

#### Example Requests

**Base Reflectivity for NYC area:**
```
https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/wms?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&FORMAT=image/png&LAYERS=conus_bref_qcd&TIME=2026-06-14T04:50:08Z&WIDTH=512&HEIGHT=512&SRS=EPSG:3857&BBOX=-10644926.307106785,4383204.9499851465,-10018754.171394622,5009377.08569731
```

**Echo Tops:**
```
https://opengeo.ncep.noaa.gov/geoserver/conus/conus_neet_v18/wms?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&FORMAT=image/png&LAYERS=conus_neet_v18&TIME=2026-06-14T04:50:08Z&WIDTH=512&HEIGHT=512&SRS=EPSG:3857&BBOX={bbox}
```

**Precipitation Type:**
```
https://opengeo.ncep.noaa.gov/geoserver/conus/conus_pcpn_typ/wms?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&FORMAT=image/png&LAYERS=conus_pcpn_typ&TIME=2026-06-14T04:50:08Z&WIDTH=512&HEIGHT=512&SRS=EPSG:3857&BBOX={bbox}
```

#### Getting the Latest Timestamp

Call GetCapabilities to find the default (latest) timestamp:

```
https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/wms?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.1.1
```

The response includes:
```xml
<Extent name="time" default="2026-06-14T04:52:25Z">
  2026-06-14T02:54:17.000Z,2026-06-14T02:56:15.000Z,...,2026-06-14T04:52:25.000Z
</Extent>
```

**Available time range:** ~40 timestamps updating every ~2 minutes.

#### Bounding Box Calculation (EPSG:3857 / Web Mercator)

For a bounding box centered on lat/lon:

```
// Convert lat/lon to Web Mercator bounds
function latLonToBbox(lat, lon, radiusKm) {
  const R = 6371; // Earth radius in km
  const dLat = (radiusKm / R) * (180 / Math.PI);
  const dLon = (radiusKm / R) * (180 / Math.PI) / Math.cos(lat * Math.PI / 180);
  return [
    lon - dLon,   // minx
    lat - dLat,   // miny
    lon + dLon,   // maxx
    lat + dLat    // maxy
  ];
}
```

#### Key Advantages

1. **No API key required** — Open access
2. **MRMS composite** — Combines all NEXRAD stations (not just one station)
3. **Multiple products** — Reflectivity, composite reflectivity, echo tops, precipitation type
4. **Standard WMS protocol** — Compatible with any GIS/WMS client
5. **CORS enabled** — `Access-Control-Allow-Origin: *` allows direct browser requests
6. **Time-aware** — Request specific timestamps or use the default (latest)
7. **Quality controlled** — 1km x 1km resolution, MRMS algorithm

#### Caveats

- The `conus_cref_qcd` layer may return an empty/transparent image if there's no significant precipitation in the requested area
- Timestamps are ~2 minutes apart (not real-time)
- The GeoServer is served by Apache-Coyote (different from the NWS API server)
- Bounding boxes must be calculated for the specific SRS being used

---

## Radar Imagery (NEXDB/Ridge System - DEPRECATED/UNRELIABLE)

**These endpoints are NOT part of the OpenAPI spec and are served from a separate system.** The imagery URLs follow a pattern but may change without notice. **Prefer the NOAA/NCEP GeoServer WMS endpoints above instead.**

### NEXRAD Level II Base Reflectivity (Deprecated)

The radar imagery is served from `https://radar.weather.gov/ridge2/NEXDB_nexrad_level2/` with the following URL pattern:

```
https://radar.weather.gov/ridge2/NEXDB_nexrad_level2/{STATION_ID}/{YYYYMMDD}_{HHMM}_{STATION_ID}.png
```

**Example:**
```
https://radar.weather.gov/ridge2/NEXDB_nexrad_level2/KOKX/20260614_0455_KOKX.png
```

**Status:** As of June 14, 2026, these imagery endpoints returned 404 errors when tested. The path format may have changed or the data may not be available at the exact timestamps queried. **Use NOAA/NCEP GeoServer WMS endpoints instead.**

### WMS Radar Images (Deprecated)

The NEXDB/Ridge system also serves WMS-style radar images:

```
https://radar.weather.gov/nexrad/images/wms/latest/{STATION_ID}.png
```

**Status:** As of June 14, 2026, this endpoint returned 404 errors when tested. **Use NOAA/NCEP GeoServer WMS endpoints instead.**

---

## Station Types

| Type | Description |
|------|-------------|
| WSR-88D | NEXRAD WSR-88D radar (primary network) |
| TDWR | Terminal Doppler Weather Radar (airport-based) |
| C-band | C-band radar |
| S-band | S-band radar |

---

## Example: Finding the Nearest Radar Station for a Location

The `/points` endpoint returns the primary radar station for any location:

```
GET /points/40.7128,-74.0060
Response includes:
{
  "properties": {
    "radarStation": "KOKX",
    ...
  }
}
```

Then use that station ID to get detailed station info:

```
GET /radar/stations/KOKX
```

---

## Rate Limiting & Caching

- No strict rate limits for well-behaved clients
- Each User-Agent is tracked separately
- Cache radar station data for 10+ minutes (data updates ~hourly)
- Cache radar server data for 60+ minutes (rarely changes)

---

## Resources

- **API Documentation:** https://weather-gov.github.io/api/
- **NEXRAD Radar Images:** https://radar.weather.gov/
- **Radar Station Map:** https://radar.weather.gov/map/
- **OpenAPI Spec:** https://api.weather.gov/openapi.json