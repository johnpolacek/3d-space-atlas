import test from 'node:test';
import assert from 'node:assert/strict';
import { PC_LY } from '../src/astronomy.js';
import { GALAXIES, galaxyPosition, galaxyExtent, galaxyOutline, galaxyDistanceRange } from '../src/galaxies.js';
import { skyBasis } from '../src/coordinates.js';
import directions from './fixtures/galactic-directions.json' with { type: 'json' };

test('galaxy coordinates preserve catalog distance and the Galactic X, Z, −Y frame',()=>{
  for(const galaxy of GALAXIES){
    const p=galaxyPosition(galaxy),distance=galaxy.kpc*1000*PC_LY;
    assert.ok(Math.abs(p.length()-distance)<1e-8);
    const expected=directions.galaxies.find(g=>g.id===galaxy.id);
    assert.ok(Math.abs(Math.asin(p.y/distance)*180/Math.PI-expected.latitude)<.00002);
    const longitude=(Math.atan2(-p.z,p.x)*180/Math.PI+360)%360;
    assert.ok(Math.abs(longitude-expected.longitude)<.00002);
  }
  const m31=galaxyPosition(GALAXIES.find(g=>g.id==='m31'));
  assert.ok(m31.x<0&&m31.y<0&&m31.z<0);
  assert.ok(m31.length()>2.5e6&&m31.length()<2.6e6);
  const lmc=galaxyPosition(GALAXIES.find(g=>g.id==='lmc'));
  assert.ok(lmc.x>0&&lmc.y<0&&lmc.z>0);
  assert.ok(lmc.length()>160000&&lmc.length()<170000);
});

test('Andromeda companion separations agree with LVDB release separations (central estimates only)',()=>{
  const m31=galaxyPosition(GALAXIES.find(g=>g.id==='m31'));
  for(const [id,kpc] of [['m32',6.48],['ngc205',59.97],['m33',225.8]]){
    const separation=m31.distanceTo(galaxyPosition(GALAXIES.find(g=>g.id===id)))/(1000*PC_LY);
    assert.ok(Math.abs(separation-kpc)<2,`${id}: ${separation} kpc`);
  }
});

test('galaxy search names and identifiers are unambiguous',()=>{
  const names=GALAXIES.flatMap(g=>[g.name,...g.aliases].map(n=>n.toLowerCase()));
  assert.equal(new Set(names).size,names.length);
  assert.equal(new Set(GALAXIES.map(g=>g.id)).size,GALAXIES.length);
});


test('projected ellipses recover observed angular sizes and position angles from the Sun',()=>{
  for(const galaxy of GALAXIES){
    const extent=galaxyExtent(galaxy),outline=galaxyOutline(galaxy);
    if(!galaxy.extent){assert.equal(extent,null);assert.deepEqual(outline,[]);continue;}
    const distance=galaxyPosition(galaxy).length();
    assert.ok(Math.abs(Math.atan(extent.majorLy/distance)*10800/Math.PI-galaxy.extent.semimajorArcmin)<1e-9);
    assert.ok(Math.abs(Math.atan(extent.minorLy/distance)*10800/Math.PI-galaxy.extent.semimajorArcmin*galaxy.extent.axisRatio)<1e-9);
    const {north,east}=skyBasis(galaxy.ra,galaxy.dec);
    const pa=(Math.atan2(extent.major.dot(east),extent.major.dot(north))*180/Math.PI+360)%180;
    assert.ok(Math.abs(pa-(galaxy.extent.paDeg%180))<1e-7);
    assert.ok(Math.abs(extent.major.dot(extent.radial))<1e-9);
    for(const point of outline)assert.ok(Math.abs(point.dot(extent.radial))<.00001);
  }
  assert.equal(galaxyExtent(GALAXIES.find(g=>g.id==='ic10')),null,'Missing position angle is not invented');
  assert.equal(galaxyExtent(GALAXIES.find(g=>g.id==='smc')),null,'Missing ellipticity is not assumed');
});

test('distance intervals are nonzero, asymmetric where appropriate, and follow our line of sight',()=>{
  for(const galaxy of GALAXIES){
    const [low,high]=galaxyDistanceRange(galaxy),radial=galaxyPosition(galaxy).normalize();
    assert.ok(galaxy.minusKpc>0&&galaxy.plusKpc>0);
    assert.ok(low.dot(radial)<0&&high.dot(radial)>0);
    assert.ok(low.clone().cross(radial).length()<1e-7);
    if(galaxy.distanceModulus!==null){
      assert.ok(Math.abs(galaxy.kpc-10**((galaxy.distanceModulus-10)/5))<1e-10);
      assert.ok(Math.abs(galaxy.kpc-galaxy.minusKpc-10**((galaxy.distanceModulus-galaxy.modulusMinus-10)/5))<1e-10);
      assert.ok(Math.abs(galaxy.kpc+galaxy.plusKpc-10**((galaxy.distanceModulus+galaxy.modulusPlus-10)/5))<1e-10);
      assert.ok(galaxy.plusKpc>galaxy.minusKpc,'Logarithmic modulus produces asymmetric distance uncertainty');
    }else assert.equal(galaxy.plusKpc,Math.hypot(galaxy.statisticalKpc,galaxy.systematicKpc));
  }
  assert.equal(GALAXIES.find(g=>g.id==='lmc').kpc,49.59);
  assert.equal(GALAXIES.find(g=>g.id==='smc').kpc,62.44);
});
