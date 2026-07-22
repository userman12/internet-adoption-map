# Internet Adoption Map

An interactive data visualization exploring 30 years of internet adoption (1990–2024): a year-by-year timelapse of the world coming online, annotated with the milestones that shaped the internet — plus how fast each country went from 10% to 50% penetration, and what that reveals about who actually won the race online.

**The finding:** it wasn't the latecomers who moved fastest, it was the rich. The slowest movers were middle-income countries that connected an elite early, then stalled for a decade before the rest of the population came online.

## Live demo

**[userman12.github.io/internet-adoption-map](https://userman12.github.io/internet-adoption-map/)**

## Features

- **Timelapse with history** — press play to watch the real share of people online, country by country, year by year from 1990 to 2024, while the events that shaped the internet (Mosaic, Google, the iPhone, the Arab Spring, Jio, COVID…) appear in sync. Every year has at least one milestone; country-specific ones pulse on the map.
- **Scrub & shareable URLs** — drag the timeline (event ticks are clickable), and every meaningful control writes itself into the URL so any view is a link: view, layer, race threshold, highlight, cable overlay, scatter axes, year and the open country panel. `?v=scatter&ax=gdp&ay=net` or `?y=2016&l=mobile&c=IND` reopen exactly what you were looking at.
- **Keyboard** — `←`/`→` step the year, `space` plays/pauses, `1`–`0` pick a data layer, `F`/`G`/`S`/`R` switch to flat map / globe / scatter / race, `Esc` closes the country panel.
- **Eleven data layers** — adoption speed (10→50 years), share online, mobile subscriptions and fixed broadband per 100 people, price of 1GB mobile data (USD), median mobile download speed, internet-use gender parity (women online per man online), cumulative internet shutdowns since 2016, the Freedom on the Net score, internet exchange points per country (with data-center facility counts on hover), and native IPv6 adoption. Each layer works both as a static map (latest values) and inside the timelapse, greying out before its data begins.
- **Country drill-down** — click any country for a panel with its 1990–2024 curves (online %, mobile, broadband), its 10%/50% crossing points, its national milestones, a hover readout, and a cursor that follows the timelapse year.
- **Submarine cable overlay** — toggle the physical network that carries all this traffic: 604 in-service submarine cables (RFS 1989–2026, live TeleGeography data) appear on the globe/map as their ready-for-service year is reached during the timelapse, glowing on the year they're laid before settling into the background mesh. Also viewable statically. Hover a cable for its name, RFS year and owners.
- **Flat map / 3D globe / Scatter / Race toggle** — view country data on a Natural Earth projection, a draggable orthographic globe, a Gapminder-style bubble chart with any two of the twelve metrics (including GDP per capita) on the axes, bubble size mapped to population and colour to World Bank region (with a legend and direct labels on the twelve largest countries), or a bar chart race ranking the top 12 countries on any data layer, bars reordering and resizing live as you scrub or play the 1990–2024 timelapse. Scatter and Race share the same region colour legend; click a bubble or bar for the full country drill-down.
- **Compare mode** — switch the whole app into a dedicated mode (top-center toggle) where clicking countries on the map adds them (2–4) to an overlaid line chart of any one metric, instead of opening the single-country panel. Shareable via URL (`?mode=compare&c=USA,IND&cm=mobile`) just like everything else.
- **Two adoption thresholds** — compare how long each country took to go from 10% → 50% or 10% → 40% online.
- **Highlight groups** — isolate the fastest, slowest, "leapfrog," and never-reached-50% countries with one click.
- **Country tooltips and ranked leaderboard** — hover any country for its exact timeline (including its share online in the selected timelapse year); see a live top/bottom ranking as you filter.
- **Clean mode** — hide all UI chrome for a distraction-free view of the map itself.
- **Self-refreshing data** — a monthly GitHub Action reruns the entire pipeline against live upstream sources and commits whatever changed, with a sanity check that refuses to commit if a source looks broken (see [Keeping it live](#keeping-it-live) below). A quiet "Data refreshed \<month year\>" badge states exactly when that last happened.
- **Estimated live counter** — "≈ N people online right now" in the header, extrapolated client-side from the last two real data years' growth rate to the current date and ticking up every second. Clearly labelled as an estimate, not a live feed — see the methodology note below.

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
data/meta.js            "data refreshed" timestamp for the UI badge (generated)
data/geo.js            topojson-id → ISO lookups, small-territory dots
data/events.js         curated internet-history milestones
scripts/build_data.py  regenerates adoption.js + metrics.js (OWID + World Bank)
scripts/build_extras.py regenerates extras.js + region.js (Cable.co.uk, Ookla, World Bank, PeeringDB, Google, Access Now, Freedom House)
scripts/build_cables.py regenerates cables.js (TeleGeography, live API)
scripts/build_meta.py  regenerates meta.js (just today's date)
scripts/check_data.py  sanity-checks record counts across all generated files
.github/workflows/refresh-data.yml   the monthly refresh described below
```

## Keeping it live

`.github/workflows/refresh-data.yml` runs on the 1st of every month (and on
demand via the "Run workflow" button in the Actions tab): it reruns the full
pipeline (`build_data.py` → `build_extras.py` → `build_cables.py` →
`build_meta.py`), then `check_data.py` — which refuses to let the run commit
if any dataset's record count falls below a hard floor, so a source that
silently changed its page layout or returned an empty response can't quietly
overwrite good data with broken data. If everything passes and something
actually changed, it commits straight to `main` and pushes; GitHub Pages
picks it up immediately since there's no build step. If nothing changed
upstream, it's a no-op.

Note: GitHub only fires a workflow's `schedule` trigger from the copy of the
file on the repo's **default branch** — so the cron is inert on any other
branch until this file is merged there.

The header's "≈ N people online right now" counter is **not** live data —
it's computed once per page load from the last two real annual data points
(summed per-country: % online × population), extrapolated forward at that
growth rate to the current date, then ticked up client-side once a second
for the animated effect. It's an honest estimate stated as one, not a feed.

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
