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
  // Use BOTH place_id AND coordinate proximity matching to prevent duplicates
  const allCities = [...nearby];
  const seenPlaceIds = new Set(nearby.map(c => String(c.place_id)));
  const seenCoords = new Set(nearby.map(c => {
    const lat = c.latitude != null ? DataCache._roundCoord(c.latitude) : null;
    const lon = c.longitude != null ? DataCache._roundCoord(c.longitude) : null;
    return lat != null && lon != null ? `${lat},${lon}` : null;
  }).filter(Boolean));

  for (const fav of favAll) {
    const favPlaceId = String(fav.place_id);
    const favLat = fav.latitude != null ? DataCache._roundCoord(fav.latitude) : null;
    const favLon = fav.longitude != null ? DataCache._roundCoord(fav.longitude) : null;

    // Skip if place_id already seen (same physical city from same source)
    if (seenPlaceIds.has(favPlaceId)) continue;

    // Skip if coordinate proximity match (same physical city from different source)
    const favCoordKey = favLat != null && favLon != null ? `${favLat},${favLon}` : null;
    if (favCoordKey != null) {
      let isCoordDuplicate = false;
      for (const existingCoord of seenCoords) {
        const [exLat, exLon] = existingCoord.split(',').map(Number);
        // 0.01° tolerance (≈1km)
        if (Math.abs(favLat - exLat) < 0.01 && Math.abs(favLon - exLon) < 0.01) {
          isCoordDuplicate = true;
          break;
        }
      }
      if (isCoordDuplicate) continue;
    }

    allCities.push({
      place_id: favPlaceId,
      name: fav.name,
      state: fav.state,
      latitude: fav.latitude,
      longitude: fav.longitude,
      distance: haversine(userLocation.lat, userLocation.lon, fav.latitude, fav.longitude),
      bearing: bearing(userLocation.lat, userLocation.lon, fav.latitude, fav.longitude),
    });
    seenPlaceIds.add(favPlaceId);
    if (favCoordKey != null) seenCoords.add(favCoordKey);
  }

  // Sort all cities by distance from user (closest first)
  allCities.sort((a, b) => a.distance - b.distance);

  if (allCities.length === 0) {
    return;
  }

  weatherData = await fetchWeatherForCities(allCities);
  renderAll();
}

