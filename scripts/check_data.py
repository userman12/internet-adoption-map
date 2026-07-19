#!/usr/bin/env python3
"""Sanity-check the generated data/*.js files before letting a refresh commit.

Guards against a silently broken upstream source (changed page layout, empty
API response, rate limit disguised as a 200) writing near-empty data over
good data. Run after the build_*.py scripts, before `git commit`.

Usage:
    python3 scripts/check_data.py

Exits 1 (with a message on what failed) if any floor is violated, 0 if the
data looks sane. These floors are set well below current real counts — they
catch "something broke," not "a source lost a few countries."
"""
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent

# name -> (file, JS global, floor)  — floor is a hard minimum count, not a target
CHECKS = [
    ("adoption countries", "data/adoption.js", "ADOPTION", 150,
        lambda d: len(d["countries"])),
    ("mobile subscriptions", "data/metrics.js", "METRICS", 150,
        lambda d: len(d["mobile"])),
    ("fixed broadband", "data/metrics.js", "METRICS", 140,
        lambda d: len(d["bband"])),
    ("1GB price", "data/extras.js", "EXTRAS", 150, lambda d: len(d["price"])),
    ("mobile speed", "data/extras.js", "EXTRAS", 50, lambda d: len(d["mbps"])),
    ("gender parity", "data/extras.js", "EXTRAS", 100, lambda d: len(d["gender"])),
    ("shutdowns", "data/extras.js", "EXTRAS", 30, lambda d: len(d["shut"])),
    ("Freedom on the Net", "data/extras.js", "EXTRAS", 40, lambda d: len(d["fotn"])),
    ("internet exchanges", "data/extras.js", "EXTRAS", 100, lambda d: len(d["ixp"])),
    ("data centers", "data/extras.js", "EXTRAS", 100, lambda d: len(d["dc"])),
    ("IPv6 adoption", "data/extras.js", "EXTRAS", 150, lambda d: len(d["ipv6"])),
    ("GDP per capita", "data/extras.js", "EXTRAS", 180, lambda d: len(d["gdp"])),
    ("population", "data/extras.js", "EXTRAS", 180, lambda d: len(d["pop"])),
    ("submarine cables", "data/cables.js", "CABLES", 400, lambda d: len(d)),
    ("countries with a region", "data/region.js", "REGION", 180, lambda d: len(d)),
]


def load(path, global_name):
    text = (REPO / path).read_text()
    m = re.search(rf"window\.{global_name}=(.*);\s*$", text, re.S)
    if not m:
        raise ValueError(f"couldn't find window.{global_name}= in {path}")
    return json.loads(m.group(1))


def main():
    failures = []
    cache = {}
    for label, path, global_name, floor, extract in CHECKS:
        key = (path, global_name)
        if key not in cache:
            try:
                cache[key] = load(path, global_name)
            except Exception as e:
                failures.append(f"{label}: couldn't load {path} ({e})")
                continue
        try:
            count = extract(cache[key])
        except Exception as e:
            failures.append(f"{label}: couldn't read count ({e})")
            continue
        status = "ok" if count >= floor else "FAIL"
        print(f"  {status:4} {label}: {count} (floor {floor})")
        if count < floor:
            failures.append(f"{label}: {count} is below the floor of {floor}")

    if failures:
        print(f"\n{len(failures)} check(s) failed — refusing to commit:")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)
    print("\nall checks passed")


if __name__ == "__main__":
    main()
