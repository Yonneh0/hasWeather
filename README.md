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
build.js            build script — inlines CSS/JS into weather.html
index.html          development HTML template (linked CSS/JS)
weather.html        release build — everything bundled together
package.json        project metadata + build script
README.md           you are here
css/
  main.css          929 lines of the best styling known to AI
js/
  main.js           2139 lines of sweet sweet scripts of the java variety
rag-docs/
  air-quality-api.md          documentation for the air-quality endpoint
  geocoding-api.md            documentation for the geocoding endpoint
  weather-forecast-api.md     documentation for the weather forecast endpoint
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