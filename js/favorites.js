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

  has(placeId) {
    return this.getIds().includes(String(placeId));
  },

  add(placeId, name, state, lat, lon) {
    const ids = this.getIds();
    const details = this.getDetails();
    if (!ids.includes(String(placeId))) {
      ids.push(String(placeId));
      details[String(placeId)] = { name, state, latitude: lat, longitude: lon };
      localStorage.setItem(this._idsKey, JSON.stringify(ids));
      localStorage.setItem(this._detailsKey, JSON.stringify(details));
    }
  },

  remove(placeId) {
    const ids = this.getIds().filter(id => id !== String(placeId));
    const details = this.getDetails();
    delete details[String(placeId)];
    localStorage.setItem(this._idsKey, JSON.stringify(ids));
    localStorage.setItem(this._detailsKey, JSON.stringify(details));
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
