# 3D Space Atlas

Explore Earth, the Solar System, nearby stars, and neighboring galaxies in an interactive 3D atlas. Travel continuously from Earth to the Local Group, search for destinations, and explore astronomical distances.

Open **index.html** in a modern browser. The application, thirteen texture maps, ephemeris, and catalogs are embedded in that file. No server, account, CDN, or internet connection is needed. WebGL 2 / hardware acceleration is required.

Explore Earth and the Moon, all eight planets, **109,400 HYG stars** (958 searchable), the Milky Way, and **10 selected neighboring galaxies**. Search for names and aliases such as M31 or M33. This is an educational coordinate atlas with documented observations and uncertainty, not a complete or exact reconstruction of the universe.

The atlas occupies **one Three.js scene with one camera**. Scroll, pinch, or use the zoom slider to move continuously across scales. Destination buttons or keys **1–5** animate the camera through the same world. Drag, scroll, or press **Escape** to stop a flight; choose another destination to redirect it. Drag to orbit, right-drag to pan, **/** to search, **R** to reset, and **Space** to play or pause planetary time. Arrow keys and **+ / −** also control the camera.

Coordinates use astronomical units, a floating origin, uniform render scaling, and logarithmic depth. Planetary **True sizes** are enabled by default. Optional enlarged disks, illustrative Milky Way structure, and a statistical asteroid belt are labeled as visualization aids. Density reconstructions are off by default. Galaxy centers, projected photometric contours, and distance uncertainty are visible by default. The Local Group overview also includes enlarged, illustrative galaxy portraits; turn off **Galaxy portraits** for a view of the measured overlays alone.

## Scientific scope

The **Model and sources** dialog explains these assumptions inside the application. Selecting a neighboring galaxy shows its adopted distance study and expandable measurement details.

- **Planet and Moon positions:** [Astronomy Engine 2.1.19](https://github.com/cosinekitty/astronomy), using its VSOP87-derived planetary and lunar ephemeris. Its design target is approximately one arcminute, with upstream comparisons against JPL Horizons and NOVAS. Earth uses its actual center. Coordinates are geometric J2000 vectors for the selected UTC time, without observer light-time, aberration, or atmospheric corrections. Initial time is September 6, 2026, noon UTC; the date control spans 1800–2050.
- **Orbit guides:** planetary ellipses use [JPL's approximate Keplerian elements](https://ssd.jpl.nasa.gov/planets/approx_pos.html), Table 1. Body positions use the ephemeris, so the guides are approximate. The Moon's guide samples its geocentric ephemeris over a sidereal month and refreshes daily.
- **Surfaces and rotation:** spherical mean radii follow [JPL's physical parameters](https://ssd.jpl.nasa.gov/planets/phys_par.html). Poles and prime-meridian rotation follow Astronomy Engine's IAU 2015 implementation. Texture maps are static composites; absolute texture longitude registration and colors are not independently calibrated. Rendering omits oblateness, terrain, and current weather. Other moons, dwarf planets, comets, spacecraft, and exoplanet orbits are omitted. The optional asteroid belt is generated, not a catalog of measured asteroids.
- **Stars:** [HYG 4.1](https://github.com/astronexus/HYG-Database) combines Hipparcos, Yale, and Gliese sources. The subset retains distances in **(0, 1,000] parsecs**, excluding missing-distance sentinels. It is incomplete and has varying measurement precision. Empty space beyond its survey cut is not an observed absence of stars. Positions stay at **J2000.0**, independently of the planetary clock; proper motion is not animated. Search includes named stars, stars closer than 12 parsecs, and stars brighter than apparent magnitude 3. Multiple-star components can remain unresolved.
- **Reference frame:** star positions are recomputed from HYG RA, declination, and distance fields, then transformed into Galactic coordinates. The atlas uses axis order `(Galactic X, Galactic Z, −Galactic Y)`. The embedded star buffer stores light-years; camera and planetary calculations use AU. J2000 equatorial ephemeris vectors and galaxy directions use the same transform. Point size, brightness, and color favor legibility and do not represent physical stellar radii or calibrated photometry.
- **Milky Way:** the default view shows HYG and a Galactic center marker. The center adopts the J2000 radio position of [Sagittarius A*](https://simbad.cds.unistra.fr/simbad/sim-id?Ident=Sagittarius+A) at **8,277 pc**, with statistical uncertainty 9 pc and systematics roughly 30 pc ([GRAVITY Collaboration 2022](https://www.aanda.org/articles/aa/full_html/2022/01/aa42465-21/aa42465-21.html)). The optional disk, bar, and spiral arms are a seeded statistical illustration; particle positions, arm paths, and the roughly 100,000-light-year disk boundary are not measurement results. We do not have a complete 3D census or an external photograph of our galaxy.
- **Neighboring galaxies:** the pinned [Local Volume Database v1.1.1, released August 12, 2026](https://github.com/apace7/local_volume_database/releases/tag/v1.1.1), supplies observed centers and adopted measurements with original-study references. Selected objects are Andromeda, Triangulum, the Magellanic Clouds, M32, NGC 205, IC 10, NGC 6822, IC 1613, and WLM. This is not a complete census; different methods can give different distance estimates. The Magellanic Clouds use direct eclipsing-binary distances from [Pietrzyński et al. 2019](https://arxiv.org/abs/1903.08096) and [Graczyk et al. 2020](https://arxiv.org/abs/2010.08754), with statistical and systematic errors combined in quadrature for display. Other distance intervals are transformed from reported distance-modulus bounds. Gold segments show those reported 1σ intervals along our line of sight, not galaxy lengths.
- **Galaxy outlines:** blue ellipses show sky-projected photometric contours in the observer's tangent plane. Most use the catalog's half-light semi-major axis, ellipticity, and position angle. Andromeda and Triangulum use [RC3 B-band 25 mag/arcsec² isophotes](https://cdsarc.cds.unistra.fr/viz-bin/ReadMe/VII/155?format=html), which are not directly comparable to half-light contours. These are fitted summaries of observations, not exact boundaries or 3D disks. Missing orientations stay unknown: SMC and IC 10 have center markers without ellipses. Stellar halos can extend farther. Marker size and color are map symbols. Galaxy motions, interactions, dark matter, and expansion are not simulated.
- **Galaxy portraits:** screen-facing, procedurally drawn map symbols make the major spirals and isolated dwarfs readable in the Local Group overview. Their apparent sizes, inclinations, colors, spiral arms, dust lanes, and generated stars are artistic choices, not observed structure or physical extents. Centers remain at catalog positions; portraits fade out as you approach the measured contours. Click a portrait or catalog center to explore it. On phones the overview prioritizes the three main galaxy labels; companions remain tappable and searchable. The dashed Milky Way–Andromeda ruler displays the 3D separation of the adopted centers (about 2.54 million light-years), not an orbit.
- **Epochs and framing:** stars remain at their catalog epoch and galaxies at their adopted observed estimates; the planetary clock does not reconstruct a simultaneous present-day universe from ancient light. The overview anchor is the framing midpoint of the Milky Way and Andromeda, not a measured barycenter. Guide rings are 1, 2, and 3 million light-years from the Milky Way center.

## Editing and rebuilding

```sh
npm install
npm run build
npm test
npm run dev
```

The preview is `http://127.0.0.1:4173`. The build creates portable `index.html`; only that file needs to be shared. Ordinary builds do not fetch data.

- `src/app.js`: camera controls, travel, interface, and render loop.
- `src/universe.js`: persistent bodies, observed contours, catalog points, and optional illustrations.
- `src/galaxy-portraits.js`: seeded atlas illustrations and responsive screen-space sizing.
- `src/navigation.js` / `src/coordinates.js`: reference frame, floating origin, zoom anchors, and flights.
- `src/ephemeris.js`: geometric positions and IAU orientations.
- `src/galaxies.js`: names, aliases, projected contours, and distance intervals.
- `src/astronomy.js`: approximate orbit guides and physical parameters.
- `src/template.html` / `src/style.css`: interface and source explanations.
- `data/galaxies.json`: adopted measurements. Rebuild offline with `python3 scripts/prepare-galaxies.py`; provenance is documented in `data/galaxy-sources/README.md`.
- `data/stars.bin`: little-endian float32 records: Galactic X, Z, −Y (light-years), apparent magnitude, B−V color index.
- `data/stars.json`: searchable catalog subset.
- `scripts/prepare-catalog.py`: star preprocessing; expects the [original HYG CSV](https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv) at `.cache/hygdata_v41.csv`.

## Deployment

Hosted on Vercel. The build generates the self-contained atlas and copies it into `dist/`, the public output directory. Pushes to `main` deploy to production through the connected GitHub repository.

To deploy manually from a linked checkout:

```sh
vercel --prod
```

## Attribution

Planet maps: **Solar System Scope / INOVE**, [texture collection](https://www.solarsystemscope.com/textures/), **CC BY 4.0**, based on NASA imagery. Composite maps have enhanced colors and some filled gaps; originals remain in `assets/`.

Star data: **David Nash / Astronexus, HYG 4.1**, **CC BY-SA 4.0**. The filtered/reprojected catalog and embedded copy carry the same license (`data/HYG-LICENSE.txt`). Galaxy compilation: **Andrew B. Pace, Local Volume Database**, **CC0**, with original studies and RC3 credited in the source records.

Three.js and Astronomy Engine: **MIT**. Full notices are embedded in the HTML and reproduced in `THIRD_PARTY_LICENSES.md`; that file also documents GSAP and data attribution.

## Verification

Numerical tests compare all eight planets and the Moon with independent **JPL Horizons ICRF vectors at three dates** (J2000, September 2026, and December 2049), requiring angular differences below one arcminute and radial differences below 0.1%. Additional checks cover varying lunar distance, an IAU pole reference, coordinate directions independently calculated with Astropy, projected ellipse axes and position angles, missing structural measurements, and asymmetric distance intervals. Source URLs accompany the fixtures.

Existing tests cover approximate orbit guides, Julian dates, physical scale conversion, every binary star record, floating-origin precision, continuous reversible zoom anchors, and interruptible travel. Browser verification covers navigation and search, observed defaults and optional overlays, uncertainty toggles, planetary close-ups, responsive layout, persistent scene objects, simulation time, and direct offline loading. These checks validate implementation within the stated model; they do not establish catalog completeness or eliminate observational uncertainty.
