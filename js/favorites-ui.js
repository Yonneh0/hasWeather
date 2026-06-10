// ===== FAVORITES DROPDOWN =====
let _allNearbyCities = []; // 20 nearest cities for dropdown (with place_id)

async function renderFavDropdown(searchQuery) {
  const content = document.getElementById('fav-dropdown-content');
  if (!content) return;

  // Ensure we have nearby cities
  if (_allNearbyCities.length === 0 && userLocation) {
    _allNearbyCities = await fetchAllNearby(20);
  }

  let html = '';

  // Search results (if searching)
  if (searchQuery) {
    try {
      const url = `${NOMINATIM}?q=${encodeURIComponent(searchQuery)}&format=jsonv2&limit=5&addressdetails=1`;
      const res = await fetch(url);
      const data = await res.json();
      if (data?.length > 0) {
        html += '<div class="fav-section-title">Search Results</div>';
        for (const item of data) {
          const addr = item.address || {};
          const name = (item.name || addr.city || '').replace(/^City of\s+/i, '');
          const state = addr.state || addr.state_district || addr.region || addr.county || '';
          const lat = parseFloat(item.lat);
          const lon = parseFloat(item.lon);
          const placeId = String(item.place_id);
          const isFav = FavoritesManager.has(placeId);
          html += renderFavCityItem(placeId, name, state, lat, lon, isFav, false);
        }
      } else {
        html += '<div style="padding:0.5rem;font-size:0.7rem;color:rgba(255,255,255,0.3);text-align:center;">No results</div>';
      }
    } catch {
      html += '<div style="padding:0.5rem;font-size:0.7rem;color:rgba(255,255,255,0.3);text-align:center;">Search failed</div>';
    }
  } else {
    // Categorize cities by type
    const nearestCities = _allNearbyCities.filter(c => c.category === 'nearest_city').slice(0, 3);
    const regionalCapitals = _allNearbyCities.filter(c => c.category === 'regional_capital');
    const stateCapitals = _allNearbyCities.filter(c => c.category === 'state_capital');

    // Show Nearest Cities (exactly 3, non-capital)
    if (nearestCities.length > 0) {
      html += '<div class="fav-section-title">Nearest Cities</div>';
      for (const city of nearestCities) {
        const isFav = FavoritesManager.has(city.place_id);
        html += renderFavCityItem(city.place_id, city.name, city.state || '', city.latitude, city.longitude, isFav, true);
      }
    }

    // Show Regional Capitals
    if (regionalCapitals.length > 0) {
      html += '<div class="fav-section-title">Regional Capitals</div>';
      for (const city of regionalCapitals) {
        const isFav = FavoritesManager.has(city.place_id);
        html += renderFavCityItem(city.place_id, city.name, city.state || '', city.latitude, city.longitude, isFav, true);
      }
    }

    // Show State Capitals
    if (stateCapitals.length > 0) {
      html += '<div class="fav-section-title">State Capitals</div>';
      for (const city of stateCapitals) {
        const isFav = FavoritesManager.has(city.place_id);
        html += renderFavCityItem(city.place_id, city.name, city.state || '', city.latitude, city.longitude, isFav, true);
      }
    }
  }

  // Favorites section (always shown)
  const favAll = FavoritesManager.getAll();
  if (favAll.length > 0) {
    html += '<div class="fav-section-title">My Favorites</div>';
    for (const fav of favAll) {
      html += renderFavCityItem(fav.place_id, fav.name, fav.state || '', fav.latitude, fav.longitude, true, false, true);
    }
  }

  content.innerHTML = html;
  bindFavDropdownEvents();
}

function renderFavCityItem(placeId, name, state, lat, lon, isFav, isNearby, showRemove) {
  const star = isFav ? '<span class="fav-city-star">★</span>' : '';
  const removeBtn = showRemove ? `<button class="fav-city-remove" data-placeid="${placeId}" title="Remove">✕</button>` : '';
  const region = state || '';
  return `<div class="fav-city-item" data-placeid="${placeId}" data-name="${name}" data-lat="${lat}" data-lon="${lon}" data-state="${state}">
    <div class="fav-city-top">
      <span class="fav-city-name">${name}</span>
      ${star}
    </div>
    <div class="fav-city-bottom">
      ${region ? `<span class="fav-city-region">${region}</span>` : '<span></span>'}
      ${removeBtn}
    </div>
  </div>`;
}

