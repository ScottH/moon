// Leaflet map (Web Mercator) with the Moon marker, target marker and track lines.
/* global L */

const COPIES = [-360, 0, 360]; // draw on neighbouring world copies so panning stays seamless

export function createMap(el) {
  const map = L.map(el, {
    center: [10, 0],
    zoom: 2,
    minZoom: 1,
    worldCopyJump: true,
  });

  const esri = (service) => `https://server.arcgisonline.com/ArcGIS/rest/services/${service}/MapServer/tile/{z}/{y}/{x}`;
  const esriAttribution = 'Tiles &copy; <a href="https://www.esri.com/">Esri</a>, HERE, Garmin, &copy; OpenStreetMap contributors';
  const dark = L.layerGroup([
    L.tileLayer(esri('Canvas/World_Dark_Gray_Base'), { attribution: esriAttribution, maxZoom: 16 }),
    L.tileLayer(esri('Canvas/World_Dark_Gray_Reference'), { maxZoom: 16 }),
  ]).addTo(map);
  const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  });
  const satellite = L.tileLayer(esri('World_Imagery'), {
    attribution: 'Imagery &copy; <a href="https://www.esri.com/">Esri</a>, Maxar, Earthstar Geographics',
    maxZoom: 18,
  });
  L.control.layers({ Dark: dark, OpenStreetMap: osm, Satellite: satellite }, null, { position: 'topright' }).addTo(map);
  L.control.scale({ imperial: true }).addTo(map);

  const trackLayer = L.layerGroup().addTo(map);
  const trailLayer = L.layerGroup().addTo(map);
  const bandLayer = L.layerGroup().addTo(map);
  const suggestionLayer = L.layerGroup().addTo(map);

  const moonIcon = L.divIcon({ className: '', html: '<div class="moon-icon"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
  const moon = L.marker([0, 0], { icon: moonIcon, zIndexOffset: 1000, keyboard: false }).addTo(map);
  let target = null;

  return {
    map,

    setMoon(lat, lon, label) {
      moon.setLatLng(wrapNear(map, lat, lon));
      if (label) moon.bindTooltip(label, { direction: 'top', offset: [0, -12] });
    },

    setTarget(lat, lon, label) {
      if (target) target.remove();
      target = L.circleMarker([lat, lon], {
        // Large ring so it stays visible when the Moon marker sits on top of it.
        radius: 15, color: '#5ec8ff', weight: 2.5, fillColor: '#5ec8ff', fillOpacity: 0.15,
      }).addTo(map);
      if (label) target.bindTooltip(label, { direction: 'top', offset: [0, -6] });
    },

    showTrack(points) {
      trackLayer.clearLayers();
      for (const seg of splitAtAntimeridian(points)) {
        for (const off of COPIES) {
          L.polyline(seg.map((p) => [p.lat, p.lon + off]), {
            color: '#f5d76e', weight: 2, opacity: 0.45, dashArray: '4 6', interactive: false,
          }).addTo(trackLayer);
        }
      }
    },

    showTrail(points) {
      trailLayer.clearLayers();
      for (const seg of splitAtAntimeridian(points)) {
        for (const off of COPIES) {
          L.polyline(seg.map((p) => [p.lat, p.lon + off]), {
            color: '#f5d76e', weight: 3, opacity: 0.95, interactive: false,
          }).addTo(trailLayer);
        }
      }
    },

    clearTrack() { trackLayer.clearLayers(); trailLayer.clearLayers(); },

    /** Dashed lines at ±maxDec: the band where the Moon can be overhead. */
    showBand(maxDec) {
      bandLayer.clearLayers();
      for (const lat of [maxDec, -maxDec]) {
        L.polyline([[lat, -540], [lat, 540]], {
          color: '#8d98b8', weight: 1, opacity: 0.6, dashArray: '2 6', interactive: false,
        }).addTo(bandLayer);
      }
      L.tooltip({ permanent: true, direction: 'right', className: 'band-label' })
        .setLatLng([maxDec, map.getCenter().lng - 170])
        .setContent(`Moon's overhead limit ±${maxDec.toFixed(1)}°`)
        .addTo(bandLayer);
    },

    showSuggestions(items, onClick) {
      suggestionLayer.clearLayers();
      for (const s of items) {
        L.circleMarker([s.city.lat, s.city.lon], {
          radius: 5, color: '#6fdc8c', weight: 2, fillOpacity: 0.5,
        })
          .bindTooltip(s.city.name)
          .on('click', (e) => { L.DomEvent.stopPropagation(e); onClick(s); })
          .addTo(suggestionLayer);
      }
    },

    clearSuggestions() { suggestionLayer.clearLayers(); },
  };
}

/** Break a track into pieces wherever it jumps across ±180° longitude. */
export function splitAtAntimeridian(points) {
  const segs = [];
  let cur = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (cur.length && Math.abs(p.lon - cur[cur.length - 1].lon) > 180) {
      // Interpolate the crossing so both pieces reach the map edge.
      const a = cur[cur.length - 1];
      const bLon = p.lon + (p.lon < a.lon ? 360 : -360);
      const edge = a.lon < 0 ? -180 : 180;
      const f = (edge - a.lon) / (bLon - a.lon);
      const lat = a.lat + f * (p.lat - a.lat);
      cur.push({ lat, lon: edge });
      segs.push(cur);
      cur = [{ lat, lon: -edge }];
    }
    cur.push(p);
  }
  if (cur.length > 1) segs.push(cur);
  return segs;
}

/** Pick the world copy of `lon` closest to the current view so markers don't jump. */
function wrapNear(map, lat, lon) {
  const c = map.getCenter().lng;
  return [lat, lon + 360 * Math.round((c - lon) / 360)];
}
