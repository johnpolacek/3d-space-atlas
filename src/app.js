import * as THREE from 'three';
import { gsap } from 'gsap';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AU_KM, PC_LY, PLANETS, julianDate, planetPosition } from './astronomy.js';
import { Universe } from './universe.js';
import { GALAXIES, GALAXY_CATALOG, galaxyPosition, galaxyViewRadius, referenceLink } from './galaxies.js';
import { skyBasis } from './coordinates.js';
import { portraitBounds, portraitScale } from './galaxy-portraits.js';
import { LY_AU, GALACTIC_CENTER, MIN_DISTANCE_AU, MAX_DISTANCE_AU, RENDER_DISTANCE, eclipticToGalactic, homeTarget, scaleAtDistance, clampDistance, planFlight, sampleFlight, smooth, logBlend } from './navigation.js';
import { ASSETS, CATALOG, STAR_BUFFER, META } from './embedded.js';

const $=id=>document.getElementById(id),vec=a=>new THREE.Vector3(...a);
const modes=['earth','solar','stars','galaxy','group'];
const motionPreference=matchMedia('(prefers-reduced-motion: reduce)');
let reducedMotion=motionPreference.matches;
motionPreference.addEventListener('change',()=>{reducedMotion=motionPreference.matches;if(reducedMotion){stopTravel();labelItems.forEach(item=>item.fade?.tween.progress(1));}});
const state={mode:'earth',planet:PLANETS[2],star:null,galaxy:null,date:new Date('2026-09-06T12:00:00Z'),playing:false,speed:1,labels:true,orbits:true,trueSizes:true,reconstruction:false,portraits:true,extents:true,uncertainty:true};
const pose={target:new THREE.Vector3(),direction:new THREE.Vector3(0,0,1),distance:1,home:true,follow:null};
const textures={},labelItems=[];let hudZones=[];
let renderer,camera,controls,universe,flight=null,zoomGoal=null,toastTimer,uiTime=0,viewFactor=1,frameCount=0,contextKey='';
const raycaster=new THREE.Raycaster(),offset=new THREE.Vector3(),projected=new THREE.Vector3();
function format(n,dp=0){return n.toLocaleString('en-US',{maximumFractionDigits:dp,minimumFractionDigits:dp});}
function dateText(){return state.date.toISOString().slice(0,10);}
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3600);}
function fatal(error){console.error(error);$('fatal').hidden=false;$('loading').classList.add('done');}
function decodeStars(){return new Float32Array(Uint8Array.from(atob(STAR_BUFFER),c=>c.charCodeAt(0)).buffer);}
async function loadTextures(){
  const loader=new THREE.TextureLoader();let completed=0;
  await Promise.all(Object.entries(ASSETS).map(async([key,url])=>{
    const texture=await loader.loadAsync(url);texture.colorSpace=key==='earth_clouds'?THREE.NoColorSpace:THREE.SRGBColorSpace;
    texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());textures[key]=texture;
    $('loading-detail').textContent=`Preparing planetary maps · ${++completed} / ${Object.keys(ASSETS).length}`;
  }));
}

function syncOverflow(){const body=document.querySelector('.object-body');if(body)body.classList.toggle('overflowing',body.scrollTop+body.clientHeight<body.scrollHeight-2);}
function setInfo({kicker,name,description,facts,evidence,source,measurement}) {
  $('object-evidence').textContent=evidence||(['earth','solar'].includes(state.mode)?'Computed ephemeris · static surface maps':state.mode==='stars'?'HYG catalog positions · J2000.0':state.reconstruction?'Illustrative Milky Way density enabled':'Catalog positions · incomplete coverage');
  $('object-source').hidden=!source;if(source){$('object-source').textContent=source.label;$('object-source').href=source.url;}
  $('measurement-details').hidden=!measurement;$('measurement-text').textContent=measurement||'';
  $('object-kicker').textContent=kicker;$('object-name').textContent=name;$('object-description').textContent=description;
  $('object-name').dataset.size=name.length>19?'long':name.length>11?'medium':'';
  $('object-facts').replaceChildren(...facts.map(([label,value,unit])=>{
    const div=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd'),span=document.createElement('span');dt.textContent=label;dd.textContent=value+' ';span.textContent=unit;dd.append(span);div.append(dt,dd);return div;
  }));
  syncOverflow();
}
function defaultInfo() {
  if(state.galaxy&&!flight)return galaxyInfo(state.galaxy);
  if(state.mode==='earth') {
    const p=state.planet;
    setInfo({kicker:`SOL ${['I','II','III','IV','V','VI','VII','VIII'][PLANETS.indexOf(p)]} / ${p.type.toUpperCase()}`,name:p.name,description:p.description,facts:[['Mean diameter',format(p.radius*2),'km'],['Mean Sun distance',format(p.elements[0],2),'AU']]});
  } else if(state.mode==='solar') setInfo({kicker:'OUR PLANETARY SYSTEM',name:'Solar System',description:'One star. Eight planets. Worlds in motion, connected by gravity. Follow their orbits from Mercury to the ice giants.',facts:[['Neptune’s orbit','30.07','AU'],['Light to Neptune','4.2','hours']]});
  else if(state.mode==='stars') {
    if(state.star)return starInfo(state.star);
    setInfo({kicker:'THE LOCAL STELLAR NEIGHBORHOOD',name:'Among the stars',description:'Our Sun is one of many. Explore the nearest stellar systems at their cataloged three-dimensional positions.',facts:[['Nearest star','4.23','ly'],['Catalog stars',format(META.count),'']]});
  } else if(state.mode==='galaxy')setInfo({kicker:'OUR GALAXY / BARRED SPIRAL',name:'Milky Way',description:'A disk of stars, dust, and gas, wrapped around a luminous central bar. Our Sun lies far from the crowded galactic center.',facts:[['Disk scale (model)','~100,000','ly'],['Sun to center','~27,000','ly']],evidence:state.reconstruction?'Illustrative density · not individual observed stars':'Measured stars only · HYG coverage is incomplete',source:{label:'Galactic center distance · GRAVITY 2022',url:'https://www.aanda.org/articles/aa/full_html/2022/01/aa42465-21/aa42465-21.html'}});
  else setInfo({kicker:'OUR NEIGHBORHOOD OF GALAXIES',name:'Local Group',description:'The Milky Way becomes one island among others. Find Andromeda, Triangulum, and smaller companions across millions of light-years.',facts:[['Selected galaxies',String(GALAXIES.length+1),''],['Andromeda from Sun','~'+format(GALAXIES[0].kpc*PC_LY/1000,2),'million ly']],evidence:state.portraits?'Catalog positions · illustrative portraits enlarged':'Catalog positions · this selection is not a census',source:{label:'Local Volume Database · August 2026 release',url:GALAXY_CATALOG.source}});
}
function galaxyInfo(galaxy){
  const distance=galaxy.kpc*1000*PC_LY,divisor=distance>=1e6?1e6:1000,unit=distance>=1e6?'million ly':'thousand ly';
  const low=(galaxy.kpc-galaxy.minusKpc)*1000*PC_LY/divisor,high=(galaxy.kpc+galaxy.plusKpc)*1000*PC_LY/divisor;
  const extent=galaxy.extent;
  const outline=extent?`${extent.kind==='half-light'?'Projected half-light ellipse':'B-band 25 mag/arcsec² contour'}: semi-major axis ${format(extent.semimajorArcmin,2)} arcmin, axis ratio ${format(extent.axisRatio,3)}, position angle ${format(extent.paDeg,2)}° north through east. This is a sky projection, not a measured 3D boundary.`:'No complete projected ellipse is provided for this object, so only its center and distance range are drawn.';
  const errors=galaxy.statisticalKpc!==undefined?`±${galaxy.statisticalKpc} kpc statistical and ±${galaxy.systematicKpc} kpc systematic, combined in quadrature for the displayed range.`:`−${format(galaxy.minusKpc,2)} / +${format(galaxy.plusKpc,2)} kpc, transformed from the reported distance-modulus interval.`;
  setInfo({kicker:`LOCAL GROUP / ${galaxy.type.toUpperCase()}`,name:galaxy.name,description:galaxy.description,
    facts:[['Distance estimate',format(distance/divisor,2),unit],['Reported 1σ range',`${format(low,2)}–${format(high,2)}`,unit]],
    evidence:'Observed sky position · distance has uncertainty',source:{label:galaxy.distanceRef.replace(/(\d{4}).*/,' et al. $1')+' · distance study',url:referenceLink(galaxy.distanceRef)},
    measurement:`ICRS/J2000: RA ${format(galaxy.ra,5)}°, Dec ${format(galaxy.dec,5)}°. Adopted distance ${format(galaxy.kpc,2)} kpc; ${errors} ${outline} Yellow segments show the reported distance interval along our line of sight, not a galaxy’s physical length. The catalog is LVDB v1.1.1; the SMC distance is updated from Graczyk et al. (2020). Different stellar populations can have different measured centers, especially in the Magellanic Clouds.`});
}

