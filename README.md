# hasWeather (Under Development: Proceed with caution)

## Changelog

### 2026-06-13 — Per-City NWS Enhancement Toggle (Major Refactor)

This release replaces the global source toggle (NWS vs OM for ALL cities) with per-city NWS enhancement toggles. The changes consolidate `favorites-ui.js` into `favorites.js`, restructure the CSS, and refactor the API fetching logic to always use OM as base data with optional NWS enhancement where available.

**Changes:**
- **Architecture**: Always fetch Open-Meteo as base for all cities; NWS is fetched only where available as supplemental enhancement (no global toggle)
- **NWS Toggle Button**: Each city card now has a ⚡ toggle button that appears when NWS coverage is available for that city — users can selectively enhance individual cities with NWS data
- **Visual Feedback**: Toggle buttons show green (success), red (error), amber (outside bounds), or blue (processing) feedback on click
- **Cross-Session Persistence**: NWS toggle state is persisted to localStorage — user preferences are remembered across app reloads
- **Cache Validation**: Stale cache entries are detected and cleaned up during cross-session restore
- **Bounds Cache TTL**: NWS bounds cache now has a 1-hour TTL to prevent memory leak
- **Source Badge Logic**: Enhanced cities always show "ENHANCED" badge; OM-only cities always show "OM" badge (no empty badges)
- **Fullscreen Mode**: Game panel fullscreen restored to fill the viewport (was constrained to 640px centered)
- **Dead CSS Removed**: Unused `.nws-toggle-btn.feedback-*` CSS classes removed
- **HTML Entity Fix**: `escapeHTML()` now uses standard HTML entities instead of broken Unicode escapes
- **File Consolidation**: `favorites-ui.js` deleted; its code merged into `favorites.js`
- **Source Toggle Removed**: Global NWS/OM toggle button and related code removed from UI
- **Background Refresh**: Conditional cache invalidation by source type (NWS-only vs OM cities)

**Fixes:**
1. Fixed contradictory `source`/`nwsActive` state in cross-source cached data
2. Fixed enhanced city badge showing "OM" instead of "ENHANCED" when `nwsActive` is false
3. Fixed fullscreen game panel no longer filling the viewport
4. Removed dead CSS classes for NWS toggle feedback states
5. Added TTL to NWS bounds cache to prevent memory leak
6. Added processing feedback for rapid toggle clicks
7. Added specific feedback for partial NWS data (not just generic error)
8. Fixed `escapeHTML()` using broken Unicode escape sequences
9. Added `place_id !== ''` check for empty placeId in event delegation
10. Fixed source badge always showing "OM" for cities without NWS bounds
11. Conditional cache invalidation by source type during background refresh


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
build.js                249 lines — build script (inlines CSS/JS into weather.html)
favicon.ico                       — site favicon
index.html               74 lines — development HTML template (linked CSS/JS)
package.json             14 lines — project metadata + build script
README.md                         — you are here
weather-full.html       GENERATED — complete single-file build output with comments, including embedded favicon (318kb+)
weather-prod.html       GENERATED — minimized/optimized production-ready single-file build output, without embedded favicon (179kb+)
weather.html            GENERATED — complete single-file build output with comments, without embedded favicon (303kb+)
css/
  base.css              18 lines — reset & base styles (body, particle-canvas)
  main.css               7 lines — entry point (imports all modular CSS)
  layout.css           183 lines — core layout & structural styles (header, city grid, modal, loading, text glow)
  card-components.css  436 lines — card display components (city card, hourly forecast, canvas charts)
  interactive.css      528 lines — interactive elements (favorites dropdown, SVG weather icons, network outage panel)
  donkey-runner.css    740 lines — minigame panel styling & animations
js/
  api-nws.js          1162 lines — NWS API client (gridpoint data, observation stations, alerts) with rate limiting and cross-source lookup
  api-openmeteo.js     314 lines — Open-Meteo weather/AQI API client with deduplication and retry logic
  api-openstreetmap.js 184 lines — Nominatim/OSM nearby city discovery
  cache.js             189 lines — DataCache (localStorage caching with configurable TTLs and LRU eviction)
  charts.js            302 lines — canvas chart rendering (merged chart, combined chart, particles)
  constants.js          72 lines — shared constants (WMO codes & gradients)
  donkey-runner.js    2581 lines — Donkey Runner minigame engine (canvas-based runner)
   favorites-ui.js      592 lines — favorites dropdown UI, city management & FavoritesManager
  icons.js             289 lines — animated SVG weather icons
  main.js              252 lines — entry point (state + DOM init + event bindings + game toggle + run orchestration)
  network-monitor.js   331 lines — network outage detection, animated error panel, auto-retry
  render.js            255 lines — DOM rendering (city cards, hourly forecast) with cross-source field mapping
  utils.js             375 lines — utility functions (unit conversion, haversine, bearing, wind compass, day/night check, location prompt, source toggle, refresh, background refresh, IP-based location fallback (ipinfo.io))
rag-docs/
  air-quality-api.md      167 lines — documentation for the air-quality endpoint
  geocoding-api.md        137 lines — documentation for the geocoding endpoint
  weather-forecast-api.md 204 lines — documentation for the weather forecast endpoint
  weather.gov-api.md     1200 lines — documentation for the NWS API endpoint
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
- `rag-docs/weather-forecast-api.md` — current information about the weather forecast endpoint
- `rag-docs/weather.gov-api.md` — current information about the NWS API endpoint


## Aboot

`Half-Assed Solutions`™ is a project, ran by Yonneh, to release some "actually kinda useful" things that are developed during random hobby development. Yonneh wears most of the hats in this organization- in fact, he wears all of them; but that's only because he is the sole member. If literally ANYONE more competent was around- he'd be fired.
This project, and any others tagged with `Half-Assed Solutions` are completely open-source, and MIT Licensed.
If you found this project under a rock somewhere, and want to see if it was ever finished- it probably came from https://github.com/Yonneh0/hasWeather at some point.

---

if you have made it to this point, and are still reading- I would like to thank you, and question your sanity. have a nice day.