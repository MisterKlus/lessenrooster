// Bouwt het lessenrooster uit src/rooster.src.html:
//  - index.html + ouders.html (GitHub Pages: installeerbaar als app, werkt offline)
//  - bestanden/Lessenrooster_Tymo.html + bestanden/Lessenrooster.html (losse bestanden om door te sturen)
//  - icons/*, manifests en sw.js
// Alle pagina's worden vooraf gerenderd, zodat het rooster ook zichtbaar is zonder JavaScript.
// Gebruik: node src/build.js
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process');
const src=__dirname,root=path.join(src,'..');
const chrome='C:/Program Files/Google/Chrome/Application/chrome.exe';
const out=(...p)=>path.join(root,...p);
fs.mkdirSync(out('icons'),{recursive:true});
fs.mkdirSync(out('bestanden'),{recursive:true});

function replaceOnce(s,from,to){if(!s.includes(from))throw new Error('Niet gevonden: '+from);return s.split(from).join(to)}
const dropLines=(s,marker)=>s.split('\n').filter(line=>!line.includes(marker)).join('\n');
const dropBlock=(s,name)=>s.replace(new RegExp(`<!--@${name}-->[\\s\\S]*?<!--@/${name}-->\\n?`,'g'),'');
const fileUrl=p=>'file:///'+p.replace(/\\/g,'/');
function chromeRun(args){return execFileSync(chrome,['--headless=new','--disable-gpu','--hide-scrollbars',...args],{encoding:'utf8',maxBuffer:1e8})}

// Iconen
const iconSvg=fs.readFileSync(path.join(src,'icon.svg'),'utf8');
const maskableSvg=replaceOnce(iconSvg,'<g id="art">','<g id="art" transform="translate(256 256) scale(.78) translate(-256 -256)">');
fs.writeFileSync(out('icons','icon.svg'),iconSvg);
function renderPng(svg,file){
 const tmp=path.join(src,'tmp-icon.html');
 fs.writeFileSync(tmp,`<!doctype html><style>html,body{margin:0;overflow:hidden}svg{display:block;width:100vw;height:100vh}</style>${svg}`);
 chromeRun(['--force-device-scale-factor=1','--window-size=512,512','--screenshot='+file,fileUrl(tmp)]);
 fs.unlinkSync(tmp);
}
function resizePng(from,to,size){
 const ps=`Add-Type -AssemblyName System.Drawing;$s=[System.Drawing.Image]::FromFile('${from}');$b=New-Object System.Drawing.Bitmap ${size},${size};$g=[System.Drawing.Graphics]::FromImage($b);$g.InterpolationMode='HighQualityBicubic';$g.PixelOffsetMode='HighQuality';$g.DrawImage($s,0,0,${size},${size});$b.Save('${to}',[System.Drawing.Imaging.ImageFormat]::Png);$g.Dispose();$b.Dispose();$s.Dispose()`;
 execFileSync('powershell.exe',['-NoProfile','-Command',ps]);
}
renderPng(iconSvg,out('icons','icon-512.png'));
renderPng(maskableSvg,out('icons','icon-maskable-512.png'));
resizePng(out('icons','icon-512.png'),out('icons','icon-192.png'),192);
resizePng(out('icons','icon-512.png'),out('icons','apple-touch-icon.png'),180);