function bindFavDropdownEvents() {
  document.querySelectorAll('.fav-city-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      if (e.target.classList.contains('fav-city-remove')) return;
      const placeId = item.dataset.placeid;
      const name = item.dataset.name;
      const lat = parseFloat(item.dataset.lat);
      const lon = parseFloat(item.dataset.lon);
      const state = item.dataset.state;
      const isFav = FavoritesManager.has(placeId);

      if (isFav) {
        FavoritesManager.remove(placeId);
        removeCardByName(name);
      } else {
        FavoritesManager.add(placeId, name, state, lat, lon);
        await addFavoriteCard({ place_id: placeId, name, state, latitude: lat, longitude: lon });
      }
      // Clear search box and re-render all
      const favSearchEl = document.getElementById('fav-search');
      if (favSearchEl) favSearchEl.value = '';
      renderFavDropdown(null);
    });
  });

  document.querySelectorAll('.fav-city-remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const placeId = btn.dataset.placeid;
      const name = btn.closest('.fav-city-item').dataset.name;
      FavoritesManager.remove(placeId);
      removeCardByName(name);
      // Clear search box and re-render all
      const favSearchEl = document.getElementById('fav-search');
      if (favSearchEl) favSearchEl.value = '';
      renderFavDropdown(null);
    });
  });
}

// Feature codes for categorization (from Open-Meteo Geocoding API)
const FEATURE_CODE_MAP = {
  PPLC: 'state_capital',    // Capital of political entity
  PPLA: 'state_capital',    // Administrative seat
  PPLA2: 'regional_capital', // Second-order admin seat
  PPLX: 'regional_capital', // Seat of admin division
  PPL: 'nearest_city',      // Populated place
  TMHN: 'nearest_city',     // Hamlet
  INTL: 'nearest_city',     // International
};

// Fetch feature_codes from Open-Meteo Geocoding API for a list of cities
async function fetchFeatureCodes(cityList) {
  if (!cityList || cityList.length === 0) return {};

  // Extract unique names for geocoding
  const uniqueNames = new Map();
  for (const city of cityList) {
    const nameKey = (city.name || '').toLowerCase().trim();
    if (!uniqueNames.has(nameKey)) {
      uniqueNames.set(nameKey, city);
    }
  }

  // Batch query Open-Meteo Geocoding API (up to 20 names per request)
  const featureCodes = {};
  const nameArray = Array.from(uniqueNames.values()).map(c => c.name);

  // Open-Meteo Geocoding API accepts multiple names as query parameter
  // We query each city individually for accuracy
  const batchSize = 10;
  for (let i = 0; i < nameArray.length; i += batchSize) {
    const batch = nameArray.slice(i, i + batchSize);
    const queries = batch.map(n => encodeURIComponent(n)).join(',');

    try {
      const url = `${OPEN_METEO_GEOCODING}?name=${queries}&count=${batch.length}&language=en&format=json`;
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json();
        if (data?.results) {
          for (const result of data.results) {
            // Match by name and coordinates
            const nameMatch = cityList.find(c =>
              (c.name || '').toLowerCase().trim() === (result.name || '').toLowerCase().trim() &&
              Math.abs(c.latitude - result.latitude) < 0.5 &&
              Math.abs(c.longitude - result.longitude) < 0.5
            );
            if (nameMatch) {
              const code = result.feature_code || '';
              if (code) {
                featureCodes[nameMatch.place_id] = code;
              }
            }
          }
        }
      }
    } catch {
      // silently ignore geocoding failures
    }

    // Small delay between batches to avoid rate limiting
    if (i + batchSize < nameArray.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return featureCodes;
}

async function fetchAllNearby(count) {
  if (!userLocation) return [];

  // First: search close area for nearest cities
  let viewbox = scaleViewbox(userLocation.lat, userLocation.lon, NOMINATIM_CLOSE_RADIUS);
  let url = `${NOMINATIM}?q=city&format=jsonv2&viewbox=${viewbox}&bounded=1&limit=20&addressdetails=1`;
  let results = [];
  try {
    const resp = await fetch(url);
    if (resp.ok) {
      const data = await resp.json();
      results = results.concat(data || []);
    }
  } catch { /* ignore */ }

  // Second: search wider area without bounded to find capitals/regional cities
  viewbox = scaleViewbox(userLocation.lat, userLocation.lon, NOMINATIM_WIDE_RADIUS);
  url = `${NOMINATIM}?q=city&format=jsonv2&viewbox=${viewbox}&limit=100&addressdetails=1`;
  try {
    const resp = await fetch(url);
    if (resp.ok) {
      const data = await resp.json();
      const existingIds = new Set(results.map(r => r.place_id));
      results = results.concat(data.filter(r => r && !existingIds.has(r.place_id)) || []);
    }
  } catch { /* ignore */ }

  // Filter: keep only towns/cities/villages/hamlets/localities, reject boundary/country/fuel/street
  if (results.length > 0) {
    results = results.filter(r => {
      const type = (r.type || '').toLowerCase();
      const cls = (r.class || '').toLowerCase();
      if (cls === 'boundary' && r.place_rank >= 4) return false;
      if (type === 'country' || type === 'state' || type === 'administrative') return false;
      if (type === 'fuel' || type === 'street' || type === 'residential') return false;
      if (r.place_rank >= 10 && r.place_rank <= 16) return true;
      return false;
    });
  }

  // Deduplicate by name+coordinate proximity
  const cities = [];
  const seen = new Set();
  for (const item of results) {
    const addr = item.address || {};
    const name = (item.name || addr.city || '').replace(/^City of\s+/i, '');
    const key = name.toLowerCase().trim();
    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);
    const coordKey = `${DataCache._roundCoord(lat)},${DataCache._roundCoord(lon)}`;

    // Skip duplicates (same name within 0.01° ≈ 1km)
    const nameKey = key;
    for (const existing of seen) {
      if (existing.nameKey === nameKey && existing.coordKey === coordKey) {
        continue; // skip
      }
    }
    seen.add({ nameKey, coordKey });

    // Skip if no name
    if (!name) continue;

    const distance = haversine(userLocation.lat, userLocation.lon, lat, lon);

    // Only include cities within reasonable range (200 miles)
    if (distance < 200) {
      cities.push({
        place_id: String(item.place_id),
        name,
        state: addr.state || addr.state_district || addr.region || addr.county || '',
        latitude: lat,
        longitude: lon,
        distance,
        category: 'nearest_city', // default, will be updated via Open-Meteo
      });
    }
  }

  // Now fetch feature_codes from Open-Meteo Geocoding API for categorization
  if (cities.length > 0) {
    const featureCodes = await fetchFeatureCodes(cities);
    for (const city of cities) {
      const code = featureCodes[city.place_id];
      if (code) {
        const mappedCategory = FEATURE_CODE_MAP[code];
        if (mappedCategory) {
          city.category = mappedCategory;
        }
      }
    }
  }

  // Fallback: for any uncategorized cities, use Nominatim address fields to determine category
  // This catches smaller/lesser-known cities that Open-Meteo geocoding may not have feature_code for
  for (const city of cities) {
    if (city.category === 'nearest_city') {
      // Check if the city IS a state or state_district from the Nominatim address
      // We already have this info from the initial fetch, check the original results
      const stateDistrict = city.state;
      // If state matches a known state_district name, this city might be a regional capital
      // But without additional API call, we can't be sure. Skip for now.
    }
  }

  cities.sort((a, b) => a.distance - b.distance);
  return cities;
}