function starInfo(star) {
  let description=`A cataloged ${star.spectral==='Unknown'?'star':star.spectral+' star'} ${format(star.distance,2)} light-years from the Sun. Its position is shown in the Galactic reference frame at epoch J2000.0.`;
  if(star.name==='Proxima Centauri')description='The nearest known star to the Sun, a faint red dwarf in the Alpha Centauri system. Its catalog distance is about 4.23 light-years.';
  if(star.name==='Rigil Kentaurus')description='Alpha Centauri A, also called Rigil Kentaurus. It forms a close binary with Alpha Centauri B; the pair is unresolved at this map scale.';
  if(star.name==='Sirius')description='The brightest star in Earth’s night sky. Sirius is a nearby binary system; its faint white-dwarf companion is not resolved here.';
  setInfo({kicker:`HYG ${star.id} / ${star.spectral.toUpperCase()}`,name:star.name,description,facts:[['Distance from Sun',format(star.distance,2),'ly'],['Visual magnitude',format(star.mag,2),'mag']]});
}
function searchResults(query='') {
  const q=query.toLowerCase().trim();
  const planetResults=PLANETS.filter(p=>p.name.toLowerCase().includes(q));
  let stars;
  if(!q)stars=CATALOG.filter(s=>['Proxima Centauri','Sirius','Rigil Kentaurus','Vega'].includes(s.name));
  else stars=CATALOG.filter(s=>[s.name,s.hip&&'hip '+s.hip,s.gl,s.name==='Rigil Kentaurus'?'alpha centauri':'',s.name==='Toliman'?'alpha centauri b':'',s.name==='Ran'?'epsilon eridani':''].filter(Boolean).some(v=>v.toLowerCase().includes(q))).sort((a,b)=>a.distance-b.distance).slice(0,35);
  const galaxies=GALAXIES.filter(g=>[g.name,...g.aliases].some(name=>name.toLowerCase().includes(q)));
  const destinations=[{name:'Local Group',aliases:['galaxies'],mode:'group'},{name:'Milky Way',aliases:['our galaxy'],mode:'galaxy'}].filter(d=>[d.name,...d.aliases].some(name=>name.toLowerCase().includes(q)));
  const results=[...destinations.map(d=>({name:d.name,subtitle:'Atlas destination',detail:'Explore the view',action:()=>setMode(d.mode)})),...galaxies.map(g=>({name:g.name,subtitle:g.type,detail:format(g.kpc*PC_LY/1000,2)+' million light-years',action:()=>focusGalaxy(g)})),...planetResults.map(p=>({name:p.name,subtitle:p.type,detail:format(p.elements[0],2)+' AU from Sun',action:()=>focusPlanet(p)})),...stars.map(s=>({name:s.name,subtitle:s.spectral+' · HYG '+s.id,detail:format(s.distance,2)+' light-years',action:()=>focusStar(s)}))];
  $('search-results').replaceChildren(...results.map(r=>{const row=document.createElement('div'),button=document.createElement('button'),name=document.createElement('span'),sub=document.createElement('em'),detail=document.createElement('small');row.setAttribute('role','listitem');button.className='search-result';name.textContent=r.name;sub.textContent=r.subtitle;name.append(sub);detail.textContent=r.detail;button.append(name,detail);button.onclick=()=>{$('search-dialog').close();r.action();};row.append(button);return row;}));
  if(!results.length){const p=document.createElement('p');p.className='no-results';p.textContent='No match in this subset. Try a planet, star or galaxy name, or a catalog ID such as M31.';$('search-results').append(p);}
}
function openSearch(){searchResults();$('search-input').value='';$('search-dialog').showModal();$('search-input').focus();}

