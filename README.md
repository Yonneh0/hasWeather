# hasWeather (Under Development: Proceed with caution)

completely self-contained single file weather app, that uses public sources, with proper local caching, to provide reliable comprehensive weather information, with 0 ads. Brought to you by `Carls' Jr`.

## Features

- Multiple city monitoring in a responsive grid layout (configurable up to 6 cities)
- Dual data source architecture: Open-Meteo as base for all cities, NWS as supplemental where available (enhanced mode)
- Weather data from Open-Meteo API (temperature, humidity, wind, precipitation, UV index, visibility, surface pressure, air quality, 24-hour hourly forecast) + NWS API (current conditions, hourly forecast, alerts)
- Radar imagery from NOAA/NCEP GeoServer WMS — current MRMS base reflectivity image displayed as a page background with white-to-transparent processing
- **Radar Marker Toggle** — Click the 👁 button (next to the radar overlay selector) to switch between city cards and small map markers overlaid on the radar image. City cards animate outward from their positions while markers fade in at their exact geographic locations. Markers are pixel-perfect, centered on the user's location, and positioned using percentage-based coordinates within a 512×512 container scaled to match the background image. City names and distances are always visible on markers; hover reveals additional info. Background weather updates continue uninterrupted in either view.
- localStorage-based caching with configurable TTLs per data type (15 min for weather/AQI, 24h for geocoding/IP, 10 min for nearby cities) and LRU eviction (default: 500 entries per type)
- Nearby city discovery via Nominatim with bearing-based diversity selection and automatic display of up to 6 nearest cities
- °F/°C unit toggle with debouncing
- Fullscreen toggle button (hidden by default, shown when supported)
- Animated SVG weather icons (20+ weather types with glow, rotation, drift, shake, bob, and particle animations)
- Canvas-based charts — merged chart (temperature area fill + precipitation bars + wind line), combined chart (humidity fill + wind line + precipitation bars) with live min/max/avg stats, and ghost NWS overlay charts
- Automatic API retry with exponential backoff (3 retries, 1s/2s/4s) for network resilience
- Automatic geolocation via browser Geolocation API, falling back to ipinfo.io IP-based lookup
- Nearby city discovery via Nominatim with bearing-based diversity selection and Open-Meteo feature_code categorization (state capitals, regional capitals, nearest cities)
- Wind compass display with directional arrows
- Day/night aware UI theming (dynamic city backgrounds based on current weather code)
- Debug quick-select buttons for common test locations
- Particle canvas background animation
- Network outage detection on initial load with comical animated error panel, progress bar, and auto-retry cycle
- **Local Sensor Bar** — Real-time local weather station data display (temperature, feels-like, dewpoint, wind speed/gust/direction, humidity, pressure, GPS coordinates, UV index, visibility, rainfall, solar radiation, soil moisture) with auto-refresh and TTL expiry
- **Ghost Chart Overlay** — When NWS data is available, parallel NWS data shown as blue-tinted ghost elements: ghost temperature, ghost weather icon, ghost details grid values, ghost hourly forecast, and ghost merged chart canvas
- **Cross-source Data Model** — Three states: `open-meteo` (OM-only), `nws` (NWS-only), `enhanced` (OM base + NWS supplemental). Field-level merging where missing OM fields are filled from NWS cache and vice versa
- **Donkey Runner Minigame** — Chrome dinosaur-style endless runner with extensive features: animated donkey character, backflip on rare jumps, double-jump with fart sound effect, stumble mechanic (donkey trips for 2 seconds), property damage bonus (+100 points when knocking obstacles while stumbling), near-miss detection (+50 points), snarky message system (50+ messages across 20 event types), procedural sound effects (jump, double-jump/fart, game over, milestone, near-miss, land, ceiling), day/night cycle, air-based obstacles (jet, falling rock, drone), obstacle count tracking on game over screen with SVG icons, post-game stats breakdown (run time, air time, jump stats), corner stat blocks, fullscreen mode, sound toggle with localStorage persistence
- Zero external dependencies — pure vanilla HTML/CSS/JS

## Tech Stack

