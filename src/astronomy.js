// JPL Table 1, approximate elements and secular rates, valid 1800–2050.
// Coordinate output is ecliptic J2000, converted to right-handed Y-up: (x,z,-y).
export const AU_KM = 149597870.7;
export const PC_LY = 3.261563777;
export const J2000 = 2451545;
export const DEG = Math.PI / 180;
export const PLANETS = [
  {name:'Mercury',radius:2439.4,day:58.6462,year:.2408467,tilt:.034,color:'#b2a79a',texture:'mercury',type:'Terrestrial planet',description:'A cratered, almost airless world. Mercury follows the most eccentric orbit of the eight planets.',elements:[.38709927,.20563593,7.00497902,252.25032350,77.45779628,48.33076593],rates:[.00000037,.00001906,-.00594749,149472.67411175,.16047689,-.12534081]},
  {name:'Venus',radius:6051.8,day:-243.018,year:.61519726,tilt:177.36,color:'#e5c997',texture:'venus_atmosphere',type:'Terrestrial planet',description:'A rocky world hidden beneath thick clouds of sulfuric acid. Its dense atmosphere traps enough heat to make it hotter than Mercury.',elements:[.72333566,.00677672,3.39467605,181.97909950,131.60246718,76.67984255],rates:[.00000390,-.00004107,-.00078890,58517.81538729,.00268329,-.27769418]},
  {name:'Earth',radius:6371.0084,day:.99726968,year:1.0000174,tilt:23.43928,color:'#90c9ff',texture:'earth_daymap',type:'Terrestrial planet',description:'Our home, suspended in sunlight. Liquid oceans, a thin atmosphere, and the only life we have found in the universe.',elements:[1.00000261,.01671123,-.00001531,100.46457166,102.93768193,0],rates:[.00000562,-.00004392,-.01294668,35999.37244981,.32327364,0]},
  {name:'Mars',radius:3389.5,day:1.02595676,year:1.8808476,tilt:25.19,color:'#dc9578',texture:'mars',type:'Terrestrial planet',description:'Rust-colored deserts, polar ice, and traces of ancient rivers. Mars is a cold rocky world with a thin carbon dioxide atmosphere.',elements:[1.52371034,.09339410,1.84969142,-4.55343205,-23.94362959,49.55953891],rates:[.00001847,.00007882,-.00813131,19140.30268499,.44441088,-.29257343]},
  {name:'Jupiter',radius:69911,day:.41354,year:11.862615,tilt:3.13,color:'#e2c3a4',texture:'jupiter',type:'Gas giant',description:'The largest planet in our Solar System. Bands of turbulent cloud surround a world made mostly of hydrogen and helium.',elements:[5.202887,.04838624,1.30439695,34.39644051,14.72847983,100.47390909],rates:[-.00011607,-.00013253,-.00183714,3034.74612775,.21252668,.20469106]},
  {name:'Saturn',radius:58232,day:.44401,year:29.447498,tilt:26.73,color:'#e5d4aa',texture:'saturn',type:'Gas giant',description:'An immense hydrogen-and-helium world encircled by a remarkably thin system of rings, made mostly of water ice.',elements:[9.53667594,.05386179,2.48599187,49.95424423,92.59887831,113.66242448],rates:[-.00125060,-.00050991,.00193609,1222.49362201,-.41897216,-.28867794]},
  {name:'Uranus',radius:25362,day:-.71833,year:84.016846,tilt:97.77,color:'#aedadd',texture:'uranus',type:'Ice giant',description:'A pale blue-green ice giant tipped almost onto its side. Methane in its atmosphere absorbs red light.',elements:[19.18916464,.04725744,.77263783,313.23810451,170.95427630,74.01692503],rates:[-.00196176,-.00004397,-.00242939,428.48202785,.40805281,.04240589]},
  {name:'Neptune',radius:24622,day:.67125,year:164.79132,tilt:28.32,color:'#91b6e7',texture:'neptune',type:'Ice giant',description:'The outermost major planet, about 30 times farther from the Sun than Earth. Its cold atmosphere supports powerful winds.',elements:[30.06992276,.00859048,1.77004347,-55.12002969,44.96476227,131.78422574],rates:[.00026291,.00005105,.00035372,218.45945325,-.32241464,-.00508664]}
];
export function julianDate(date) { return date.getTime()/86400000+2440587.5; }
export function elementsAt(planet,jd) { const t=(jd-J2000)/36525; return planet.elements.map((n,i)=>n+planet.rates[i]*t); }
export function solveKepler(mean,e) {
  let E=mean;
  for(let i=0;i<15;i++) { const delta=(E-e*Math.sin(E)-mean)/(1-e*Math.cos(E)); E-=delta; if(Math.abs(delta)<1e-12) break; }
  return E;
}
export function positionFromElements(elements,eccentricAnomaly) {
  const [a,e,i0,,peri0,node0]=elements;
  const i=i0*DEG,omega=(peri0-node0)*DEG,node=node0*DEG;
  const x=a*(Math.cos(eccentricAnomaly)-e),y=a*Math.sqrt(1-e*e)*Math.sin(eccentricAnomaly);
  const cO=Math.cos(node),sO=Math.sin(node),cw=Math.cos(omega),sw=Math.sin(omega),ci=Math.cos(i),si=Math.sin(i);
  return [(cw*cO-sw*sO*ci)*x+(-sw*cO-cw*sO*ci)*y,sw*si*x+cw*si*y,-((cw*sO+sw*cO*ci)*x+(-sw*sO+cw*cO*ci)*y)];
}
export function planetPosition(planet,jd) {
  const el=elementsAt(planet,jd);
  const mean=(((el[3]-el[4]+180)%360+360)%360-180)*DEG;
  return positionFromElements(el,solveKepler(mean,el[1]));
}
export function orbitPath(planet,jd,segments=256) {
  const el=elementsAt(planet,jd);
  return Array.from({length:segments+1},(_,i)=>positionFromElements(el,Math.PI*2*i/segments));
}
export function seededRandom(seed=42) { return ()=>{ seed|=0; seed=seed+0x6D2B79F5|0; let t=Math.imul(seed^seed>>>15,1|seed); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
export function colorFromBV(bv) {
  const t=4600*(1/(.92*bv+1.7)+1/(.92*bv+.62))/100;
  const clamp=x=>Math.max(0,Math.min(255,x))/255;
  return [clamp(t<=66?255:329.698727446*Math.pow(t-60,-.1332047592)),clamp(t<=66?99.4708025861*Math.log(t)-161.1195681661:288.1221695283*Math.pow(t-60,-.0755148492)),clamp(t>=66?255:t<=19?0:138.5177312231*Math.log(t-10)-305.0447927307)];
}
