import { sublunarPoint, moonPhase, track, distanceKm } from './moon.js';
import { sampleWindow, findPasses, suggestCities, DAY_MS } from './search.js';
import { createMap } from './map.js';
import { createPlayer } from './animate.js';
import { loadCities, searchLocal, searchNominatim } from './geocode.js';

const $ = (id) => document.getElementById(id);
const HOUR_MS = 3600000;
const TRAIL_MS = 12 * HOUR_MS;
const MAX_TRACK_POINTS = 5000;

const view = createMap($('map'));
const state = {
  target: null,   // { lat, lon, name }
  path: [],       // sampled track for the current path range
  samples: null,  // cached search window
  samplesKey: '',
};

// ---------- formatting ----------

const fmtLat = (v) => `${Math.abs(v).toFixed(3)}° ${v >= 0 ? 'N' : 'S'}`;
const fmtLon = (v) => `${Math.abs(v).toFixed(3)}° ${v >= 0 ? 'E' : 'W'}`;
const fmtKm = (v) => `${Math.round(v).toLocaleString()} km`;
const fmtLocal = (d) => d.toLocaleString(undefined, {
  year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
});
const fmtUtc = (d) => d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';

function toLocalInput(d) {
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
const fromLocalInput = (v) => (v ? new Date(v) : null);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let statusTimer = 0;
function setStatus(msg, ms = 0) {
  const el = $('status');
  clearTimeout(statusTimer);
  el.hidden = !msg;
  el.textContent = msg || '';
  if (msg && ms) statusTimer = setTimeout(() => { el.hidden = true; }, ms);
}
const nextPaint = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

// ---------- current moment ----------

function renderMoment(date) {
  const p = sublunarPoint(date);
  const phase = moonPhase(date);
  view.setMoon(p.lat, p.lon, `Sublunar point<br>${fmtLat(p.lat)}, ${fmtLon(p.lon)}`);

  let rows = `
    <dt>Lat</dt><dd class="big">${fmtLat(p.lat)}</dd>
    <dt>Lon</dt><dd class="big">${fmtLon(p.lon)}</dd>
    <dt>UTC</dt><dd>${fmtUtc(date)}</dd>
    <dt>Local</dt><dd>${fmtLocal(date)}</dd>
    <dt>Distance</dt><dd>${fmtKm(p.distKm)} to Moon</dd>
    <dt>Phase</dt><dd>${phase.name} · ${(phase.fraction * 100).toFixed(0)}% lit</dd>`;
  if (state.target) {
    rows += `<dt>From target</dt><dd>${fmtKm(distanceKm(state.target.lat, state.target.lon, p.lat, p.lon))}</dd>`;
  }
  $('readout').innerHTML = rows;
  $('playTime').textContent = fmtLocal(date);
  return p;
}

// ---------- path & animation ----------

const player = createPlayer({
  onFrame(date) {
    renderMoment(date);
    $('scrub').value = Math.round(player.fraction * 1000);
    if (document.activeElement !== $('time')) $('time').value = toLocalInput(date);
    drawTrail(date);
    scheduleHash();
  },
  onStateChange(playing) {
    $('play').textContent = playing ? '⏸' : '▶';
  },
});

function drawTrail(date) {
  if (!state.path.length) return;
  const t = date.getTime();
  const from = t - TRAIL_MS;
  const pts = state.path.filter((p) => p.time.getTime() >= from && p.time.getTime() <= t);
  pts.push(sublunarPoint(date));
  view.showTrail(pts);
}

function setPath(start, end, at) {
  if (!(end > start)) { setStatus('Path end must be after start', 3000); return; }
  const minutes = (end - start) / 60000;
  const step = Math.max(5, Math.ceil(minutes / MAX_TRACK_POINTS));
  state.path = track(start, end, step);
  view.showTrack(state.path);
  $('pathStart').value = toLocalInput(start);
  $('pathEnd').value = toLocalInput(end);
  player.setRange(start, end, at ?? start);
}

/** Move to a moment: keep the current path if it covers it, else centre a new ±1 day path on it. */
function goTo(date, { pan = false } = {}) {
  player.pause();
  const s = fromLocalInput($('pathStart').value), e = fromLocalInput($('pathEnd').value);
  if (state.path.length && s && e && date >= s && date <= e) {
    player.setRange(s, e, date);
  } else {
    setPath(new Date(date.getTime() - DAY_MS), new Date(date.getTime() + DAY_MS), date);
  }
  if (pan) {
    const p = sublunarPoint(date);
    view.map.setView([p.lat, p.lon], Math.max(view.map.getZoom(), 3));
  }
}

$('now').addEventListener('click', () => goTo(new Date(), { pan: true }));
$('time').addEventListener('change', () => {
  const d = fromLocalInput($('time').value);
  if (d && !isNaN(d)) goTo(d);
});
$('drawPath').addEventListener('click', () => {
  player.pause();
  const s = fromLocalInput($('pathStart').value), e = fromLocalInput($('pathEnd').value);
  if (!s || !e) return;
  const cur = fromLocalInput($('time').value);
  setPath(s, e, cur && cur >= s && cur <= e ? cur : s);
});
$('play').addEventListener('click', () => player.toggle());
$('scrub').addEventListener('input', (e) => { player.pause(); player.seek(e.target.value / 1000); });
$('speed').addEventListener('change', (e) => player.setSpeed(Number(e.target.value)));
player.setSpeed(Number($('speed').value));

// ---------- target selection ----------

function setTarget(lat, lon, name) {
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90) return;
  lon = ((lon + 180) % 360 + 360) % 360 - 180;
  state.target = { lat, lon, name: name || `${fmtLat(lat)}, ${fmtLon(lon)}` };
  $('lat').value = +lat.toFixed(4);
  $('lon').value = +lon.toFixed(4);
  if (name) $('place').value = name;
  view.setTarget(lat, lon, state.target.name);
  $('results').innerHTML = '';
  view.clearSuggestions();
  renderMoment(fromLocalInput($('time').value) || new Date());
  scheduleHash();
}

