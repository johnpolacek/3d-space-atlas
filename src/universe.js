import * as THREE from 'three';
import { AU_KM, DEG, PLANETS, julianDate, orbitPath, seededRandom, colorFromBV } from './astronomy.js';
import { LY_AU, GALACTIC_CENTER, ECLIPTIC_ROTATION, eclipticToGalactic, RENDER_DISTANCE, logBlend } from './navigation.js';
import { GALAXIES, galaxyPosition, galaxyOutline, galaxyDistanceRange } from './galaxies.js';
import { bodyPosition, bodyOrientation, moonOffset, moonOrbitPath } from './ephemeris.js';
import { GALAXY_PORTRAITS, createGalaxyPortrait, portraitScale } from './galaxy-portraits.js';

let renderer,textures;
const sphere=new THREE.SphereGeometry(1,96,64);
const vec=a=>new THREE.Vector3(...a);
function shaderMaterial(parameters) {
  parameters.vertexShader='#include <common>\n#include <logdepthbuf_pars_vertex>\n'+parameters.vertexShader.replace(/\}\s*$/, '\n#include <logdepthbuf_vertex>\n}');
  parameters.fragmentShader='#include <logdepthbuf_pars_fragment>\n'+parameters.fragmentShader.replace(/void main\(\)\s*\{/, 'void main(){\n#include <logdepthbuf_fragment>\n');
  return new THREE.ShaderMaterial(parameters);
}

function starPoints(positions,colors,sizes,{opacity=1,attenuate=false,scale=100,additive=true}={}) {
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setAttribute('pointSize',new THREE.Float32BufferAttribute(sizes,1));
  const material=shaderMaterial({transparent:true,depthWrite:false,vertexColors:true,
    blending:additive?THREE.AdditiveBlending:THREE.NormalBlending,
    uniforms:{opacity:{value:opacity},pixelRatio:{value:renderer.getPixelRatio()},attenuate:{value:attenuate?1:0},sizeScale:{value:scale}},
    vertexShader:`attribute float pointSize; varying vec3 vColor; uniform float pixelRatio; uniform float attenuate; uniform float sizeScale;
    void main(){vColor=color;vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;
      float factor=mix(1.,clamp(sizeScale/max(1.,-mv.z),.25,4.),attenuate);gl_PointSize=clamp(pointSize*pixelRatio*factor,1.,40.);}`,
    fragmentShader:`varying vec3 vColor;uniform float opacity;
    void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.)discard;float core=exp(-d*d*20.);float halo=exp(-d*d*5.)*.22;gl_FragColor=vec4(vColor,(core+halo)*opacity);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`});
  const points=new THREE.Points(geometry,material);points.frustumCulled=false;return points;
}

