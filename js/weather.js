/* Weather module — calls OpenWeatherMap /forecast (5-day / 3-hour) and aggregates per day.
 * Falls back to a published climate average for any date outside the forecast window. */

(function () {
  'use strict';

  /* Madrid late-April / early-May climate averages (sources: Climate Data, esmadrid.com).
   * Used as fallback when the API key is missing or the trip date is outside the 5-day window. */
  const CLIMATE_AVERAGES = {
    '2026-04-28': { tMax: 19, tMin: 9,  desc: 'partly sunny', icon: '⛅' },
    '2026-04-29': { tMax: 20, tMin: 10, desc: 'partly sunny', icon: '⛅' },
    '2026-04-30': { tMax: 20, tMin: 10, desc: 'sunny',        icon: '☀️' },
    '2026-05-01': { tMax: 21, tMin: 11, desc: 'mostly sunny', icon: '🌤️' },
    '2026-05-02': { tMax: 22, tMin: 11, desc: 'mostly sunny', icon: '🌤️' },
    '2026-05-03': { tMax: 22, tMin: 12, desc: 'sunny',        icon: '☀️' },
  };

  /* Climate averages for day-trip cities on their respective trip dates.
   * Keyed by city name; used when live OWM data is unavailable or outside forecast window. */
  const CITY_CLIMATE = {
    Toledo:               { tMax: 22, tMin: 9,  desc: 'mostly sunny', icon: '🌤️' },
    Valencia:             { tMax: 23, tMin: 14, desc: 'sunny',         icon: '☀️' },
    Segovia:              { tMax: 17, tMin: 5,  desc: 'partly sunny',  icon: '⛅' },
    'El Escorial':        { tMax: 18, tMin: 7,  desc: 'partly sunny',  icon: '⛅' },
    'Ávila':              { tMax: 15, tMin: 4,  desc: 'partly sunny',  icon: '⛅' },
    'Alcalá de Henares':  { tMax: 20, tMin: 9,  desc: 'mostly sunny',  icon: '🌤️' },
  };

  /* OWM weather-condition main → emoji. Centralised so tests / future changes are trivial. */
  const ICONS = {
    Clear: '☀️', Clouds: '☁️', Rain: '🌧️', Drizzle: '🌦️',
    Thunderstorm: '⛈️', Snow: '❄️', Mist: '🌫️', Fog: '🌫️', Haze: '🌫️',
  };

  function pad(n) { return String(n).padStart(2, '0'); }
  function dateKey(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /* Aggregate OWM 3-hour entries into per-day {tMax, tMin, desc, icon}. */
  function aggregateForecast(list) {
    const byDay = {};
    for (const entry of list) {
      const key = entry.dt_txt.slice(0, 10);
      const d = byDay[key] || (byDay[key] = { temps: [], conditions: {}, midday: null });
      d.temps.push(entry.main.temp);
      const main = entry.weather[0]?.main || 'Clear';
      d.conditions[main] = (d.conditions[main] || 0) + 1;
      const hour = parseInt(entry.dt_txt.slice(11, 13), 10);
      if (hour >= 12 && hour <= 15) d.midday = entry.weather[0]?.description || main;
    }
    const out = {};
    for (const [key, d] of Object.entries(byDay)) {
      const dominant = Object.entries(d.conditions).sort((a, b) => b[1] - a[1])[0][0];
      out[key] = {
        tMax: Math.round(Math.max(...d.temps)),
        tMin: Math.round(Math.min(...d.temps)),
        desc: d.midday || dominant.toLowerCase(),
        icon: ICONS[dominant] || '🌡️',
        source: 'forecast',
      };
    }
    return out;
  }

  async function fetchOwmForecast(cfg) {
    const url = `https://api.openweathermap.org/data/2.5/forecast`
      + `?lat=${cfg.forecastLocation.lat}`
      + `&lon=${cfg.forecastLocation.lon}`
      + `&appid=${cfg.openWeatherMapKey}`
      + `&units=${cfg.units || 'metric'}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`OWM responded ${resp.status}`);
    const json = await resp.json();
    return aggregateForecast(json.list || []);
  }

  async function fetchPrefetched(url) {
    const resp = await fetch(url, { cache: 'no-cache' });
    if (!resp.ok) throw new Error(`Prefetched JSON responded ${resp.status}`);
    const json = await resp.json();
    /* Allow either OWM-style payload or pre-aggregated map. */
    return Array.isArray(json.list) ? aggregateForecast(json.list) : json;
  }

  function getFallback(dateString) {
    const fallback = CLIMATE_AVERAGES[dateString];
    if (!fallback) return null;
    return Object.assign({ source: 'climate' }, fallback);
  }

  /* Fetch live OWM weather for each day-trip city on its assigned date.
   * Only trips with a `date` field and `coords` get a live fetch attempt.
   * All trips get at least a climate-average fallback. */
  async function loadDayTripWeather(dayTrips, cfg) {
    const result = {};

    for (const trip of dayTrips) {
      const fallback = Object.assign({ source: 'climate' }, CITY_CLIMATE[trip.name] || {});
      result[trip.name] = fallback;

      if (!trip.date || !trip.coords) continue;

      const [lat, lon] = trip.coords;
      try {
        if (cfg.openWeatherMapKey) {
          const url = `https://api.openweathermap.org/data/2.5/forecast`
            + `?lat=${lat}&lon=${lon}`
            + `&appid=${cfg.openWeatherMapKey}`
            + `&units=${cfg.units || 'metric'}`;
          const resp = await fetch(url);
          if (resp.ok) {
            const json = await resp.json();
            const daily = aggregateForecast(json.list || []);
            if (daily[trip.date]) result[trip.name] = daily[trip.date];
          }
        }
      } catch (err) {
        console.warn('[weather] day-trip forecast failed for', trip.name, err.message);
      }
    }

    return result;
  }

  async function loadForecast(dateStrings, cfg) {
    let live = {};
    try {
      if (cfg.prefetchedForecastUrl) {
        live = await fetchPrefetched(cfg.prefetchedForecastUrl);
      } else if (cfg.openWeatherMapKey) {
        live = await fetchOwmForecast(cfg);
      }
    } catch (err) {
      console.warn('[weather] live forecast unavailable, using climate fallback:', err.message);
    }

    return dateStrings.map((d) => ({
      date: d,
      data: live[d] || getFallback(d),
    }));
  }

  window.Weather = {
    loadForecast,
    loadDayTripWeather,
    getFallback,
    CLIMATE_AVERAGES,
    CITY_CLIMATE,
    _internals: { aggregateForecast, dateKey },
  };
})();
