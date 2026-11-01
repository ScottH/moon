// Finding when the sublunar point passes over (or near) a place.
import { sublunarPoint, distanceKm } from './moon.js';

const DAY_MS = 86400000;

/**
 * Pre-sample the sublunar track over a window so many targets can be
 * scanned cheaply. The track moves ~270 km per 10 minutes, so coarse
 * minima are refined against the exact ephemeris afterwards.
 */
export function sampleWindow(start, end, stepMinutes = 10) {
  const stepMs = stepMinutes * 60000;
  const t0 = start.getTime();
  const n = Math.floor((end.getTime() - t0) / stepMs) + 1;
  const lat = new Float64Array(n);
  const lon = new Float64Array(n);
  let maxAbsDec = 0;
  for (let i = 0; i < n; i++) {
    const p = sublunarPoint(new Date(t0 + i * stepMs));
    lat[i] = p.lat;
    lon[i] = p.lon;
    maxAbsDec = Math.max(maxAbsDec, Math.abs(p.lat));
  }
  return { t0, stepMs, n, lat, lon, maxAbsDec, start, end };
}

/** Golden-section search for the time of minimum distance in [a, b] (ms). */
function refineMinimum(target, a, b, tolMs = 1000) {
  const f = (ms) => {
    const p = sublunarPoint(new Date(ms));
    return { d: distanceKm(target.lat, target.lon, p.lat, p.lon), p };
  };
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a), d = a + g * (b - a);
  let fc = f(c), fd = f(d);
  while (b - a > tolMs) {
    if (fc.d < fd.d) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); }
  }
  const best = fc.d < fd.d ? fc : fd;
  return { time: best.p.time, distanceKm: best.d, lat: best.p.lat, lon: best.p.lon };
}

/** Local minima of distance-to-target along the sampled track (coarse). */
function coarseMinima(target, s) {
  const d = new Float64Array(s.n);
  for (let i = 0; i < s.n; i++) d[i] = distanceKm(target.lat, target.lon, s.lat[i], s.lon[i]);
  const minima = [];
  for (let i = 1; i < s.n - 1; i++) {
    if (d[i] <= d[i - 1] && d[i] < d[i + 1]) minima.push({ i, d: d[i] });
  }
  return minima;
}

// Coarse samples can overestimate the true minimum by up to half a step along the track.
const COARSE_SLACK_KM = 400;

/**
 * Find passes of the sublunar point within `thresholdKm` of `target`,
 * plus the overall closest approach in the window.
 */
export function findPasses(target, s, { thresholdKm = 50, closestCount = 5 } = {}) {
  const minima = coarseMinima(target, s);
  const refine = (m) => refineMinimum(target, s.t0 + (m.i - 1) * s.stepMs, s.t0 + (m.i + 1) * s.stepMs);

  const passes = minima
    .filter((m) => m.d < thresholdKm + COARSE_SLACK_KM)
    .map(refine)
    .filter((p) => p.distanceKm <= thresholdKm)
    .sort((a, b) => a.time - b.time);

  // Closest approaches: refine the best coarse candidates and keep the top few.
  const closest = minima
    .sort((a, b) => a.d - b.d)
    .slice(0, closestCount * 3)
    .map(refine)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, closestCount);

  return {
    passes,
    closest,
    reachable: Math.abs(target.lat) <= s.maxAbsDec,
    maxAbsDec: s.maxAbsDec,
  };
}

/**
 * For a target the Moon never (or rarely) passes over, suggest the nearest
 * cities that do get an overhead pass within the window.
 * `cities` rows: [name, region, country, lat, lon, population].
 */
export function suggestCities(target, s, cities, {
  thresholdKm = 50, minPopulation = 100000, count = 5, maxChecked = 200,
} = {}) {
  const latLimit = s.maxAbsDec + thresholdKm / 111;
  const candidates = cities
    .filter((c) => c[5] >= minPopulation && Math.abs(c[3]) <= latLimit)
    .map((c) => ({ c, dist: distanceKm(target.lat, target.lon, c[3], c[4]) }))
    .filter((x) => x.dist > 1) // skip the target itself
    .sort((a, b) => a.dist - b.dist)
    .slice(0, maxChecked);

  const out = [];
  for (const { c, dist } of candidates) {
    const city = { name: c[0], region: c[1], country: c[2], lat: c[3], lon: c[4], population: c[5] };
    const { passes } = findPasses(city, s, { thresholdKm, closestCount: 0 });
    if (passes.length) out.push({ city, distanceFromTargetKm: dist, passes });
    if (out.length >= count) break;
  }
  return out;
}

export { DAY_MS };
