#!/usr/bin/env python3
"""Regenerate data/extras.js — the phase-1a datasets.

- price:  average USD price of 1GB mobile data, 2019-2023, from the
  Cable.co.uk worldwide mobile data pricing study (XLSX, historical sheet).
- mbps:   median mobile download speed (Mbps), current snapshot, from the
  Ookla Speedtest Global Index (server-rendered HTML tables).
- gender: internet-use gender parity ratio (share of women online divided
  by share of men online; 1.0 = parity), World Bank IT.NET.USER.FE.ZS /
  IT.NET.USER.MA.ZS.

Series use the same {sy, v:[...]} shape as data/metrics.js: dense annual
values from the first data year, last value held flat through YEAR_MAX.

Usage:
    python3 scripts/build_extras.py

No dependencies beyond the Python standard library.
"""
import json
import re
import urllib.error
import urllib.request
import zipfile
from io import BytesIO
from pathlib import Path
from xml.etree import ElementTree as ET

YEAR_MIN, YEAR_MAX = 1990, 2024
REPO = Path(__file__).resolve().parent.parent
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

PRICE_URL = ("https://540k006f.tinifycdn.com/mobiles/worldwide-data-pricing/"
             "2023/worldwide_mobile_data_pricing_data.xlsx")
SPEED_URL = "https://www.speedtest.net/global-index"
WB_URL = ("https://api.worldbank.org/v2/country/all/indicator/{ind}"
          "?format=json&per_page=20000&date=1990:2025")
WB_COUNTRIES_URL = "https://api.worldbank.org/v2/country?format=json&per_page=400"
GENDER_INDICATORS = {"fe": "IT.NET.USER.FE.ZS", "ma": "IT.NET.USER.MA.ZS"}
WB_ISO_FIX = {"XKX": "OWID_KOS"}  # World Bank -> OWID country code

# Speedtest slugs that don't resolve via normalised World Bank names.
SLUG_ALIASES = {
    "ivory-coast": "CIV", "south-korea": "KOR", "russia": "RUS",
    "venezuela": "VEN", "iran": "IRN", "syria": "SYR", "laos": "LAO",
    "vietnam": "VNM", "dr-congo": "COD", "republic-of-the-congo": "COG",
    "hong-kong-sar": "HKG", "hong-kong": "HKG", "macau-sar": "MAC",
    "macau": "MAC", "taiwan": "TWN", "turkey": "TUR", "egypt": "EGY",
    "slovakia": "SVK", "kyrgyzstan": "KGZ", "palestine": "PSE",
    "brunei": "BRN", "cape-verde": "CPV", "eswatini": "SWZ",
    "swaziland": "SWZ", "the-bahamas": "BHS", "the-gambia": "GMB",
    "yemen": "YEM", "north-korea": "PRK", "moldova": "MDA",
    "tanzania": "TZA", "bolivia": "BOL", "micronesia": "FSM",
    "saint-lucia": "LCA", "saint-vincent-and-the-grenadines": "VCT",
    "saint-kitts-and-nevis": "KNA", "st-lucia": "LCA",
    "st-vincent-and-the-grenadines": "VCT", "st-kitts-and-nevis": "KNA",
    "czech-republic": "CZE", "czechia": "CZE",
}


def fetch(url, binary=False):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                data = r.read()
            return data if binary else data.decode("utf-8", errors="ignore")
        except (urllib.error.URLError, ConnectionError, TimeoutError):
            if attempt == 2:
                raise
            print("  retrying ...")


def dense_series(points, digits):
    """Yearly values from first data year to YEAR_MAX (same rules as
    build_data.py: linear interpolation in gaps, last value held flat)."""
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
    return start, [round(v, digits) for v in values]


def series_map(by_iso, digits):
    out = {}
    for iso, points in sorted(by_iso.items()):
        points.sort()
        sy, vals = dense_series(points, digits)
        out[iso] = {"sy": sy, "v": vals}
    return out


def wb_countries():
    """iso2 -> iso3 and normalised-name -> iso3 for real countries."""
    print("downloading World Bank country list ...")
    payload = json.loads(fetch(WB_COUNTRIES_URL))
    iso2to3, name_to3 = {}, {}
    for row in payload[1]:
        if row["region"]["id"] == "NA":
            continue  # aggregates
        iso3 = WB_ISO_FIX.get(row["id"], row["id"])
        iso2to3[row["iso2Code"].upper()] = iso3
        name_to3[norm(row["name"])] = iso3
    return iso2to3, name_to3