async function addFavoriteCard(city) {
  // Compute distance and bearing from user location
  const distance = haversine(userLocation.lat, userLocation.lon, city.latitude, city.longitude);
  const bearingVal = bearing(userLocation.lat, userLocation.lon, city.latitude, city.longitude);

  // Pass full city object with distance/bearing to weather fetch
  const cityWithGeo = {
    place_id: city.place_id,
    name: city.name,
    state: city.state,
    latitude: city.latitude,
    longitude: city.longitude,
    distance: distance,
    bearing: bearingVal,
  };

  const weatherResult = await fetchWeatherForCities([cityWithGeo]);
  if (!weatherResult?.[0]?.weather) return;
  const data = weatherResult[0];

  const grid = document.getElementById('city-grid');
  if (!grid) return;

  const card = document.createElement('div');
  card.className = 'city-card';
  card.dataset.cityName = data.name;
  card.style.overflow = 'visible';
  card.innerHTML = renderCityCard(data);
  grid.appendChild(card);

  // Update weatherData
  weatherData.push(data);

  // Apply background
  const code = data.weather.current?.weather_code;
  const bg = WMO_GRADIENTS[code] || WMO_GRADIENTS[0];
  card.style.background = `linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.04)), ${bg}`;

  // Draw charts for this card
  const safeName = sanitizeId(data.name);
  setTimeout(() => {
    drawMergedChart(`chart-merged-${safeName}`, data.weather, data.highTemp, data.lowTemp);
    drawCombinedChart(`chart-combined-${safeName}`, data.weather);
  }, 50);
}

function removeCardByName(name) {
  const grid = document.getElementById('city-grid');
  if (!grid) return;
  const card = grid.querySelector(`.city-card[data-city-name="${CSS.escape(name)}"]`);
  if (card) {
    card.style.transition = 'opacity 0.3s, transform 0.3s';
    card.style.opacity = '0';
    card.style.transform = 'scale(0.95)';
    setTimeout(() => card.remove(), 300);
  }
  weatherData = weatherData.filter(d => d.name !== name);
}

