# Sublunar Point Tracker

A static web app showing where on Earth the Moon is directly overhead (the **sublunar point**).

- **Moment:** latitude/longitude of the sublunar point for any date and time, plus Moon distance and phase.
- **Find a pass:** pick a city (bundled list or OpenStreetMap search), type coordinates, or click the map to list the times the sublunar point passes within a chosen distance.
- **Out-of-band places:** the Moon is only ever overhead between about ±18° and ±28.6° latitude (the limit varies over an 18.6-year cycle). For places outside that band, the app shows the closest approaches and the **nearest cities the Moon does pass over**, ranked by distance from you.
- **Path & animation:** draws the track on a Mercator (Leaflet) map and plays it back with adjustable speed and a time slider.
- The URL hash stores the time and target, so links can be shared.

## Run locally

ES modules need to be served over HTTP (they don't load from `file://`):

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Sanity tests: open `http://localhost:8000/test.html`.

## Host on GitHub Pages

No build step is needed.

1. Push this folder to a GitHub repository.
2. In the repository, go to **Settings → Pages → Build and deployment**, choose **Deploy from a branch**, then select `main` and `/ (root)`.
3. The site appears at `https://<user>.github.io/<repo>/`.

`.nojekyll` stops GitHub from running Jekyll on the files. All paths are relative, so it works from a project subpath.

If the project later grows a build step (npm dependencies, bundling), switch Pages to **GitHub Actions** and add a workflow using `actions/deploy-pages`.

## How it works

- `js/moon.js`: the Moon's geocentric position from [Astronomy Engine](https://github.com/cosinekitty/astronomy), rotated to the true equator of date. The sublunar latitude is the Moon's declination. The longitude is its right ascension minus Greenwich apparent sidereal time.
- `js/search.js`: samples the track every 10 minutes across the search window, finds local minima of great-circle distance to the target, and refines each minimum to about 1 second with a golden-section search.
- `js/map.js`: the Leaflet map. Tracks are split where they cross the ±180° meridian (the antimeridian) and drawn on neighbouring copies of the world.
- `data/cities.json`: about 7,300 populated places from [Natural Earth](https://www.naturalearthdata.com/) (public domain).

Libraries load from CDNs: Astronomy Engine via jsDelivr and Leaflet via unpkg. Map tiles come from Esri and OpenStreetMap, and geocoding from Nominatim, which is only queried when you press "Search OSM".
