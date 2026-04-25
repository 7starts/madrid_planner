/* Copy this file to `config.js` (which is gitignored) and fill in your key.
 * On GitHub Pages, see README.md for the three handling strategies.
 *
 * Free tier signup: https://home.openweathermap.org/api_keys
 */
window.APP_CONFIG = {
  /* OpenWeatherMap API key. Leave empty string to use climate-average fallback only. */
  openWeatherMapKey: '',

  /* Madrid coordinates for the forecast API call. */
  forecastLocation: { lat: 40.4168, lon: -3.7038, name: 'Madrid' },

  /* Units for temperature: 'metric' (°C), 'imperial' (°F), or 'standard' (K). */
  units: 'metric',

  /* Optional: path to a pre-fetched forecast JSON (built by GitHub Actions).
   * If set and reachable, used instead of calling OWM directly. See README.md. */
  prefetchedForecastUrl: '',
};