function planetView(planet) {
  const body=universe.bodies[PLANETS.indexOf(planet)],radius=planet.radius/AU_KM;
  const direction=vec(planetPosition(planet,julianDate(state.date))).normalize().negate().applyAxisAngle(new THREE.Vector3(0,1,0),.75);
  direction.multiplyScalar(planet.name==='Saturn'?6.1:3.55);direction.y=planet.name==='Saturn'?3.3:1.1;
  const view=eclipticToGalactic(direction).multiplyScalar(radius*viewFactor);
  return {target:body.positionAU.clone(),direction:view.clone().normalize(),distance:view.length(),home:planet.name==='Earth',follow:{planet}};
}
function bookmark(mode) {
  if(mode==='earth')return planetView(PLANETS[2]);
  // Choose an oblique solar viewpoint whose orbital plane fits horizontally
  // in the Galactic frame, without rotating or rearranging the actual planets.
  const normal=eclipticToGalactic(new THREE.Vector3(0,1,0)).normalize();
  const tangent=new THREE.Vector3(0,1,0).addScaledVector(normal,-normal.y).normalize();
  const view=mode==='solar'?normal.multiplyScalar(.6).addScaledVector(tangent,.8).multiplyScalar(85*viewFactor):
    mode==='stars'?new THREE.Vector3(21,15,29).multiplyScalar(LY_AU*viewFactor):mode==='galaxy'?new THREE.Vector3(18000,85000,105000).multiplyScalar(LY_AU*viewFactor):new THREE.Vector3(-.1,.86,.5).normalize().multiplyScalar(5.2e6*LY_AU*viewFactor);
  return {target:homeTarget(view.length(),universe.earth.positionAU),direction:view.clone().normalize(),distance:view.length(),home:true,follow:null};
}
function syncCamera() {
  controls.target.set(0,0,0);camera.position.copy(pose.direction).multiplyScalar(RENDER_DISTANCE);camera.lookAt(controls.target);camera.updateMatrixWorld();
}
function stopTravel(){flight?.tween?.kill();flight=null;zoomGoal=null;$('travel-status').hidden=true;contextKey='';}
function readControls() {
  offset.copy(camera.position).sub(controls.target);
  if(controls.target.lengthSq()>1e-16){pose.target.addScaledVector(controls.target,pose.distance/RENDER_DISTANCE);pose.home=false;pose.follow=null;}
  pose.distance=clampDistance(pose.distance*offset.length()/RENDER_DISTANCE);pose.direction.copy(offset).normalize();
  syncCamera();
}
function flyTo(destination,name,{instant=false,duration}={}) {
  stopTravel();state.playing=false;updatePlay();
  // Flush any remaining orbit damping before capturing the exact departure pose.
  controls.enableDamping=false;controls.update();readControls();controls.enableDamping=true;
  clearTimeout(toastTimer);$('toast').classList.remove('visible');
  if(instant||reducedMotion){Object.assign(pose,{distance:destination.distance,home:destination.home,follow:destination.follow});pose.target.copy(destination.target);pose.direction.copy(destination.direction);syncCamera();updateContext();return;}
  flight={...planFlight(pose,destination,{home:pose.home&&destination.home,duration}),progress:0,name,destination};
  flight.tween=gsap.to(flight,{progress:1,duration:flight.duration/1000,ease:'none'});
  pose.follow=null;pose.home=flight.home;
  $('travel-status').hidden=false;$('travel-name').textContent=`Traveling to ${name}`;
  contextKey='';
}
function setMode(mode,{instant=false,planet}={}) {
  if(!modes.includes(mode))return;
  state.star=null;state.galaxy=null;state.planet=planet||PLANETS[2];
  const destination=planet?planetView(planet):bookmark(mode);
  flyTo(destination,planet?.name||{earth:'Earth',solar:'the Solar System',stars:'nearby stars',galaxy:'the Milky Way',group:'the Local Group'}[mode],{instant});
  history.replaceState(null,'','#'+mode);
}
function focusPlanet(planet){setMode('earth',{planet});}
function focusStar(star){
  state.star=star;state.galaxy=null;
  const view=new THREE.Vector3(2,1.5,3.7).multiplyScalar(LY_AU*viewFactor);
  flyTo({target:vec(star.pos).multiplyScalar(LY_AU),direction:view.clone().normalize(),distance:view.length(),home:false,follow:{star}},star.name);
  ensureStarLabel(star,true);contextKey='';
}
function focusGalaxy(galaxy){
  state.galaxy=galaxy;state.star=null;
  const direction=skyBasis(galaxy.ra,galaxy.dec).radial.negate();
  flyTo({target:galaxyPosition(galaxy).multiplyScalar(LY_AU),direction,distance:galaxyViewRadius(galaxy)*4*LY_AU*viewFactor,home:false,follow:{galaxy}},galaxy.name);
  contextKey='';
}
function focusMoon(){
  const view=eclipticToGalactic(new THREE.Vector3(1,1,2)).multiplyScalar(1737.4/AU_KM*2*viewFactor);
  flyTo({target:universe.moonPositionAU.clone(),direction:view.clone().normalize(),distance:view.length(),home:false,follow:{moon:true}},'the Moon');
}
function zoom(factor){
  if(flight)stopTravel();
  zoomGoal=clampDistance((zoomGoal??pose.distance)*factor);
  if(reducedMotion){pose.distance=zoomGoal;zoomGoal=null;}
}
function updatePlay(){ $('play').textContent=state.playing?'Ⅱ':'▶';$('play').setAttribute('aria-label',state.playing?'Pause time':'Play time'); }
function setPlaying(){if($('play').disabled)return;state.playing=!state.playing;updatePlay();}