view.map.on('click', (e) => {
  setTarget(e.latlng.lat, e.latlng.lng, null);
  $('place').value = '';
});
for (const id of ['lat', 'lon']) {
  $(id).addEventListener('change', () => {
    setTarget(Number($('lat').value), Number($('lon').value), null);
    $('place').value = '';
  });
}

// Place dropdown
let dropItems = [], dropActive = -1;
function showDropdown(items) {
  dropItems = items;
  dropActive = -1;
  const ul = $('placeList');
  ul.innerHTML = items.length
    ? items.map((it, i) => `<li data-i="${i}">${escapeHtml(it.name)} <small>${escapeHtml(it.detail)}</small></li>`).join('')
    : '<li><small>No matches — try “Search OSM”</small></li>';
  ul.hidden = false;
}
function hideDropdown() { $('placeList').hidden = true; }
function choose(i) {
  const it = dropItems[i];
  if (!it) return;
  hideDropdown();
  setTarget(it.lat, it.lon, it.name);
  view.map.setView([it.lat, it.lon], Math.max(view.map.getZoom(), 4));
}

$('place').addEventListener('input', async (e) => {
  const q = e.target.value;
  if (!q.trim()) { hideDropdown(); return; }
  const items = await searchLocal(q);
  if ($('place').value === q) showDropdown(items);
});
$('place').addEventListener('keydown', (e) => {
  const lis = [...$('placeList').querySelectorAll('li[data-i]')];
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    if (!lis.length) return;
    dropActive = (dropActive + (e.key === 'ArrowDown' ? 1 : -1) + lis.length) % lis.length;
    lis.forEach((li, i) => li.classList.toggle('active', i === dropActive));
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (dropActive >= 0) choose(dropActive);
    else if (dropItems.length && !$('placeList').hidden) choose(0);
    else $('osm').click();
  } else if (e.key === 'Escape') {
    hideDropdown();
  }
});
$('placeList').addEventListener('mousedown', (e) => {
  const li = e.target.closest('li[data-i]');
  if (li) { e.preventDefault(); choose(Number(li.dataset.i)); }
});
$('place').addEventListener('blur', () => setTimeout(hideDropdown, 150));

$('osm').addEventListener('click', async () => {
  const q = $('place').value.trim();
  if (!q) return;
  setStatus('Searching OpenStreetMap…');
  try {
    showDropdown(await searchNominatim(q));
    setStatus('');
  } catch (err) {
    setStatus(`Search failed: ${err.message}`, 4000);
  }
});

// ---------- pass search ----------

async function getSamples(start, years) {
  // Cache per day + window so repeated searches are instant.
  const day = new Date(start); day.setUTCHours(0, 0, 0, 0);
  const key = `${day.getTime()}:${years}`;
  if (state.samplesKey !== key) {
    setStatus(`Computing the Moon's track for ${years} year${years > 1 ? 's' : ''}…`);
    await nextPaint();
    const end = new Date(day.getTime() + years * 365.25 * DAY_MS);
    state.samples = sampleWindow(day, end);
    state.samplesKey = key;
  }
  return state.samples;
}

