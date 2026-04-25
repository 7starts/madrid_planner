/* Main app — bootstrap, rendering, navigation, modal, maps. */

(function () {
  'use strict';

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ------ Helpers ------ */
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      node.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  function formatDate(iso, opts = { weekday: 'long', day: 'numeric', month: 'short' }) {
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', opts);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ------ Maps ------ */
  /* OpenStreetMap embedded iframe — no API key required. */
  function osmEmbedUrl([lat, lon], zoom = 15) {
    const d = 0.005;
    const bbox = [lon - d, lat - d, lon + d, lat + d].join(',');
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;
  }

  /* Deep link to Google Maps directions — opens externally, no key required. */
  function googleMapsUrl([lat, lon], label) {
    const q = label ? `${lat},${lon}(${encodeURIComponent(label)})` : `${lat},${lon}`;
    return `https://www.google.com/maps/search/?api=1&query=${q}`;
  }

  /* ------ Navigation ------ */
  function setupNav() {
    const toggle = $('.nav-toggle');
    const list = $('#primary-nav');
    if (!toggle || !list) return;
    toggle.addEventListener('click', () => {
      const open = list.dataset.open === 'true';
      list.dataset.open = open ? 'false' : 'true';
      toggle.setAttribute('aria-expanded', String(!open));
    });
    list.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') {
        list.dataset.open = 'false';
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ------ Modal ------ */
  let lastFocus = null;
  function openModal({ title, html, coords, links = [] }) {
    const root = $('#modal-root');
    lastFocus = document.activeElement;
    root.innerHTML = '';

    const modal = el('div', { class: 'modal', role: 'document' });
    const header = el('div', { class: 'modal-header' });
    header.appendChild(el('h3', { id: 'modal-title' }, title));
    header.appendChild(el('button', {
      class: 'modal-close',
      'aria-label': 'Close',
      onclick: closeModal,
    }, '×'));
    modal.appendChild(header);

    const body = el('div', { class: 'modal-body' });
    body.innerHTML = html || '';

    if (coords) {
      const iframe = el('iframe', {
        class: 'modal-map',
        loading: 'lazy',
        src: osmEmbedUrl(coords),
        title: `Map showing ${title}`,
      });
      body.appendChild(iframe);
    }

    if (links.length) {
      const actions = el('div', { class: 'card-actions', style: 'margin-top:1rem' });
      for (const l of links) {
        actions.appendChild(el('a', {
          class: l.primary ? 'btn' : 'btn btn--ghost',
          href: l.href, target: '_blank', rel: 'noopener',
        }, l.text));
      }
      body.appendChild(actions);
    }

    modal.appendChild(body);
    root.appendChild(modal);
    root.dataset.open = 'true';
    root.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    modal.querySelector('.modal-close').focus();
  }
  function closeModal() {
    const root = $('#modal-root');
    root.dataset.open = 'false';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = '';
    document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('#modal-root').dataset.open === 'true') closeModal();
  });
  document.addEventListener('click', (e) => {
    const root = $('#modal-root');
    if (e.target === root && root.dataset.open === 'true') closeModal();
  });

  /* ------ Hero meta ------ */
  function renderHero(meta) {
    $('#hero-dates').textContent =
      `${formatDate(meta.arrival.date)} → ${formatDate(meta.departure.date)}`;

    const items = [
      ['Pace', meta.pace],
      ['Public holidays', meta.holidays],
      ['Expected weather', meta.weather],
      ['Estimated total budget', meta.budgetTotal],
    ];
    const ul = $('#hero-meta');
    for (const [label, value] of items) {
      ul.appendChild(el('li', {}, el('strong', {}, label), value));
    }
  }

  /* ------ Weather grid ------ */
  function renderWeather(forecast, days) {
    const grid = $('#weather-grid');
    grid.innerHTML = '';
    let liveCount = 0;

    forecast.forEach((entry, i) => {
      const day = days[i];
      const data = entry.data || { tMax: '–', tMin: '–', desc: 'no data', icon: '🌡️', source: 'none' };
      if (data.source === 'forecast') liveCount++;

      const card = el('div', { class: `weather-card${data.source === 'forecast' ? '' : ' is-fallback'}` });
      card.appendChild(el('div', { class: 'day-label' }, day.label));
      card.appendChild(el('div', { class: 'date-label' }, formatDate(day.date, { weekday: 'short', day: 'numeric', month: 'short' })));
      card.appendChild(el('div', { class: 'icon', 'aria-hidden': 'true' }, data.icon));
      const temps = el('div', { class: 'temps' });
      temps.appendChild(el('span', { class: 'high' }, `${data.tMax}°`));
      temps.appendChild(el('span', { class: 'low' }, `${data.tMin}°`));
      card.appendChild(temps);
      card.appendChild(el('div', { class: 'desc' }, data.desc));
      grid.appendChild(card);
    });

    const sub = $('#weather-sub');
    const total = forecast.length;
    if (liveCount === 0) {
      sub.textContent = 'No live forecast available yet — showing climate averages. Once the GitHub Actions workflow runs and publishes weather.json, the cards switch to live data automatically.';
    } else if (liveCount < total) {
      sub.textContent = `Live forecast for ${liveCount} of ${total} days. Dates beyond the 5-day API window fall back to climate averages and switch to live as the trip approaches.`;
    } else {
      sub.textContent = `Live forecast for all ${total} days from OpenWeatherMap.`;
    }
  }

  /* ------ Itinerary ------ */
  function renderDays(days) {
    const list = $('#itinerary-list');
    list.innerHTML = '';

    days.forEach((day, idx) => {
      const card = el('div', { class: 'day-card', dataset: { collapsed: idx === 0 ? 'false' : 'true' } });

      const header = el('button', {
        class: 'day-header',
        type: 'button',
        'aria-expanded': idx === 0 ? 'true' : 'false',
      });
      const top = el('div', { class: 'day-header__top' });
      top.appendChild(el('span', { class: 'day-header__date' }, `${day.label} • ${formatDate(day.date)}`));
      top.appendChild(el('h3', { class: 'day-header__title' }, day.title));
      header.appendChild(top);

      const meta = el('div', { class: 'day-header__meta' });
      for (const tag of (day.tags || [])) {
        const cls = tag.kind === 'accent' ? 'badge badge--accent'
                  : tag.kind === 'gold'   ? 'badge badge--gold'
                  : 'badge badge--neutral';
        meta.appendChild(el('span', { class: cls }, tag.text));
      }
      meta.appendChild(el('span', { class: 'day-toggle-icon', 'aria-hidden': 'true' }, '+'));
      header.appendChild(meta);

      header.addEventListener('click', () => {
        const collapsed = card.dataset.collapsed === 'true';
        card.dataset.collapsed = collapsed ? 'false' : 'true';
        header.setAttribute('aria-expanded', String(collapsed));
      });

      const body = el('div', { class: 'day-body' });
      if (day.note) body.appendChild(el('p', { class: 'muted small' }, day.note));

      const ul = el('ol', { class: 'timeline' });
      for (const slot of day.slots) {
        const li = el('li');
        li.appendChild(el('div', { class: 'slot-time' }, slot.time));
        li.appendChild(el('div', { class: 'slot-activity' }, slot.activity));
        if (slot.directions) li.appendChild(el('div', { class: 'slot-directions' }, slot.directions));
        ul.appendChild(li);
      }
      body.appendChild(ul);

      body.appendChild(el('div', { class: 'day-spend' },
        el('strong', {}, 'Estimated daily spend (3 pax): '), day.dailySpend));

      card.appendChild(header);
      card.appendChild(body);
      list.appendChild(card);
    });
  }

  /* ------ Cards (sights, rooftops) ------ */
  function attractionCard(item) {
    const card = el('article', { class: 'card', dataset: { category: item.category } });

    const media = el('div', { class: 'card-media' });
    media.appendChild(el('span', { class: 'icon-fallback', 'aria-hidden': 'true' }, item.icon || '📍'));
    media.appendChild(el('span', { class: 'card-tag' }, item.category));
    card.appendChild(media);

    const body = el('div', { class: 'card-body' });
    body.appendChild(el('h3', { class: 'card-title' }, item.name));
    if (item.blurb) body.appendChild(el('p', { class: 'card-meta' }, item.blurb));

    const dl = el('dl', { class: 'card-attrs' });
    const attrs = [
      ['Hours', item.hours],
      ['Cost', item.cost],
      ['Visit', item.duration],
      ['Metro', item.metro],
      ['Best time', item.bestTime],
    ].filter(([, v]) => v);
    for (const [k, v] of attrs) {
      const wrap = el('div');
      wrap.appendChild(el('dt', {}, k));
      wrap.appendChild(el('dd', {}, v));
      dl.appendChild(wrap);
    }
    body.appendChild(dl);

    const actions = el('div', { class: 'card-actions' });
    actions.appendChild(el('button', {
      class: 'btn',
      type: 'button',
      onclick: () => openItemModal(item),
    }, 'View map'));
    actions.appendChild(el('a', {
      class: 'btn btn--ghost',
      href: googleMapsUrl(item.coords, item.name),
      target: '_blank', rel: 'noopener',
    }, 'Google Maps'));
    if (item.link) {
      actions.appendChild(el('a', {
        class: 'btn btn--ghost',
        href: item.link, target: '_blank', rel: 'noopener',
      }, 'Official site'));
    }
    body.appendChild(actions);

    card.appendChild(body);
    return card;
  }

  function openItemModal(item) {
    const lines = [];
    if (item.address) lines.push(`<p class="muted small"><strong>${escapeHtml(item.address)}</strong></p>`);
    if (item.blurb) lines.push(`<p>${escapeHtml(item.blurb)}</p>`);

    const attrEntries = [
      ['Hours', item.hours], ['Cost', item.cost], ['Visit', item.duration],
      ['Metro', item.metro], ['Best time', item.bestTime],
    ].filter(([, v]) => v);
    if (attrEntries.length) {
      lines.push('<dl class="modal-attrs">');
      for (const [k, v] of attrEntries) {
        lines.push(`<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`);
      }
      lines.push('</dl>');
    }

    const links = [
      { text: 'Open in Google Maps', href: googleMapsUrl(item.coords, item.name), primary: true },
    ];
    if (item.link) links.push({ text: 'Official site', href: item.link });

    openModal({
      title: item.name,
      html: lines.join(''),
      coords: item.coords,
      links,
    });
  }

  function renderAttractions(items) {
    const grid = $('#attraction-grid');
    grid.innerHTML = '';
    items.forEach((item) => grid.appendChild(attractionCard(item)));
  }

  function renderAttractionFilters(items) {
    const row = $('#attraction-filters');
    row.innerHTML = '';
    const categories = Array.from(new Set(items.map((i) => i.category))).sort();
    const all = el('button', {
      class: 'filter-btn', type: 'button',
      'aria-pressed': 'true', dataset: { category: 'all' },
    }, 'All');
    row.appendChild(all);
    for (const cat of categories) {
      row.appendChild(el('button', {
        class: 'filter-btn', type: 'button',
        'aria-pressed': 'false', dataset: { category: cat },
      }, cat[0].toUpperCase() + cat.slice(1)));
    }
    row.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;
      $$('.filter-btn', row).forEach((b) => b.setAttribute('aria-pressed', 'false'));
      btn.setAttribute('aria-pressed', 'true');
      const cat = btn.dataset.category;
      $$('#attraction-grid .card').forEach((card) => {
        const match = cat === 'all' || card.dataset.category === cat;
        card.style.display = match ? '' : 'none';
      });
    });
  }

  /* ------ Rooftops ------ */
  function renderRooftops(items) {
    const grid = $('#rooftop-grid');
    grid.innerHTML = '';
    items.forEach((item) => grid.appendChild(attractionCard(item)));
  }

  /* ------ Restaurants ------ */
  function restaurantCard(r) {
    const card = el('article', { class: 'card' });

    const media = el('div', { class: 'card-media' });
    media.appendChild(el('span', { class: 'icon-fallback', 'aria-hidden': 'true' }, '🍽️'));
    media.appendChild(el('span', { class: 'card-tag' }, r.assignedDay));
    card.appendChild(media);

    const body = el('div', { class: 'card-body' });
    body.appendChild(el('h3', { class: 'card-title' }, r.name));
    body.appendChild(el('p', { class: 'card-meta' }, r.cuisine));

    const rating = el('div', { class: 'rating' });
    rating.appendChild(el('span', { class: 'star', 'aria-hidden': 'true' }, '★'));
    rating.appendChild(document.createTextNode(`${r.rating.toFixed(1)} `));
    rating.appendChild(el('span', { class: 'reviews' }, `(${r.reviews} reviews)`));
    body.appendChild(rating);

    const dl = el('dl', { class: 'card-attrs' });
    for (const [k, v] of [
      ['Price', r.pricePerPerson],
      ['Best dish', r.bestDish],
      ['Atmosphere', r.atmosphere],
      ['Address', r.address],
    ]) {
      const wrap = el('div');
      wrap.appendChild(el('dt', {}, k));
      wrap.appendChild(el('dd', {}, v));
      dl.appendChild(wrap);
    }
    body.appendChild(dl);

    if (r.note) body.appendChild(el('p', { class: 'muted small' }, r.note));

    const actions = el('div', { class: 'card-actions' });
    actions.appendChild(el('button', {
      class: 'btn',
      type: 'button',
      onclick: () => openRestaurantModal(r),
    }, 'View map'));
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(r.name + ' Madrid')}`;
    actions.appendChild(el('a', {
      class: 'btn btn--ghost',
      href: searchUrl, target: '_blank', rel: 'noopener',
    }, 'Latest reviews'));
    body.appendChild(actions);

    card.appendChild(body);
    return card;
  }

  function openRestaurantModal(r) {
    const lines = [
      `<p class="muted small"><strong>${escapeHtml(r.address)}</strong></p>`,
      `<p>${escapeHtml(r.cuisine)} · <strong>${r.rating.toFixed(1)} ★</strong> (${escapeHtml(r.reviews)} reviews)</p>`,
      '<dl class="modal-attrs">',
      `<div><dt>Price</dt><dd>${escapeHtml(r.pricePerPerson)}</dd></div>`,
      `<div><dt>Best dish</dt><dd>${escapeHtml(r.bestDish)}</dd></div>`,
      `<div><dt>Atmosphere</dt><dd>${escapeHtml(r.atmosphere)}</dd></div>`,
      `<div><dt>Assigned</dt><dd>${escapeHtml(r.assignedDay)}</dd></div>`,
      '</dl>',
    ];
    if (r.note) lines.push(`<p class="muted small">${escapeHtml(r.note)}</p>`);

    openModal({
      title: r.name,
      html: lines.join(''),
      coords: r.coords,
      links: [
        { text: 'Open in Google Maps', href: googleMapsUrl(r.coords, r.name), primary: true },
        { text: 'Latest reviews on Google', href: `https://www.google.com/search?q=${encodeURIComponent(r.name + ' Madrid reviews')}` },
      ],
    });
  }

  function renderRestaurants(items) {
    const grid = $('#restaurant-grid');
    grid.innerHTML = '';
    items.forEach((r) => grid.appendChild(restaurantCard(r)));
  }

  /* ------ Day trips ------ */
  function dayTripCard(t) {
    const cls = t.status === 'mandatory' ? 'trip-card is-mandatory'
              : t.status === 'optional-skip' ? 'trip-card is-skip'
              : 'trip-card';
    const card = el('article', { class: cls });

    const tagRow = el('div', { class: 'trip-tags' });
    if (t.status === 'mandatory') tagRow.appendChild(el('span', { class: 'badge' }, 'Mandatory'));
    if (t.status === 'optional-recommend') tagRow.appendChild(el('span', { class: 'badge badge--accent' }, 'Optional'));
    if (t.status === 'optional-skip') tagRow.appendChild(el('span', { class: 'badge badge--neutral' }, 'Skip'));
    if (t.assignedDay) tagRow.appendChild(el('span', { class: 'badge badge--neutral' }, t.assignedDay));

    card.appendChild(el('h3', {}, t.name));
    card.appendChild(tagRow);

    const dl = el('dl', { class: 'trip-meta' });
    for (const [k, v] of [
      ['Transport', t.transport],
      ['Cost', t.cost],
      ['Duration', t.duration],
      ['Weather', t.weather],
    ]) {
      if (!v) continue;
      const wrap = el('div');
      wrap.appendChild(el('dt', {}, k));
      wrap.appendChild(el('dd', {}, v));
      dl.appendChild(wrap);
    }
    card.appendChild(dl);

    if (t.highlights && t.highlights.length) {
      card.appendChild(el('div', {}, el('strong', {}, 'Highlights')));
      const ul = el('ul');
      for (const h of t.highlights) ul.appendChild(el('li', {}, h));
      card.appendChild(ul);
    }
    if (t.verdict)         card.appendChild(el('p', { class: 'muted small' }, t.verdict));
    if (t.sameDayVerdict)  card.appendChild(el('p', {}, el('strong', {}, t.sameDayVerdict)));

    const actions = el('div', { class: 'card-actions' });
    actions.appendChild(el('a', {
      class: 'btn',
      href: googleMapsUrl(t.coords, t.name),
      target: '_blank', rel: 'noopener',
    }, 'Open in Google Maps'));
    card.appendChild(actions);

    return card;
  }

  function renderDayTrips(items) {
    const list = $('#day-trips-list');
    list.innerHTML = '';
    /* Mandatory first, then recommended optionals, then skip-recommended. */
    const order = { 'mandatory': 0, 'optional-recommend': 1, 'optional-skip': 2 };
    const sorted = [...items].sort((a, b) => order[a.status] - order[b.status]);
    sorted.forEach((t) => list.appendChild(dayTripCard(t)));
  }

  /* ------ Practical info ------ */
  function practicalCard(card) {
    const node = el('article', { class: 'practical-card' });
    node.appendChild(el('h3', {}, card.title));
    if (card.body) {
      for (const para of card.body) {
        node.appendChild(el('p', { html: para }));
      }
    }
    if (card.list) {
      const ul = el('ul');
      for (const item of card.list) ul.appendChild(el('li', { html: item }));
      node.appendChild(ul);
    }
    if (card.recommendation) {
      node.appendChild(el('div', { class: 'recommendation', html: card.recommendation }));
    }
    return node;
  }

  function renderPractical(items) {
    const grid = $('#practical-grid');
    grid.innerHTML = '';
    items.forEach((c) => grid.appendChild(practicalCard(c)));
  }

  /* ------ Bootstrap ------ */
  async function init() {
    const trip = window.TRIP;
    if (!trip) {
      console.error('TRIP data missing — js/data.js failed to load.');
      return;
    }

    setupNav();
    renderHero(trip.meta);
    renderDays(trip.days);
    renderAttractionFilters(trip.attractions);
    renderAttractions(trip.attractions);
    renderRooftops(trip.rooftops);
    renderRestaurants(trip.restaurants);
    renderDayTrips(trip.dayTrips);
    renderPractical(trip.practical);

    /* Weather: skeleton cards first, then live data. */
    const dateStrings = trip.days.map((d) => d.date);
    renderWeather(dateStrings.map((d) => ({ date: d, data: null })), trip.days);
    try {
      const forecast = await window.Weather.loadForecast(dateStrings, window.APP_CONFIG || {});
      renderWeather(forecast, trip.days);
    } catch (err) {
      console.warn('[weather] failed:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