function updateContext() {
  state.mode=state.galaxy&&!flight&&pose.distance<650000*LY_AU?'galaxy':scaleAtDistance(pose.distance);
  const m=state.mode,extragalactic=m==='group'||!!state.galaxy&&!flight,key=[m,state.planet.name,state.star?.id,state.galaxy?.id,state.trueSizes,state.reconstruction,state.portraits,state.extents,state.uncertainty,!!flight,pose.follow?.moon].join('|');
  if(key===contextKey)return;contextKey=key;
  const activeMode=state.galaxy&&!flight?'group':m;
  document.querySelectorAll('[data-mode]').forEach(el=>{el.classList.toggle('active',el.dataset.mode===activeMode);el.setAttribute('aria-pressed',String(el.dataset.mode===activeMode));});
  // Narrow layouts scroll the destinations horizontally; keep the active one in view.
  const activeStep=document.querySelector('.scale-step.active'),steps=activeStep?.parentElement;if(steps&&steps.scrollWidth>steps.clientWidth)activeStep.scrollIntoView({block:'nearest',inline:'center',behavior:reducedMotion?'auto':'smooth'});
  $('frame-note').textContent='ONE UNIVERSE · CONTINUOUS 3D';
  $('model-note').textContent=extragalactic?'Observed positions · projected extents · distance uncertainty':m==='earth'?'Computed ephemeris · physical radii · static maps':m==='solar'?(state.trueSizes?'Computed ephemeris · true physical radii':'Computed positions · planet disks enlarged'):m==='stars'?`${format(META.count)} measured stars · J2000.0`:(state.reconstruction?'Illustrative Milky Way density + catalog stars':'Measured HYG stars · survey coverage is incomplete');
  $('outward-label').textContent=state.galaxy&&!flight?'Return to the Local Group':m==='earth'?'Travel to the Solar System':m==='solar'?'Travel to nearby stars':m==='stars'?'Travel to the Milky Way':m==='galaxy'?'Travel to other galaxies':'Travel back to Earth';
  $('sizes-option').hidden=m!=='solar';$('orbits-option').hidden=false;$('reconstruction-option').hidden=m==='earth'||m==='stars';$('reconstruction-option').querySelector('span').textContent=m==='solar'?'Illustrative asteroid belt':'Illustrative Milky Way';
  $('extents-option').hidden=$('uncertainty-option').hidden=!extragalactic;
  $('portraits-option').hidden=m!=='group'||!!state.galaxy;
  if(m==='group'&&!state.galaxy)$('reconstruction-option').hidden=true;
  if(m==='group'&&!state.galaxy&&state.portraits)$('model-note').textContent='Measured positions · enlarged illustrative portraits';
  $('orbits-option').querySelector('span').textContent=['stars','galaxy','group'].includes(m)?'Distance guides':'Orbits';
  $('play').disabled=!!flight||['stars','galaxy','group'].includes(m);$('speed').disabled=$('play').disabled;$('date').disabled=!!flight;
  if(['stars','galaxy','group'].includes(m)){state.playing=false;updatePlay();}
  if(pose.follow?.moon&&!flight)setInfo({kicker:'EARTH’S NATURAL SATELLITE',name:'Moon',description:'A cratered world orbiting Earth. Its position and varying distance follow a lunar ephemeris for the selected date. Its pole and rotation follow the IAU model; the surface map is a static composite.',facts:[['Mean diameter','3,475','km'],['Mean Earth distance','384,400','km']]});
  else defaultInfo();
}

