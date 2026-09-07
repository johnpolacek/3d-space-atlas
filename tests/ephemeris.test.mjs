import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { bodyPosition, bodyOrientation, moonOffset } from '../src/ephemeris.js';
import { equatorialToGalactic } from '../src/coordinates.js';
import { AU_KM } from '../src/astronomy.js';
import references from './fixtures/horizons-vectors.json' with { type: 'json' };

test('planetary and lunar vectors agree with independent JPL Horizons on three dates',()=>{
  for(const body of references.bodies)for(const sample of body.samples){
    const date=new Date((sample.jdUTC-2440587.5)*86400000);
    const expected=equatorialToGalactic(new Vector3(...sample.positionAU));
    const actual=body.name==='Moon'?moonOffset(date):bodyPosition(body.name,date);
    const angle=actual.angleTo(expected)*180/Math.PI*60;
    assert.ok(angle<1,`${body.name} ${date.toISOString()}: ${angle} arcminutes`);
    assert.ok(Math.abs(actual.length()/expected.length()-1)<.001,`${body.name} radial distance`);
  }
});

test('the lunar distance varies with the date instead of following a fixed circle',()=>{
  const distances=Array.from({length:32},(_,day)=>moonOffset(new Date(Date.UTC(2026,8,day+1,12))).length()*AU_KM);
  assert.ok(Math.max(...distances)-Math.min(...distances)>30000);
  assert.ok(Math.min(...distances)>350000&&Math.max(...distances)<410000);
});

test('IAU orientation has a known J2000 north pole and right-handed equatorial plane',()=>{
  const date=new Date('2000-01-01T12:00:00Z');
  // IAU J2000 Saturn pole: RA 40.589°, Dec 83.537° (2015 report).
  const ra=40.589*Math.PI/180,dec=83.537*Math.PI/180;
  const expected=equatorialToGalactic(new Vector3(Math.cos(dec)*Math.cos(ra),Math.cos(dec)*Math.sin(ra),Math.sin(dec))).normalize();
  const q=bodyOrientation('Saturn',date),north=new Vector3(0,1,0).applyQuaternion(q);
  assert.ok(north.angleTo(expected)<1e-6);
  for(const name of ['Earth','Venus','Moon','Saturn']){
    const orientation=bodyOrientation(name,date);
    const x=new Vector3(1,0,0).applyQuaternion(orientation),y=new Vector3(0,1,0).applyQuaternion(orientation),z=new Vector3(0,0,1).applyQuaternion(orientation);
    assert.ok(x.clone().cross(y).distanceTo(z)<1e-12);
  }
});
