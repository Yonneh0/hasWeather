# hasWeather (Under Development: Proceed with caution)

completely self-contained single file weather app, that uses public sources, with proper local caching, to provide reliable comprehensive weather information, with 0 ads. Brought to you by `Carls' Jr`.

## Features

- Multiple city monitoring in a responsive grid layout (configurable up to 6 cities)
- Dual data source architecture: Open-Meteo as base for all cities, NWS as supplemental where available (enhanced mode)
- Weather data from Open-Meteo API (temperature, humidity, wind, precipitation, UV index, visibility, surface pressure, air quality, 24-hour hourly forecast) + NWS API (current conditions, hourly forecast, alerts)
- Radar imagery from NOAA/NCEP GeoServer WMS — MRMS composite radar data with enhanced player (Base Reflectivity, Composite Reflectivity, Echo Tops, Precipitation Type) including timeline scrubbing, zoom-to-point, keyboard shortcuts, and Cache API storage
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
- **Enhanced Radar Player** — Timeline scrubbing (mouse/touch), zoom-to-point (scroll wheel), keyboard shortcuts (Space/play, +/-/zoom, 0/reset, arrows/frame), fullscreen mode, double-click reset, prefetch progress bar, "Load All Frames" button
- **Ghost Chart Overlay** — When NWS data is available, parallel NWS data shown as blue-tinted ghost elements: ghost temperature, ghost weather icon, ghost details grid values, ghost hourly forecast, and ghost merged chart canvas
- **Cross-source Data Model** — Three states: `open-meteo` (OM-only), `nws` (NWS-only), `enhanced` (OM base + NWS supplemental). Field-level merging where missing OM fields are filled from NWS cache and vice versa
- **Donkey Runner Minigame** — Chrome dinosaur-style endless runner with extensive features: animated donkey character, backflip on rare jumps, double-jump with fart sound effect, stumble mechanic (donkey trips for 2 seconds), property damage bonus (+100 points when knocking obstacles while stumbling), near-miss detection (+50 points), snarky message system (50+ messages across 20 event types), procedural sound effects (jump, double-jump/fart, game over, milestone, near-miss, land, ceiling), day/night cycle, air-based obstacles (jet, falling rock, drone), obstacle count tracking on game over screen with SVG icons, post-game stats breakdown (run time, air time, jump stats), corner stat blocks, fullscreen mode, sound toggle with localStorage persistence
- Zero external dependencies — pure vanilla HTML/CSS/JS

## Tech Stack

