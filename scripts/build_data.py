#!/usr/bin/env python3
"""Regenerate data/adoption.js and data/metrics.js.

- data/adoption.js: OWID "share of individuals using the internet" (ITU) —
  per-country threshold metrics plus a dense annual series.
- data/metrics.js: World Bank mobile subscriptions (IT.CEL.SETS.P2) and fixed
  broadband subscriptions (IT.NET.BBND.P2) per 100 people, dense annual series.

Usage:
    python3 scripts/build_data.py            # download everything fresh
    python3 scripts/build_data.py local.csv  # reuse a downloaded OWID CSV
                                             # (World Bank is always fetched)
"""
import csv
import io
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

OWID_URL = ("https://ourworldindata.org/grapher/"
            "share-of-individuals-using-the-internet.csv"
            "?csvType=full&useColumnShortNames=true")
YEAR_MIN, YEAR_MAX = 1990, 2024
REPO = Path(__file__).resolve().parent.parent

# Entities whose series is too sparse/stale to trust for speed rankings.
LOW_CONFIDENCE = {
    "ASM", "CAF", "CUW", "GIB", "LIE", "LKA", "NRU", "OWID_KOS", "PLW",
    "PRK", "SDN", "SMR", "SOM", "SSD", "TKM", "VGB",
}


def load_rows(argv):
    if len(argv) > 1:
        text = Path(argv[1]).read_text()
    else:
        print(f"downloading {OWID_URL.split('?')[0]} ...")
        with urllib.request.urlopen(OWID_URL) as r:
            text = r.read().decode("utf-8")
    return list(csv.DictReader(io.StringIO(text)))


def first_crossing(points, threshold):
    """First year the raw series reaches the threshold."""
    for year, value in points:
        if value >= threshold:
            return year
    return None


def dense_series(points):
    """Yearly values from first data year to YEAR_MAX.

    Linear interpolation over gaps between observations; the last observed
    value is held flat through YEAR_MAX (shown as "latest available").
    """
    start = points[0][0]
    known = dict(points)
    values, prev = [], None
    for year in range(start, YEAR_MAX + 1):
        if year in known:
            values.append(known[year])
        elif year > points[-1][0]:
            values.append(points[-1][1])
        else:
            nxt = next(p for p in points if p[0] > year)
            prv = prev if prev is not None else points[0]
            span = nxt[0] - prv[0]
            values.append(prv[1] + (nxt[1] - prv[1]) * (year - prv[0]) / span)
        if year in known:
            prev = (year, known[year])
    return start, [round(v, 1) for v in values]


def build(rows):
    by_code = {}
    for row in rows:
        code, year = row["code"], int(row["year"])
        value = row["it_net_user_zs"]
        if not code or value == "" or year < YEAR_MIN:
            continue
        by_code.setdefault(code, []).append((year, float(value)))

    world = by_code.pop("OWID_WRL", None)
    countries = []
    for code, points in sorted(by_code.items()):
        if "_" in code and code != "OWID_KOS":
            continue  # regional aggregates (OWID_*, WB_*)
        points.sort()
        name = next(r["entity"] for r in rows if r["code"] == code)
        y10 = first_crossing(points, 10)
        y40 = first_crossing(points, 40)
        y50 = first_crossing(points, 50)
        peak = max(v for _, v in points)
        ly, latest = points[-1]
        sy, vals = dense_series(points)
        countries.append({
            "iso": code, "name": name,
            "y10": y10, "y40": y40, "y50": y50,
            "gap50": (y50 - y10) if y10 is not None and y50 is not None else None,
            "gap40": (y40 - y10) if y10 is not None and y40 is not None else None,
            "latest": round(latest, 1), "peak": round(peak, 1),
            "reached50": y50 is not None,
            "lowconf": code in LOW_CONFIDENCE, "ly": ly,
            "sy": sy, "v": vals,
        })

    out = {"countries": countries}
    if world:
        world.sort()
        sy, vals = dense_series(world)
        out["world"] = {"sy": sy, "v": vals}
    return out


WB_URL = ("https://api.worldbank.org/v2/country/all/indicator/{ind}"
          "?format=json&per_page=20000&date=1990:2025")
WB_INDICATORS = {"mobile": "IT.CEL.SETS.P2", "bband": "IT.NET.BBND.P2"}
WB_ISO_FIX = {"XKX": "OWID_KOS"}  # World Bank -> OWID country code


def build_metrics(valid_isos):
    out = {}
    for key, ind in WB_INDICATORS.items():
        url = WB_URL.format(ind=ind)
        print(f"downloading World Bank {ind} ...")
        req = urllib.request.Request(url, headers={"User-Agent": "internet-adoption-map data pipeline"})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    payload = json.load(r)
                break
            except (urllib.error.URLError, ConnectionError, TimeoutError):
                if attempt == 2:
                    raise
                print("  retrying ...")
        by_iso = {}
        for row in payload[1]:
            iso = WB_ISO_FIX.get(row["countryiso3code"], row["countryiso3code"])
            if iso not in valid_isos or row["value"] is None:
                continue
            by_iso.setdefault(iso, []).append((int(row["date"]), float(row["value"])))
        series = {}
        for iso, points in sorted(by_iso.items()):
            points.sort()
            sy, vals = dense_series(points)
            series[iso] = {"sy": sy, "v": vals}
        out[key] = series
    return out


def main():
    rows = load_rows(sys.argv)
    data = build(rows)
    js = ("// Generated by scripts/build_data.py — do not edit by hand.\n"
          "// Source: Our World in Data / ITU, share of individuals using the internet.\n"
          "window.ADOPTION=" + json.dumps(data, separators=(",", ":")) + ";\n")
    target = REPO / "data" / "adoption.js"
    target.parent.mkdir(exist_ok=True)
    target.write_text(js)
    print(f"wrote {target} — {len(data['countries'])} countries"
          + (", world series included" if "world" in data else ""))

    valid = {c["iso"] for c in data["countries"]}
    metrics = build_metrics(valid)
    js = ("// Generated by scripts/build_data.py — do not edit by hand.\n"
          "// Source: World Bank — mobile (IT.CEL.SETS.P2) and fixed broadband\n"
          "// (IT.NET.BBND.P2) subscriptions per 100 people.\n"
          "window.METRICS=" + json.dumps(metrics, separators=(",", ":")) + ";\n")
    target = REPO / "data" / "metrics.js"
    target.write_text(js)
    counts = {k: len(v) for k, v in metrics.items()}
    print(f"wrote {target} — {counts}")


if __name__ == "__main__":
    main()
