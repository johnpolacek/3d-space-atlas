# Adopted galaxy observations

Retrieved September 6, 2026. These files pin the inputs so builds and regeneration work offline.

## Local Volume Database

[Andrew B. Pace, Local Volume Database v1.1.1](https://github.com/apace7/local_volume_database/releases/tag/v1.1.1), released August 12, 2026, CC0. See the [database paper](https://arxiv.org/abs/2411.07424) and [field documentation](https://local-volume-database.readthedocs.io/en/latest/usage.html).

`lvdb-v1.1.1-subset.csv` retains selected rows and measurement/reference columns of the release's `comb_all.csv`. The ten YAML files are unmodified per-object records from `https://raw.githubusercontent.com/apace7/local_volume_database/v1.1.1/data_input/{key}.yaml`. They preserve comments and provenance absent from the combined table.

Coordinates are ICRS/J2000 RA and declination in degrees. `rhalf` is the projected half-light **semi-major axis**, in arcminutes. Ellipticity is `1 − b/a`; position angle is measured north through east. Missing values are not zero. Different tracer populations can have different centers, especially in the Magellanic Clouds.

The generator computes distance in kpc as `10^((μ − 10)/5)` and transforms both modulus error endpoints independently. It does not use the combined table's derived distance-error columns, which can contain zero despite nonzero modulus uncertainty. The resulting distance interval is generally asymmetric. Reported errors do not capture every possible cross-method systematic.

Two direct-distance overrides retain published statistical and systematic terms:

- LMC: **49.59 ± 0.09 (stat) ± 0.54 (sys) kpc**, [Pietrzyński et al. (2019)](https://arxiv.org/abs/1903.08096).
- SMC: **62.44 ± 0.47 (stat) ± 0.81 (sys) kpc**, [Graczyk et al. (2020)](https://arxiv.org/abs/2010.08754), replacing LVDB's older Cioni (2000) distance.

Errors are combined in quadrature for display, with both originals preserved. This is an adopted compilation, not a guarantee that every estimate is the latest or uniquely preferred measurement.

## RC3 contours

`rc3-m31.tsv` and `rc3-m33.tsv` are original VizieR query responses for [de Vaucouleurs et al. (1991), RC3, CDS VII/155](https://cdsarc.cds.unistra.fr/viz-bin/ReadMe/VII/155?format=html). Query template:

`https://cdsarc.cds.unistra.fr/viz-bin/asu-tsv?-source=VII/155/rc3&-c=M31&-c.rs=10&-out=name,PGC,D25,e_D25,R25,e_R25,PA`

Use M33 for the second object. `D25` is log10 of the major-axis diameter in units of 0.1 arcminutes; `R25` is log10 of the major/minor axis ratio. Semi-major axis in arcminutes is `10^D25 / 20`, and `b/a = 10^(−R25)`. Quoted log errors remain in the generated records. These B-band 25 mag/arcsec² contours differ from half-light ellipses and are not total galaxy boundaries.

## Rendering and regeneration

Run `python3 scripts/prepare-galaxies.py` to rebuild `data/galaxies.json`, then `npm run build`. No network or third-party Python packages are required.

Only complete measured semi-major axis, ellipticity, and position angle sets produce outlines. IC 10 and SMC lack complete sets, so neither receives an invented ellipse. Outlines are tangent-plane projections at the adopted distance, with physical semi-axes `d × tan(angular semi-axis)`. They do not reconstruct inclination, thickness, spiral arms, or far-side structure. Gold segments show the reported distance interval along the Sun-to-object direction. Other structural errors remain in source records; they are not rendered as confidence bands.