- **Frontend:** Vanilla HTML5, CSS3, JavaScript (ES6+)
- **Build:** Node.js (no frameworks, no npm packages required at runtime)
- **Weather Data:** [Open-Meteo API](https://open-meteo.com/) (forecast + current) + [NWS API](https://api.weather.gov/) (current conditions, hourly forecast, alerts)
- **Air Quality:** [Open-Meteo Air Quality API](https://open-meteo.com/air-quality-api)
- **Radar Imagery:** [NOAA/NCEP GeoServer WMS](https://opengeo.ncep.noaa.gov/geoserver/conus/) — selectable overlay layers (Base Reflectivity, Composite Reflectivity/QCD, Echo Tops, Precipitation Type) via header combo box (in a button bar with the 👁 radar marker toggle); radar image is always centered on the user's location as a single non-tiled background with white pixels made transparent
- **Geocoding:** [Open-Meteo Geocoding API](https://geocoding-api.open-meteo.com/) + [Nominatim/OSM](https://nominatim.openstreetmap.org/)
- **Location:** Browser Geolocation API, [ipinfo.io](https://ipinfo.io/) (fallback)
- **Chart Rendering:** Canvas-based custom implementation

## Getting Started

Just open `weather-prod.html` in your browser. That's it. No install, no server, no nonsense.

```
file:///path/to/weather.html
```

Alternatively, if you want to build from source (see [Building](#building) below):

```
# Open index.html directly for development
file:///path/to/index.html
```

## Building

The build script (`build.js`) inlines all CSS and JS into a single self-contained `weather.html` file. This is the release product — everything in one file, no external dependencies.

```bash
# Via npm
npm run build

# Or directly with Node
node build.js
```

Output: `weather.html` — the one true file.

## Project Structure (hasWeather/)

### .git/ - 11 items - GIT Folder

### css/ - 6 items - Directory

#### css/base.css - 29 lines - Cascading Style Sheet (css) — reset & base styles (body, particle-canvas)

#### css/card-components.css - 912 lines - Cascading Style Sheet (css) — card display components (city card, hourly forecast, canvas charts)

#### css/donkey-runner.css - 777 lines - Cascading Style Sheet (css) — minigame panel styling & animations

#### css/interactive.css - 385 lines - Cascading Style Sheet (css) — interactive elements (SVG weather icons, network outage panel)

#### css/layout.css - 323 lines - Cascading Style Sheet (css) — core layout & structural styles (header, city grid, modal, loading, text glow)

#### css/main.css - 7 lines - Cascading Style Sheet (css) — entry point (imports all modular CSS)

### js/ - 14 items - Directory

#### js/api-nws.js - 842 lines - JavaScript (js) — NWS API client
- gridpoint data, observation stations, alerts, snowfall/ice accumulation parsing, sky cover, cross-source lookup with rate limiting and exponential backoff for 429 responses

#### js/api-openmeteo.js - 437 lines - JavaScript (js) — Open-Meteo weather/AQI API client
- consolidated cache keys, per-city incremental fetch, request deduplication, and cross-source NWS fallback

#### js/api-openstreetmap.js - 184 lines - JavaScript (js) — Nominatim/OSM nearby city discovery with bearing-based diversity selection

#### js/api-radar.js - 245 lines - JavaScript (js) — NOAA/NCEP GeoServer WMS radar API client
- multi-overlay fetch with per-layer localStorage caching, GetCapabilities layer discovery, white-to-transparent processing

#### js/cache.js - 285 lines - JavaScript (js) — DataCache (localStorage caching with configurable TTLs per type and LRU eviction, NWS toggle state persistence)

#### js/charts.js - 495 lines - JavaScript (js) — canvas chart rendering (merged chart, combined chart, ghost NWS overlay charts, particles) with named constants and shared helpers

#### js/constants.js - 68 lines - JavaScript (js) — shared constants (WMO codes & gradients)

#### js/donkey-runner.js - 2755 lines - JavaScript (js) — Donkey Runner minigame engine (canvas-based runner with extensive features)

#### js/icons.js - 290 lines - JavaScript (js) — animated SVG weather icons

#### js/local-sensor.js - 754 lines - JavaScript (js) — Local Sensor Bar for displaying local weather station data (15 sensor types, flexible unit parsing, auto-refresh with exponential backoff, TTL expiry, page visibility awareness, health checks)

#### js/main.js - 589 lines - JavaScript (js) — entry point (state + DOM init + event bindings + game toggle + radar background + marker toggle + run orchestration)

#### js/network-monitor.js - 332 lines - JavaScript (js) — network outage detection, animated error panel, auto-retry

#### js/render.js - 555 lines - JavaScript (js) — DOM rendering (placeholder cards, incremental OM/NWS updates, full card render with ghost NWS overlay, chart coordination) using named constants

#### js/utils.js - 258 lines - JavaScript (js) — utility functions (unit conversion, haversine, bearing, wind compass, AQI labeling, day/night check, IP-based location, NWS bounds check, background refresh, unit toggle)

### node_modules/ - 20 items

### rag-docs/ - 7 items - Directory

#### rag-docs/MET_Norway-api.md - 253 lines - Markdown Document (md) — documentation for the MET Norway API

#### rag-docs/WeatherGov-Radar-API.md - 356 lines - Markdown Document (md) — documentation for the Weather.gov radar endpoints (WMS, metadata)

#### rag-docs/air-quality-api.md - 168 lines - Markdown Document (md) — documentation for the air-quality endpoint

#### rag-docs/alternate-weather-apis.md - 510 lines - Markdown Document (md) — list of alternative weather APIs

#### rag-docs/geocoding-api.md - 138 lines - Markdown Document (md) — documentation for the geocoding endpoint

#### rag-docs/weather-forecast-api.md - 205 lines - Markdown Document (md) — documentation for the weather forecast endpoint

#### rag-docs/weather.gov-api.md - 1201 lines - Markdown Document (md) — documentation for the NWS API endpoint

### .gitignore - 2 lines

### AGENTS.md - 2 lines — I wouldn't let your agent read this. Very bad advice.

### README.md - 281 lines — you are here

### build.js - 250 lines — build script (inlines CSS/JS into weather.html)

### favicon.ico - 130985 bytes - ICO Image (ico) — site favicon

### has.png - 61909 bytes - PNG Image (png) — Half-Assed Solutions Official Unoffocial Mascott

### hasWeather-low.png - 11568 bytes - PNG Image (png) — Favicon, minimized, in png flavor

### hasWeather.png - 52189 bytes - PNG Image (png) — Favicon, in png flavor

### index.html - 64 lines — development HTML template (linked CSS/JS)

### package-lock.json - 251 lines — build script stuff

### package.json - 15 lines — project metadata + build script

### project-tree.js - 211 lines — ... huh, I wonder what this was....

### weather-full.html - 10597 lines — (GENERATED) complete single-file build output with comments, including embedded favicon (318kb+)

### weather-local.js - 4 lines — local weather station data override file (see below)

### weather-local.js.example - 107 lines — example configuration for local sensor data

### weather-prod.html - 1 lines — (GENERATED) minimized/optimized production-ready single-file build output, without embedded favicon (179kb+)

### weather.html - 10597 lines — (GENERATED) complete single-file build output with comments, without embedded favicon (303kb+)


---

## Caching

All API responses are cached in `localStorage` with type-specific TTLs and LRU eviction:

| Data Type        | TTL       | Cache Key Pattern                    |
|------------------|-----------|--------------------------------------|
| Weather          | 15 min    | `hasw_cache_weather_X_Y`            |
| Air Quality      | 15 min    | `hasw_cache_airQuality_X_Y`         |
| Geocoding        | 24 hours  | `hasw_cache_geocode_X`              |
| Nearby Cities    | 10 min    | `hasw_cache_nearby_X_Y`             |
| IP Location      | 24 hours  | `hasw_cache_ip_location`            |
| NWS Point        | 15 min    | `hasw_cache_nws_point_X_Y`          |
| NWS Gridpoint    | 15 min    | `hasw_cache_nws_grid_WFO_X_Y_type`  |
| NWS City Data    | 15 min    | `hasw_cache_nws_X_Y`                |
| NWS Observation  | 15 min    | `hasw_cache_nws_obs_STATION_ID`     |
| NWS Alerts       | 10 min    | `hasw_cache_nws_alerts_ZONE_ID`     |
| NWS Zone Forecast| 15 min    | `hasw_cache_nws_zoneforecast_ZONE`  |

**Note:** Weather and AQI data now use a **consolidated cache key** (`weatherAqi_X_Y`) — they share the same TTL and are always fetched together, eliminating cache type conflicts. Legacy separate keys (`weather_X_Y` and `airQuality_X_Y`) remain for backward compatibility.

### Cross-Source Data Model

The app uses a dual-source architecture: Open-Meteo is always the base for all cities, while NWS data is fetched where available as supplemental enhancement. The `source` field on each city's data indicates its effective source:

| Source Value   | Meaning                                          |
|--------------|--------------------------------------------------|
| `'open-meteo'` | OM-only city (outside NWS coverage or no NWS data) |
| `'nws'`        | NWS-only city (NWS coverage but no OM data)     |
| `'enhanced'`   | OM base + NWS supplemental (merged data)        |

When cross-sourcing, the app checks both source caches for missing fields. For example, if NWS doesn't provide UV index or visibility, those fields are filled from OM cache. Cross-source lookups check both the consolidated `weatherAqi` key and legacy `weather` key for OM data.

### Per-City Incremental Fetch

In addition to batch fetching, Open-Meteo supports **per-city incremental fetch** (`fetchWeatherForCity`) — used for background refresh of individual cities without re-fetching the entire city set. This also respects cross-source lookups and deduplication.

### LRU Eviction

When the cache exceeds `DataCache.MAX_ENTRIES_PER_TYPE` (default: 500 entries per type), the Least Recently Used entries are evicted. The LRU list is maintained in `localStorage` as `hasw_lru_{type}` (e.g., `hasw_lru_weather`, `hasw_lru_airQuality`), with the most-recently-used key at the front. On every cache `get()` or `set()`, the accessed key is moved to the front of the LRU list.

### Cache Architecture

- Cache keys are generated by rounding coordinates to 2 decimal places (~1km accuracy), so nearby cities share cache entries
- Before API calls, duplicate cities (within 0.01° of each other) are deduplicated — only unique coordinate pairs are fetched
- `DataCache.MAX_ENTRIES_PER_TYPE` is configurable: set `DataCache.MAX_ENTRIES_PER_TYPE = 1000` before the cache initializes to change the limit

### Radar Overlay Layers

The app supports multiple selectable radar overlays, displayed via a combo box in the header (positioned between the °F/°C toggle and the refresh button). The overlay selection is persisted in `localStorage` (`hasw_radar_overlay`) and restored on page load. Default: **QCD Composite Reflectivity**.

Available layers:

| Key | WMS Layer | Label |
|-----|-----------|-------|
| `base` | `conus_bref_qcd` | Base Reflectivity |
| `qcd-composite` | `conus_cref_qcd` | Composite Reflectivity (QCD) |
| `echo_tops` | `conus_neet_v18` | Echo Tops |
| `precip_type` | `conus_pcpn_typ` | Precipitation Type |

Additional layers may be discovered via WMS GetCapabilities and added to the combo box.

**"None" option:** When selected, hides the radar image entirely and shows the animated particle canvas background. Radar updates are stopped automatically.

### Radar Cache Architecture

Each radar overlay is cached independently in `localStorage` with a 5-minute TTL. The cache key pattern is `hasw_radar_overlay_{layerName}_{lat}_{lon}`. A separate GetCapabilities cache (`hasw_radar_capabilities_{lat}_{lon}`) stores discovered layer metadata for up to 50 minutes.

Background radar updates use the shortest TTL from all city data (weather, AQI, NWS, and the active radar overlay) to determine the refresh interval — radar images are updated at approximately 80% of their TTL to ensure fresh data.

### NWS Toggle State Persistence

The app persists per-city NWS toggle state in localStorage (`hasW_nwsActive`) — entries are intentionally NOT cleaned up when cities are removed, preserving user preference across removal/re-addition. This has negligible storage impact (~30 bytes per entry).

Additional `localStorage` keys used by the app:

| Key                     | Purpose                                  |
|-------------------------|------------------------------------------|
| `hasW_maxCities`        | User-configured max city count (default: 6) |
| `hasW_donkeyHighScore`  | Donkey Runner minigame high score         |
| `hasW_nwsActive`          | Per-city NWS toggle state persistence       |
| `hasw_radar_overlay_*`    | Cached radar overlay images (5min TTL)      |
| `hasw_radar_capabilities_*`| WMS GetCapabilities layer metadata (50min)  |
| `hasw_radar_overlay`      | Currently selected overlay key (e.g., "qcd-composite") |

Clear all cached data via browser dev tools → Application → Local Storage → remove keys starting with `hasw_cache_`, `hasw_lru_`, or `hasW_`.

## Local Sensor Bar

The Local Sensor Bar displays real-time data from a local weather station. To configure it:

1. Copy `weather-local.js.example` to `weather-local.js`
2. Edit the values in `weather-local.js` to match your station's readings
3. Set `LOCAL_CONFIG_REFRESH_INTERVAL_SECONDS` to your desired auto-refresh interval (0 = disabled)
4. Optionally set `LOCAL_SENSOR_TTL` to an ISO 8601 timestamp — the bar hides when data expires

### Supported Sensors

| Variable | Description | Default Unit |
|----------|-------------|--------------|
| `LOCAL_SENSOR_TEMPERATURE` | Current temperature | °F (or "22.5C" for Celsius) |
| `LOCAL_SENSOR_FEELSLIKE` | Feels-like temperature | °F |
| `LOCAL_SENSOR_DEWPOINT` | Dew point temperature | °F |
| `LOCAL_SENSOR_WIND_SPEED` | Wind speed | mph (or "19km/h") |
| `LOCAL_SENSOR_WIND_GUST` | Wind gust | mph |
| `LOCAL_SENSOR_WIND_DIRECTION_DEGREES` | Wind direction (0=N, 90=E, etc.) | degrees |
| `LOCAL_SENSOR_HUMIDITY_PERCENT` | Relative humidity | % |
| `LOCAL_SENSOR_PRESSURE` | Atmospheric pressure | inHg (or "1017hPa") |
| `LOCAL_SENSOR_LATITUDE` | GPS latitude | degrees |
| `LOCAL_SENSOR_LONGITUDE` | GPS longitude | degrees |
| `LOCAL_SENSOR_UV_INDEX` | UV Index | index |
| `LOCAL_SENSOR_VISIBILITY` | Visibility distance | mi (or "16km") |
| `LOCAL_SENSOR_RAINFALL` | Rainfall amount | in (or "4mm") |
| `LOCAL_SENSOR_SOLARRADIATION` | Solar radiation | W/m² |
| `LOCAL_SENSOR_SOIL_MOISTURE_PERCENT` | Soil moisture | % |

Set any value to `null` to hide that sensor from the UI. The bar auto-converts units based on your current °F/°C setting.

## Donkey Runner Minigame

A Chrome dinosaur-style endless runner triggered by network outage or the 🫏 button in the header. Features include:

- **Animated donkey character** — Procedurally drawn with walking animation, backflip on rare jumps, and stumble wobble
- **Double-jump** — Jump again mid-air for a second jump (with fart sound effect)
- **Stumble mechanic** — Donkey trips every 30-60 seconds, can't jump during stumble but can knock obstacles aside
- **Property damage bonus** — +100 points when knocking obstacles while stumbling
- **Near-miss detection** — +50 points for narrowly dodging tall obstacles
- **Snarky message system** — 50+ messages across 20 event types (start, jump, double-jump, land, near-miss, property damage, game over, high score, etc.)
- **Procedural sound effects** — Jump, double-jump/fart, game over, milestone, near-miss, land, ceiling impact sounds
- **Score milestones** — Flash animation at 1000-point intervals
- **Day/night cycle** — 60-second cycle affecting background colors and star visibility
- **Air-based obstacles** — Flying jets (mid-air height), falling rocks (with warning), hovering drones (wave pattern)
- **Obstacle count tracking** — Game over screen shows counts for each obstacle type with SVG icons
- **Post-game stats breakdown** — Run time, air time, air percentage, total jumps, double jumps, ignored jumps, max speed, distance, near misses, property damage count
- **Corner stat blocks** — Compact stat displays positioned at card corners during game over
- **Fullscreen mode** — Toggle fullscreen view for immersive gameplay
- **Sound toggle** — Enable/disable sound effects (persisted in localStorage)
- **Speed lines** — Visual speed indicator at high speeds
- **Particle effects** — Jump, landing, knock, ceiling impact, and double-jump particles

## License

MIT. (google it yourself <3)

## Docs

- `rag-docs/air-quality-api.md` — current information about the air-quality-api
- `rag-docs/geocoding-api.md` — current information about the geocoding-api
- `rag-docs/weather-forecast-api.md` — current information about the weather forecast endpoint
- `rag-docs/weather.gov-api.md` — current information about the NWS API endpoint
- `rag-docs/WeatherGov-Radar-API.md` — current information about the Weather.gov radar endpoints (WMS, metadata)

## Aboot

`Half-Assed Solutions`™ is a project, ran by Yonneh, to release some "actually kinda useful" things that are developed during random hobby development. Yonneh wears most of the hats in this organization- in fact, he wears all of them; but that's only because he is the sole member. If literally ANYONE more competent was around- he'd be fired.
This project, and any others tagged with `Half-Assed Solutions` are completely open-source, and MIT Licensed.
If you found this project under a rock somewhere, and want to see if it was ever finished- it probably came from https://github.com/Yonneh0/hasWeather at some point.

---

if you have made it to this point, and are still reading- I would like to thank you, and question your sanity. have a nice day.