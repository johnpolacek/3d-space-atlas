import * as THREE from 'three';
import { seededRandom } from './astronomy.js';

// Screen-sized atlas illustrations, independent of the measured contours.
// Shape, inclination, color, and generated stars are artistic choices.
export const GALAXY_PORTRAITS = {
  milkyway:{size:380,flatten:.62,angle:-.38,arms:4,seed:73,warm:true},
  m31:{size:420,flatten:.42,angle:-.48,arms:2,seed:31,warm:true},
  m33:{size:230,flatten:.78,angle:.35,arms:3,seed:33},
  ic10:{size:88,flatten:.72,angle:.4,seed:10},
  ngc6822:{size:108,flatten:.55,angle:-.65,seed:6822},
  ic1613:{size:94,flatten:.8,angle:.2,seed:1613},
  wlm:{size:88,flatten:.48,angle:.55,seed:91}
};

export function portraitScale(width,distanceLy) {
  return (width<=760?.48:Math.min(1,width/1600))*Math.min(1.15,Math.pow(5.2e6/Math.max(distanceLy,1),.3));
}

export function portraitBounds(id,scale) {
  const p=GALAXY_PORTRAITS[id];
  if(!p)return null;
  const radius=p.size*scale*.38,c=Math.cos(p.angle),s=Math.sin(p.angle);
  return {x:radius*Math.hypot(c,p.flatten*s),y:radius*Math.hypot(s,p.flatten*c)};
}

function portraitTexture(style) {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const ctx=canvas.getContext('2d'),random=seededRandom(style.seed);
  const gaussian=()=>Math.sqrt(-2*Math.log(Math.max(1e-8,random())))*Math.cos(2*Math.PI*random());
  ctx.translate(256,256);ctx.rotate(style.angle);ctx.scale(1,style.flatten);
  const wash=(radius,stops)=>{
    const gradient=ctx.createRadialGradient(0,0,0,0,0,radius);
    stops.forEach(([at,color])=>gradient.addColorStop(at,color));
    ctx.fillStyle=gradient;ctx.fillRect(-radius,-radius,radius*2,radius*2);
  };
  wash(248,[[0,'rgba(181,192,220,.17)'],[.3,'rgba(100,135,187,.12)'],[.7,'rgba(68,105,163,.045)'],[1,'rgba(40,65,110,0)']]);
  wash(180,[[0,'rgba(242,210,164,.6)'],[.14,'rgba(209,179,150,.35)'],[.5,'rgba(125,148,176,.09)'],[1,'rgba(90,125,165,0)']]);
  ctx.globalCompositeOperation='screen';
  const count=style.arms?23000:4800;
  for(let i=0;i<count;i++){
    const r=Math.min(218,-Math.log(Math.max(1e-8,random()*random()))*37);
    let theta=random()*Math.PI*2;
    if(style.arms&&random()>.34)theta=Math.floor(random()*style.arms)*Math.PI*2/style.arms+Math.log(Math.max(r,12)/28)*2.7+gaussian()*.14;
    const scatter=style.arms?3+r*.028:13;
    const x=Math.cos(theta)*r+gaussian()*scatter,y=Math.sin(theta)*r+gaussian()*scatter;
    const fade=Math.max(0,1-r/225),core=Math.exp(-r*r/1800),bright=random();
    const alpha=(.025+random()*.15)*fade;
    ctx.fillStyle=core>.3&&style.warm?`rgba(255,218,165,${alpha})`:bright>.96?`rgba(241,155,177,${alpha*1.6})`:`rgba(158,194,245,${alpha})`;
    const size=.35+random()*.9;
    ctx.fillRect(x,y,size,size/style.flatten);
  }
  ctx.globalCompositeOperation='source-over';
  if(style.arms){
    // Broken dark lanes lend the spiral symbols texture without sharp outlines.
    for(let arm=0;arm<style.arms;arm++){
      ctx.beginPath();
      for(let r=28;r<185;r+=2){const t=arm*Math.PI*2/style.arms+Math.log(r/28)*2.7+.2;const x=Math.cos(t)*r,y=Math.sin(t)*r;r===28?ctx.moveTo(x,y):ctx.lineTo(x,y);}
      ctx.strokeStyle='rgba(8,13,24,.2)';ctx.lineWidth=3;ctx.stroke();
    }
  }
  wash(style.warm?57:30,[[0,style.warm?'rgba(255,242,214,.95)':'rgba(220,232,255,.7)'],[.16,'rgba(248,221,182,.7)'],[.46,'rgba(219,185,143,.25)'],[1,'rgba(172,145,125,0)']]);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  return texture;
}

export function createGalaxyPortrait(id) {
  const style=GALAXY_PORTRAITS[id];
  if(!style)return null;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:portraitTexture(style),transparent:true,depthWrite:false,depthTest:false,toneMapped:false}));
  sprite.renderOrder=-2;
  return sprite;
}