function addLabel({name,position,action,priority=0,kind='planet',color,star,portraitId}) {
  const el=document.createElement(action?'button':'span');el.className=`object-label ${kind==='galaxy'?'galaxy-label':''} ${kind==='sun'?'sun-label':''} ${kind==='system'?'system-label':''} ${kind==='neighbor'?'neighbor-label':''}`;
  el.textContent=name;el.style.setProperty('--label-color',color||'#8daabc');
  if(kind==='neighbor'&&['Andromeda','Triangulum','Milky Way · our galaxy'].includes(name))el.classList.add('major-galaxy-label');
  if(kind==='earth')el.classList.add('earth-marker');
  if(kind==='guide')el.classList.add('guide-label');
  const fades=['earth','sun','system'].includes(kind);
  if(fades)el.style.opacity='0';
  if(action){el.setAttribute('aria-label',`Explore ${name}`);el.onclick=action;}
  const fade=fades?gsap.quickTo(el,'opacity',{duration:.18,ease:'power1.out'}):null;
  $('labels').append(el);labelItems.push({name,position,action,priority,kind,color,star,el,fade,portraitId});
}
function ensureStarLabel(star,selected=false){
  let label=labelItems.find(l=>l.star?.id===star.id);
  if(!label){addLabel({name:star.name,position:()=>vec(star.pos).multiplyScalar(LY_AU),action:()=>focusStar(star),priority:star.distance<5?25:star.name==='Sirius'?24:10,kind:'star',star});label=labelItems.at(-1);}
  if(selected){labelItems.forEach(l=>l.el.classList.toggle('selected',l===label));label.priority=50;}
}
function createLabels(){
  for(const body of universe.bodies)addLabel({name:body.planet.name,position:()=>body.positionAU,action:()=>focusPlanet(body.planet),kind:body===universe.earth?'earth':'planet',priority:body===universe.earth?60:20-PLANETS.indexOf(body.planet),color:body.planet.color});
  addLabel({name:'Moon',position:()=>universe.moonPositionAU,action:focusMoon,priority:19,kind:'moon',color:'#d3d7dc'});
  addLabel({name:'Sun',position:()=>new THREE.Vector3(),priority:40,kind:'sun',color:'#ffe1a4',action:()=>setMode('solar')});
  addLabel({name:'Solar System',position:()=>new THREE.Vector3(),priority:65,kind:'system',color:'#a3d9ed',action:()=>setMode('solar')});
  for(const star of CATALOG.filter(s=>s.distance<17||['Vega','Altair','Arcturus','Fomalhaut','Capella','Aldebaran','Betelgeuse','Polaris','Rigel','Deneb','Spica'].includes(s.name))){if(star.name!=='Toliman')ensureStarLabel(star);}
  addLabel({name:'Galactic center · Sagittarius A*',position:()=>GALACTIC_CENTER,priority:35,kind:'center',action:()=>flyTo({target:GALACTIC_CENTER.clone(),direction:new THREE.Vector3(.2,.6,.77).normalize(),distance:22000*LY_AU,home:false,follow:null},'the galactic center')});
  addLabel({name:'Milky Way · our galaxy',position:()=>GALACTIC_CENTER,priority:70,kind:'neighbor',portraitId:'milkyway',color:'#e5c6a3',action:()=>setMode('galaxy')});
  for(const [index,galaxy] of GALAXIES.entries())addLabel({name:galaxy.name,position:()=>galaxyPosition(galaxy).multiplyScalar(LY_AU),priority:69-index,kind:'neighbor',portraitId:galaxy.id,color:galaxy.color,action:()=>focusGalaxy(galaxy)});
  addLabel({name:'1 million light-years from the Milky Way',position:()=>GALACTIC_CENTER.clone().add(new THREE.Vector3(1e6*LY_AU,0,0)),priority:1,kind:'guide'});
}
function projectAU(positionAU,target=projected){
  // Same angular/depth projection as the distant-star shader, in CPU precision.
  target.copy(positionAU).sub(universe.cameraAU).multiplyScalar(universe.renderScale);
  if(target.length()>800000)target.setLength(800000);
  return target.add(camera.position).project(camera);
}
function updateGroupGuide(){
  const guide=$('group-guide'),dLy=pose.distance/LY_AU;
  const hidden=!state.orbits||!state.labels||!!state.galaxy||dLy<1e6||innerWidth<=760;
  guide.toggleAttribute('hidden',hidden);
  if(hidden)return;
  const a=projectAU(GALACTIC_CENTER,new THREE.Vector3()),b=projectAU(universe.galaxies[0].positionAU,new THREE.Vector3());
  if([a,b].some(p=>p.z<-1||p.z>1||Math.abs(p.x)>.95||Math.abs(p.y)>.9)){guide.setAttribute('hidden','');return;}
  const ax=(a.x+1)*innerWidth/2,ay=(1-a.y)*innerHeight/2,bx=(b.x+1)*innerWidth/2,by=(1-b.y)*innerHeight/2;
  const length=Math.hypot(bx-ax,by-ay),dx=(bx-ax)/length,dy=(by-ay)/length;
  if(length<280){guide.setAttribute('hidden','');return;}
  const x=(ax+bx)/2,y=(ay+by)/2,gap=90;
  let angle=Math.atan2(dy,dx)*180/Math.PI;if(angle>90)angle-=180;if(angle<-90)angle+=180;
  $('group-guide-line').setAttribute('d',`M${ax},${ay}L${x-dx*gap},${y-dy*gap}M${x+dx*gap},${y+dy*gap}L${bx},${by}`);
  $('group-guide-caption').setAttribute('transform',`translate(${x},${y}) rotate(${angle})`);
  const distance=GALACTIC_CENTER.distanceTo(universe.galaxies[0].positionAU)/LY_AU/1e6;
  $('group-guide-distance').textContent=`~${format(distance,2)} MILLION LIGHT-YEARS`;
  guide.style.opacity=String(logBlend(dLy,1e6,2e6));
}
function updateLabels(){
  const occupied=[],zones=hudZones.filter(el=>!el.classList.contains('dismissed')).map(el=>el.getBoundingClientRect()),w=innerWidth,h=innerHeight,dLy=pose.distance/LY_AU;
  const portraits=state.portraits&&dLy>(state.galaxy?3e6:1e6),portraitBoxes=[],leaders=[];
  const symbolScale=portraitScale(w,dLy);
  if(portraits)for(const item of labelItems){
    const bounds=portraitBounds(item.portraitId,symbolScale);if(!bounds)continue;
    const p=projectAU(item.position(),new THREE.Vector3());if(p.z<-1||p.z>1)continue;
    portraitBoxes.push({x:(p.x+1)*w/2-bounds.x,y:(1-p.y)*h/2-bounds.y,w:bounds.x*2,h:bounds.y*2});
  }
  updateGroupGuide();
  if(!$('group-guide').hasAttribute('hidden'))zones.push($('group-guide-caption').getBoundingClientRect());
  // Hand the globe over to its marker across 12–2 CSS pixels, while the
  // physical surface is still visible. The same blend reverses on approach.
  const earthDepth=-offset.copy(universe.earth.root.position).applyMatrix4(camera.matrixWorldInverse).z;
  const earthDiameter=universe.earth.displayRadiusAU*universe.renderScale*h*camera.projectionMatrix.elements[5]/earthDepth;
  const earthOpacity=earthDepth>0?1-smooth((earthDiameter-2)/10):0;
  for(const item of [...labelItems].sort((a,b)=>b.priority-a.priority)){
    let visible=state.labels;
    if(item.fade){
      // Fade local identities away before introducing the system-level name.
      // Distance-based blends work for flights, manual zoom, and the return trip.
      const localOpacity=1-logBlend(dLy,.025,.1);
      const alpha=item.kind==='earth'?earthOpacity*localOpacity:
        item.kind==='sun'?logBlend(pose.distance,.06,.15)*localOpacity:logBlend(dLy,.1,.3)*(1-logBlend(dLy,400000,650000));
      if(reducedMotion){item.fade.tween.pause();gsap.set(item.el,{opacity:alpha});}
      else if(item.fadeTarget!==alpha)item.fade(alpha);
      item.fadeTarget=alpha;
      visible&&=alpha>.001||Number(item.el.style.opacity)>.001;
      item.el.style.pointerEvents=alpha>.1?'auto':'none';
    }
    if(item.kind==='planet'){
      const body=universe.bodies.find(b=>b.planet.name===item.name);
      visible&&=pose.distance>.0007&&pose.distance<4000&&universe.cameraAU.distanceTo(body.positionAU)>body.planet.radius/AU_KM*15;
    }
    if(item.kind==='moon')visible&&=pose.distance>.0002&&pose.distance<.025;
    if(item.kind==='star')visible&&=dLy>.15&&dLy<4000;
    if(item.kind==='center')visible&&=dLy>4000&&dLy<650000&&!state.galaxy;
    if(item.kind==='neighbor')visible&&=item.name==='Milky Way · our galaxy'?dLy>=650000:dLy>80000||!!state.galaxy;
    // At phone overview scale, keep the three main destinations legible.
    // Companion centers remain tappable, with all names available on approach.
    if(item.kind==='neighbor'&&w<=760&&dLy>6e6&&!state.galaxy)visible&&=['milkyway','m31','m33'].includes(item.portraitId);
    if(item.kind==='guide')visible&&=state.orbits&&dLy>1e6;
    if(!visible){item.el.hidden=true;continue;}
    const position=item.position();projectAU(position);
    if(projected.z<-1||projected.z>1||Math.abs(projected.x)>1.1||Math.abs(projected.y)>1.1){item.el.hidden=true;continue;}
    // Keep Earth's callout above-left of its exact point, away from the Sun
    // and inner-planet labels. Its connector still ends at Earth's position.
    const earth=item.kind==='earth';
    let x=(projected.x+1)*w/2+(earth?-76:9),y=(1-projected.y)*h/2-(earth?36:11);
    if(item.w===undefined&&!earth){item.el.hidden=false;item.w=item.el.offsetWidth;}
    const width=earth?58:item.w,height=25;
    const anchorX=(projected.x+1)*w/2,anchorY=(1-projected.y)*h/2;
    // Labels avoid the measured interface panels rather than assumed pixel zones.
    const overlapsPortrait=(x,y,r)=>Math.hypot((Math.max(x,Math.min(x+width,r.x+r.w/2))-r.x-r.w/2)/(r.w/2),(Math.max(y,Math.min(y+height,r.y+r.h/2))-r.y-r.h/2)/(r.h/2))<(w<=760?.55:.9);
    const blocked=(x,y)=>x<12||y<8||x+width>w-12||y+height>h-8||zones.some(z=>x<z.right+8&&x+width>z.left-8&&y<z.bottom+8&&y+height>z.top-8)||portraitBoxes.some(r=>overlapsPortrait(x,y,r))||occupied.some(r=>!(item.kind==='sun'&&r.kind==='system')&&x<r.x+r.w&&x+width>r.x&&y<r.y+r.h&&y+height>r.y);
    // Nearby companions often project together. Give their labels a few stable
    // alternatives while keeping their actual galaxy positions untouched.
    const candidates=item.kind==='neighbor'?[[x,y],[x,y+26],[x,y-26],[x-width-18,y],[x-width-18,y+26],[x-width-18,y-26],[x-width/2-9,y-30],[x-width/2-9,y+30],[x,y+52],[x,y-52],[x-width-18,y+52],[x-width-18,y-52],[x-width/2-9,y+56],[x-width/2-9,y-56]]:[[x,y]];
    if(portraits&&item.kind==='neighbor'){
      const bounds=portraitBounds(item.portraitId,symbolScale);
      if(bounds)candidates.unshift([anchorX+bounds.x+10,y],[anchorX+bounds.x+10,y-26],[anchorX+bounds.x+10,y+26],[anchorX-width/2,anchorY+bounds.y+8],[anchorX-width/2,anchorY-bounds.y-height-8],[anchorX-bounds.x-width-10,y]);
      for(const radius of [78,104,132,160,190])for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1],[-.7,-.7],[.7,.7],[-.7,.7],[.7,-.7]])candidates.push([anchorX+dx*radius-(dx<0?width:dx===0?width/2:0),anchorY+dy*radius-height/2]);
    }
    const placement=candidates.find(([x,y])=>!blocked(x,y));
    if(!placement){item.el.hidden=true;continue;}
    [x,y]=placement;
    if(portraits&&item.kind==='neighbor'){
      const endX=Math.max(x,Math.min(x+width,anchorX)),endY=Math.max(y,Math.min(y+height,anchorY)),length=Math.hypot(endX-anchorX,endY-anchorY);
      if(length>28){const inset=Math.min(18,length/3);leaders.push(`M${anchorX+(endX-anchorX)*inset/length},${anchorY+(endY-anchorY)*inset/length}L${endX},${endY}`);}
    }
    occupied.push({x,y,w:width,h:height,kind:item.kind});item.el.hidden=false;item.el.style.transform=`translate(${x.toFixed(2)}px,${y.toFixed(2)}px)`;
  }
  $('group-callout-lines').setAttribute('d',leaders.join(''));
}
function formatDistance(distance){
  if(distance<.01)return `${format(distance*AU_KM)} km`;
  if(distance<.1*LY_AU)return `${format(distance,distance<1?3:distance<100?1:0)} AU`;
  if(distance>=1e6*LY_AU)return `${format(distance/LY_AU/1e6,2)} ${innerWidth<=760?'Mly':'million light-years'}`;
  return `${format(distance/LY_AU,distance/LY_AU<100?1:0)} ${innerWidth<=760?'ly':'light-years'}`;
}
function syncZoomFill(){const z=$('zoom-scale'),min=Number(z.min),max=Number(z.max);z.style.setProperty('--fill',`${((Number(z.value)-min)/(max-min)*100).toFixed(2)}%`);}
function updateReadout(){
  let distance=pose.distance,label='DISTANCE TO VIEW CENTER';
  if(state.mode==='earth'&&(pose.home||pose.follow?.planet)){
    const body=universe.bodies[PLANETS.indexOf(state.planet)];distance=Math.max(0,universe.cameraAU.distanceTo(body.positionAU)-body.planet.radius/AU_KM);label=`ALTITUDE ABOVE ${body.planet.name.toUpperCase()}`;
  }
  $('distance-value').textContent=formatDistance(distance);$('distance-label').textContent=label;
  const sliderDistance=zoomGoal??pose.distance;
  $('zoom-scale').value=String(Math.log10(sliderDistance));$('zoom-scale').setAttribute('aria-valuetext',formatDistance(sliderDistance));syncZoomFill();
  if(flight){const t=flight.progress;$('travel-progress').value=t;$('travel-percent').textContent=`${Math.round(t*100)}%`;}
}
function resize(){
  const {width:w,height:h}=$('viewport').getBoundingClientRect();
  if(!w||!h)return;
  // CSS owns the canvas layout. Its drawing buffer must never force the mobile
  // viewport wider during a resize or a change in device orientation.
  renderer.setSize(w,h,false);camera.aspect=w/h;
  labelItems.forEach(item=>{item.w=undefined;});syncOverflow();
  const factor=w<=760?Math.max(1,h/w*1.25):1;
  if(universe&&factor!==viewFactor){stopTravel();pose.distance=clampDistance(pose.distance*factor/viewFactor);}
  viewFactor=factor;camera.clearViewOffset();
  // The projection stays fixed while traveling; changing scale never shifts the viewport.
  if(w>760)camera.setViewOffset(w,h,-w*.105,0,w,h);else camera.setViewOffset(w,h,0,h*.15,w,h);
  camera.updateProjectionMatrix();
}
function trackTarget(){
  if(pose.home)pose.target.copy(homeTarget(pose.distance,universe.earth.positionAU));
  else if(pose.follow?.planet)pose.target.copy(universe.bodies[PLANETS.indexOf(pose.follow.planet)].positionAU);
  else if(pose.follow?.moon)pose.target.copy(universe.moonPositionAU);
}
function frame(time,deltaTime){
  frameCount++;
  const dt=Math.min(deltaTime/1000,.05);if(document.hidden)return;
  if(state.playing){
    const ms=state.date.getTime()+dt*state.speed*86400000;
    if(ms>Date.parse('2050-12-31T23:59:59Z')){state.date=new Date('2050-12-31T12:00:00Z');state.playing=false;updatePlay();$('date').value=dateText();toast('Reached the end of the supported date range.');}
    else state.date=new Date(ms);
  }
  universe.updateEphemeris(state.date);
  if(flight){
    const t=flight.progress,sample=sampleFlight(flight,t,universe.earth.positionAU);
    pose.target.copy(sample.target);pose.direction.copy(sample.direction);pose.distance=sample.distance;
    if(t===1){pose.home=flight.destination.home;pose.follow=flight.destination.follow;flight=null;$('travel-status').hidden=true;contextKey='';}
    syncCamera();
  } else {
    controls.update();readControls();
    if(zoomGoal!==null){const blend=1-Math.exp(-dt*9);pose.distance=Math.exp(THREE.MathUtils.lerp(Math.log(pose.distance),Math.log(zoomGoal),blend));if(Math.abs(Math.log(pose.distance/zoomGoal))<1e-5){pose.distance=zoomGoal;zoomGoal=null;}}
    trackTarget();syncCamera();
  }
  universe.update(pose,state,camera);renderer.render(universe.scene,camera);
  updateLabels();
  uiTime+=dt;
  if(uiTime>.06){uiTime=0;updateContext();updateReadout();if(state.playing&&document.activeElement!==$('date'))$('date').value=dateText();}
}