function line(points,color='#597487',opacity=.2) {
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p=>Array.isArray(p)?vec(p):p)),new THREE.LineBasicMaterial({color,transparent:true,opacity,depthWrite:false}));
}
function circle(radius,color,opacity,y=0) { return line(Array.from({length:257},(_,i)=>[radius*Math.cos(i*Math.PI/128),y,radius*Math.sin(i*Math.PI/128)]),color,opacity); }
function glow(color,size,opacity=.7) {
  const positions=[0,0,0],colors=new THREE.Color(color).toArray();
  const point=starPoints(positions,colors,[size],{opacity});return point;
}
function makeAtmosphere(radius,color='#62b5ff',sunDir=new THREE.Vector3(1,0,0)) {
  return new THREE.Mesh(sphere,shaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.BackSide,
    uniforms:{tint:{value:new THREE.Color(color)},sunDir:{value:sunDir},strength:{value:1}},
    vertexShader:`varying vec3 vNormal;varying vec3 vWorld;void main(){vNormal=normalize(mat3(modelMatrix)*normal);vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`,
    fragmentShader:`varying vec3 vNormal;varying vec3 vWorld;uniform vec3 tint;uniform vec3 sunDir;uniform float strength;
    void main(){vec3 n=normalize(vNormal);vec3 viewDir=normalize(cameraPosition-vWorld);float rim=pow(max(0.,1.-abs(dot(n,viewDir))),4.);float day=smoothstep(-.3,.8,dot(n,normalize(sunDir)));gl_FragColor=vec4(tint,rim*(.07+.7*day)*strength);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`}));
}
function createPlanet(planet,{detailed=false,sunDir=new THREE.Vector3(-3,1,3)}={}) {
  const root=new THREE.Group(),axial=new THREE.Group();root.add(axial);axial.rotation.x=-planet.tilt*DEG;
  let material;
  if(planet.name==='Earth') {
    material=shaderMaterial({uniforms:{dayMap:{value:textures.earth_daymap},nightMap:{value:textures.earth_nightmap},sunDir:{value:sunDir}},
      vertexShader:`varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorld;void main(){vUv=uv;vNormal=normalize(mat3(modelMatrix)*normal);vWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);}`,
      fragmentShader:`uniform sampler2D dayMap;uniform sampler2D nightMap;uniform vec3 sunDir;varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorld;
      void main(){vec3 n=normalize(vNormal),light=normalize(sunDir),v=normalize(cameraPosition-vWorld);float ndl=dot(n,light);vec3 day=texture2D(dayMap,vUv).rgb;vec3 night=texture2D(nightMap,vUv).rgb;
        float ocean=smoothstep(.025,.11,day.b-day.r)*smoothstep(.0,.07,day.b-day.g);float spec=pow(max(0.,dot(reflect(-light,n),v)),65.)*ocean*.32;
        vec3 col=day*(.022+max(0.,ndl)*1.6)+night*(1.-smoothstep(-.18,.08,ndl))*.9+spec;
        float rim=pow(1.-max(0.,dot(n,v)),3.);col+=vec3(.05,.28,.55)*rim*smoothstep(-.12,.45,ndl)*.42;
        gl_FragColor=vec4(col,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
  } else material=new THREE.MeshStandardMaterial({map:textures[planet.texture],roughness:1,metalness:0});
  const surface=new THREE.Mesh(sphere,material);surface.castShadow=true;surface.receiveShadow=true;axial.add(surface);
  // Radius comes from the parent root, so atmosphere and rings follow physical proportions.
  let clouds,atmosphere;
  if(planet.name==='Earth') {
    clouds=new THREE.Mesh(sphere,new THREE.MeshStandardMaterial({map:textures.earth_clouds,alphaMap:textures.earth_clouds,transparent:true,opacity:.72,depthWrite:false,roughness:1}));
    clouds.scale.setScalar(1.004);axial.add(clouds);
    atmosphere=makeAtmosphere(1.025,'#559eee',sunDir);atmosphere.scale.setScalar(1.025);root.add(atmosphere);
  }
  if(planet.name==='Saturn') {
    const geometry=new THREE.RingGeometry(1.24,2.27,180);
    const uv=geometry.attributes.uv,pos=geometry.attributes.position;
    for(let i=0;i<pos.count;i++) { const r=Math.hypot(pos.getX(i),pos.getY(i));uv.setXY(i,(r-1.24)/(2.27-1.24),.5); }
    const rings=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({map:textures.saturn_ring_alpha,transparent:true,alphaTest:.04,side:THREE.DoubleSide,depthWrite:false,roughness:1,opacity:.9}));
    rings.castShadow=true;rings.receiveShadow=true;rings.rotation.x=-Math.PI/2;axial.add(rings);
  }
  root.userData.planet=planet;
  return {root,axial,surface,clouds,atmosphere,sunDir,planet};
}

// Distant point positions remain in light-years. Camera subtraction occurs
// before conversion to render units, preserving angular positions and parallax.
// Capping only depth keeps distant stars inside the same camera's depth range.
function distantPoints(positions,colors,sizes,nearAlpha,{opacity=1,offset=new THREE.Vector3()}={}) {
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.setAttribute('pointSize',new THREE.Float32BufferAttribute(sizes,1));
  geometry.setAttribute('nearAlpha',new THREE.Float32BufferAttribute(nearAlpha,1));
  const material=shaderMaterial({transparent:true,depthWrite:false,vertexColors:true,blending:THREE.AdditiveBlending,
    uniforms:{cameraLy:{value:new THREE.Vector3()},offsetLy:{value:offset},scaleLy:{value:1},opacity:{value:opacity},surveyBlend:{value:1},pixelRatio:{value:renderer.getPixelRatio()}},
    vertexShader:`attribute float pointSize;attribute float nearAlpha;varying vec3 vColor;varying float vAlpha;
      uniform vec3 cameraLy;uniform vec3 offsetLy;uniform float scaleLy;uniform float surveyBlend;uniform float pixelRatio;
      void main(){vec3 relative=position+offsetLy-cameraLy;float d=max(length(relative),1e-20);
        vec3 renderRelative=relative/d*min(d*scaleLy,800000.);
        gl_Position=projectionMatrix*vec4(mat3(viewMatrix)*renderRelative,1.);
        vColor=color;vAlpha=mix(nearAlpha,1.,surveyBlend);
        gl_PointSize=clamp(pointSize*pixelRatio,1.,40.);
      }`,
    fragmentShader:`varying vec3 vColor;varying float vAlpha;uniform float opacity;
      void main(){float d=length(gl_PointCoord-.5)*2.;if(d>1.||vAlpha<.001)discard;
        gl_FragColor=vec4(vColor,(exp(-d*d*20.)+.22*exp(-d*d*5.))*opacity*vAlpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
  const points=new THREE.Points(geometry,material);points.frustumCulled=false;return points;
}

function galacticDensity() {
  const rand=seededRandom(271828),gaussian=()=>Math.sqrt(-2*Math.log(Math.max(1e-8,rand())))*Math.cos(2*Math.PI*rand());
  const pos=[],col=[],sizes=[];
  for(let i=0;i<135000;i++) {
    let x,y,z,c,size;const component=rand();
    if(component<.22) {
      const bx=gaussian()*(rand()<.65?5100:2400),bz=gaussian()*1300,angle=27*DEG;
      x=bx*Math.cos(angle)-bz*Math.sin(angle);z=bx*Math.sin(angle)+bz*Math.cos(angle);y=gaussian()*850;
      c=[.45,.24,.10];size=1.1+rand()*1.4;
    } else if(component<.56) {
      const radius=Math.min(52000,-Math.log(Math.max(1e-6,rand()*rand()))*8000),theta=rand()*Math.PI*2;
      x=radius*Math.cos(theta);z=radius*Math.sin(theta);y=gaussian()*(250+radius*.009);
      c=[.58,.58,.60];size=.9+rand()*1.6;
    } else {
      const arm=Math.floor(rand()*4),radius=6500+Math.pow(rand(),.68)*42500;
      const theta=arm*Math.PI/2+Math.log(radius/7000)/Math.tan(13*DEG)+.25;
      const scatter=gaussian()*(600+radius*.033),jitter=gaussian()*.022;
      x=Math.cos(theta+jitter)*(radius+scatter)+gaussian()*450;z=Math.sin(theta+jitter)*(radius+scatter)+gaussian()*450;y=gaussian()*190;
      const bright=rand();c=bright<.14?[.94,.64,.59]:bright<.5?[.58,.72,.94]:[.69,.76,.86];size=1+rand()*2.2;
    }
    pos.push(x,y,z);
    const fade=1-logBlend(Math.max(1,Math.hypot(x,z)),36000,53000),brightness=(.4+rand()*.5)*(.08+.92*fade);
    col.push(...c.map(v=>v*brightness));sizes.push(size);
  }
  const offset=GALACTIC_CENTER.clone().divideScalar(LY_AU);
  const density=distantPoints(pos,col,sizes,sizes.map(()=>1),{opacity:.19,offset});
  const p=[],c=[],s=[];
  for(let i=0;i<pos.length;i+=15){p.push(pos[i],pos[i+1],pos[i+2]);c.push(col[i]*.45,col[i+1]*.45,col[i+2]*.45);s.push(17);}
  const haze=distantPoints(p,c,s,s.map(()=>1),{opacity:.023,offset});
  return {density,haze};
}

// A soft fill makes the measured contour readable without inventing a disk
// inclination or a resolved stellar population. The gradient is map styling.
function contourFill(outline) {
  const positions=[],uv=[];
  for(let i=0;i<outline.length-1;i++){
    positions.push(0,0,0,...outline[i].toArray(),...outline[i+1].toArray());
    const a=i*Math.PI/64,b=(i+1)*Math.PI/64;
    uv.push(0,0,Math.cos(a),Math.sin(a),Math.cos(b),Math.sin(b));
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  const material=shaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
    uniforms:{opacity:{value:.5}},
    vertexShader:`varying vec2 point;void main(){point=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 point;uniform float opacity;void main(){float r=length(point);float center=exp(-r*r*8.);vec3 tint=mix(vec3(.30,.57,.76),vec3(.95,.78,.52),center);gl_FragColor=vec4(tint,opacity*(1.-smoothstep(.1,1.,r))*.65);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`});
  return new THREE.Mesh(geometry,material);
}

function nearbyGalaxy(galaxy) {
  const positionLy=galaxyPosition(galaxy),positionAU=positionLy.clone().multiplyScalar(LY_AU);
  const root=new THREE.Group(),outline=galaxyOutline(galaxy);
  const extent=outline.length?line(outline,'#a3c8db',.55):null;
  const fill=outline.length?contourFill(outline):null;
  if(extent)root.add(extent,fill);
  const uncertainty=line(galaxyDistanceRange(galaxy),'#c8ac80',.42);root.add(uncertainty);
  // Screen-sized map symbols indicate catalog centers, never galaxy size/color.
  const major=['m31','m33'].includes(galaxy.id);
  const marker=distantPoints([0,0,0,0,0,0],[.63,.79,.89,.3,.5,.7],[9,major?36:22],[1,1],{offset:positionLy});
  return {galaxy,positionAU,root,extent,fill,uncertainty,marker};
}

export class Universe {
  constructor(webglRenderer,loadedTextures,catalogArray) {
    renderer=webglRenderer;textures=loadedTextures;
    // This is the only Scene. Every destination keeps the same object identity.
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#06090e');
    this.bodies=PLANETS.map(planet=>{
      const body=createPlanet(planet);body.positionAU=new THREE.Vector3();body.root.quaternion.copy(ECLIPTIC_ROTATION);this.scene.add(body.root);return body;
    });
    this.earth=this.bodies[2];
    this.sun=new THREE.Mesh(sphere,new THREE.MeshBasicMaterial({map:textures.sun,color:'#fff1d9'}));this.scene.add(this.sun);
    this.sunlight=new THREE.PointLight('#fff5e7',3,0,0);this.scene.add(this.sunlight,new THREE.AmbientLight('#8797ae',.065));
    this.saturnLight=new THREE.DirectionalLight('#fff6e7',0);this.saturnLight.castShadow=true;
    this.saturnLight.shadow.mapSize.set(2048,2048);this.saturnLight.shadow.bias=-.00015;this.saturnLight.shadow.normalBias=.008;
    this.scene.add(this.saturnLight,this.saturnLight.target);
    this.sunMarker=distantPoints([0,0,0],[1,.82,.5],[13],[1]);this.scene.add(this.sunMarker);
    this.orbits=new THREE.Group();this.orbits.quaternion.copy(ECLIPTIC_ROTATION);this.scene.add(this.orbits);
    this.orbitLines=[];
    for(const planet of PLANETS){const path=line(orbitPath(planet,2451545),planet.color,.24);this.orbitLines.push(path);this.orbits.add(path);}
    const r=seededRandom(34),p=[],c=[],s=[];
    for(let i=0;i<3200;i++){const a=2.15+r()*1.15,t=r()*Math.PI*2;p.push(Math.cos(t)*a,(r()-.5)*.15,Math.sin(t)*a);c.push(.35,.33,.30);s.push(.8);}
    this.belt=starPoints(p,c,s,{opacity:.35});this.orbits.add(this.belt);
    this.moon=new THREE.Mesh(sphere,new THREE.MeshStandardMaterial({map:textures.moon,roughness:1}));this.moon.quaternion.copy(ECLIPTIC_ROTATION);this.scene.add(this.moon);
    this.moonPositionAU=new THREE.Vector3();
    this.moonOrbit=line([], '#728598',.15);this.scene.add(this.moonOrbit);
    const positions=[],colors=[],sizes=[],near=[];
    for(let i=0;i<catalogArray.length;i+=5){
      positions.push(catalogArray[i],catalogArray[i+1],catalogArray[i+2]);
      colors.push(...colorFromBV(Math.max(-.39,Math.min(2.5,catalogArray[i+4]))));
      sizes.push(Math.max(1.3,4.3-catalogArray[i+3]*.36));near.push(catalogArray[i+3]<=6.5?1:0);
    }
    this.catalog=distantPoints(positions,colors,sizes,near,{opacity:.8});this.scene.add(this.catalog);
    const galaxy=galacticDensity();this.density=galaxy.density;this.haze=galaxy.haze;this.scene.add(this.density,this.haze);
    this.milkyWayMarker=distantPoints([0,0,0,0,0,0],[.95,.8,.6,.6,.4,.2],[9,36],[1,1],{offset:GALACTIC_CENTER.clone().divideScalar(LY_AU)});this.scene.add(this.milkyWayMarker);
    this.distant=[this.catalog,this.density,this.haze,this.sunMarker,this.milkyWayMarker];
    this.galaxies=GALAXIES.map(nearbyGalaxy);
    for(const galaxy of this.galaxies){this.scene.add(galaxy.root,galaxy.marker);this.distant.push(galaxy.marker);}
    this.portraits=[{id:'milkyway',positionAU:GALACTIC_CENTER},...this.galaxies.map(g=>({id:g.galaxy.id,positionAU:g.positionAU}))]
      .filter(g=>GALAXY_PORTRAITS[g.id]).map(g=>({...g,sprite:createGalaxyPortrait(g.id)}));
    for(const portrait of this.portraits)this.scene.add(portrait.sprite);
    this.viewportSize=new THREE.Vector2();
    this.starRings=new THREE.Group();this.scene.add(this.starRings);
    for(const radius of [5,10,20,50,100,500,1000])this.starRings.add(circle(radius,'#759bb3',.10));
    this.galaxyRings=new THREE.Group();this.scene.add(this.galaxyRings);
    for(const radius of [10000,20000,30000,40000,50000])this.galaxyRings.add(circle(radius,'#70879c',.085,-100));
    this.galaxyRings.add(line([GALACTIC_CENTER.clone().divideScalar(-LY_AU),[0,0,0]],'#d3b580',.28));
    this.groupRings=new THREE.Group();this.scene.add(this.groupRings);
    for(const radius of [1e6,2e6,3e6])this.groupRings.add(circle(radius,'#70879c',.1));
    this.cameraAU=new THREE.Vector3();this.renderScale=1;this.lastOrbitYear=null;
  }

  updateEphemeris(date) {
    if(this.lastEphemerisTime===date.getTime())return;
    this.lastEphemerisTime=date.getTime();
    const jd=julianDate(date);
    for(const b of this.bodies){
      b.positionAU.copy(bodyPosition(b.planet.name,date));b.sunDir.copy(b.positionAU).negate().normalize();
      b.root.quaternion.copy(bodyOrientation(b.planet.name,date));b.axial.rotation.set(0,0,0);b.surface.rotation.set(0,0,0);
      if(b.clouds)b.clouds.rotation.set(0,0,0);
    }
    this.sun.quaternion.copy(bodyOrientation('Sun',date));
    this.moonPositionAU.copy(moonOffset(date)).add(this.earth.positionAU);
    this.moon.quaternion.copy(bodyOrientation('Moon',date));
    if(this.lastMoonOrbitDay!==Math.floor(jd)){
      this.lastMoonOrbitDay=Math.floor(jd);this.moonOrbit.geometry.setFromPoints(moonOrbitPath(date));
    }
    if(this.lastOrbitYear!==date.getUTCFullYear()){
      this.lastOrbitYear=date.getUTCFullYear();this.orbitLines.forEach((path,i)=>path.geometry.setFromPoints(orbitPath(PLANETS[i],jd).map(vec)));
    }
  }

  update(pose,state,camera) {
    const scale=this.renderScale=RENDER_DISTANCE/pose.distance,dLy=pose.distance/LY_AU;
    this.cameraAU.copy(pose.target).addScaledVector(pose.direction,pose.distance);
    const origin=pose.target;
    let nearestPlanetRadii=Infinity;
    for(const b of this.bodies){
      b.root.position.copy(b.positionAU).sub(origin).multiplyScalar(scale);
      const real=b.planet.radius/AU_KM,distance=this.cameraAU.distanceTo(b.positionAU);
      nearestPlanetRadii=Math.min(nearestPlanetRadii,distance/real);
      const display=Math.max(real,Math.min(.17*Math.sqrt(b.planet.radius/6371),distance*.0034));
      const detail=logBlend(distance/real,30,800);
      // Earth recedes at its physical size; its marker fades in as the globe
      // shrinks to a few pixels instead of retaining an enlarged Earth disk.
      b.displayRadiusAU=state.trueSizes||b===this.earth?real:THREE.MathUtils.lerp(real,display,detail);
      b.root.scale.setScalar(b.displayRadiusAU*scale);
      // Subpixel surfaces need no geometry; their existing labels and star markers remain.
      b.root.visible=b.displayRadiusAU/distance>1e-6&&distance*scale<700000;
    }
    this.sun.position.copy(origin).negate().multiplyScalar(scale);this.sun.scale.setScalar(.00465047*scale);
    this.sun.visible=.00465047/Math.max(1e-20,this.cameraAU.length())>1e-6&&this.cameraAU.length()*scale<700000;
    this.sunlight.position.copy(this.sun.position);
    const saturn=this.bodies[5],saturnClose=this.cameraAU.distanceTo(saturn.positionAU)<saturn.planet.radius/AU_KM*40;
    this.saturnLight.intensity=saturnClose?2.6:0;this.sunlight.intensity=saturnClose?0:3;
    if(saturnClose){
      const radius=saturn.planet.radius/AU_KM*scale;
      this.saturnLight.target.position.copy(saturn.root.position);this.saturnLight.position.copy(saturn.root.position).addScaledVector(saturn.sunDir,100*radius);
      Object.assign(this.saturnLight.shadow.camera,{left:-3*radius,right:3*radius,top:3*radius,bottom:-3*radius,near:90*radius,far:110*radius});this.saturnLight.shadow.camera.updateProjectionMatrix();
    }
    const solarVisibility=logBlend(nearestPlanetRadii,25,120)*logBlend(pose.distance,.0002,.003)*(1-logBlend(pose.distance,150,6000));
    this.orbits.position.copy(origin).negate().multiplyScalar(scale);this.orbits.scale.setScalar(scale);
    this.orbits.visible=state.orbits&&solarVisibility>.001;
    this.orbitLines.forEach(path=>path.material.opacity=.24*solarVisibility);this.belt.visible=state.reconstruction;this.belt.material.uniforms.opacity.value=.35*solarVisibility;
    this.moon.position.copy(this.moonPositionAU).sub(origin).multiplyScalar(scale);this.moon.scale.setScalar(1737.4/AU_KM*scale);
    this.moon.visible=(1737.4/AU_KM)/this.cameraAU.distanceTo(this.moonPositionAU)>1e-6;
    this.moonOrbit.position.copy(this.earth.positionAU).sub(origin).multiplyScalar(scale);this.moonOrbit.scale.setScalar(scale);
    const moonVisibility=logBlend(pose.distance,.0003,.001)*(1-logBlend(pose.distance,.015,.05));
    this.moonOrbit.visible=state.orbits&&moonVisibility>.001;this.moonOrbit.material.opacity=.18*moonVisibility;
    const galaxyVisibility=state.reconstruction?logBlend(dLy,400,12000):0;
    const milkyWayDistance=this.cameraAU.distanceTo(GALACTIC_CENTER)/LY_AU;
    const compact=Math.min(1,Math.pow(220000/Math.max(1,milkyWayDistance),1.35));
    this.density.material.uniforms.opacity.value=.19*galaxyVisibility*compact;this.haze.material.uniforms.opacity.value=.023*galaxyVisibility*compact;
    this.density.visible=this.haze.visible=galaxyVisibility>.001;
    this.catalog.material.uniforms.surveyBlend.value=logBlend(dLy,.002,.5);
    this.catalog.material.uniforms.opacity.value=.8*(1-logBlend(dLy,2500,50000))+(state.reconstruction?.0015:.16)*logBlend(dLy,2500,50000);
    this.catalog.material.uniforms.opacity.value*=1-logBlend(dLy,350000,650000);
    this.sunMarker.material.uniforms.opacity.value=logBlend(pose.distance,.02,4)*(1-logBlend(dLy,400000,650000));
    const groupVisibility=logBlend(dLy,35000,180000);
    const portraitVisibility=state.portraits?logBlend(dLy,state.galaxy?2e6:650000,state.galaxy?4e6:1.5e6):0;
    renderer.getSize(this.viewportSize);
    const symbolScale=portraitScale(this.viewportSize.x,dLy);
    for(const {id,positionAU,sprite} of this.portraits){
      sprite.position.copy(positionAU).sub(origin).multiplyScalar(scale);
      const depth=-offsetDepth(positionAU,this.cameraAU,pose.direction)*scale;
      sprite.visible=portraitVisibility>.001&&depth>0&&depth<700000;
      if(!sprite.visible)continue;
      sprite.material.opacity=portraitVisibility;
      sprite.scale.setScalar(GALAXY_PORTRAITS[id].size*symbolScale*2*depth/(this.viewportSize.y*camera.projectionMatrix.elements[5]));
    }
    this.milkyWayMarker.material.uniforms.opacity.value=.7*groupVisibility;
    this.milkyWayMarker.visible=groupVisibility>.001;
    for(const neighbor of this.galaxies){
      const {galaxy,root,extent,fill,uncertainty,marker,positionAU}=neighbor;
      const visibility=Math.max(groupVisibility,state.galaxy===galaxy?1:0);
      root.position.copy(positionAU).sub(origin).multiplyScalar(scale);root.scale.setScalar(LY_AU*scale);
      root.visible=marker.visible=visibility>.001;
      if(extent){extent.visible=state.extents;extent.material.opacity=.4*visibility;fill.visible=state.extents;fill.material.uniforms.opacity.value=.65*visibility;}
      uncertainty.visible=state.uncertainty;uncertainty.material.opacity=.42*visibility;
      marker.material.uniforms.opacity.value=.7*visibility;
    }
    for(const points of this.distant){const u=points.material.uniforms;u.cameraLy.value.copy(this.cameraAU).divideScalar(LY_AU);u.scaleLy.value=scale*LY_AU;}
    const ringVisibility=logBlend(dLy,.5,4)*(1-logBlend(dLy,2000,7000));
    this.starRings.position.copy(origin).negate().multiplyScalar(scale);this.starRings.scale.setScalar(LY_AU*scale);
    this.starRings.visible=state.orbits&&ringVisibility>.001;this.starRings.children.forEach(r=>r.material.opacity=.10*ringVisibility);
    this.galaxyRings.position.copy(GALACTIC_CENTER).sub(origin).multiplyScalar(scale);this.galaxyRings.scale.setScalar(LY_AU*scale);
    const galaxyGuides=logBlend(dLy,400,12000)*(1-logBlend(dLy,150000,650000));
    this.galaxyRings.visible=state.orbits&&galaxyGuides>.001;this.galaxyRings.children.forEach(r=>r.material.opacity=.08*galaxyGuides);
    this.groupRings.position.copy(GALACTIC_CENTER).sub(origin).multiplyScalar(scale);this.groupRings.scale.setScalar(LY_AU*scale);
    const groupGuides=logBlend(dLy,350000,1e6);
    this.groupRings.visible=state.orbits&&groupGuides>.001;this.groupRings.children.forEach(r=>r.material.opacity=.1*groupGuides);
  }
}

function offsetDepth(position,camera,direction) {
  return (position.x-camera.x)*direction.x+(position.y-camera.y)*direction.y+(position.z-camera.z)*direction.z;
}
