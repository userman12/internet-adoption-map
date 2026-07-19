# Internet Adoption Map

An interactive data visualization exploring 30 years of internet adoption (1990–2024): a year-by-year timelapse of the world coming online, annotated with the milestones that shaped the internet — plus how fast each country went from 10% to 50% penetration, and what that reveals about who actually won the race online.

**The finding:** it wasn't the latecomers who moved fastest, it was the rich. The slowest movers were middle-income countries that connected an elite early, then stalled for a decade before the rest of the population came online.

## Live demo

**[userman12.github.io/internet-adoption-map](https://userman12.github.io/internet-adoption-map/)**

## Features

- **Timelapse with history** — press play to watch the real share of people online, country by country, year by year from 1990 to 2024, while the events that shaped the internet (Mosaic, Google, the iPhone, the Arab Spring, Jio, COVID…) appear in sync. Every year has at least one milestone; country-specific ones pulse on the map.
- **Scrub & deep-link any year** — drag the timeline (event ticks are clickable) or link straight to a year with `?y=2007`.
- **Eleven data layers** — adoption speed (10→50 years), share online, mobile subscriptions and fixed broadband per 100 people, price of 1GB mobile data (USD), median mobile download speed, internet-use gender parity (women online per man online), cumulative internet shutdowns since 2016, the Freedom on the Net score, internet exchange points per country (with data-center facility counts on hover), and native IPv6 adoption. Each layer works both as a static map (latest values) and inside the timelapse, greying out before its data begins.
- **Country drill-down** — click any country for a panel with its 1990–2024 curves (online %, mobile, broadband), its 10%/50% crossing points, its national milestones, a hover readout, and a cursor that follows the timelapse year.
- **Submarine cable overlay** — toggle the physical network that carries all this traffic: 604 in-service submarine cables (RFS 1989–2026, live TeleGeography data) appear on the globe/map as their ready-for-service year is reached during the timelapse, glowing on the year they're laid before settling into the background mesh. Also viewable statically. Hover a cable for its name, RFS year and owners.
- **Flat map / 3D globe / Scatter toggle** — view country data on a Natural Earth projection, a draggable orthographic globe, or a Gapminder-style bubble chart with any two of the twelve metrics (including GDP per capita) on the axes, bubble size mapped to population and colour to World Bank region (with a legend and direct labels on the twelve largest countries) — animated through the same 1990–2024 timelapse, log-scaled where the data is long-tailed, click a bubble for the full country drill-down.
- **Two adoption thresholds** — compare how long each country took to go from 10% → 50% or 10% → 40% online.
- **Highlight groups** — isolate the fastest, slowest, "leapfrog," and never-reached-50% countries with one click.
- **Country tooltips and ranked leaderboard** — hover any country for its exact timeline (including its share online in the selected timelapse year); see a live top/bottom ranking as you filter.
- **Clean mode** — hide all UI chrome for a distraction-free view of the map itself.

## Project structure

```
index.html            markup
css/style.css         styles
js/app.js             map, timelapse and UI logic (plain D3, no build step)
data/adoption.js       per-country annual series + threshold metrics (generated)
data/metrics.js        mobile & fixed-broadband subs per 100 people (generated)
data/extras.js         1GB price, median Mbps, gender parity, GDP, population… (generated)
data/region.js         iso3 -> World Bank region, scatter view bubble colour (generated)
data/cables.js         submarine cable routes + ready-for-service years (generated)
data/geo.js            topojson-id → ISO lookups, small-territory dots
data/events.js         curated internet-history milestones
scripts/build_data.py  regenerates adoption.js + metrics.js (OWID + World Bank)
scripts/build_extras.py regenerates extras.js (Cable.co.uk + Ookla + World Bank)
scripts/build_cables.py regenerates cables.js (TeleGeography mirror)
```

## Data

- Internet penetration (annual, per country) is sourced from [Our World in Data](https://ourworldindata.org/grapher/share-of-individuals-using-the-internet) / ITU (2025 release).
- Mobile and fixed-broadband subscriptions per 100 people come from the [World Bank API](https://data.worldbank.org/indicator/IT.CEL.SETS.P2) (indicators `IT.CEL.SETS.P2`, `IT.NET.BBND.P2`).
- The price of 1GB of mobile data (USD, 2019–2023) comes from the [Cable.co.uk worldwide mobile data pricing study](https://www.cable.co.uk/mobiles/worldwide-data-pricing/); median mobile download speeds are a current snapshot of the [Ookla Speedtest Global Index](https://www.speedtest.net/global-index); the gender parity ratio is women online / men online from World Bank indicators `IT.NET.USER.FE.ZS` / `IT.NET.USER.MA.ZS`. Refresh with `python3 scripts/build_extras.py`.
- Refresh everything with `python3 scripts/build_data.py` — no dependencies beyond the Python standard library. Where a country's series ends early, the last reported value is held (shown as "latest available").
- Submarine cable routes, owners and ready-for-service years come from the live [TeleGeography submarine cable map](https://www.submarinecablemap.com/) v3 API (in-service cables only; planned builds excluded), regenerated with `python3 scripts/build_cables.py`.
- Internet shutdown counts come from the [Access Now #KeepItOn STOP dataset](https://www.accessnow.org/campaign/keepiton/) (2016–2024, cumulative per country); Freedom on the Net scores are the current edition from [Freedom House](https://freedomhouse.org/report/freedom-net) (72 countries). Both refresh with `python3 scripts/build_extras.py`.
- Internet exchange points and data-center facility counts come from the [PeeringDB](https://www.peeringdb.com/) API (1,311 exchanges and 5,857 facilities, live); native IPv6 adoption is Google's [per-country snapshot](https://www.google.com/intl/en/ipv6/statistics.html) (no history — refreshed daily upstream, pulled at build time). GDP per capita and total population (current US$ / headcount, full 1990+ history — the scatter view's flagship axis and its bubble size) are World Bank indicators `NY.GDP.PCAP.CD` and `SP.POP.TOTL`. Each country's World Bank region (the scatter view's bubble colour) comes from the same country-list call. All refreshed with `python3 scripts/build_extras.py`.
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
