// ===== WIND COMPASS =====
function getWindCompass(deg) {
  const arrow = ['⬆', '↗', '➡', '↘', '⬇', '↙', '⬅', '↖'][Math.round(deg / 45) % 8];
  return `<span class="wind-compass"><span class="compass-dial">${arrow}</span> ${bearingToCompass(deg)} ${deg}°</span>`;
}

// ===== DAY/NIGHT CHECK =====
function isDaytime(hour, sunrise, sunset) {
  return hour >= sunrise && hour < sunset;
}