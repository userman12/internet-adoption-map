# Internet Adoption Map

An interactive data visualization exploring 30 years of internet adoption (1990–2024): a year-by-year timelapse of the world coming online, annotated with the milestones that shaped the internet — plus how fast each country went from 10% to 50% penetration, and what that reveals about who actually won the race online.

**The finding:** it wasn't the latecomers who moved fastest, it was the rich. The slowest movers were middle-income countries that connected an elite early, then stalled for a decade before the rest of the population came online.

## Live demo

**[userman12.github.io/internet-adoption-map](https://userman12.github.io/internet-adoption-map/)**

## Features

- **Timelapse with history** — press play to watch the real share of people online, country by country, year by year from 1990 to 2024, while the events that shaped the internet (Mosaic, Google, the iPhone, the Arab Spring, Jio, COVID…) appear in sync. Every year has at least one milestone; country-specific ones pulse on the map.
- **Scrub & deep-link any year** — drag the timeline (event ticks are clickable) or link straight to a year with `?y=2007`.
- **Four data layers** — adoption speed (10→50 years), share online, mobile subscriptions and fixed broadband per 100 people. Each layer works both as a static map (latest values) and inside the timelapse.
- **Country drill-down** — click any country for a panel with its 1990–2024 curves (online %, mobile, broadband), its 10%/50% crossing points, its national milestones, a hover readout, and a cursor that follows the timelapse year.
- **Flat map / 3D globe toggle** — view country data on a Natural Earth projection or a draggable, rotatable orthographic globe.
- **Two adoption thresholds** — compare how long each country took to go from 10% → 50% or 10% → 40% online.
- **Highlight groups** — isolate the fastest, slowest, "leapfrog," and never-reached-50% countries with one click.
- **Country tooltips and ranked leaderboard** — hover any country for its exact timeline (including its share online in the selected timelapse year); see a live top/bottom ranking as you filter.
- **Clean mode** — hide all UI chrome for a distraction-free view of the map itself.

## Project structure

```
index.html            markup
css/style.css         styles
js/app.js             map, timelapse and UI logic (plain D3, no build step)
data/adoption.js      per-country annual series + threshold metrics (generated)
data/metrics.js       mobile & fixed-broadband subs per 100 people (generated)
data/geo.js           topojson-id → ISO lookups, small-territory dots
data/events.js        curated internet-history milestones
scripts/build_data.py regenerates the generated data files (OWID + World Bank)
```

## Data

- Internet penetration (annual, per country) is sourced from [Our World in Data](https://ourworldindata.org/grapher/share-of-individuals-using-the-internet) / ITU (2025 release).
- Mobile and fixed-broadband subscriptions per 100 people come from the [World Bank API](https://data.worldbank.org/indicator/IT.CEL.SETS.P2) (indicators `IT.CEL.SETS.P2`, `IT.NET.BBND.P2`).
- Refresh everything with `python3 scripts/build_data.py` — no dependencies beyond the Python standard library. Where a country's series ends early, the last reported value is held (shown as "latest available").
- Historical events are hand-curated in `data/events.js`.
- Country boundaries and centroids come from [world-atlas](https://github.com/topojson/world-atlas) via TopoJSON.

## Tech stack

- [D3.js](https://d3js.org/) (v7) for projections, scales, and DOM binding
- [TopoJSON](https://github.com/topojson/topojson) for compact map geometry
- Plain HTML/CSS/JavaScript — no framework, no build step

## Running locally

Clone the repo and open `index.html` — data files load as plain scripts, so it works straight from disk (a local server like `python3 -m http.server` works too, but isn't required).

```bash
git clone https://github.com/userman12/internet-adoption-map.git
```

## License

No license specified yet — all rights reserved by default until one is added.
