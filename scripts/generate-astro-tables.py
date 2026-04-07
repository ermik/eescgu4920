#!/usr/bin/env python3
"""
Generate JSON table files for Laskar astronomical solutions.

Reads the binary/ASCII data files from the installed `inso` Python package
and outputs compact JSON files for the browser-based AnalySeries application.

Usage:
    python scripts/generate-astro-tables.py

Output:
    public/astro-tables/laskar2004.json
    public/astro-tables/laskar1993_01.json
    public/astro-tables/laskar1993_11.json
    public/astro-tables/laskar2010a.json
    public/astro-tables/laskar2010b.json
    public/astro-tables/laskar2010c.json
    public/astro-tables/laskar2010d.json

JSON format:
    {
      "tMin": <number>,     // start time in kyr
      "tMax": <number>,     // end time in kyr
      "tStep": <number>,    // time step in kyr (always 1)
      "ecc": [...],         // eccentricity array
      "obl": [...],         // obliquity in radians (optional)
      "sinPre": [...],      // sin(precession angle) (optional)
      "cosPre": [...]       // cos(precession angle) (optional)
    }

For full orbital solutions (Laskar2004, Laskar1993), all fields are present.
For eccentricity-only solutions (Laskar2010), only ecc is present.
"""

import json
import io
import os
import numpy as np
from numpy import loadtxt
from pathlib import Path

# Locate the inso package data files
try:
    import inso
    MODULE_DIR = Path(inso.__file__).parent
except ImportError:
    print("Error: 'inso' package not installed. Install with: pip install inso")
    exit(1)

ASTRO_DIR = MODULE_DIR / "astrofiles"
OUT_DIR = Path(__file__).parent.parent / "public" / "astro-tables"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def round_array(arr, decimals=10):
    """Round array values to reduce JSON size while preserving accuracy."""
    return [round(float(x), decimals) for x in arr]


def load_fortran_file(path):
    """Load a Fortran-format data file (D exponent notation)."""
    with open(path, "r") as f:
        return loadtxt(io.StringIO(f.read().replace('D', 'E')))


def generate_laskar2004():
    print("Generating laskar2004.json...")
    path_51 = ASTRO_DIR / "Laskar2004" / "INSOLN.LA2004.BTL.ASC"
    path_21 = ASTRO_DIR / "Laskar2004" / "INSOLP.LA2004.BTL.ASC"
    path_101 = ASTRO_DIR / "Laskar2004" / "INSOLN.LA2004.BTL.100.ASC"

    a51 = load_fortran_file(path_51)
    a21 = load_fortran_file(path_21)
    with open(path_101, "r") as f:
        a101 = loadtxt(f)

    # Combine: past 51 Ma + future 21 Ma + extended past 101 Ma
    a = np.concatenate([a51, a21[1:, :], a101[51001:, :]])

    # Sort by time
    idx = np.argsort(a[:, 0])
    a = a[idx]

    tMin = int(a[0, 0])
    tMax = int(a[-1, 0])
    tStep = 1

    data = {
        "tMin": tMin,
        "tMax": tMax,
        "tStep": tStep,
        "ecc": round_array(a[:, 1]),
        "obl": round_array(a[:, 2]),
        "sinPre": round_array(np.sin(a[:, 3])),
        "cosPre": round_array(np.cos(a[:, 3])),
    }

    out_path = OUT_DIR / "laskar2004.json"
    with open(out_path, "w") as f:
        json.dump(data, f, separators=(',', ':'))
    size_mb = os.path.getsize(out_path) / 1e6
    print(f"  -> {out_path} ({size_mb:.1f} MB, {len(a)} rows)")


def generate_laskar1993(variant):
    name = f"laskar1993_{variant}"
    print(f"Generating {name}.json...")

    path_past = ASTRO_DIR / "Laskar1993" / f"INSOLN.LA93_{variant}.BTL.ASC"
    path_future = ASTRO_DIR / "Laskar1993" / f"INSOLP.LA93_{variant}.BTL.ASC"

    a_past = load_fortran_file(path_past)
    a_future = load_fortran_file(path_future)

    a = np.concatenate([a_past, a_future[1:, :]])
    idx = np.argsort(a[:, 0])
    a = a[idx]

    tMin = int(a[0, 0])
    tMax = int(a[-1, 0])
    tStep = 1

    data = {
        "tMin": tMin,
        "tMax": tMax,
        "tStep": tStep,
        "ecc": round_array(a[:, 1]),
        "obl": round_array(a[:, 2]),
        "sinPre": round_array(np.sin(a[:, 3])),
        "cosPre": round_array(np.cos(a[:, 3])),
    }

    out_path = OUT_DIR / f"{name}.json"
    with open(out_path, "w") as f:
        json.dump(data, f, separators=(',', ':'))
    size_mb = os.path.getsize(out_path) / 1e6
    print(f"  -> {out_path} ({size_mb:.1f} MB, {len(a)} rows)")


def generate_laskar2010(variant):
    name = f"laskar2010{variant}"
    print(f"Generating {name}.json...")

    path = ASTRO_DIR / "Laskar2010" / f"La2010{variant}_ecc3L.dat"

    with open(path, "r") as f:
        a = loadtxt(f)

    idx = np.argsort(a[:, 0])
    a = a[idx]

    tMin = int(a[0, 0])
    tMax = int(a[-1, 0])
    # Laskar2010 files may not be at exact 1 kyr intervals.
    # Check spacing and resample if needed.
    dt = np.diff(a[:, 0])
    mean_dt = np.mean(dt)
    if abs(mean_dt - 1.0) < 0.01:
        tStep = 1
        ecc = a[:, 1]
    else:
        # Resample to 1 kyr
        tStep = 1
        t_new = np.arange(tMin, tMax + 1, tStep)
        ecc = np.interp(t_new, a[:, 0], a[:, 1])

    data = {
        "tMin": tMin,
        "tMax": tMax,
        "tStep": tStep,
        "ecc": round_array(ecc),
    }

    out_path = OUT_DIR / f"{name}.json"
    with open(out_path, "w") as f:
        json.dump(data, f, separators=(',', ':'))
    size_mb = os.path.getsize(out_path) / 1e6
    print(f"  -> {out_path} ({size_mb:.1f} MB, {len(ecc)} rows)")


if __name__ == "__main__":
    generate_laskar2004()
    generate_laskar1993("01")
    generate_laskar1993("11")
    generate_laskar2010("a")
    generate_laskar2010("b")
    generate_laskar2010("c")
    generate_laskar2010("d")
    print("Done!")
