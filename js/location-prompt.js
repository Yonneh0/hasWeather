// ===== LOCATION PROMPT =====
function showLocationPrompt() {
  document.getElementById('location-prompt').classList.remove('hidden');
}

function hideLocationPrompt() {
  document.getElementById('location-prompt').classList.add('hidden');
}

async function handleCitySearch() {
  const input = document.getElementById('city-input');
  const city = input.value.trim();
  if (!city) return;

  hideLocationPrompt();
  input.value = '';

  try {
    const url = `${NOMINATIM}?q=${encodeURIComponent(city)}&format=jsonv2&limit=1`;
    const res = await fetch(url);
    const data = await res.json();
    if (data?.length > 0) {
      userLocation = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
      document.getElementById('user-location').textContent = `\u{1F4CD} ${userLocation.lat.toFixed(2)}\u00B0N, ${Math.abs(userLocation.lon).toFixed(2)}\u00B0W`;
      await run();
    }
  } catch {
    // silently ignore search failures
  }
}

// ===== REFRESH & UNIT TOGGLE =====