// Manifests (zonder start_url voor Tymo: zo blijft de link met je keuzes bewaard als je de app toevoegt)
const icons=[{src:'icons/icon-192.png',sizes:'192x192',type:'image/png'},{src:'icons/icon-512.png',sizes:'512x512',type:'image/png'},{src:'icons/icon-maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}];
const manifestBase={lang:'nl',display:'standalone',background_color:'#f5f7fc',theme_color:'#f5f7fc',icons};
fs.writeFileSync(out('manifest.webmanifest'),JSON.stringify({name:'Mijn lessenrooster',short_name:'Lessenrooster',description:'Lessenrooster PXL Graduaat Programmeren',...manifestBase},null,1));
fs.writeFileSync(out('ouders.webmanifest'),JSON.stringify({name:'Lessenrooster van Tymo',short_name:'Rooster Tymo',description:'Lessenrooster van Tymo, PXL Graduaat Programmeren',start_url:'ouders.html',...manifestBase},null,1));

// Service worker: eerst het netwerk (roosterwijzigingen komen meteen door), zonder internet de bewaarde versie
const cached=['./','index.html','ouders.html','manifest.webmanifest','ouders.webmanifest','icons/icon.svg','icons/icon-192.png','icons/icon-512.png','icons/icon-maskable-512.png','icons/apple-touch-icon.png'];
fs.writeFileSync(out('sw.js'),`const CACHE='lessenrooster-${Date.now().toString(36)}';
const FILES=${JSON.stringify(cached)};
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET'||new URL(request.url).origin!==location.origin)return;
 event.respondWith(fetch(request).then(response=>{
  if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy))}
  return response;
 }).catch(()=>caches.match(request,{ignoreSearch:true}).then(hit=>hit||caches.match('index.html'))));
});
`);

// Pagina's
let base=fs.readFileSync(path.join(src,'rooster.src.html'),'utf8');
const svgUri=encodeURIComponent(iconSvg.replace(/\s*\n\s*/g,'').replace(/"/g,"'"));
const pngBase64=fs.readFileSync(out('icons','apple-touch-icon.png')).toString('base64');

function variant({web,parent}){
 let s=base;
 s=dropLines(s,web?'data-file-only':'data-web-only');
 s=dropBlock(s,web?'file':'web').replace(/<!--@\/?(web|file)-->\n?/g,'');
 s=dropLines(s,parent?'data-tymo-only':'data-parent-only');
 if(web)s=replaceOnce(s,'const WEB=false;','const WEB=true;');
 else s=replaceOnce(replaceOnce(s,'__ICON_SVG__',svgUri),'__ICON_PNG__',pngBase64);
 s=s.split('__MANIFEST__').join(parent?'ouders.webmanifest':'manifest.webmanifest');
 s=replaceOnce(s,'__APP_TITLE__',parent?'Rooster Tymo':'Lessenrooster');
 if(parent){
  s=replaceOnce(s,'<title>Mijn lessenrooster · PXL</title>','<title>Lessenrooster voor ouders · PXL</title>');
  s=replaceOnce(s,'<h1>Mijn lessenrooster</h1>','<h1>Lessenrooster voor mijn ouders</h1>');
  s=replaceOnce(s,'const PARENT=false;','const PARENT=true;');
  s=replaceOnce(s,' Grijs en doorgestreept = een les die je niet volgt.','');
  if(web)s=replaceOnce(s,' Je vinkjes en kleuren gaan mee.','');
 }
 return s;
}
function prerender(html,file){
 const tmp=path.join(path.dirname(file),'tmp-'+path.basename(file));
 fs.writeFileSync(tmp,html);
 let dom=chromeRun(['--dump-dom',fileUrl(tmp)]);
 fs.unlinkSync(tmp);
 if(!dom.includes('class="listday'))throw new Error('Rooster niet gerenderd: '+file);
 dom=dom.replace(/<html\b[^>]*>/,'<html lang="nl" class="static">');
 if(!/^\s*<!doctype/i.test(dom))dom='<!doctype html>\n'+dom;
 fs.writeFileSync(file,dom);
 console.log(path.relative(root,file),Math.round(fs.statSync(file).size/1024)+' kB');
}
prerender(variant({web:true,parent:false}),out('index.html'));
prerender(variant({web:true,parent:true}),out('ouders.html'));
prerender(variant({web:false,parent:false}),out('bestanden','Lessenrooster_Tymo.html'));
prerender(variant({web:false,parent:true}),out('bestanden','Lessenrooster.html'));
