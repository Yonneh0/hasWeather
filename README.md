# hasW Weather

single file weather app, by Half-Assed Solutions.
completely self-contained single file weather app, that uses public sources, with proper local caching, to provide reliable comprehensive weather information, with 0 ads. Brought to you by `Carls' Jr`.

## Features

- Multiple city monitoring in a responsive grid layout
- Weather data from Open-Meteo API (temperature, humidity, wind, precipitation, UV index, air quality)
- localStorage-based caching with configurable TTLs per data type (15 min for weather/AQI, 24h for geocoding)
- Favorites system using place_id with deduplication and proximity checking
- °F/°C unit toggle with debouncing
- Animated SVG weather icons (16+ weather types with glow, rotation, drift, shake, and bob animations)
- Automatic geolocation via browser Geolocation API, falling back to ipinfo.io IP-based lookup
- Nearby city discovery via Nominatim/Overpass with bearing-based diversity selection
- Wind compass display with directional arrows
- Day/night aware UI theming
- Debug quick-select buttons for common test locations
- Particle canvas background animation
- Zero external dependencies — pure vanilla HTML/CSS/JS

## Tech Stack

- **Frontend:** Vanilla HTML5, CSS3, JavaScript (ES6+)
- **Build:** Node.js (no frameworks, no npm packages required at runtime)
- **Weather Data:** [Open-Meteo API](https://open-meteo.com/) (forecast + current)
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
build.js                67 lines — build script (inlines CSS/JS into weather.html)
index.html              68 lines — development HTML template (linked CSS/JS)
weather.html            3127 lines — release build (everything bundled together)
package.json            11 lines — project metadata + build script
README.md               — you are here
css/
  main.css              13 lines — entry point (imports all modular CSS)
  base.css              18 lines — reset & base styles (body, particle-canvas)
  header.css            48 lines — header layout, logo, buttons, location display
  grid.css              18 lines — city grid responsive layout
  card.css              27 lines — city card base styles, glass effect, animations
  card-header.css       63 lines — card header (city name, temp, weather icon)
  card-details.css      84 lines — info rows, details grid, AQI badge, sun times
  hourly.css            65 lines — hourly forecast grid & slots
  daily.css             70 lines — 7-day forecast rows & temperature bars
  charts.css            134 lines — canvas charts, stat rows, combined charts
  icons.css             110 lines — SVG weather icon styles & animations
  modal.css             43 lines — modal overlay, card styles, loading state
  favorites.css         163 lines — favorites dropdown, search, settings
  utilities.css          6 lines — glow/shadow text utilities
js/
  main.js               147 lines — entry point (state + DOM initialization + event bindings)
  constants.js          80 lines — API endpoints, constants, WMO codes & gradients
  cache.js              112 lines — DataCache (localStorage caching with configurable TTLs)
  favorites.js          50 lines — FavoritesManager (place_id-based favorites)
  utils.js              51 lines — utility functions (unit conversion, haversine, bearing, etc.)
  icons.js              289 lines — animated SVG weather icons
  geo.js                223 lines — geolocation, nearby city discovery, geocoding
  weather.js            165 lines — weather/AQI API fetching
  render.js             243 lines — DOM rendering (city cards, hourly/daily forecasts)
  charts.js             285 lines — canvas chart rendering (merged chart, combined chart, particles)
  location-prompt.js    32 lines — location prompt modal helpers
  refresh-utils.js      38 lines — unit toggle & refresh button handlers
  main-run.js           45 lines — main run() orchestration
  favorites-ui.js       379 lines — favorites dropdown UI & city management
rag-docs/
  air-quality-api.md    168 lines — documentation for the air-quality endpoint
  geocoding-api.md      138 lines — documentation for the geocoding endpoint
  weather-forecast-api.md 205 lines — documentation for the weather forecast endpoint
```

## Caching

All API responses are cached in `localStorage` with type-specific TTLs:

| Data Type      | TTL       | Cache Key Pattern            |
|---------------|-----------|------------------------------|
| Weather/AQI   | 15 min    | `hasw_cache_weather_X_Y`     |
| Geocoding     | 24 hours  | `hasw_cache_geocode_X`       |
| Nearby Cities | 10 min    | `hasw_cache_nearby_X_Y`      |
| IP Location   | 24 hours  | `hasw_cache_ip_location`     |

Cache size is visible in the UI. Clear all cached data via the debug interface (browser dev tools → Application → Local Storage → keys starting with `hasw_cache_`).

## License

MIT. (google it yourself <3)

## Docs

- `rag-docs/air-quality-api.md` — current information about the air-quality-api
- `rag-docs/geocoding-api.md` — current information about the geocoding-api
- `rag-docs/weather-forecast-api.md` — current information about the weather-forecast-api

---

if you have made it to this point, and are still reading- I would like to thank you, and question your sanity. have a nice day.