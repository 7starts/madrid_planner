/* Local config — gitignored. Replace the empty string with your OpenWeatherMap key.
 * If you commit this file by accident, rotate the key at
 * https://home.openweathermap.org/api_keys
 */
window.APP_CONFIG = {
  /* Empty — the key never ships to the browser. The GitHub Actions workflow
   * (.github/workflows/refresh-weather.yml) fetches the forecast and commits
   * it as weather.json, which the site reads via prefetchedForecastUrl below. */
  openWeatherMapKey: '',
  forecastLocation: { lat: 40.4168, lon: -3.7038, name: 'Madrid' },
  units: 'metric',
  prefetchedForecastUrl: 'weather.json',
};
