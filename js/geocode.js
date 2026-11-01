// Place lookup: instant matches from the bundled city list, plus an
// on-demand Nominatim query for anything else (no autocomplete against
// Nominatim, per its usage policy).

let citiesPromise = null;

/** Rows: [name, region, country, lat, lon, population], sorted by population. */
export function loadCities() {
  citiesPromise ??= fetch('data/cities.json').then((r) => r.json());
  return citiesPromise;
}

const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export async function searchLocal(query, limit = 8) {
  const q = fold(query.trim());
  if (!q) return [];
  const cities = await loadCities();
  const prefix = [], contains = [];
  for (const c of cities) {
    const n = fold(c[0]);
    if (n.startsWith(q)) prefix.push(c);
    else if (q.length >= 3 && n.includes(q)) contains.push(c);
    if (prefix.length >= limit) break;
  }
  return [...prefix, ...contains].slice(0, limit).map((c) => ({
    name: c[0],
    detail: [c[1], c[2]].filter(Boolean).join(', '),
    lat: c[3],
    lon: c[4],
  }));
}

export async function searchNominatim(query, limit = 6) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({ q: query, format: 'jsonv2', limit: String(limit) });
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Nominatim error ${res.status}`);
  const data = await res.json();
  return data.map((d) => {
    const [name, ...rest] = d.display_name.split(', ');
    return { name, detail: rest.join(', '), lat: Number(d.lat), lon: Number(d.lon) };
  });
}
