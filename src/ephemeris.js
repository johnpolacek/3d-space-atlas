import { GeoMoon, HelioVector, RotationAxis } from 'astronomy-engine';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { equatorialToGalactic } from './coordinates.js';

// Geometric positions at the simulation time, not light-time-corrected sky
// appearances. Astronomy Engine 2.1.19: VSOP87-derived planets + lunar theory.
export const bodyPosition = (name,date) => equatorialToGalactic(HelioVector(name,date));
export const moonOffset = date => equatorialToGalactic(GeoMoon(date));

// IAU 2015 north pole and prime meridian; mesh +Y is north, +X is longitude 0.
// Texture maps are static composites, not date-dependent weather observations.
export function bodyOrientation(name,date) {
  const axis=RotationAxis(name,date),ra=axis.ra*Math.PI/12,w=axis.spin*Math.PI/180;
  const north=equatorialToGalactic(axis.north).normalize();
  const node=equatorialToGalactic(new Vector3(-Math.sin(ra),Math.cos(ra),0)).normalize();
  const prime=node.clone().multiplyScalar(Math.cos(w)).addScaledVector(north.clone().cross(node),Math.sin(w)).normalize();
  return new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(prime,north,prime.clone().cross(north))).normalize();
}

export function moonOrbitPath(date) {
  return Array.from({length:97},(_,i)=>moonOffset(new Date(date.getTime()+i/96*27.321661*86400000)));
}