- **Frontend:** Vanilla HTML5, CSS3, JavaScript (ES6+)
- **Build:** Node.js (no frameworks, no npm packages required at runtime)
- **Weather Data:** [Open-Meteo API](https://open-meteo.com/) (forecast + current) + [NWS API](https://api.weather.gov/) (current conditions, hourly forecast, alerts)
- **Air Quality:** [Open-Meteo Air Quality API](https://open-meteo.com/air-quality-api)
- **Radar Imagery:** [NOAA/NCEP GeoServer WMS](https://opengeo.ncep.noaa.gov/geoserver/conus/) — MRMS composite radar data (Base Reflectivity, Composite Reflectivity, Echo Tops, Precipitation Type)
- **Geocoding:** [Open-Meteo Geocoding API](https://geocoding-api.open-meteo.com/) + [Nominatim/OSM](https://nominatim.openstreetmap.org/)
- **Location:** Browser Geolocation API, [ipinfo.io](https://ipinfo.io/) (fallback)
- **Chart Rendering:** Canvas-based custom implementation

## Getting Started

Just open `weather.html` in your browser. That's it. No install, no server, no nonsense.

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

## Project Structure

```
build.js                249 lines — build script (inlines CSS/JS into weather.html)
favicon.ico                       — site favicon
index.html               74 lines — development HTML template (linked CSS/JS)
package.json             14 lines — project metadata + build script
README.md                         — you are here
weather-full.html       GENERATED — complete single-file build output with comments, including embedded favicon (318kb+)
weather-prod.html       GENERATED — minimized/optimized production-ready single-file build output, without embedded favicon (179kb+)
weather.html            GENERATED — complete single-file build output with comments, without embedded favicon (303kb+)
weather-local.js        — local weather station data override file (see below)
weather-local.js.example — example configuration for local sensor data
css/
  base.css              18 lines — reset & base styles (body, particle-canvas)
  main.css               7 lines — entry point (imports all modular CSS)
  layout.css           183 lines — core layout & structural styles (header, city grid, modal, loading, text glow)
  card-components.css  436 lines — card display components (city card, hourly forecast, canvas charts)
   interactive.css      410 lines — interactive elements (SVG weather icons, network outage panel)
  donkey-runner.css    740 lines — minigame panel styling & animations
  radar-player.css     350+ lines — radar player UI with zoom, pan, timeline, playback controls
js/
  api-nws.js          1162 lines — NWS API client (gridpoint data, observation stations, alerts) with rate limiting and cross-source lookup
  api-openmeteo.js     314 lines — Open-Meteo weather/AQI API client with deduplication and retry logic
  api-openstreetmap.js 184 lines — Nominatim/OSM nearby city discovery
  api-radar.js         549 lines — NOAA/NCEP GeoServer WMS radar API client (MRMS composite imagery, Cache API storage, request deduplication)
  cache.js             189 lines — DataCache (localStorage caching with configurable TTLs and LRU eviction)
  charts.js            302 lines — canvas chart rendering (merged chart, combined chart, ghost NWS overlay charts, particles)
  constants.js          72 lines — shared constants (WMO codes & gradients)
  donkey-runner.js    2581 lines — Donkey Runner minigame engine (canvas-based runner with extensive features)
  icons.js             289 lines — animated SVG weather icons
  local-sensor.js      400+ lines — Local Sensor Bar for displaying local weather station data
  main.js              252 lines — entry point (state + DOM init + event bindings + game toggle + radar player + run orchestration)
  network-monitor.js   331 lines — network outage detection, animated error panel, auto-retry
  radar-player.js      450+ lines — Radar Player engine (zoom, pan, timeline scrubbing, playback state management)
  render.js            255 lines — DOM rendering (city cards, hourly forecast, ghost NWS overlay)
  utils.js             340 lines — utility functions (unit conversion, haversine, bearing, wind compass, day/night check, refresh, background refresh, IP-based location fallback (ipinfo.io))
rag-docs/
  air-quality-api.md      167 lines — documentation for the air-quality endpoint
  alternate-weather-apis.md — list of alternative weather APIs
  geocoding-api.md        137 lines — documentation for the geocoding endpoint
  MET_Norway-api.md       — documentation for the MET Norway API
  weather-forecast-api.md 204 lines — documentation for the weather forecast endpoint
  weather.gov-api.md     1200 lines — documentation for the NWS API endpoint
  WeatherGov-Radar-API.md 400+ lines — documentation for the Weather.gov radar endpoints (WMS, metadata)
```

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

**Note:** Weather and AQI data now use **separate cache keys** (`weather_X_Y` and `airQuality_X_Y`) instead of sharing the same key. This prevents cache type conflicts and allows each to expire independently.

### Cross-Source Data Model

The app uses a dual-source architecture: Open-Meteo is always the base for all cities, while NWS data is fetched where available as supplemental enhancement. The `source` field on each city's data indicates its effective source:

| Source Value   | Meaning                                          |
|--------------|--------------------------------------------------|
| `'open-meteo'` | OM-only city (outside NWS coverage or no NWS data) |
| `'nws'`        | NWS-only city (NWS coverage but no OM data)     |
| `'enhanced'`   | OM base + NWS supplemental (merged data)        |

When cross-sourcing, the app checks both source caches for missing fields. For example, if NWS doesn't provide UV index or visibility, those fields are filled from OM cache.

### LRU Eviction

When the cache exceeds `DataCache.MAX_ENTRIES_PER_TYPE` (default: 500 entries per type), the Least Recently Used entries are evicted. The LRU list is maintained in `localStorage` as `hasw_lru_{type}` (e.g., `hasw_lru_weather`, `hasw_lru_airQuality`), with the most-recently-used key at the front. On every cache `get()` or `set()`, the accessed key is moved to the front of the LRU list.

### Cache Architecture

- Cache keys are generated by rounding coordinates to 2 decimal places (~1km accuracy), so nearby cities share cache entries
- Before API calls, duplicate cities (within 0.01° of each other) are deduplicated — only unique coordinate pairs are fetched
- `DataCache.MAX_ENTRIES_PER_TYPE` is configurable: set `DataCache.MAX_ENTRIES_PER_TYPE = 1000` before the cache initializes to change the limit

### Radar Cache Architecture

Radar images use **Browser Cache API** (CacheStorage) instead of localStorage — binary images (~100-300KB each as PNG) are stored directly in CacheStorage with frame-based keys for future animated clip playback. Metadata (available timestamps, layer info) is tracked in localStorage.

- **Cache API key pattern:** `https://radar.hasweather.local/frame/{lat}/{lon}/{layer}/frame/{timestamp}`
- **localStorage metadata:** `hasw_cache_radar_meta_{lat}_{lon}_{layer}` — `{ timestamps: [...], layer, lat, lon, lastUpdated }`
- **Cache eviction:** ~250MB total limit — evicts oldest frames when exceeded

### Radar Player Features

The radar player provides an enhanced radar viewing experience with the following features:

- **Timeline Scrubbing** — Click or drag on the progress bar to scrub through time. Touch support included for mobile devices.
- **Zoom-to-Point** — Scroll wheel zooms toward cursor position for precise location focus. Double-click resets the view.
- **Keyboard Shortcuts** — Space (play/pause), +/- (zoom in/out), 0 (reset view), arrow keys (pan to adjacent frame).
- **Fullscreen Mode** — Toggle fullscreen view for immersive radar viewing.
- **Layer Selector** — Dropdown to switch between Base Reflectivity, Composite Reflectivity, Echo Tops, and Precipitation Type layers.
- **Request Deduplication** — Prevents duplicate WMS fetches for the same location/layer/timestamp via Map-based pending fetch tracking.
- **Exponential Backoff Retry** — 3 retries with 1s/2s/4s delays for failed WMS requests.
- **Size-Based Cache Eviction** — ~250MB total limit — evicts oldest frames when limit is exceeded.
- **Prefetch Progress Bar** — Shows progress of frame pre-fetching on load.
- **Load All Frames Button** — Manually load all remaining uncached frames.

Additional `localStorage` keys used by the app:

| Key                     | Purpose                                  |
|-------------------------|------------------------------------------|
| `hasW_maxCities`        | User-configured max city count (default: 6) |
| `hasW_donkeyHighScore`  | Donkey Runner minigame high score         |
| `hasw_cache_radar_meta_*` | Radar frame timestamps per location/layer |

Clear all cached data via browser dev tools → Application → Local Storage → remove keys starting with `hasw_cache_`, `hasw_lru_`, or `hasW_`. For radar cache, also clear Cache Storage entries in the `hasw-radar-v1` cache.

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