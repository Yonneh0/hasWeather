// ===== MAIN RUN =====
async function run() {
  if (!userLocation) {
    userLocation = await getLocation();
  }

  const locEl = document.getElementById('user-location');
  if (locEl) locEl.textContent = `\u{1F4CD} ${userLocation.lat.toFixed(2)}\u00B0N, ${Math.abs(userLocation.lon).toFixed(2)}\u00B0W`;

  _nearbyCache = null;
  _nearbyCacheTime = 0;

  // Load nearby cities + favorites, then render both
  const nearby = await findNearbyCities(userLocation.lat, userLocation.lon);
  const favAll = FavoritesManager.getAll();

  // Combine: nearby cities first, then favorites that aren't already in nearby
  const allCities = [...nearby];
  const seenIds = new Set(nearby.map(c => c.place_id));
  for (const fav of favAll) {
    if (!seenIds.has(fav.place_id)) {
      allCities.push({
        place_id: fav.place_id,
        name: fav.name,
        state: fav.state,
        latitude: fav.latitude,
        longitude: fav.longitude,
        distance: haversine(userLocation.lat, userLocation.lon, fav.latitude, fav.longitude),
        bearing: bearing(userLocation.lat, userLocation.lon, fav.latitude, fav.longitude),
      });
      seenIds.add(fav.place_id);
    }
  }

  // Sort all cities by distance from user (closest first)
  allCities.sort((a, b) => a.distance - b.distance);

  if (allCities.length === 0) {
    return;
  }

  weatherData = await fetchWeatherForCities(allCities);
  renderAll();
}

