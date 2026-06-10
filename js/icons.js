// ===== SVG WEATHER ICONS - LOUD & ANIMATED =====
function getWeatherIcon(code, size = 64) {
  const w = WMO_CODES[code] || WMO_CODES[0];
  return loudWeatherIcon(w.icon, size);
}

function getMoonIcon(code, size = 64) {
  return loudWeatherIcon('moon', size);
}

function loudWeatherIcon(type, size) {
  const icons = {
    sun: `<svg class="weather-svg weather-icon-animated weather-icon-sun" width="${size}" height="${size}" viewBox="0 0 64 64">
      <g class="icon-glow">
        <circle cx="32" cy="32" r="18" fill="rgba(255,213,79,0.15)">
          <animate attributeName="r" values="16;22;16" dur="3s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.1;0.25;0.1" dur="3s" repeatCount="indefinite"/>
        </circle>
      </g>
      <circle cx="32" cy="32" r="12" class="sun" stroke-width="2.5">
        <animate attributeName="r" values="11;13;11" dur="4s" repeatCount="indefinite"/>
      </circle>
      <g class="icon-rotate">
        <line x1="32" y1="8" x2="32" y2="16" class="sun" stroke-width="2.5"/>
        <line x1="32" y1="48" x2="32" y2="56" class="sun" stroke-width="2.5"/>
        <line x1="8" y1="32" x2="16" y2="32" class="sun" stroke-width="2.5"/>
        <line x1="48" y1="32" x2="56" y2="32" class="sun" stroke-width="2.5"/>
        <line x1="15" y1="15" x2="21" y2="21" class="sun" stroke-width="2.5"/>
        <line x1="43" y1="43" x2="49" y2="49" class="sun" stroke-width="2.5"/>
        <line x1="49" y1="15" x2="43" y2="21" class="sun" stroke-width="2.5"/>
        <line x1="15" y1="49" x2="21" y2="43" class="sun" stroke-width="2.5"/>
      </g>
    </svg>`,
    moon: `<svg class="weather-svg weather-icon-animated weather-icon-moon" width="${size}" height="${size}" viewBox="0 0 64 64">
      <g class="icon-bob">
        <circle cx="48" cy="16" r="1.5" fill="#e0e0e0">
          <animate attributeName="opacity" values="0.3;1;0.3" dur="2s" repeatCount="indefinite"/>
        </circle>
        <circle cx="54" cy="30" r="1" fill="#e0e0e0">
          <animate attributeName="opacity" values="0.2;0.8;0.2" dur="3s" repeatCount="indefinite"/>
        </circle>
        <circle cx="44" cy="48" r="1.2" fill="#e0e0e0">
          <animate attributeName="opacity" values="0.4;1;0.4" dur="2.5s" repeatCount="indefinite"/>
        </circle>
        <circle cx="56" cy="42" r="0.8" fill="#e0e0e0">
          <animate attributeName="opacity" values="0.3;0.9;0.3" dur="3.5s" repeatCount="indefinite"/>
        </circle>
      </g>
      <path d="M36 10 A22 22 0 1 0 36 46 A18 18 0 1 1 36 10 Z" class="moon" fill="#e0e0e0" stroke="none" stroke-width="1">
        <animateTransform attributeName="transform" type="rotate" values="-5 32 32;5 32 32;-5 32 32" dur="6s" repeatCount="indefinite"/>
      </path>
    </svg>`,
    'cloud-sun': `<svg class="weather-svg weather-icon-animated weather-icon-cloud-sun" width="${size}" height="${size}" viewBox="0 0 64 64">
      <g class="icon-rotate">
        <circle cx="22" cy="24" r="10" fill="#ffd54f" stroke="none">
          <animate attributeName="r" values="9;12;9" dur="4s" repeatCount="indefinite"/>
        </circle>
        <g>
          <line x1="22" y1="8" x2="22" y2="14" stroke="#ffd54f" stroke-width="2.5"/>
          <line x1="22" y1="34" x2="22" y2="40" stroke="#ffd54f" stroke-width="2.5"/>
          <line x1="6" y1="24" x2="12" y2="24" stroke="#ffd54f" stroke-width="2.5"/>
          <line x1="32" y1="24" x2="38" y2="24" stroke="#ffd54f" stroke-width="2.5"/>
          <line x1="11" y1="13" x2="15" y2="17" stroke="#ffd54f" stroke-width="2.5"/>
          <line x1="29" y1="31" x2="33" y2="35" stroke="#ffd54f" stroke-width="2.5"/>
          <line x1="33" y1="13" x2="29" y2="17" stroke="#ffd54f" stroke-width="2.5"/>
          <line x1="11" y1="35" x2="15" y2="31" stroke="#ffd54f" stroke-width="2.5"/>
        </g>
      </g>
      <g class="icon-drift">
        <path d="M18 50 Q18 38 28 38 Q30 26 42 28 Q54 28 54 38 Q54 50 44 50 Z" class="cloud" stroke-width="2"/>
      </g>
    </svg>`,
    cloud: `<svg class="weather-svg weather-icon-animated weather-icon-cloud" width="${size}" height="${size}" viewBox="0 0 64 64">
      <g class="icon-drift">
        <path d="M16 46 Q16 34 26 34 Q28 22 42 24 Q54 24 54 36 Q54 46 44 46 Z" class="cloud" stroke-width="2">
          <animateTransform attributeName="transform" type="translate" values="-1,0;1,0;-1,0" dur="4s" repeatCount="indefinite"/>
        </path>
      </g>
    </svg>`,
    fog: `<svg class="weather-svg weather-icon-animated weather-icon-fog" width="${size}" height="${size}" viewBox="0 0 64 64">
      <g>
        <line x1="8" y1="18" x2="56" y2="18" stroke="#b0bec5" stroke-width="2.5" opacity="0.6">
          <animate attributeName="x1" values="8;12;8" dur="4s" repeatCount="indefinite"/>
          <animate attributeName="x2" values="56;60;56" dur="4s" repeatCount="indefinite"/>
        </line>
        <line x1="10" y1="28" x2="54" y2="28" stroke="#b0bec5" stroke-width="2.5" opacity="0.5">
          <animate attributeName="x1" values="10;14;10" dur="5s" repeatCount="indefinite"/>
          <animate attributeName="x2" values="54;58;54" dur="5s" repeatCount="indefinite"/>
        </line>
        <line x1="8" y1="38" x2="56" y2="38" stroke="#b0bec5" stroke-width="2.5" opacity="0.6">
          <animate attributeName="x1" values="8;12;8" dur="4.5s" repeatCount="indefinite"/>
          <animate attributeName="x2" values="56;60;56" dur="4.5s" repeatCount="indefinite"/>
        </line>
        <line x1="10" y1="48" x2="54" y2="48" stroke="#b0bec5" stroke-width="2.5" opacity="0.5">
          <animate attributeName="x1" values="10;14;10" dur="5.5s" repeatCount="indefinite"/>
          <animate attributeName="x2" values="54;58;54" dur="5.5s" repeatCount="indefinite"/>
        </line>
      </g>
    </svg>`,
    drizzle: `<svg class="weather-svg weather-icon-animated weather-icon-rain" width="${size}" height="${size}" viewBox="0 0 64 64">
      <g class="icon-drift">
        <path d="M16 34 Q16 22 26 22 Q28 12 42 14 Q54 14 54 26 Q54 34 44 34 Z" class="cloud" stroke-width="2"/>
      </g>
      <g>
        <line x1="20" y1="38" x2="18" y2="46" class="rain" stroke-width="2">
          <animate attributeName="y1" values="38;42;38" dur="1s" repeatCount="indefinite"/>
          <animate attributeName="y2" values="46;50;46" dur="1s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="1;0.5;1" dur="1s" repeatCount="indefinite"/>
        </line>
        <line x1="32" y1="38" x2="30" y2="48" class="rain" stroke-width="2">
          <animate attributeName="y1" values="38;42;38" dur="1.2s" repeatCount="indefinite"/>
          <animate attributeName="y2" values="48;52;48" dur="1.2s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.5;1;0.5" dur="1.2s" repeatCount="indefinite"/>
        </line>
        <line x1="44" y1="38" x2="42" y2="46" class="rain" stroke-width="2">
          <animate attributeName="y1" values="38;42;38" dur="0.9s" repeatCount="indefinite"/>
          <animate attributeName="y2" values="46;50;46" dur="0.9s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="1;0.5;1" dur="0.9s" repeatCount="indefinite"/>
        </line>
      </g>
    </svg>`,
    rain: `<svg class="weather-svg weather-icon-animated weather-icon-rain" width="${size}" height="${size}" viewBox="0 0 64 64">
      <g class="icon-drift">
        <path d="M14 32 Q14 20 26 20 Q28 10 44 12 Q56 12 56 26 Q56 34 44 34 Z" class="cloud" stroke-width="2"/>
      </g>
      <g>
        <line x1="18" y1="36" x2="14" y2="48" class="rain" stroke-width="2.5">
          <animate attributeName="y1" values="36;42;36" dur="0.8s" repeatCount="indefinite"/>
          <animate attributeName="y2" values="48;54;48" dur="0.8s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="1;0.4;1" dur="0.8s" repeatCount="indefinite"/>
        </line>
        <line x1="28" y1="36" x2="24" y2="50" class="rain" stroke-width="2.5">
          <animate attributeName="y1" values="36;42;36" dur="0.9s" repeatCount="indefinite"/>
          <animate attributeName="y2" values="50;54;50" dur="0.9s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.4;1;0.4" dur="0.9s" repeatCount="indefinite"/>
        </line>
        <line x1="38" y1="36" x2="34" y2="48" class="rain" stroke-width="2.5">
          <animate attributeName="y1" values="36;42;36" dur="0.7s" repeatCount="indefinite"/>
          <animate attributeName="y2" values="48;54;48" dur="0.7s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="1;0.4;1" dur="0.7s" repeatCount="indefinite"/>
        </line>
        <line x1="48" y1="36" x2="44" y2="50" class="rain" stroke-width="2.5">
          <animate attributeName="y1" values="36;42;36" dur="1s" repeatCount="indefinite"/>
          <animate attributeName="y2" values="50;54;50" dur="1s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.4;1;0.4" dur="1s" repeatCount="indefinite"/>
        </line>
      </g>
    </svg>`,
    snow: `<svg class="weather-svg weather-icon-animated weather-icon-snow" width="${size}" height="${size}" viewBox="0 0 64 64">
      <g class="icon-drift">
        <path d="M16 34 Q16 22 26 22 Q28 12 42 14 Q54 14 54 26 Q54 34 44 34 Z" class="cloud" stroke-width="2"/>
      </g>
      <g>
        <circle cx="20" cy="40" r="2.5" fill="#e0e0e0">
          <animate attributeName="cy" values="40;54" dur="2s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="1;0" dur="2s" repeatCount="indefinite"/>
        </circle>
        <circle cx="32" cy="38" r="2.5" fill="#e0e0e0">
          <animate attributeName="cy" values="38;52" dur="2.2s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="1;0" dur="2.2s" repeatCount="indefinite"/>
        </circle>
        <circle cx="44" cy="40" r="2.5" fill="#e0e0e0">
          <animate attributeName="cy" values="40;54" dur="1.8s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="1;0" dur="1.8s" repeatCount="indefinite"/>
        </circle>
        <circle cx="26" cy="48" r="2.5" fill="#e0e0e0">
          <animate attributeName="cy" values="48;56" dur="2.5s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="1;0" dur="2.5s" repeatCount="indefinite"/>
        </circle>
        <circle cx="38" cy="46" r="2.5" fill="#e0e0e0">
          <animate attributeName="cy" values="46;56" dur="2.1s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="1;0" dur="2.1s" repeatCount="indefinite"/>
        </circle>
      </g>
    </svg>`,
    showers: `<svg class="weather-svg weather-icon-animated weather-icon-rain" width="${size}" height="${size}" viewBox="0 0 64 64">
      <g class="icon-drift">
        <path d="M12 30 Q12 18 26 18 Q28 8 44 10 Q56 10 56 24 Q56 34 44 34 Z" class="cloud" stroke-width="2"/>
      </g>
      <g>
        <line x1="16" y1="34" x2="12" y2="48" class="rain" stroke-width="3">
          <animate attributeName="y1" values="34;42;34" dur="0.6s" repeatCount="indefinite"/>
          <animate attributeName="y2" values="48;56;48" dur="0.6s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="1;0.3;1" dur="0.6s" repeatCount="indefinite"/>
        </line>
        <line x1="28" y1="34" x2="24" y2="54" class="rain" stroke-width="3">
          <animate attributeName="y1" values="34;42;34" dur="0.7s" repeatCount="indefinite"/>
          <animate attributeName="y2" values="54;56;54" dur="0.7s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.3;1;0.3" dur="0.7s" repeatCount="indefinite"/>
        </line>
        <line x1="40" y1="34" x2="36" y2="48" class="rain" stroke-width="3">
          <animate attributeName="y1" values="34;42;34" dur="0.5s" repeatCount="indefinite"/>
          <animate attributeName="y2" values="48;56;48" dur="0.5s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="1;0.3;1" dur="0.5s" repeatCount="indefinite"/>
        </line>
        <line x1="52" y1="34" x2="48" y2="54" class="rain" stroke-width="3">
          <animate attributeName="y1" values="34;42;34" dur="0.8s" repeatCount="indefinite"/>
          <animate attributeName="y2" values="54;56;54" dur="0.8s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.3;1;0.3" dur="0.8s" repeatCount="indefinite"/>
        </line>
      </g>
    </svg>`,
    'freezing-rain': `<svg class="weather-svg weather-icon-animated weather-icon-rain" width="${size}" height="${size}" viewBox="0 0 64 64">
      <g class="icon-drift">
        <path d="M16 34 Q16 22 26 22 Q28 12 42 14 Q54 14 54 26 Q54 34 44 34 Z" class="cloud" stroke-width="2"/>
      </g>
      <g>
        <line x1="20" y1="38" x2="18" y2="44" class="rain" stroke-width="2">
          <animate attributeName="y1" values="38;42;38" dur="0.8s" repeatCount="indefinite"/>
          <animate attributeName="y2" values="44;48;44" dur="0.8s" repeatCount="indefinite"/>
        </line>
        <line x1="32" y1="38" x2="30" y2="46" class="rain" stroke-width="2">
          <animate attributeName="y1" values="38;42;38" dur="0.9s" repeatCount="indefinite"/>
          <animate attributeName="y2" values="46;50;46" dur="0.9s" repeatCount="indefinite"/>
        </line>
        <line x1="44" y1="38" x2="42" y2="44" class="rain" stroke-width="2">
          <animate attributeName="y1" values="38;42;38" dur="0.7s" repeatCount="indefinite"/>
          <animate attributeName="y2" values="44;48;44" dur="0.7s" repeatCount="indefinite"/>
        </line>
        <line x1="20" y1="46" x2="20" y2="50" class="snow" stroke-width="1.5">
          <animate attributeName="y1" values="46;48;46" dur="1.5s" repeatCount="indefinite"/>
          <animate attributeName="y2" values="50;52;50" dur="1.5s" repeatCount="indefinite"/>
        </line>
        <line x1="32" y1="46" x2="32" y2="50" class="snow" stroke-width="1.5">
          <animate attributeName="y1" values="46;48;46" dur="1.7s" repeatCount="indefinite"/>
          <animate attributeName="y2" values="50;52;50" dur="1.7s" repeatCount="indefinite"/>
        </line>
        <line x1="44" y1="46" x2="44" y2="50" class="snow" stroke-width="1.5">
          <animate attributeName="y1" values="46;48;46" dur="1.3s" repeatCount="indefinite"/>
          <animate attributeName="y2" values="50;52;50" dur="1.3s" repeatCount="indefinite"/>
        </line>
      </g>
    </svg>`,
    'snow-showers': `<svg class="weather-svg weather-icon-animated weather-icon-snow" width="${size}" height="${size}" viewBox="0 0 64 64">
      <g class="icon-drift">
        <path d="M12 30 Q12 18 26 18 Q28 8 44 10 Q56 10 56 24 Q56 34 44 34 Z" class="cloud" stroke-width="2"/>
      </g>
      <g>
        <circle cx="16" cy="38" r="3" fill="#e0e0e0">
          <animate attributeName="cy" values="38;54" dur="2s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="1;0" dur="2s" repeatCount="indefinite"/>
        </circle>
        <circle cx="28" cy="40" r="3" fill="#e0e0e0">
          <animate attributeName="cy" values="40;54" dur="2.3s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="1;0" dur="2.3s" repeatCount="indefinite"/>
        </circle>
        <circle cx="40" cy="38" r="3" fill="#e0e0e0">
          <animate attributeName="cy" values="38;54" dur="1.9s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="1;0" dur="1.9s" repeatCount="indefinite"/>
        </circle>
        <circle cx="52" cy="40" r="3" fill="#e0e0e0">
          <animate attributeName="cy" values="40;54" dur="2.1s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="1;0" dur="2.1s" repeatCount="indefinite"/>
        </circle>
      </g>
    </svg>`,
    'snow-grains': `<svg class="weather-svg weather-icon-animated weather-icon-snow" width="${size}" height="${size}" viewBox="0 0 64 64">
      <g class="icon-drift">
        <path d="M16 34 Q16 22 26 22 Q28 12 42 14 Q54 14 54 26 Q54 34 44 34 Z" class="cloud" stroke-width="2"/>
      </g>
      <g>
        <line x1="20" y1="38" x2="20" y2="44" class="snow" stroke-width="2">
          <animate attributeName="y1" values="38;42;38" dur="1s" repeatCount="indefinite"/>
          <animate attributeName="y2" values="44;48;44" dur="1s" repeatCount="indefinite"/>
        </line>
        <line x1="32" y1="38" x2="32" y2="44" class="snow" stroke-width="2">
          <animate attributeName="y1" values="38;42;38" dur="1.1s" repeatCount="indefinite"/>
          <animate attributeName="y2" values="44;48;44" dur="1.1s" repeatCount="indefinite"/>
        </line>
        <line x1="44" y1="38" x2="44" y2="44" class="snow" stroke-width="2">
          <animate attributeName="y1" values="38;42;38" dur="0.9s" repeatCount="indefinite"/>
          <animate attributeName="y2" values="44;48;44" dur="0.9s" repeatCount="indefinite"/>
        </line>
      </g>
    </svg>`,
    thunderstorm: `<svg class="weather-svg weather-icon-animated weather-icon-thunder" width="${size}" height="${size}" viewBox="0 0 64 64">
      <g class="icon-shake">
        <path d="M12 28 Q12 16 26 16 Q28 6 44 8 Q56 8 56 22 Q56 32 44 32 Z" class="cloud" stroke-width="2"/>
      </g>
      <g>
        <polygon points="32,32 26,44 34,44 30,56 42,42 34,42 38,32" fill="#ffd54f" stroke="#e6a817" stroke-width="1">
          <animate attributeName="opacity" values="1;0.3;1;1;0.5;1" dur="2s" repeatCount="indefinite"/>
        </polygon>
      </g>
    </svg>`,
  };
  return icons[type] || icons.sun;
}

