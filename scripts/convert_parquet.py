"""
convert_parquet.py
------------------
Converts bolivia_processed_data.parquet → data/bolivia_data.json
Run this whenever you have a new parquet file, then redeploy.

Usage:
    python scripts/convert_parquet.py [path/to/parquet]

Default parquet path: data/bolivia_processed_data.parquet
"""
import sys
import json
import os
from pathlib import Path

def main():
    try:
        import pandas as pd
    except ImportError:
        print("ERROR: pandas not installed. Run: pip install pandas pyarrow")
        sys.exit(1)

    project_root = Path(__file__).parent.parent
    parquet_path = Path(sys.argv[1]) if len(sys.argv) > 1 else project_root / "data" / "bolivia_processed_data.parquet"
    output_path = project_root / "data" / "bolivia_data.json"

    if not parquet_path.exists():
        print(f"ERROR: Parquet file not found at {parquet_path}")
        print("Place your parquet file in the /data/ directory.")
        sys.exit(1)

    print(f"Reading: {parquet_path}")
    df = pd.read_parquet(parquet_path)

    # Ensure required columns
    required = ['Date', 'supplier', 'buyer', 'kg']
    missing = [c for c in required if c not in df.columns]
    if missing:
        print(f"ERROR: Missing required columns: {missing}")
        sys.exit(1)

    # Normalise
    df['Date'] = pd.to_datetime(df['Date']).dt.strftime('%Y-%m-%d')
    df['kg'] = pd.to_numeric(df['kg'], errors='coerce').fillna(0)
    df['usd'] = pd.to_numeric(df.get('usd', 0), errors='coerce').fillna(0)
    df['tons'] = df['kg'] / 1000
    df['usd_per_kg'] = df.apply(lambda r: r['usd'] / r['kg'] if r['kg'] > 0 else 0, axis=1)

    d = pd.to_datetime(df['Date'])
    df['year'] = d.dt.year
    df['month_num'] = d.dt.month
    df['month_name'] = d.dt.strftime('%B')
    df['Quarter'] = d.dt.to_period('Q').astype(str)

    if 'aduana' not in df.columns:
        df['aduana'] = ''

    df = df.dropna(subset=['Date'])
    df = df[df['Date'].str.len() == 10]

    # Select only the columns Next.js needs
    keep = ['Date', 'supplier', 'buyer', 'kg', 'usd', 'tons', 'usd_per_kg',
            'mineral', 'year', 'month_num', 'month_name', 'Quarter', 'aduana']
    keep = [c for c in keep if c in df.columns]
    df = df[keep]

    print(f"Rows: {len(df):,}")
    print(f"Columns: {list(df.columns)}")
    print(f"Date range: {df['Date'].min()} → {df['Date'].max()}")
    print(f"Suppliers: {df['supplier'].nunique():,}")
    print(f"Buyers: {df['buyer'].nunique():,}")

    os.makedirs(output_path.parent, exist_ok=True)
    records = df.to_dict(orient='records')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False, separators=(',', ':'))

    size_mb = output_path.stat().st_size / 1024 / 1024
    print(f"\nDone! Output: {output_path} ({size_mb:.1f} MB)")
    print("Next steps:")
    print("  1. git add data/bolivia_data.json")
    print("  2. git commit -m 'Update market data'")
    print("  3. git push  (Vercel auto-deploys)")

if __name__ == '__main__':
    main()
