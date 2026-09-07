"""Create a compact, attributed HYG 4.1 subset. Download source into .cache first."""
import csv, json, math, struct
from pathlib import Path

root = Path(__file__).resolve().parents[1]
rows = list(csv.DictReader((root / '.cache/hygdata_v41.csv').open()))
points, searchable = [], []
pc_to_ly = 3.261563777
# ICRS/J2000 equatorial → Galactic, IAU frame (same matrix as Astropy).
rotation = [(-.0548755604,-.8734370902,-.4838350155),
            (.4941094279,-.4448296300,.7469822445),
            (-.8676661490,-.1980763734,.4559837762)]
for row in rows:
    d = float(row['dist'])
    # Exclude the Sun and the catalog's 100000-pc missing-parallax sentinel.
    # Limit to 1000 pc: farther inverse-parallax distances become especially fragile.
    if not 0 < d <= 1000: continue
    # Recompute from the canonical spherical fields: some legacy Cartesian fields
    # differ slightly from the catalog's updated distance/RA/Dec values.
    ra = float(row['ra']) * math.pi / 12
    dec = float(row['dec']) * math.pi / 180
    eq = [d*math.cos(dec)*math.cos(ra),d*math.cos(dec)*math.sin(ra),d*math.sin(dec)]
    gal = [sum(a*b for a,b in zip(r,eq))*pc_to_ly for r in rotation]
    # Three.js right-handed Y-up mapping: (Galactic X, Z, -Y).
    pos = [gal[0],gal[2],-gal[1]]
    mag = float(row['mag'])
    ci = float(row['ci']) if row['ci'] else .65
    points.extend([*pos,mag,ci])
    name = row['proper'] or row['gl'] or row['bf'].strip() or ('HIP '+row['hip'] if row['hip'] else 'HYG '+row['id'])
    if row['proper'] or d < 12 or mag < 3:
        searchable.append(dict(id=int(row['id']),name=name,hip=row['hip'],gl=row['gl'],
            pos=[round(v,6) for v in pos],distance=round(d*pc_to_ly,5),
            mag=mag,ci=ci,spectral=row['spect'] or 'Unknown',
            ra=float(row['ra']),dec=float(row['dec'])))
(root/'data/stars.bin').write_bytes(struct.pack('<'+'f'*len(points),*points))
(root/'data/stars.json').write_text(json.dumps(searchable,separators=(',',':')))
(root/'data/catalog-meta.json').write_text(json.dumps(dict(version='HYG 4.1',epoch='J2000.0',
    count=len(points)//5,searchable=len(searchable),maxParsecs=1000,
    fields=['galacticX_ly','galacticZ_ly','negativeGalacticY_ly','apparentMagnitude','bvColorIndex'],
    source='https://github.com/astronexus/HYG-Database',license='CC BY-SA 4.0'),indent=2)+'\n')
print(f'{len(points)//5:,} catalog stars; {len(searchable):,} searchable entries')
