import { build } from 'esbuild';
import { readdir,readFile,writeFile } from 'node:fs/promises';
import path from 'node:path';
const root=new URL('../',import.meta.url);
const assets={};
for(const file of await readdir(new URL('assets/',root))) {
  if(!/\.(jpg|png)$/.test(file))continue;
  assets[path.parse(file).name]=`data:image/${file.endsWith('.png')?'png':'jpeg'};base64,${(await readFile(new URL('assets/'+file,root))).toString('base64')}`;
}
const catalog=await readFile(new URL('data/stars.json',root),'utf8');
const meta=await readFile(new URL('data/catalog-meta.json',root),'utf8');
const stars=(await readFile(new URL('data/stars.bin',root))).toString('base64');
const embedded=`export const ASSETS=${JSON.stringify(assets)};export const CATALOG=${catalog};export const META=${meta};export const STAR_BUFFER=${JSON.stringify(stars)};`;
const result=await build({entryPoints:[new URL('src/app.js',root).pathname],bundle:true,write:false,format:'iife',minify:true,target:'es2020',legalComments:'inline',plugins:[{name:'embedded-assets',setup(b){b.onResolve({filter:/embedded\.js$/},()=>({path:'embedded',namespace:'virtual'}));b.onLoad({filter:/.*/,namespace:'virtual'},()=>({contents:embedded,loader:'js'}));}}]});
const css=await readFile(new URL('src/style.css',root),'utf8');
const template=await readFile(new URL('src/template.html',root),'utf8');
// Escape script closing delimiters so embedded data can never terminate the script tag.
const js=result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
const license=await readFile(new URL('node_modules/three/LICENSE',root),'utf8');
const ephemerisLicense=(await readFile(new URL('node_modules/astronomy-engine/esm/astronomy.js',root),'utf8')).split('*/')[0].replace('/**','').trim();
const attribution=`<!--\nThree.js license:\n${license}\nAstronomy Engine license:\n${ephemerisLicense}\nPlanetary texture maps: Solar System Scope / INOVE, CC BY 4.0, https://www.solarsystemscope.com/textures/\nHYG 4.1 star data: David Nash / Astronexus, CC BY-SA 4.0, https://github.com/astronexus/HYG-Database\nAdaptations: distance filtering and Galactic coordinate transformation; adapted data remains CC BY-SA 4.0.\nGalaxy compilation: Andrew B. Pace, Local Volume Database v1.1.1, CC0, https://github.com/apace7/local_volume_database\nGalaxy measurements: original studies cited per object; RC3 B25 contours, de Vaucouleurs et al. (1991), CDS VII/155.\n-->\n`;
const html=template.replace('<head>','<head>\n'+attribution).replace('/*__CSS__*/',()=>css).replace('/*__APP__*/',()=>js);
await writeFile(new URL('index.html',root),html);
console.log(`Built self-contained index.html · ${(Buffer.byteLength(html)/1024/1024).toFixed(2)} MB · no runtime network requests`);