function passItem(p, extra = '') {
  return `<li data-t="${p.time.getTime()}">
    <span>${fmtLocal(p.time)}<small>${fmtUtc(p.time)}${extra}</small></span>
    <span class="km">${fmtKm(p.distanceKm)}</span></li>`;
}

$('find').addEventListener('click', async () => {
  if (!state.target) {
    setTarget(Number($('lat').value), Number($('lon').value), null);
    if (!state.target) { setStatus('Pick a city, enter coordinates, or click the map first', 3000); return; }
  }
  const target = state.target;
  const thresholdKm = Math.max(1, Number($('threshold').value) || 50);
  const years = Number($('years').value);
  const from = fromLocalInput($('time').value) || new Date();

  player.pause();
  const s = await getSamples(from, years);
  setStatus('Searching for passes…');
  await nextPaint();

  const r = findPasses(target, s, { thresholdKm });
  view.showBand(s.maxAbsDec);

  const windowText = `${s.start.toLocaleDateString()} – ${s.end.toLocaleDateString()}`;
  let html = '';

  if (r.passes.length) {
    html += `<h3>${r.passes.length} pass${r.passes.length > 1 ? 'es' : ''} within ${thresholdKm} km of ${escapeHtml(target.name)} (${windowText})</h3>`;
    html += `<ol>${r.passes.map((p) => passItem(p)).join('')}</ol>`;
  } else if (!r.reachable) {
    html += `<p class="note">${escapeHtml(target.name)} is at ${fmtLat(target.lat)}, outside the band where the Moon
      can be overhead (±${s.maxAbsDec.toFixed(1)}° during ${windowText}). The Moon is never directly overhead here —
      below are its closest approaches and the nearest cities it does pass over.</p>`;
  } else {
    html += `<p class="note">No passes within ${thresholdKm} km of ${escapeHtml(target.name)} during ${windowText}.
      Try a wider radius or a longer search, or travel to one of the cities below.</p>`;
  }

  if (r.closest.length) {
    const shown = r.passes.length ? r.closest.slice(0, 1) : r.closest;
    html += `<h3>Closest approach${shown.length > 1 ? 'es' : ''}</h3><ol>${shown.map((p) =>
      passItem(p, ` · overhead at ${fmtLat(p.lat)}, ${fmtLon(p.lon)}`)).join('')}</ol>`;
  }

  if (!r.passes.length) {
    setStatus('Finding the nearest cities with an overhead pass…');
    await nextPaint();
    const cities = await loadCities();
    const sug = suggestCities(target, s, cities, { thresholdKm, minPopulation: Number($('minPop').value) });
    if (sug.length) {
      html += `<h3>Nearest cities the Moon passes over (within ${thresholdKm} km)</h3><ol>${sug.map((x) => {
        const p = x.passes[0];
        return `<li data-t="${p.time.getTime()}" data-city="${escapeHtml(x.city.name)}">
          <span>${escapeHtml(x.city.name)}, ${escapeHtml(x.city.country)}
            <small>next: ${fmtLocal(p.time)} · ${x.passes.length} pass${x.passes.length > 1 ? 'es' : ''} in window
            · pop. ${x.city.population.toLocaleString()}</small></span>
          <span class="km">${fmtKm(x.distanceFromTargetKm)} away</span></li>`;
      }).join('')}</ol>`;
      view.showSuggestions(sug, (x) => goTo(x.passes[0].time, { pan: true }));
    } else {
      html += '<p class="hint">No nearby cities found with a pass in this window.</p>';
    }
  }

  $('results').innerHTML = html;
  setStatus('');
});

$('results').addEventListener('click', (e) => {
  const li = e.target.closest('li[data-t]');
  if (li) goTo(new Date(Number(li.dataset.t)), { pan: true });
});

// ---------- shareable URL state ----------

let hashTimer = 0;
function scheduleHash() {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(() => {
    const p = new URLSearchParams();
    const t = fromLocalInput($('time').value);
    if (t) p.set('t', t.toISOString().slice(0, 16) + 'Z');
    if (state.target) {
      p.set('lat', state.target.lat.toFixed(4));
      p.set('lon', state.target.lon.toFixed(4));
      if ($('place').value) p.set('name', $('place').value);
    }
    history.replaceState(null, '', '#' + p.toString());
  }, 400);
}

function init() {
  const p = new URLSearchParams(location.hash.slice(1));
  const t = p.has('t') ? new Date(p.get('t')) : new Date();
  goTo(isNaN(t) ? new Date() : t, { pan: false });
  if (p.has('lat') && p.has('lon')) setTarget(Number(p.get('lat')), Number(p.get('lon')), p.get('name'));
  loadCities(); // warm the cache for search
}

init();
