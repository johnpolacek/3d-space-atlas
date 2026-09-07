import { PC_LY } from './astronomy.js';
import { skyBasis } from './coordinates.js';
import observations from '../data/galaxies.json' with { type: 'json' };

export const GALAXY_CATALOG = observations;
const descriptions = [
  {
    "id": "m31",
    "name": "Andromeda",
    "aliases": [
      "M31",
      "M 31",
      "NGC 224"
    ],
    "type": "Spiral galaxy",
    "description": "A vast spiral beyond our own. Andromeda and the Milky Way are the two dominant galaxies of the Local Group, each surrounded by smaller companions."
  },
  {
    "id": "m33",
    "name": "Triangulum",
    "aliases": [
      "M33",
      "M 33",
      "NGC 598"
    ],
    "type": "Spiral galaxy",
    "description": "The third large spiral of the Local Group. Triangulum is smaller than the Milky Way and Andromeda, with a loose disk of stars and star-forming regions."
  },
  {
    "id": "lmc",
    "name": "Large Magellanic Cloud",
    "aliases": [
      "LMC"
    ],
    "type": "Magellanic irregular",
    "description": "A close companion of the Milky Way. Its uneven stellar disk and central bar offer a different galactic shape from the great spirals."
  },
  {
    "id": "smc",
    "name": "Small Magellanic Cloud",
    "aliases": [
      "SMC"
    ],
    "type": "Dwarf irregular",
    "description": "A smaller, irregular companion near the Large Magellanic Cloud. Both clouds belong to the Milky Way’s surrounding family of galaxies."
  },
  {
    "id": "m32",
    "name": "M32",
    "aliases": [
      "M 32",
      "NGC 221"
    ],
    "type": "Compact elliptical",
    "description": "A compact elliptical companion of Andromeda. Its rounded concentration of stars contrasts with its neighbor’s extended spiral disk."
  },
  {
    "id": "ngc205",
    "name": "NGC 205",
    "aliases": [
      "M110",
      "M 110"
    ],
    "type": "Dwarf elliptical",
    "description": "Also called M110, this dwarf elliptical is one of Andromeda’s close companions. Zoom toward Andromeda to separate the surrounding galaxies."
  },
  {
    "id": "ic10",
    "name": "IC 10",
    "aliases": [
      "IC10"
    ],
    "type": "Dwarf irregular",
    "description": "An irregular dwarf in the Andromeda region of the Local Group. Its position adds depth to the family of galaxies beyond our own."
  },
  {
    "id": "ngc6822",
    "name": "NGC 6822",
    "aliases": [
      "NGC6822",
      "Barnard’s Galaxy",
      "Barnard galaxy"
    ],
    "type": "Dwarf irregular",
    "description": "Barnard’s Galaxy, an irregular dwarf farther from the large spirals. It helps reveal the space between the Local Group’s two main concentrations."
  },
  {
    "id": "ic1613",
    "name": "IC 1613",
    "aliases": [
      "IC1613"
    ],
    "type": "Dwarf irregular",
    "description": "A relatively isolated dwarf galaxy. Its sparse, irregular stellar body sits away from the crowded neighborhoods of the largest spirals."
  },
  {
    "id": "wlm",
    "name": "WLM",
    "aliases": [
      "Wolf-Lundmark-Melotte",
      "Wolf Lundmark Melotte"
    ],
    "type": "Dwarf irregular",
    "description": "Wolf–Lundmark–Melotte, a dwarf on the outskirts of this selection. A small island of stars in the wide spaces of the Local Group."
  }
];
export const GALAXIES = descriptions.map(info => ({...info,...observations.galaxies.find(g=>g.id===info.id)}));

export function galaxyPosition(galaxy) {
  return skyBasis(galaxy.ra,galaxy.dec).radial.multiplyScalar(galaxy.kpc*1000*PC_LY);
}

export function galaxyExtent(galaxy) {
  if(!galaxy.extent)return null;
  const {north,east,radial}=skyBasis(galaxy.ra,galaxy.dec),pa=galaxy.extent.paDeg*Math.PI/180;
  const major=north.clone().multiplyScalar(Math.cos(pa)).addScaledVector(east,Math.sin(pa));
  const minor=east.clone().multiplyScalar(Math.cos(pa)).addScaledVector(north,-Math.sin(pa));
  const majorLy=galaxy.kpc*1000*PC_LY*Math.tan(galaxy.extent.semimajorArcmin*Math.PI/10800);
  const minorLy=galaxy.kpc*1000*PC_LY*Math.tan(galaxy.extent.semimajorArcmin*galaxy.extent.axisRatio*Math.PI/10800);
  return {major,minor,radial,majorLy,minorLy};
}

// These are projected photometric contours in the observer's tangent plane.
// They make no claim about disk inclination, thickness, or a galaxy's far side.
export function galaxyOutline(galaxy) {
  const extent=galaxyExtent(galaxy);
  if(!extent)return [];
  return Array.from({length:129},(_,i)=>extent.major.clone().multiplyScalar(extent.majorLy*Math.cos(i*Math.PI/64)).addScaledVector(extent.minor,extent.minorLy*Math.sin(i*Math.PI/64)));
}

export function galaxyDistanceRange(galaxy) {
  const radial=skyBasis(galaxy.ra,galaxy.dec).radial;
  return [radial.clone().multiplyScalar(-galaxy.minusKpc*1000*PC_LY),radial.clone().multiplyScalar(galaxy.plusKpc*1000*PC_LY)];
}

export function galaxyViewRadius(galaxy) {
  // Camera framing only: never used to draw a physical galaxy boundary.
  return galaxyExtent(galaxy)?.majorLy ?? (galaxy.halfLightArcmin?galaxy.kpc*1000*PC_LY*Math.tan(galaxy.halfLightArcmin*Math.PI/10800):5000);
}

export function referenceLink(reference) {
  const bibcode=reference.match(/\d{4}.*/)?.[0];
  return bibcode?'https://ui.adsabs.harvard.edu/abs/'+encodeURIComponent(bibcode)+'/abstract':GALAXY_CATALOG.source;
}
