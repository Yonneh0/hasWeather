// ===== FAVORITES MANAGER (place_id-based) =====
const FavoritesManager = {
  _idsKey: 'hasW_favorites',
  _detailsKey: 'hasW_favDetails',

  // Get array of favorited place_id strings
  getIds() {
    try { return JSON.parse(localStorage.getItem(this._idsKey) || '[]'); }
    catch { return []; }
  },

  // Get details map { place_id -> {name, state, lat, lon} }
  getDetails() {
    try { return JSON.parse(localStorage.getItem(this._detailsKey) || '{}'); }
    catch { return {}; }
  },

  has(placeId, lat, lon) {
    // Check by place_id first
    if (this.getIds().includes(String(placeId))) return true;

    // If coordinates are provided, also check by coordinate proximity (0.01° tolerance ≈ 1km)
    if (lat != null && lon != null) {
      const latRounded = Math.round(lat * 100) / 100;
      const lonRounded = Math.round(lon * 100) / 100;
      const details = this.getDetails();
      for (const [id, entry] of Object.entries(details)) {
        const existingLat = Math.round(entry.latitude * 100) / 100;
        const existingLon = Math.round(entry.longitude * 100) / 100;
        if (Math.abs(latRounded - existingLat) < 0.01 && Math.abs(lonRounded - existingLon) < 0.01) {
          return true;
        }
      }
    }
    return false;
  },

  add(placeId, name, state, lat, lon) {
    const ids = this.getIds();
    const details = this.getDetails();

    // Check for coordinate-based duplicates before adding (0.01° tolerance ≈ 1km)
    const latRounded = Math.round(lat * 100) / 100;
    const lonRounded = Math.round(lon * 100) / 100;
    for (const [id, entry] of Object.entries(details)) {
      const existingLat = Math.round(entry.latitude * 100) / 100;
      const existingLon = Math.round(entry.longitude * 100) / 100;
      if (Math.abs(latRounded - existingLat) < 0.01 && Math.abs(lonRounded - existingLon) < 0.01) {
        // Same city by coordinates, update the existing entry instead of adding a duplicate
        details[id] = { name, state, latitude: lat, longitude: lon };
        localStorage.setItem(this._idsKey, JSON.stringify(ids));
        localStorage.setItem(this._detailsKey, JSON.stringify(details));
        return;
      }
    }

    // No coordinate match found, add as new
    if (!ids.includes(String(placeId))) {
      ids.push(String(placeId));
      details[String(placeId)] = { name, state, latitude: lat, longitude: lon };
      localStorage.setItem(this._idsKey, JSON.stringify(ids));
      localStorage.setItem(this._detailsKey, JSON.stringify(details));
    }
  },

  remove(placeId) {
    const ids = this.getIds();
    const details = this.getDetails();
    
    // First try to remove by place_id
    const filteredIds = ids.filter(id => id !== String(placeId));
    const filteredDetails = { ...details };
    delete filteredDetails[String(placeId)];
    
    // If nothing was removed, check by coordinate proximity (0.01° tolerance ≈ 1km)
    if (filteredIds.length === ids.length) {
      // Find the city to remove by place_id from details
      const cityToRemove = details[String(placeId)];
      if (cityToRemove && cityToRemove.latitude != null && cityToRemove.longitude != null) {
        const latRounded = Math.round(cityToRemove.latitude * 100) / 100;
        const lonRounded = Math.round(cityToRemove.longitude * 100) / 100;
        for (const [id, entry] of Object.entries(filteredDetails)) {
          const existingLat = Math.round(entry.latitude * 100) / 100;
          const existingLon = Math.round(entry.longitude * 100) / 100;
          if (Math.abs(latRounded - existingLat) < 0.01 && Math.abs(lonRounded - existingLon) < 0.01) {
            // Found coordinate match, remove this entry
            filteredIds.splice(filteredIds.indexOf(id), 1);
            delete filteredDetails[id];
            break;
          }
        }
      }
    }
    
    localStorage.setItem(this._idsKey, JSON.stringify(filteredIds));
    localStorage.setItem(this._detailsKey, JSON.stringify(filteredDetails));
  },

  // Get all favorite city objects (includes place_id)
  getAll() {
    const ids = this.getIds();
    const details = this.getDetails();
    return ids.map(id => {
      const d = details[id];
      return d ? { ...d, place_id: id } : null;
    }).filter(Boolean);
  },
};
