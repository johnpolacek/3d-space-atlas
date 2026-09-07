"""Rebuild adopted observations from the checked-in, pinned source subset.

No network or third-party Python packages are needed. Source values, missing
fields, and references are preserved; no unknown structural value is filled in.
"""
import csv
import json
import math
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = root / 'data/galaxy-sources'
keys = dict(zip(['m_031', 'm_033', 'lmc', 'smc', 'm_032', 'ngc_0205', 'ic_0010', 'ngc_6822', 'ic_1613', 'wlm'],
                ['m31', 'm33', 'lmc', 'smc', 'm32', 'ngc205', 'ic10', 'ngc6822', 'ic1613', 'wlm']))

def number(row, key):
    return float(row[key]) if row.get(key, '').strip() else None

def distance_kpc(modulus):
    return 10 ** ((modulus - 10) / 5)

observations = []
for row in csv.DictReader((source / 'lvdb-v1.1.1-subset.csv').open()):
    key = row['key']
    mu, em, ep = (number(row, field) for field in ['distance_modulus', 'distance_modulus_em', 'distance_modulus_ep'])
    d = distance_kpc(mu)
    item = dict(id=keys[key], key=key, ra=number(row, 'ra'), dec=number(row, 'dec'),
                kpc=d, minusKpc=d-distance_kpc(mu-em), plusKpc=distance_kpc(mu+ep)-d,
                distanceModulus=mu, modulusMinus=em, modulusPlus=ep, distanceRef=row['ref_distance'],
                halfLightArcmin=number(row, 'rhalf'), halfLightMinus=number(row, 'rhalf_em'), halfLightPlus=number(row, 'rhalf_ep'),
                ellipticity=number(row, 'ellipticity'), positionAngle=number(row, 'position_angle'),
                structureRef=row['ref_structure'] or None, extent=None,
                source=f'https://github.com/apace7/local_volume_database/blob/v1.1.1/data_input/{key}.yaml')
    # Use the direct geometrical distances, retaining both reported error terms.
    # The SMC update supersedes the older Cioni (2000) distance adopted by LVDB.
    if key in ['lmc', 'smc']:
        d, stat, systematic, ref = ((49.59, .09, .54, 'Pietrzynski2019Natur.567..200P') if key == 'lmc'
                                   else (62.44, .47, .81, 'Graczyk2020ApJ...904...13G'))
        item.update(kpc=d, minusKpc=math.hypot(stat, systematic), plusKpc=math.hypot(stat, systematic),
                    statisticalKpc=stat, systematicKpc=systematic, distanceRef=ref,
                    distanceModulus=None, modulusMinus=None, modulusPlus=None)
    if all(item[k] is not None for k in ['halfLightArcmin', 'ellipticity', 'positionAngle']):
        item['extent'] = dict(kind='half-light', semimajorArcmin=item['halfLightArcmin'],
                              axisRatio=1-item['ellipticity'], paDeg=item['positionAngle'], ref=item['structureRef'])
    if key in ['m_031', 'm_033']:
        lines = (source / f'rc3-{keys[key]}.tsv').read_text().splitlines()
        values = next(line for line in lines if line.startswith('NGC')).split('\t')
        log_d, log_r, pa = float(values[2]), float(values[4]), float(values[6])
        item['extent'] = dict(kind='B25-isophote', semimajorArcmin=10**log_d/20,
                              axisRatio=10**(-log_r), paDeg=pa, ref='deVaucouleurs1991rc3..book.....D',
                              logDiameterError=float(values[3]), logAxisRatioError=float(values[5]))
    observations.append(item)

output = dict(catalog='Local Volume Database v1.1.1', released='2026-08-12', retrieved='2026-09-06',
              source='https://github.com/apace7/local_volume_database/releases/tag/v1.1.1', galaxies=observations)
(root / 'data/galaxies.json').write_text(json.dumps(output, indent=2)+'\n')
print(f'Prepared {len(observations)} galaxies with provenance and distance uncertainty.')
