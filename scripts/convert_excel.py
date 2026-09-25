"""
convert_excel.py
----------------
Converts the PowerBI Excel export ("Export" sheet) into data/bolivia_data.json,
the file the website reads.

Expected columns (matched loosely, so small renames are fine):
    Fecha - Year | Fecha - Month | Minerals | SUPPLYING COMPANY | BUYER COUNTRY |
    IMPORTING COMPANY | Kgs. Netos | U$S FOB | Aduana

Shipments are dated at month level: every row is set to the 1st of its month
(the day column in the export is not meaningful).

Usage:
    python scripts/convert_excel.py [path/to/export.xlsx]

With no argument it uses the newest .xlsx file in data/.
Normally you do not run this by hand: uploading an .xlsx into data/ on GitHub
triggers .github/workflows/convert-data.yml, which runs it and commits the JSON.
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "bolivia_data.json"

MONTHS = {
    # English
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
    # Spanish (in case the export language changes)
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10,
    "noviembre": 11, "diciembre": 12,
}
MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July",
               "August", "September", "October", "November", "December"]

# The export mixes two spellings for the same customs post
ADUANA_CANON = {
    "FRONTERA TAMBO QUEMADO": "F. T. Quemado",
    "FRONTERA AVAROA": "F. Avaroa",
    "FRONTERA PISIGA": "F. Pisiga",
    "FRONTERA DESAGUADERO": "F. Desaguadero",
    "FRONTERA ARROYO CONCEPCION": "F. Arroyo Concepcion",
    "FRONTERA VILLAZON": "F. Villazon",
    "AEROPUERTO VIRU VIRU": "A. Viru-Viru",
    "AEROPUERTO EL ALTO": "A. El Alto",
    "AEROPUERTO COCHABAMBA": "A. Cochabamba",
}


def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def canon_aduana(v) -> str:
    s = str(v or "").strip()
    key = strip_accents(s).upper()
    if key in ADUANA_CANON:
        return ADUANA_CANON[key]
    # Unknown long form "FRONTERA X" -> "F. X" (title case), "AEROPUERTO X" -> "A. X"
    m = re.match(r"^(FRONTERA|AEROPUERTO)\s+(.+)$", key)
    if m:
        return ("F. " if m.group(1) == "FRONTERA" else "A. ") + m.group(2).title()
    return s


def find_col(df: pd.DataFrame, *keywords: str, required: bool = True):
    """First column whose (accent-stripped, lower-case) name contains all keywords."""
    for c in df.columns:
        name = strip_accents(str(c)).lower()
        if all(k in name for k in keywords):
            return c
    if required:
        sys.exit(f"ERROR: could not find a column matching {keywords}. Columns are: {list(df.columns)}")
    return None


def main():
    if len(sys.argv) > 1:
        src = Path(sys.argv[1])
    else:
        files = sorted((ROOT / "data").glob("*.xlsx"), key=lambda p: p.stat().st_mtime, reverse=True)
        if not files:
            sys.exit("ERROR: no .xlsx file found in data/")
        src = files[0]

    print(f"Reading: {src}")
    xl = pd.ExcelFile(src)
    sheet = "Export" if "Export" in xl.sheet_names else xl.sheet_names[0]
    df = xl.parse(sheet)
    print(f"Sheet '{sheet}': {len(df):,} rows")

    c_year = find_col(df, "year")
    c_month = find_col(df, "month")
    c_mineral = find_col(df, "mineral")
    c_supplier = find_col(df, "supplying", "company")
    c_buyer = find_col(df, "importing")
    c_country = find_col(df, "buyer", "country", required=False)
    c_kg = find_col(df, "kg")
    c_usd = find_col(df, "fob")
    c_aduana = find_col(df, "aduana", required=False)

    month = df[c_month].map(
        lambda v: int(v) if str(v).strip().isdigit() else MONTHS.get(strip_accents(str(v)).strip().lower())
    )
    year = pd.to_numeric(df[c_year], errors="coerce")
    bad = month.isna() | year.isna()
    if bad.any():
        print(f"WARNING: dropping {int(bad.sum())} rows with an unreadable year/month")
    df, month, year = df[~bad], month[~bad].astype(int), year[~bad].astype(int)

    kg = pd.to_numeric(df[c_kg], errors="coerce").fillna(0)
    usd = pd.to_numeric(df[c_usd], errors="coerce").fillna(0)

    out = pd.DataFrame({
        "Date": [f"{y}-{m:02d}-01" for y, m in zip(year, month)],
        "supplier": df[c_supplier].astype(str).str.strip(),
        "buyer": df[c_buyer].astype(str).str.strip(),
        "kg": kg.round(3),
        "usd": usd.round(2),
        "tons": (kg / 1000).round(6),
        "usd_per_kg": [round(u / k, 6) if k > 0 else 0 for u, k in zip(usd, kg)],
        "mineral": df[c_mineral].astype(str).str.strip(),
        "year": year.values,
        "month_num": month.values,
        "month_name": [MONTH_NAMES[m - 1] for m in month],
        "Quarter": [f"{y}Q{(m - 1) // 3 + 1}" for y, m in zip(year, month)],
        "aduana": df[c_aduana].map(canon_aduana) if c_aduana is not None else "",
        "buyer_country": df[c_country].astype(str).str.strip() if c_country is not None else "",
    })
    out = out[(out.supplier != "") & (out.buyer != "") & (out.supplier != "nan") & (out.buyer != "nan")]

    print(f"Rows written: {len(out):,}")
    print(f"Months: {out.Date.min()[:7]} -> {out.Date.max()[:7]}")
    print(f"Suppliers: {out.supplier.nunique():,} | Buyers: {out.buyer.nunique():,} | Minerals: {out.mineral.nunique()}")
    print(f"Total USD: ${out.usd.sum():,.0f}")
    recent = out.groupby(out.Date.str[:7]).size().tail(6)
    print("Rows per month (latest 6): " + ", ".join(f"{k}: {v}" for k, v in recent.items()))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out.to_dict(orient="records"), f, ensure_ascii=False, separators=(",", ":"))
    print(f"Done: {OUT} ({OUT.stat().st_size / 1024 / 1024:.1f} MB)")


if __name__ == "__main__":
    main()
