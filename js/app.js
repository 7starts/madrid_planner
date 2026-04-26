/* Main app — bootstrap, rendering, navigation, modal, maps, i18n. */

(function () {
  'use strict';

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /* ------ i18n ------ */
  let lang = localStorage.getItem('lang') || 'en';
  let cachedForecast = null;

  function t() { return window.I18N[lang] || window.I18N['en']; }
  function tripData() { return lang === 'lt' && window.TRIP_LT ? window.TRIP_LT : window.TRIP; }

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

  function formatDate(iso, opts) {
    const o = opts || { weekday: 'long', day: 'numeric', month: 'short' };
    return new Date(iso + 'T12:00:00').toLocaleDateString(t().locale, o);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ------ Maps ------ */
  function osmEmbedUrl([lat, lon], zoom = 15) {
    const d = 0.005;
    const bbox = [lon - d, lat - d, lon + d, lat + d].join(',');
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;
  }

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
      'aria-label': t().modalClose,
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
          href: l.href, target: '_blank', rel: 'noopener noreferrer',
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
      [t().heroPace,      meta.pace],
      [t().heroHolidays,  meta.holidays],
      [t().heroWeather,   meta.weather],
      [t().heroBudget,    meta.budgetTotal],
    ];
    const ul = $('#hero-meta');
    ul.innerHTML = '';
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
      const rawDesc = data.desc || '';
      const desc = t().weatherDescs[rawDesc] || rawDesc;
      card.appendChild(el('div', { class: 'desc' }, desc));
      grid.appendChild(card);
    });

    const sub = $('#weather-sub');
    const total = forecast.length;
    if (liveCount === 0) {
      sub.textContent = t().weatherNoLive;
    } else if (liveCount < total) {
      sub.textContent = t().weatherPartialLive(liveCount, total);
    } else {
      sub.textContent = t().weatherAllLive(total);
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
        el('strong', {}, t().dailySpend), day.dailySpend));

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
      [t().attrHours,   item.hours],
      [t().attrCost,    item.cost],
      [t().attrVisit,   item.duration],
      [t().attrMetro,   item.metro],
      [t().attrBestTime,item.bestTime],
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
    }, t().btnViewMap));
    actions.appendChild(el('a', {
      class: 'btn btn--ghost',
      href: googleMapsUrl(item.coords, item.name),
      target: '_blank', rel: 'noopener noreferrer',
    }, t().btnGoogleMaps));
    if (item.link) {
      actions.appendChild(el('a', {
        class: 'btn btn--ghost',
        href: item.link, target: '_blank', rel: 'noopener noreferrer',
      }, t().btnOfficialSite));
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
      [t().attrHours,    item.hours],
      [t().attrCost,     item.cost],
      [t().attrVisit,    item.duration],
      [t().attrMetro,    item.metro],
      [t().attrBestTime, item.bestTime],
    ].filter(([, v]) => v);
    if (attrEntries.length) {
      lines.push('<dl class="modal-attrs">');
      for (const [k, v] of attrEntries) {
        lines.push(`<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`);
      }
      lines.push('</dl>');
    }

    const links = [
      { text: t().btnOpenInGoogleMaps, href: googleMapsUrl(item.coords, item.name), primary: true },
    ];
    if (item.link) links.push({ text: t().btnOfficialSite, href: item.link });

    openModal({ title: item.name, html: lines.join(''), coords: item.coords, links });
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
    }, t().filterAll);
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
    rating.appendChild(el('span', { class: 'reviews' }, `(${r.reviews} ${t().reviews})`));
    body.appendChild(rating);

    const dl = el('dl', { class: 'card-attrs' });
    for (const [k, v] of [
      [t().attrPrice,       r.pricePerPerson],
      [t().attrBestDish,    r.bestDish],
      [t().attrAtmosphere,  r.atmosphere],
      [t().attrAddress,     r.address],
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
    }, t().btnViewMap));
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(r.name + ' Madrid')}`;
    actions.appendChild(el('a', {
      class: 'btn btn--ghost',
      href: searchUrl, target: '_blank', rel: 'noopener noreferrer',
    }, t().btnLatestReviews));
    body.appendChild(actions);

    card.appendChild(body);
    return card;
  }

  function openRestaurantModal(r) {
    const lines = [
      `<p class="muted small"><strong>${escapeHtml(r.address)}</strong></p>`,
      `<p>${escapeHtml(r.cuisine)} · <strong>${r.rating.toFixed(1)} ★</strong> (${escapeHtml(r.reviews)} ${escapeHtml(t().reviews)})</p>`,
      '<dl class="modal-attrs">',
      `<div><dt>${escapeHtml(t().attrPrice)}</dt><dd>${escapeHtml(r.pricePerPerson)}</dd></div>`,
      `<div><dt>${escapeHtml(t().attrBestDish)}</dt><dd>${escapeHtml(r.bestDish)}</dd></div>`,
      `<div><dt>${escapeHtml(t().attrAtmosphere)}</dt><dd>${escapeHtml(r.atmosphere)}</dd></div>`,
      `<div><dt>${escapeHtml(t().attrAssigned)}</dt><dd>${escapeHtml(r.assignedDay)}</dd></div>`,
      '</dl>',
    ];
    if (r.note) lines.push(`<p class="muted small">${escapeHtml(r.note)}</p>`);

    openModal({
      title: r.name,
      html: lines.join(''),
      coords: r.coords,
      links: [
        { text: t().btnOpenInGoogleMaps, href: googleMapsUrl(r.coords, r.name), primary: true },
        { text: t().btnLatestReviewsOnGoogle, href: `https://www.google.com/search?q=${encodeURIComponent(r.name + ' Madrid reviews')}` },
      ],
    });
  }

  function renderRestaurants(items) {
    const grid = $('#restaurant-grid');
    grid.innerHTML = '';
    items.forEach((r) => grid.appendChild(restaurantCard(r)));
  }

  /* ------ Day trips ------ */
  function dayTripCard(trip) {
    const cls = trip.status === 'mandatory' ? 'trip-card is-mandatory'
              : trip.status === 'optional-skip' ? 'trip-card is-skip'
              : 'trip-card';
    const card = el('article', { class: cls });

    const tagRow = el('div', { class: 'trip-tags' });
    if (trip.status === 'mandatory')         tagRow.appendChild(el('span', { class: 'badge' }, t().badgeMandatory));
    if (trip.status === 'optional-recommend') tagRow.appendChild(el('span', { class: 'badge badge--accent' }, t().badgeOptional));
    if (trip.status === 'optional-skip')     tagRow.appendChild(el('span', { class: 'badge badge--neutral' }, t().badgeSkip));
    if (trip.assignedDay) tagRow.appendChild(el('span', { class: 'badge badge--neutral' }, trip.assignedDay));

    card.appendChild(el('h3', {}, trip.name));
    card.appendChild(tagRow);

    const dl = el('dl', { class: 'trip-meta' });
    for (const [k, v] of [
      [t().attrTransport, trip.transport],
      [t().attrCost,      trip.cost],
      [t().attrDuration,  trip.duration],
      [t().attrWeather,   trip.weather],
    ]) {
      if (!v) continue;
      const wrap = el('div');
      wrap.appendChild(el('dt', {}, k));
      wrap.appendChild(el('dd', {}, v));
      dl.appendChild(wrap);
    }
    card.appendChild(dl);

    if (trip.highlights && trip.highlights.length) {
      card.appendChild(el('div', {}, el('strong', {}, t().highlights)));
      const ul = el('ul');
      for (const h of trip.highlights) ul.appendChild(el('li', {}, h));
      card.appendChild(ul);
    }
    if (trip.verdict)        card.appendChild(el('p', { class: 'muted small' }, trip.verdict));
    if (trip.sameDayVerdict) card.appendChild(el('p', {}, el('strong', {}, trip.sameDayVerdict)));

    const actions = el('div', { class: 'card-actions' });
    actions.appendChild(el('a', {
      class: 'btn',
      href: googleMapsUrl(trip.coords, trip.name),
      target: '_blank', rel: 'noopener noreferrer',
    }, t().btnOpenInGoogleMaps));
    card.appendChild(actions);

    return card;
  }

  function renderDayTrips(items) {
    const list = $('#day-trips-list');
    list.innerHTML = '';
    const order = { 'mandatory': 0, 'optional-recommend': 1, 'optional-skip': 2 };
    const sorted = [...items].sort((a, b) => order[a.status] - order[b.status]);
    sorted.forEach((trip) => list.appendChild(dayTripCard(trip)));
  }

  /* ------ Practical info ------ */
  function practicalCard(card) {
    const node = el('article', { class: 'practical-card' });
    node.appendChild(el('h3', {}, card.title));
    if (card.body) {
      for (const para of card.body) node.appendChild(el('p', { html: para }));
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

  /* ------ Static string update (non-dynamic DOM nodes) ------ */
  function updateStaticStrings() {
    document.documentElement.lang = lang;

    const skip = $('.skip-link');
    if (skip) skip.textContent = t().skipLink;

    const brand = $('.brand');
    if (brand) brand.setAttribute('aria-label', t().brandAriaLabel);

    const nav = $('.site-nav');
    if (nav) nav.setAttribute('aria-label', t().navAriaLabel);

    const toggleVh = $('.nav-toggle .visually-hidden');
    if (toggleVh) toggleVh.textContent = t().navToggle;

    const navLinks = $$('#primary-nav a');
    const navKeys = ['navItinerary', 'navSights', 'navRooftops', 'navRestaurants', 'navDayTrips', 'navPractical'];
    navLinks.forEach((a, i) => { if (navKeys[i]) a.textContent = t()[navKeys[i]]; });

    const eyebrow = $('.eyebrow');
    if (eyebrow) eyebrow.textContent = t().eyebrow;

    const sectionIds = ['itinerary', 'attractions', 'rooftops', 'restaurants', 'day-trips', 'practical'];
    const titleKeys   = ['itineraryTitle', 'attractionsTitle', 'rooftopsTitle', 'restaurantsTitle', 'dayTripsTitle', 'practicalTitle'];
    const subKeys     = ['itinerarySub',   'attractionsSub',   'rooftopsSub',   'restaurantsSub',   'dayTripsSub',   'practicalSub'];
    sectionIds.forEach((id, i) => {
      const titleEl = $(`#${id}-title`);
      const subEl   = $(`#${id}-sub`);
      if (titleEl) titleEl.textContent = t()[titleKeys[i]];
      if (subEl)   subEl.textContent   = t()[subKeys[i]];
    });

    /* weather title only (subtitle is managed by renderWeather) */
    const wTitle = $('#weather-title');
    if (wTitle) wTitle.textContent = t().weatherTitle;

    const heroMeta = $('#hero-meta');
    if (heroMeta) heroMeta.setAttribute('aria-label', t().tripDetailsAria);

    const filterGroup = $('#attraction-filters');
    if (filterGroup) filterGroup.setAttribute('aria-label', t().filterAttractionsAria);

    const footerP = $('.site-footer p');
    if (footerP) footerP.textContent = t().footer;

    const langBtn = $('#lang-toggle');
    if (langBtn) {
      langBtn.textContent = t().langToggle;
      langBtn.setAttribute('aria-label', t().langToggleAria);
    }
  }

  /* ------ Full re-render ------ */
  function renderAll() {
    const trip = tripData();
    renderHero(trip.meta);
    renderDays(trip.days);
    renderAttractionFilters(trip.attractions);
    renderAttractions(trip.attractions);
    renderRooftops(trip.rooftops);
    renderRestaurants(trip.restaurants);
    renderDayTrips(trip.dayTrips);
    renderPractical(trip.practical);

    const days = trip.days;
    if (cachedForecast) {
      renderWeather(cachedForecast, days);
    } else {
      renderWeather(days.map((d) => ({ date: d.date, data: null })), days);
    }

    updateStaticStrings();
  }

  /* ------ Language toggle ------ */
  function initLangToggle() {
    const btn = $('#lang-toggle');
    if (!btn) return;
    btn.textContent = t().langToggle;
    btn.setAttribute('aria-label', t().langToggleAria);
    btn.addEventListener('click', () => {
      lang = lang === 'en' ? 'lt' : 'en';
      localStorage.setItem('lang', lang);
      renderAll();
    });
  }

  /* ------ Bootstrap ------ */
  async function init() {
    const trip = window.TRIP;
    if (!trip) {
      console.error('TRIP data missing — js/data.js failed to load.');
      return;
    }

    setupNav();
    initLangToggle();
    renderAll();

    /* Fetch live weather in the background; re-render weather section when ready. */
    const dateStrings = trip.days.map((d) => d.date);
    try {
      const forecast = await window.Weather.loadForecast(dateStrings, window.APP_CONFIG || {});
      cachedForecast = forecast;
      renderWeather(forecast, tripData().days);
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
