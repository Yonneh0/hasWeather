// ===== API Endpoints =====
const NWS_API = 'https://api.weather.gov';

// ===== Earth & Distance Constants =====
const EARTH_RADIUS_MI = 3958.8;
const METERS_PER_MILE = 1609.34;
const GEOLOCATION_TIMEOUT_MS = 8000;
const NEARBY_CACHE_TTL_MS = 600000;
const MAX_CITIES = 6;
const MIN_CITY_DISTANCE_MI = 8;
const HOURLY_FORECAST_SLOTS = 24;
const CHART_DRAW_DELAY_MS = 400;
const CHART_RESIZE_DEBOUNCE_MS = 250;
const TOGGLE_DEBOUNCE_MS = 300;
const RENDER_ALL_CHART_DELAY_MS = 400;
const PARTICLE_COUNT = 30;
const TEMP_GLOBAL_MIN = -40;
const TEMP_GLOBAL_MAX = 80;

// ===== WMO WEATHER CODES =====
const WMO_CODES = {
  0: { icon: 'sun', label: 'Clear Sky' },
  1: { icon: 'sun', label: 'Mainly Clear' },
  2: { icon: 'cloud-sun', label: 'Partly Cloudy' },
  3: { icon: 'cloud', label: 'Overcast' },
  45: { icon: 'fog', label: 'Foggy' },
  48: { icon: 'fog', label: 'Rime Fog' },
  51: { icon: 'drizzle', label: 'Light Drizzle' },
  53: { icon: 'drizzle', label: 'Moderate Drizzle' },
  55: { icon: 'drizzle', label: 'Dense Drizzle' },
  56: { icon: 'freezing-rain', label: 'Freezing Drizzle' },
  57: { icon: 'freezing-rain', label: 'Heavy Freezing Drizzle' },
  61: { icon: 'rain', label: 'Light Rain' },
  63: { icon: 'rain', label: 'Moderate Rain' },
  65: { icon: 'rain', label: 'Heavy Rain' },
  66: { icon: 'freezing-rain', label: 'Freezing Rain' },
  67: { icon: 'freezing-rain', label: 'Heavy Freezing Rain' },
  71: { icon: 'snow', label: 'Light Snow' },
  73: { icon: 'snow', label: 'Moderate Snow' },
  75: { icon: 'snow', label: 'Heavy Snow' },
  77: { icon: 'snow-grains', label: 'Snow Grains' },
  80: { icon: 'showers', label: 'Light Showers' },
  81: { icon: 'showers', label: 'Moderate Showers' },
  82: { icon: 'showers', label: 'Violent Showers' },
  85: { icon: 'snow-showers', label: 'Snow Showers' },
  86: { icon: 'snow-showers', label: 'Heavy Snow Showers' },
  95: { icon: 'thunderstorm', label: 'Thunderstorm' },
  96: { icon: 'thunderstorm', label: 'Thunderstorm + Hail' },
  99: { icon: 'thunderstorm', label: 'Heavy Thunderstorm + Hail' },
};

// ===== WMO GRADIENTS =====
const WMO_GRADIENTS = {
  0: 'linear-gradient(180deg, rgba(30,60,120,0.5) 0%, rgba(10,20,40,0.3) 100%)',
  1: 'linear-gradient(180deg, rgba(30,60,120,0.5) 0%, rgba(10,20,40,0.3) 100%)',
  2: 'linear-gradient(180deg, rgba(60,80,110,0.5) 0%, rgba(20,30,50,0.3) 100%)',
  3: 'linear-gradient(180deg, rgba(70,70,80,0.5) 0%, rgba(30,30,35,0.3) 100%)',
  45: 'linear-gradient(180deg, rgba(80,90,100,0.5) 0%, rgba(40,45,50,0.3) 100%)',
  48: 'linear-gradient(180deg, rgba(80,90,100,0.5) 0%, rgba(40,45,50,0.3) 100%)',
  51: 'linear-gradient(180deg, rgba(25,45,75,0.5) 0%, rgba(15,25,40,0.3) 100%)',
  53: 'linear-gradient(180deg, rgba(25,45,75,0.5) 0%, rgba(15,25,40,0.3) 100%)',
  55: 'linear-gradient(180deg, rgba(20,40,70,0.5) 0%, rgba(10,20,35,0.3) 100%)',
  61: 'linear-gradient(180deg, rgba(25,45,75,0.5) 0%, rgba(15,25,40,0.3) 100%)',
  63: 'linear-gradient(180deg, rgba(20,40,70,0.5) 0%, rgba(10,20,35,0.3) 100%)',
  65: 'linear-gradient(180deg, rgba(15,35,65,0.5) 0%, rgba(10,15,30,0.3) 100%)',
  71: 'linear-gradient(180deg, rgba(60,90,130,0.5) 0%, rgba(30,45,65,0.3) 100%)',
  73: 'linear-gradient(180deg, rgba(55,85,125,0.5) 0%, rgba(25,40,60,0.3) 100%)',
  75: 'linear-gradient(180deg, rgba(50,80,120,0.5) 0%, rgba(20,35,55,0.3) 100%)',
  80: 'linear-gradient(180deg, rgba(35,55,75,0.5) 0%, rgba(20,30,45,0.3) 100%)',
  95: 'linear-gradient(180deg, rgba(45,25,75,0.5) 0%, rgba(25,15,45,0.3) 100%)',
  96: 'linear-gradient(180deg, rgba(45,25,75,0.5) 0%, rgba(25,15,45,0.3) 100%)',
  99: 'linear-gradient(180deg, rgba(45,25,75,0.5) 0%, rgba(25,15,45,0.3) 100%)',
};
