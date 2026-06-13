# hasWeather (Under Development: Proceed with caution)

single file weather app, by Half-Assed Solutions.
completely self-contained single file weather app, that uses public sources, with proper local caching, to provide reliable comprehensive weather information, with 0 ads. Brought to you by `Carls' Jr`.

## Features

- Multiple city monitoring in a responsive grid layout (configurable 0–20 cities)
- Dual data source architecture: Open-Meteo as base for all cities, NWS as supplemental where available (enhanced mode)
- Weather data from Open-Meteo API (temperature, humidity, wind, precipitation, UV index, visibility, surface pressure, air quality, 24-hour hourly forecast) + NWS API (current conditions, hourly forecast, alerts)
- localStorage-based caching with configurable TTLs per data type (15 min for weather/AQI, 24h for geocoding/IP, 10 min for nearby cities) and LRU eviction (default: 500 entries per type)
- Favorites system using place_id with deduplication and proximity checking — includes search, categorization by distance from user, and regional/state capital classification
- °F/°C unit toggle with debouncing
- Fullscreen toggle button (hidden by default, shown when supported)
- Animated SVG weather icons (20+ weather types with glow, rotation, drift, shake, bob, and particle animations)
- Canvas-based charts — merged chart (temperature area fill + precipitation bars + wind line) and combined chart (humidity fill + wind line + precipitation bars) with live min/max/avg stats
- Automatic API retry with exponential backoff (3 retries, 1s/2s/4s) for network resilience
- Automatic geolocation via browser Geolocation API, falling back to ipinfo.io IP-based lookup
- Nearby city discovery via Nominatim with bearing-based diversity selection and Open-Meteo feature_code categorization (state capitals, regional capitals, nearest cities)
- Wind compass display with directional arrows
- Day/night aware UI theming (dynamic city backgrounds based on current weather code)
- Debug quick-select buttons for common test locations
- Particle canvas background animation
- Network outage detection on initial load with comical animated error panel, progress bar, and auto-retry cycle
- Donkey Runner minigame — a Chrome dinosaur-style endless runner with a hand-drawn donkey character, obstacles, scoring, near-miss detection, day/night cycle, particle effects, and procedural sound effects (auto-opens on network outage)
- Zero external dependencies — pure vanilla HTML/CSS/JS

## Tech Stack

- **Frontend:** Vanilla HTML5, CSS3, JavaScript (ES6+)
- **Build:** Node.js (no frameworks, no npm packages required at runtime)
- **Weather Data:** [Open-Meteo API](https://open-meteo.com/) (forecast + current) + [NWS API](https://api.weather.gov/) (current conditions, hourly forecast, alerts)
- **Air Quality:** [Open-Meteo Air Quality API](https://open-meteo.com/air-quality-api)
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
build.js                172 lines — build script (inlines CSS/JS into weather.html)
favicon.ico             — site favicon
index.html              72 lines — development HTML template (linked CSS/JS)
package.json            10 lines — project metadata + build script
README.md               — you are here
css/
  main.css              17 lines — entry point (imports all modular CSS)
  base.css              18 lines — reset & base styles (body, particle-canvas)
  header.css            66 lines — header layout, logo, buttons, location display, game btn
  grid.css              19 lines — city grid responsive layout
  card.css              31 lines — city card base styles, glass effect, animations
  card-header.css       69 lines — card header (city name, temp, weather icon)
  card-details.css      87 lines — info rows, details grid, AQI badge, sun times
  hourly.css            65 lines — hourly forecast grid & slots
  charts.css            154 lines — canvas charts, stat rows, combined charts
  icons.css             122 lines — SVG weather icon styles & animations
  modal.css             52 lines — modal overlay, card styles, loading state
  favorites.css         167 lines — favorites dropdown, search, settings
  outage.css            235 lines — network outage panel styling with glitch animations
  donkey-runner.css     740 lines — minigame panel styling & animations
  utilities.css          7 lines — glow/shadow text utilities
js/
  main.js               168 lines — entry point (state + DOM init + event bindings + game toggle)
  constants.js          77 lines — API endpoints, constants, WMO codes & gradients
  cache.js              159 lines — DataCache (localStorage caching with configurable TTLs and LRU eviction)
  favorites.js          108 lines — FavoritesManager (place_id-based favorites)
  utils.js              48 lines — utility functions (unit conversion, haversine, bearing, etc.)
  icons.js              289 lines — animated SVG weather icons
  geo.js                223 lines — geolocation, nearby city discovery, geocoding
  weather.js            262 lines — Open-Meteo weather/AQI API fetching with deduplication and retry logic
  nws-api.js            350 lines — NWS API client (gridpoint data, observation stations, alerts) with rate limiting and cross-source lookup
  render.js             260 lines — DOM rendering (city cards, hourly forecast) with cross-source field mapping
  charts.js             302 lines — canvas chart rendering (merged chart, combined chart, particles)
  location-prompt.js    32 lines — location prompt modal helpers
  refresh-utils.js      38 lines — unit toggle & refresh button handlers
  main-run.js           73 lines — main run() orchestration
  favorites-ui.js       484 lines — favorites dropdown UI & city management
  network-monitor.js    332 lines — network outage detection, animated error panel, auto-retry
  donkey-runner.js      2581 lines — Donkey Runner minigame engine (canvas-based runner)
rag-docs/
  air-quality-api.md    167 lines — documentation for the air-quality endpoint
  geocoding-api.md      137 lines — documentation for the geocoding endpoint
  weather-forecast-api.md 204 lines — documentation for the weather forecast endpoint
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

Additional `localStorage` keys used by the app:

| Key                     | Purpose                                  |
|-------------------------|------------------------------------------|
| `hasW_favorites`        | Array of favorited place_id strings       |
| `hasW_favDetails`       | Map of `{ place_id → {name, state, lat, lon} }` |
| `hasW_maxCities`        | User-configured max city count (default: 6) |
| `hasW_donkeyHighScore`  | Donkey Runner minigame high score         |

Clear all cached data via browser dev tools → Application → Local Storage → remove keys starting with `hasw_cache_`, `hasw_lru_`, or `hasW_`.

## License

MIT. (google it yourself <3)

## Docs

- `rag-docs/air-quality-api.md` — current information about the air-quality-api
- `rag-docs/geocoding-api.md` — current information about the geocoding-api
- `rag-docs/weather-forecast-api.md` — current information about the weather-forecast-api


## Aboot

`Half-Assed Solutions`™ is a project, ran by Yonneh, to release some "actually kinda useful" things that are developed during random hobby development. Yonneh wears most of the hats in this organization- in fact, he wears all of them; but that's only because he is the sole member. If literally ANYONE more competent was around- he'd be fired.
This project, and any others tagged with `Half-Assed Solutions` are completely open-source, and MIT Licensed.
If you found this project under a rock somewhere, and want to see if it was ever finished- it probably came from https://github.com/Yonneh0/hasWeather at some point.

---

if you have made it to this point, and are still reading- I would like to thank you, and question your sanity. have a nice day.