def norm(name):
    return re.sub(r"[^a-z]+", "", name.lower())


# ── price of 1GB (Cable.co.uk XLSX, historical sheet) ─────────────


def build_price(iso2to3):
    print("downloading Cable.co.uk pricing XLSX ...")
    z = zipfile.ZipFile(BytesIO(fetch(PRICE_URL, binary=True)))
    ns = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    t_tag = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t"
    strings = [
        "".join(t.text or "" for t in si.iter(t_tag))
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).findall("m:si", ns)
    ]
    sheet = ET.fromstring(z.read("xl/worksheets/sheet4.xml"))

    def cells(row):
        out = []
        for c in row.findall("m:c", ns):
            v = c.find("m:v", ns)
            val = v.text if v is not None else ""
            if c.get("t") == "s" and val:
                val = strings[int(val)]
            out.append(val)
        return out

    rows = [cells(r) for r in sheet.findall(".//m:row", ns)]
    header = rows[0]
    year_cols = {}  # column index -> year
    for i, h in enumerate(header):
        m = re.search(r"USD – (\d{4})", h)
        if m:
            year_cols[i] = int(m.group(1))

    by_iso = {}
    for row in rows[1:]:
        if len(row) < 4 or len(row[0]) != 2:
            continue
        iso3 = iso2to3.get(row[0].upper())
        if not iso3 or iso3 in by_iso:
            continue  # unmapped territory, or region-sheet repeat
        points = []
        for i, year in year_cols.items():
            try:
                points.append((year, float(row[i])))
            except (IndexError, ValueError):
                pass
        if points:
            by_iso[iso3] = points
    return series_map(by_iso, 2)


# ── median mobile download speed (Speedtest Global Index) ─────────


def build_speed(name_to3):
    print("downloading Speedtest Global Index ...")
    html = fetch(SPEED_URL)
    # the page carries both MEAN and MEDIAN mobile rankings; we want the
    # median one, which lives between these two section markers
    mobile = html.split("column-mobileMedian")[1].split("column-fixedMedian")[0]
    pairs = re.findall(
        r'href="/global-index/([a-z-]+)#mobile"[^>]*>.*?'
        r'<td class="speed">([\d.]+)</td>',
        mobile, re.S)
    by_iso, missed = {}, []
    for slug, speed in pairs:
        iso3 = SLUG_ALIASES.get(slug) or name_to3.get(norm(slug))
        if not iso3:
            missed.append(slug)
            continue
        by_iso.setdefault(iso3, []).append((YEAR_MAX, float(speed)))
    if missed:
        print(f"  unmatched slugs ({len(missed)}): {', '.join(sorted(set(missed)))}")
    return series_map(by_iso, 1)


# ── internet-use gender parity (World Bank F/M ratio) ─────────────


def build_gender():
    raw = {}
    for key, ind in GENDER_INDICATORS.items():
        print(f"downloading World Bank {ind} ...")
        payload = json.loads(fetch(WB_URL.format(ind=ind)))
        for row in payload[1]:
            iso = WB_ISO_FIX.get(row["countryiso3code"], row["countryiso3code"])
            if len(iso) != 3 and iso != "OWID_KOS":
                continue
            if row["value"] is None:
                continue
            raw.setdefault(iso, {}).setdefault(int(row["date"]), {})[key] = float(row["value"])
    by_iso = {}
    for iso, years in raw.items():
        points = [
            (y, v["fe"] / v["ma"])
            for y, v in sorted(years.items())
            if "fe" in v and "ma" in v and v["ma"] > 0
        ]
        if points:
            by_iso[iso] = points
    return series_map(by_iso, 2)


def main():
    iso2to3, name_to3 = wb_countries()
    extras = {
        "price": build_price(iso2to3),
        "mbps": build_speed(name_to3),
        "gender": build_gender(),
    }
    js = ("// Generated by scripts/build_extras.py — do not edit by hand.\n"
          "// price:  USD per 1GB mobile data (Cable.co.uk study, 2019-2023)\n"
          "// mbps:   median mobile download speed, Speedtest Global Index snapshot\n"
          "// gender: internet-use gender parity, women online / men online\n"
          "//         (World Bank IT.NET.USER.FE.ZS / IT.NET.USER.MA.ZS)\n"
          "window.EXTRAS=" + json.dumps(extras, separators=(",", ":")) + ";\n")
    target = REPO / "data" / "extras.js"
    target.write_text(js)
    counts = {k: len(v) for k, v in extras.items()}
    print(f"wrote {target} — {counts}")


if __name__ == "__main__":
    main()
