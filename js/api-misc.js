// ===== IP-BASED LOCATION API CLIENT =====
// Provides fallback geolocation via ipinfo.io.

// ===== ENDPOINT =====
const IP_API = 'https://ipinfo.io/json';

// ===== GET LOCATION (Browser Geolocation + IP Fallback) =====
async function getLocation() {
  // Check in-memory cache
  if (userLocation) return userLocation;

  // Check localStorage cache for IP geolocation
  const cachedIP = DataCache.get('ip_location', 'ipLocation');
  if (cachedIP) {
    return cachedIP;
  }

  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: GEOLOCATION_TIMEOUT_MS });
    });
    const { latitude, longitude } = pos.coords;
    const loc = { lat: latitude, lon: longitude };
    // Cache browser geolocation briefly (it's not reliable to cache long-term)
    return loc;
  } catch {
    try {
      const res = await fetch(IP_API);
      const data = await res.json();
      const lat = parseFloat(data.loc?.split(',')[0] ?? data.lat);
      const lon = parseFloat(data.loc?.split(',')[1] ?? data.lon);
      const loc = { lat, lon };
      // Cache IP location for 24 hours
      DataCache.set('ip_location', loc, 'ipLocation');
      return loc;
    } catch {
      showLocationPrompt();
      return { lat: 43.41947, lon: -83.95081 };
    }
  }
}