function wireControls(){
  hudZones=['.topbar','.scale-nav','#object-info','.view-tools','.bottom-panel','#hint'].map(s=>document.querySelector(s));
  const body=document.querySelector('.object-body');body.addEventListener('scroll',syncOverflow,{passive:true});body.addEventListener('toggle',e=>{syncOverflow();if(e.target.open)e.target.scrollIntoView({block:'nearest',behavior:reducedMotion?'auto':'smooth'});},true);
  // Narrow layouts scroll the destinations sideways; fade the edges that hide more.
  const steps=document.querySelector('.scale-steps'),syncEdges=()=>{const left=steps.scrollLeft>2,right=steps.scrollLeft+steps.clientWidth<steps.scrollWidth-2;steps.dataset.edge=left&&right?'both':left?'left':right?'right':'';};
  steps.addEventListener('scroll',syncEdges,{passive:true});new ResizeObserver(syncEdges).observe(steps);
  const dismissHint=()=>$('hint').classList.add('dismissed');
  for(const type of ['pointerdown','wheel','keydown'])addEventListener(type,dismissHint,{capture:true,once:true,passive:true});
  document.querySelectorAll('[data-mode]').forEach(el=>el.onclick=()=>setMode(el.dataset.mode));
  document.querySelector('.brand').onclick=e=>{e.preventDefault();setMode('earth');};
  $('outward').onclick=()=>setMode(state.galaxy&&!flight?'group':modes[(modes.indexOf(state.mode)+1)%modes.length]);
  $('zoom-in').onclick=()=>zoom(1/3);$('zoom-out').onclick=()=>zoom(3);
  $('zoom-scale').min=String(Math.log10(MIN_DISTANCE_AU));$('zoom-scale').max=String(Math.log10(MAX_DISTANCE_AU));
  $('zoom-scale').oninput=()=>{stopTravel();syncZoomFill();zoomGoal=clampDistance(10**Number($('zoom-scale').value));if(reducedMotion){pose.distance=zoomGoal;zoomGoal=null;}};
  $('travel-stop').onclick=()=>stopTravel();
  $('reset-view').onclick=()=>state.galaxy?focusGalaxy(state.galaxy):setMode(state.mode);
  $('top-view').onclick=()=>{
    const up=new THREE.Vector3(0,1,.001).normalize();
    const direction=state.mode==='earth'||state.mode==='solar'?eclipticToGalactic(up).normalize():up;
    flyTo({target:pose.target.clone(),direction,distance:pose.distance,home:pose.home,follow:pose.follow},'a view from above',{duration:1300});
  };
  $('labels-toggle').onclick=()=>{state.labels=!state.labels;$('labels-toggle').setAttribute('aria-pressed',String(state.labels));};
  $('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('Fullscreen is unavailable in this window.');}};
  $('play').onclick=setPlaying;
  $('date').onchange=()=>{
    const input=$('date');if(!input.value||!input.checkValidity()){input.value=dateText();toast('Choose a date from 1800 through 2050.');return;}
    state.date=new Date(input.value+'T12:00:00Z');universe.updateEphemeris(state.date);trackTarget();
  };
  $('date').oninput=()=>{if($('date').value&&$('date').checkValidity())$('date').onchange();};
  $('speed').onchange=()=>state.speed=Number($('speed').value);
  $('orbits').onchange=()=>state.orbits=$('orbits').checked;
  $('true-sizes').onchange=()=>{state.trueSizes=$('true-sizes').checked;updateContext();};
  $('reconstruction').onchange=()=>{state.reconstruction=$('reconstruction').checked;updateContext();};
  $('portraits').onchange=()=>{state.portraits=$('portraits').checked;updateContext();};
  $('extents').onchange=()=>{state.extents=$('extents').checked;updateContext();};
  $('uncertainty').onchange=()=>{state.uncertainty=$('uncertainty').checked;updateContext();};
  $('search-open').onclick=openSearch;$('search-input').oninput=()=>searchResults($('search-input').value);
  $('search-input').onkeydown=e=>{if(e.key==='ArrowDown'){e.preventDefault();$('search-results').querySelector('button')?.focus();}if(e.key==='Enter')$('search-results').querySelector('button')?.click();};
  $('about-open').onclick=()=>$('about-dialog').showModal();$('help-open').onclick=()=>$('help-dialog').showModal();
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}}));
  document.addEventListener('keydown',e=>{
    if(document.querySelector('dialog[open]')||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName))return;
    if(e.key==='/'){e.preventDefault();openSearch();}
    if(['1','2','3','4','5'].includes(e.key))setMode(modes[Number(e.key)-1]);
    if(e.key==='Escape')stopTravel();
    if(e.code==='Space'&&!['BUTTON','A'].includes(document.activeElement?.tagName)){e.preventDefault();if(flight)stopTravel();else setPlaying();}
    if(e.key.toLowerCase()==='r')$('reset-view').click();
    if(e.key==='+'||e.key==='=')zoom(1/2);if(e.key==='-')zoom(2);
    if(e.key.startsWith('Arrow')){e.preventDefault();stopTravel();const sph=new THREE.Spherical().setFromVector3(pose.direction);
      if(e.key==='ArrowLeft')sph.theta-=.1;if(e.key==='ArrowRight')sph.theta+=.1;if(e.key==='ArrowUp')sph.phi-=.1;if(e.key==='ArrowDown')sph.phi+=.1;
      sph.makeSafe();pose.direction.setFromSpherical(sph).normalize();syncCamera();
    }
  });
  controls.addEventListener('start',()=>stopTravel());
  let pointerDown;
  renderer.domElement.addEventListener('pointerdown',e=>{pointerDown={x:e.clientX,y:e.clientY};});
  renderer.domElement.addEventListener('pointerup',e=>{
    if(!pointerDown||Math.hypot(e.clientX-pointerDown.x,e.clientY-pointerDown.y)>5)return;
    const r=renderer.domElement.getBoundingClientRect(),mouse=new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-((e.clientY-r.top)/r.height)*2+1);
    raycaster.setFromCamera(mouse,camera);const hit=raycaster.intersectObjects(universe.bodies.filter(b=>b.root.visible).map(b=>b.surface),false)[0];
    if(hit){let object=hit.object;while(object&&!object.userData.planet)object=object.parent;if(object){focusPlanet(object.userData.planet);return;}}
    if(pose.distance/LY_AU>650000){
      const symbolScale=portraitScale(innerWidth,pose.distance/LY_AU);
      const targets=[{id:'milkyway',positionAU:GALACTIC_CENTER},...universe.galaxies.map(g=>({id:g.galaxy.id,positionAU:g.positionAU,galaxy:g.galaxy}))];
      const candidates=targets.map(g=>{
        const p=projectAU(g.positionAU,new THREE.Vector3());
        if(p.z<-1||p.z>1)return {...g,score:Infinity};
        const bounds=universe.portraits.find(p=>p.id===g.id)?.sprite.visible?portraitBounds(g.id,symbolScale):null;
        const dx=e.clientX-(p.x+1)*innerWidth/2,dy=e.clientY-(1-p.y)*innerHeight/2;
        return {...g,score:Math.hypot(dx/Math.max(14,bounds?.x*.8||0),dy/Math.max(14,bounds?.y*.8||0))};
      }).filter(g=>g.score<1).sort((a,b)=>a.score-b.score);
      if(candidates.length)candidates[0].galaxy?focusGalaxy(candidates[0].galaxy):setMode('galaxy');
    }
  });
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();gsap.ticker.remove(frame);stopTravel();labelItems.forEach(item=>item.fade?.tween.kill());fatal(new Error('The graphics context was interrupted. Reload to restore the atlas.'));});
  addEventListener('resize',resize);new ResizeObserver(resize).observe($('viewport'));
  addEventListener('hashchange',()=>{const mode=location.hash.slice(1);if(modes.includes(mode))setMode(mode);});
}

