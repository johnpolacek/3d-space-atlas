import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PLANETS,AU_KM,julianDate,solveKepler,planetPosition,orbitPath,positionFromElements,colorFromBV} from '../src/astronomy.js';

test('Julian dates preserve noon, epoch, and one-day increments',()=>{
  assert.equal(julianDate(new Date('2000-01-01T12:00:00Z')),2451545);
  assert.equal(julianDate(new Date('1970-01-01T00:00:00Z')),2440587.5);
  assert.equal(julianDate(new Date('2000-01-02T12:00:00Z')),2451546);
});
test('Kepler solutions satisfy the equation over planetary eccentricities and anomalies',()=>{
  for(const e of [0,.00859,.0167,.0934,.20564,.8])for(let mean=-Math.PI;mean<=Math.PI;mean+=.017){
    const E=solveKepler(mean,e);assert.ok(Math.abs(E-e*Math.sin(E)-mean)<1e-10);
  }
});
test('orbital transform puts perihelion, aphelion and an inclined quarter orbit in the right places',()=>{
  assert.deepEqual(positionFromElements([2,.25,0,0,0,0],0),[1.5,0,-0]);
  const ap=positionFromElements([2,.25,0,0,0,0],Math.PI);assert.ok(Math.abs(ap[0]+2.5)<1e-12);
  const inclined=positionFromElements([1,0,90,0,0,0],Math.PI/2);assert.ok(Math.abs(inclined[1]-1)<1e-12);assert.ok(Math.abs(inclined[2])<1e-12);
});
test('Earth is near its independently known J2000 heliocentric position',()=>{
  // Independently retrieved JPL Horizons Earth–Moon barycenter, target 3, center 500@10,
  // JD 2451545.0 TDB, ecliptic J2000, geometric vectors in AU (retrieved 2026-09-06).
  // The approximation residual is allowed by a 0.0002 AU tolerance.
  const actual=planetPosition(PLANETS[2],2451545);
  const reference=[-.1771587841839055,-.000001139275508446145,-.9672193524609504];
  actual.forEach((v,i)=>assert.ok(Math.abs(v-reference[i])<.0002));
});
test('all planetary positions stay within plausible perihelion/aphelion bounds across 1800–2050',()=>{
  for(const planet of PLANETS)for(let year=1800;year<=2050;year+=5){
    const jd=julianDate(new Date(`${year}-06-01T12:00:00Z`)),position=planetPosition(planet,jd),r=Math.hypot(...position);
    assert.ok(position.every(Number.isFinite));
    assert.ok(r>planet.elements[0]*(1-planet.elements[1])*.98,planet.name+' inner bound');
    assert.ok(r<planet.elements[0]*(1+planet.elements[1])*1.02,planet.name+' outer bound');
    const orbit=orbitPath(planet,jd);assert.ok(Math.hypot(...orbit[0].map((v,i)=>v-orbit.at(-1)[i]))<1e-10);
  }
});
test('physical AU conversion gives the expected Earth/Sun angular scale',()=>{
  const angularDiameter=2*Math.atan(PLANETS[2].radius/AU_KM)*180/Math.PI*3600;
  assert.ok(angularDiameter>17.5&&angularDiameter<17.7);
});
test('binary catalog is finite, distance-bounded, and matches searchable coordinates',async()=>{
  const binary=await readFile(new URL('../data/stars.bin',import.meta.url));
  const meta=JSON.parse(await readFile(new URL('../data/catalog-meta.json',import.meta.url)));
  assert.equal(binary.byteLength,meta.count*5*4);
  for(let i=0;i<binary.byteLength;i+=20){
    const p=[0,4,8].map(offset=>binary.readFloatLE(i+offset));
    assert.ok(p.every(Number.isFinite));assert.ok(Math.hypot(...p)>0&&Math.hypot(...p)<3262);
    assert.ok(colorFromBV(binary.readFloatLE(i+16)).every(c=>Number.isFinite(c)&&c>=0&&c<=1));
  }
  const stars=JSON.parse(await readFile(new URL('../data/stars.json',import.meta.url)));
  assert.equal(stars.length,meta.searchable);
  for(const s of stars)assert.ok(Math.abs(Math.hypot(...s.pos)-s.distance)<.00002,s.name);
  const proxima=stars.find(s=>s.name==='Proxima Centauri');assert.ok(proxima.distance>4.2&&proxima.distance<4.3);
  // Proxima lies toward the Galactic center and just below the Galactic plane.
  assert.ok(proxima.pos[0]>0&&proxima.pos[1]<0);
});
