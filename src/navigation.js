import { Vector3, Quaternion, Matrix4 } from 'three';
import { AU_KM, PC_LY } from './astronomy.js';
import { GALAXIES, galaxyPosition } from './galaxies.js';
import { equatorialToGalactic, skyBasis } from './coordinates.js';

export const LY_AU = 9460730472580.8 / AU_KM;
// Sgr A*: J2000 radio position (Petrov et al. 2011 / SIMBAD), with the
// GRAVITY Collaboration (2022) distance 8277 ± 9(stat) ± ~30(sys) pc.
export const GALACTIC_CENTER = skyBasis((17+45/60+40.03599/3600)*15,-(29+28.1699/3600)).radial.multiplyScalar(8277*PC_LY*LY_AU);
// A framing midpoint, not an inferred center of mass of the Local Group.
export const LOCAL_GROUP_CENTER = GALACTIC_CENTER.clone().lerp(galaxyPosition(GALAXIES[0]).multiplyScalar(LY_AU), .5);
export const MIN_DISTANCE_AU = 6371.0084 / AU_KM * 1.12;
export const MAX_DISTANCE_AU = 30e6 * LY_AU;
export const RENDER_DISTANCE = 100;
export const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
export const logBlend = (value, low, high) => smooth(Math.log(value / low) / Math.log(high / low));
export const clampDistance = distance => Math.max(MIN_DISTANCE_AU, Math.min(MAX_DISTANCE_AU, distance));

// Ecliptic J2000 Y-up -> equatorial J2000 -> Galactic Y-up. All transforms
// are rotations: physical positions and distance ratios remain unchanged.
export function eclipticToGalactic(v) {
  const e = 23.43928 * Math.PI / 180;
  const x = v.x, y = -v.z * Math.cos(e) - v.y * Math.sin(e), z = -v.z * Math.sin(e) + v.y * Math.cos(e);
  return equatorialToGalactic({x,y,z});
}
export const ECLIPTIC_ROTATION = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(
  eclipticToGalactic(new Vector3(1,0,0)), eclipticToGalactic(new Vector3(0,1,0)), eclipticToGalactic(new Vector3(0,0,1))
)).normalize();

export function homeTarget(distance, earthPosition) {
  const solar = logBlend(distance, .08, 3);
  const galactic = logBlend(distance, 5000 * LY_AU, 80000 * LY_AU);
  const group = logBlend(distance, 650000 * LY_AU, 3e6 * LY_AU);
  return earthPosition.clone().multiplyScalar(1 - solar).addScaledVector(GALACTIC_CENTER, galactic).lerp(LOCAL_GROUP_CENTER, group);
}
export function scaleAtDistance(distance) {
  if (distance < .025) return 'earth';
  if (distance < .35 * LY_AU) return 'solar';
  if (distance < 7000 * LY_AU) return 'stars';
  if (distance < 650000 * LY_AU) return 'galaxy';
  return 'group';
}
export function renderPosition(positionAU, originAU, distanceAU) {
  // Subtract in CPU double precision BEFORE uploading to float32 GPU matrices.
  return positionAU.clone().sub(originAU).multiplyScalar(RENDER_DISTANCE / distanceAU);
}
export function copyPose(pose) {
  return {target:pose.target.clone(), direction:pose.direction.clone().normalize(), distance:pose.distance};
}
export function planFlight(from, to, {home=false, duration} = {}) {
  from=copyPose(from);to=copyPose(to);
  const separation=from.target.distanceTo(to.target);
  const peak=Math.max(from.distance,to.distance,separation*3);
  const out=Math.log(peak/from.distance),incoming=Math.log(peak/to.distance);
  const travel=separation > Math.max(from.distance,to.distance)*1e-8 ? 1.8 : 0;
  const total=out+travel+incoming;
  const decades=home ? Math.abs(Math.log10(to.distance/from.distance)) : total/Math.LN10;
  return {from,to,home,peak,out,incoming,travel,total,duration:duration ?? Math.min(10500,2200+decades*620),
    rotation:new Quaternion().setFromUnitVectors(from.direction,to.direction)};
}
export function sampleFlight(flight, progress, earthPosition) {
  const t=Math.max(0,Math.min(1,progress));
  if(t===0)return copyPose(flight.from);
  if(t===1)return copyPose(flight.to);
  const {from,to}=flight;
  let distance,target;
  if(flight.home) {
    distance=Math.exp(Math.log(from.distance)+(Math.log(to.distance)-Math.log(from.distance))*smooth(t));
    target=homeTarget(distance,earthPosition);
  } else if(flight.total<1e-10) {
    distance=from.distance;target=from.target.clone().lerp(to.target,smooth(t));
  } else {
    // Expand before translating between distant objects, then approach. This
    // prevents a kilometer-scale camera from jumping sideways by light-years.
    const cursor=t*flight.total;
    if(cursor<flight.out) {
      distance=Math.exp(Math.log(from.distance)+flight.out*smooth(cursor/flight.out));target=from.target.clone();
    } else if(cursor<flight.out+flight.travel) {
      distance=flight.peak;target=from.target.clone().lerp(to.target,smooth((cursor-flight.out)/flight.travel));
    } else {
      const f=flight.incoming>0?(cursor-flight.out-flight.travel)/flight.incoming:1;
      distance=Math.exp(Math.log(flight.peak)-flight.incoming*smooth(f));target=to.target.clone();
    }
  }
  const rotation=new Quaternion().slerp(flight.rotation,smooth(t));
  return {target,distance,direction:from.direction.clone().applyQuaternion(rotation).normalize()};
}