async function start(){
  try{
    renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance',logarithmicDepthBuffer:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    $('viewport').append(renderer.domElement);camera=new THREE.PerspectiveCamera(43,innerWidth/innerHeight,.05,1e6);
    camera.position.set(0,0,RENDER_DISTANCE);
    // Capture wheel input before OrbitControls so one gesture crosses any scale.
    renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();e.stopImmediatePropagation();const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?innerHeight:1);zoom(Math.exp(Math.max(-2,Math.min(2,pixels*.006))));},{passive:false,capture:true});
    controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.07;controls.rotateSpeed=.65;controls.zoomSpeed=2;controls.minDistance=1;controls.maxDistance=10000;controls.screenSpacePanning=true;
    resize();await loadTextures();universe=new Universe(renderer,textures,decodeStars());universe.updateEphemeris(state.date);
    const initial=modes.includes(location.hash.slice(1))?location.hash.slice(1):'earth',destination=bookmark(initial);
    pose.target.copy(destination.target);pose.direction.copy(destination.direction);pose.distance=destination.distance;pose.home=true;pose.follow=destination.follow;
    syncCamera();universe.update(pose,state,camera);createLabels();wireControls();$('date').value=dateText();updateContext();updateLabels();updateReadout();
    $('loading').classList.add('done');gsap.ticker.add(frame);
    window.holos={
      getState:()=>({mode:state.mode,planet:state.planet.name,star:state.star?.name,galaxy:state.galaxy?.name,neighborGalaxies:GALAXIES.length,date:dateText(),playing:state.playing,trueSizes:state.trueSizes,reconstruction:state.reconstruction,portraits:state.portraits,visiblePortraits:universe.portraits.filter(p=>p.sprite.visible).length,extents:state.extents,uncertainty:state.uncertainty,catalogStars:META.count,searchable:META.searchable,loadedTextures:Object.keys(textures).length,sceneId:universe.scene.uuid,sceneCount:1,cameraId:camera.uuid,earthObjectId:universe.earth.root.uuid,frameCount,traveling:!!flight,destination:flight?.name,travelProgress:flight?flight.progress:null,drawCalls:renderer.info.render.calls,points:renderer.info.render.points,webgl:renderer.capabilities.isWebGL2}),
      getCamera:()=>({positionAU:universe.cameraAU.toArray(),targetAU:pose.target.toArray(),direction:pose.direction.toArray(),distanceAU:pose.distance,renderScale:universe.renderScale,homeAnchored:pose.home}),
      getGalaxyPositions:()=>universe.galaxies.map(g=>({name:g.galaxy.name,positionAU:g.positionAU.toArray(),visible:!!g.extent?.visible&&g.root.visible,markerVisible:g.marker.visible,uncertaintyVisible:g.uncertainty.visible&&g.root.visible,objectId:g.root.uuid})),
      getMoonPosition:()=>({positionAU:universe.moonPositionAU.toArray(),earthPositionAU:universe.earth.positionAU.toArray()}),
      getSolarPositions:()=>universe.bodies.map(b=>({name:b.planet.name,positionAU:b.positionAU.toArray(),radiusAU:b.planet.radius/AU_KM})),
      getGalaxyProjection:name=>{const g=universe.galaxies.find(g=>g.galaxy.name===name);if(!g)return null;const p=projectAU(g.positionAU,new THREE.Vector3());return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};},
      getObjectProjection:name=>{const b=universe.bodies.find(b=>b.planet.name===name);if(!b)return null;const p=projectAU(b.positionAU,new THREE.Vector3());return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2,visible:b.root.visible,objectId:b.root.uuid};}
    };
  }catch(error){fatal(error);}
}
start();
