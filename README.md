# Internet Adoption Map

An interactive data visualization exploring how fast countries went from 10% to 50% internet penetration between 1990 and 2024 — and what that reveals about who actually won the race online.

**The finding:** it wasn't the latecomers who moved fastest, it was the rich. The slowest movers were middle-income countries that connected an elite early, then stalled for a decade before the rest of the population came online.

## Live demo

Open `index.html` in any modern browser — no build step, no server, no dependencies to install.

## Features

- **Flat map / 3D globe toggle** — view country data on a Natural Earth projection or a draggable, rotatable orthographic globe.
- **Two adoption thresholds** — compare how long each country took to go from 10% → 50% or 10% → 40% online.
- **Play the wave** — animate the year-by-year march of countries crossing the 50% threshold, from 1995 to today.
- **Highlight groups** — isolate the fastest, slowest, "leapfrog," and never-reached-50% countries with one click.
- **Country tooltips and ranked leaderboard** — hover any country for its exact timeline; see a live top/bottom ranking as you filter.
- **Clean mode** — hide all UI chrome for a distraction-free view of the map itself.

## Data

Internet penetration data is sourced from [Our World in Data](https://ourworldindata.org/) / ITU (2024 release). Country boundaries and centroids come from [world-atlas](https://github.com/topojson/world-atlas) via TopoJSON.

## Tech stack

- [D3.js](https://d3js.org/) (v7) for projections, scales, and DOM binding
- [TopoJSON](https://github.com/topojson/topojson) for compact map geometry
- Plain HTML/CSS/JavaScript — everything lives in a single `index.html` file, with data embedded inline

## Running locally

```bash
git clone https://github.com/userman12/internet-adoption-map.git
cd internet-adoption-map
open index.html
```

Or serve it with any static file server:

```bash
python3 -m http.server
```

Then visit `http://localhost:8000`.

## License

No license specified yet — all rights reserved by default until one is added.
