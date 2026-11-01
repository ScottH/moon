// Pure astronomy helpers: where on Earth is the Moon directly overhead?
import * as Astronomy from 'https://cdn.jsdelivr.net/npm/astronomy-engine@2.1.19/esm/astronomy.js';

export { Astronomy };

export const EARTH_RADIUS_KM = 6371.0088;
const DEG = Math.PI / 180;

export function normalizeLon(lon) {
  lon = ((lon + 180) % 360 + 360) % 360 - 180;
  return lon === -180 ? 180 : lon;
}

/**
 * Sublunar point at `date`: geocentric declination is the latitude,
 * and (right ascension − Greenwich apparent sidereal time) is the longitude.
 */
export function sublunarPoint(date) {
  const t = Astronomy.MakeTime(date);
  const eqj = Astronomy.GeoVector(Astronomy.Body.Moon, t, true);
  const eqd = Astronomy.RotateVector(Astronomy.Rotation_EQJ_EQD(t), eqj);
  const eq = Astronomy.EquatorFromVector(eqd);
  const gast = Astronomy.SiderealTime(t);
  return {
    time: t.date,
    lat: eq.dec,
    lon: normalizeLon((eq.ra - gast) * 15),
    distKm: eq.dist * Astronomy.KM_PER_AU,
  };
}

/** Phase info for display. */
export function moonPhase(date) {
  const angle = Astronomy.MoonPhase(date); // 0 new, 90 first quarter, 180 full, 270 last quarter
  const illum = Astronomy.Illumination(Astronomy.Body.Moon, date);
  const names = ['New Moon', 'Waxing Crescent', 'First Quarter', 'Waxing Gibbous',
    'Full Moon', 'Waning Gibbous', 'Last Quarter', 'Waning Crescent'];
  return {
    angle,
    fraction: illum.phase_fraction,
    name: names[Math.round(angle / 45) % 8],
  };
}

/** Sample the sublunar track between two dates. */
export function track(start, end, stepMinutes = 5) {
  const pts = [];
  const step = stepMinutes * 60000;
  for (let ms = start.getTime(); ms <= end.getTime(); ms += step) {
    pts.push(sublunarPoint(new Date(ms)));
  }
  return pts;
}

/** Great-circle distance in km. */
export function distanceKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * DEG;
  const dLon = (lon2 - lon1) * DEG;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}
