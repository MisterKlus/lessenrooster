// Bouwt het lessenrooster uit src/rooster.src.html:
//  - haalt eerst het rooster op uit TimeEdit (als TIMEEDIT_URL of src/timeedit-url.txt bestaat)
//  - index.html + ouders.html (GitHub Pages: installeerbaar als app, werkt offline)
//  - bestanden/Lessenrooster_Tymo.html + bestanden/Lessenrooster.html (losse bestanden om door te sturen)
//  - manifests en sw.js; iconen alleen als ze ontbreken of met --icons (vraagt Windows)
// Alle pagina's worden vooraf gerenderd, zodat het rooster ook zichtbaar is zonder JavaScript.
// Gebruik: node src/build.js [--icons]
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process'),{pathToFileURL}=require('url');
const {syncFromTimeEdit,loadSchedule}=require('./timeedit');
const src=__dirname,root=path.join(src,'..');
const chrome=process.env.CHROME||'C:/Program Files/Google/Chrome/Application/chrome.exe';
const out=(...p)=>path.join(root,...p);

function replaceOnce(s,from,to){if(!s.includes(from))throw new Error('Niet gevonden: '+from);return s.split(from).join(to)}
const fill=(s,from,to)=>s.split(from).join(to);
const dropLines=(s,marker)=>s.split('\n').filter(line=>!line.includes(marker)).join('\n');
const dropBlock=(s,name)=>s.replace(new RegExp(`<!--@${name}-->[\\s\\S]*?<!--@/${name}-->\\n?`,'g'),'');
const fileUrl=p=>pathToFileURL(p).href;
function chromeRun(args){return execFileSync(chrome,['--headless=new','--disable-gpu','--hide-scrollbars',...(process.platform==='win32'?[]:['--no-sandbox']),...args],{encoding:'utf8',maxBuffer:1e8})}

// Iconen uit src/icon-source.webp: op een witte achtergrond voor het beginscherm
// (iPhone maakt transparante delen zwart), transparant voor het browsertabblad
function renderPng(file,{scale=1,background='#fff'}={}){
 const tmp=path.join(src,'tmp-icon.html');
 fs.writeFileSync(tmp,`<!doctype html><style>html,body{margin:0;height:100%;overflow:hidden;background:${background}}body{display:grid;place-items:center}img{display:block;width:${scale*100}vmin;height:${scale*100}vmin}</style><img src="${fileUrl(path.join(src,'icon-source.webp'))}">`);
 chromeRun(['--force-device-scale-factor=1','--window-size=512,512','--default-background-color=00000000','--screenshot='+file,fileUrl(tmp)]);
 fs.unlinkSync(tmp);
}
function resizePng(from,to,size){
 const ps=`Add-Type -AssemblyName System.Drawing;$s=[System.Drawing.Image]::FromFile('${from}');$b=New-Object System.Drawing.Bitmap ${size},${size};$g=[System.Drawing.Graphics]::FromImage($b);$g.InterpolationMode='HighQualityBicubic';$g.PixelOffsetMode='HighQuality';$g.DrawImage($s,0,0,${size},${size});$b.Save('${to}',[System.Drawing.Imaging.ImageFormat]::Png);$g.Dispose();$b.Dispose();$s.Dispose()`;
 execFileSync('powershell.exe',['-NoProfile','-Command',ps]);
}
function buildIcons(){
 fs.mkdirSync(out('icons'),{recursive:true});
 renderPng(out('icons','icon-512.png'));
 renderPng(out('icons','icon-maskable-512.png'),{scale:.8}); // Android knipt de randen af: iets kleiner
 resizePng(out('icons','icon-512.png'),out('icons','icon-192.png'),192);
 resizePng(out('icons','icon-512.png'),out('icons','apple-touch-icon.png'),180);
 const transparent=path.join(src,'tmp-transparent.png');
 renderPng(transparent,{background:'transparent'});
 resizePng(transparent,out('icons','favicon-48.png'),48);
 fs.unlinkSync(transparent);
}

function writeManifestsAndWorker(){
 // Manifests (zonder start_url voor Tymo: zo blijft de link met je keuzes bewaard als je de app toevoegt)
 const icons=[{src:'icons/icon-192.png',sizes:'192x192',type:'image/png'},{src:'icons/icon-512.png',sizes:'512x512',type:'image/png'},{src:'icons/icon-maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}];
 const manifestBase={lang:'nl',display:'standalone',background_color:'#f5f7fc',theme_color:'#f5f7fc',icons};
 fs.writeFileSync(out('manifest.webmanifest'),JSON.stringify({name:'Mijn lessenrooster',short_name:'Lessenrooster',description:'Lessenrooster PXL Graduaat Programmeren',...manifestBase},null,1));
 fs.writeFileSync(out('ouders.webmanifest'),JSON.stringify({name:'Lessenrooster van Tymo',short_name:'Rooster Tymo',description:'Lessenrooster van Tymo, PXL Graduaat Programmeren',start_url:'ouders.html',...manifestBase},null,1));
 // Service worker: eerst het netwerk (roosterwijzigingen komen meteen door), zonder internet de bewaarde versie
 const cached=['./','index.html','ouders.html','manifest.webmanifest','ouders.webmanifest','icons/favicon-48.png','icons/icon-192.png','icons/icon-512.png','icons/icon-maskable-512.png','icons/apple-touch-icon.png'];
 fs.writeFileSync(out('sw.js'),`const CACHE='lessenrooster-${Date.now().toString(36)}';
const FILES=${JSON.stringify(cached)};
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET'||new URL(request.url).origin!==location.origin)return;
 // no-cache: altijd bij GitHub nagaan of er een nieuwere versie is (anders kan de browser tot 10 minuten een oude tonen)
 event.respondWith(fetch(request.url,{cache:'no-cache'}).then(response=>{
  if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(request,copy))}
  return response;
 }).catch(()=>caches.match(request,{ignoreSearch:true}).then(hit=>hit||caches.match('index.html'))));
});
`);
}

const months=['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
function longDate(iso,withYear){const [y,m,d]=iso.split('-').map(Number);return `${d} ${months[m-1]}${withYear?' '+y:''}`}
function updatedText(iso){
 if(!iso)return 'nog niet';
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso)).map(x=>[x.type,x.value]));
 return `${longDate(`${p.year}-${p.month}-${p.day}`,true)} om ${p.hour}:${p.minute}`;
}

function variant(base,schedule,{web,parent}){
 const faviconBase64=fs.readFileSync(out('icons','favicon-48.png')).toString('base64');
 const pngBase64=fs.readFileSync(out('icons','apple-touch-icon.png')).toString('base64');
 let s=base;
 s=dropLines(s,web?'data-file-only':'data-web-only');
 s=dropBlock(s,web?'file':'web').replace(/<!--@\/?(web|file)-->\n?/g,'');
 s=dropLines(s,parent?'data-tymo-only':'data-parent-only');
 if(web)s=replaceOnce(s,'const WEB=false;','const WEB=true;');
 else s=replaceOnce(replaceOnce(s,'__FAVICON_PNG__',faviconBase64),'__ICON_PNG__',pngBase64);
 s=fill(s,'__MANIFEST__',parent?'ouders.webmanifest':'manifest.webmanifest');
 s=replaceOnce(s,'__APP_TITLE__',parent?'Rooster Tymo':'Lessenrooster');
 s=replaceOnce(s,'__SUBJECTS__',JSON.stringify(schedule.subjects));
 s=replaceOnce(s,'__WEEKS__',JSON.stringify(schedule.weeks));
 s=replaceOnce(s,'__CHANGES__',JSON.stringify(schedule.changes));
 s=replaceOnce(s,'__HOLIDAYS__',JSON.stringify(schedule.holidays));
 s=fill(s,'__WIDGET__',web&&!parent?JSON.stringify(fs.readFileSync(path.join(src,'widget-loader.js'),'utf8')):'""');
 s=replaceOnce(s,'__SEMESTERS__',JSON.stringify(schedule.semesters));
 s=replaceOnce(s,'__WEATHER__',JSON.stringify(schedule.weather));
 s=fill(s,'__PERIOD__',`${longDate(schedule.firstDate,schedule.firstDate.slice(0,4)!==schedule.lastDate.slice(0,4))} – ${longDate(schedule.lastDate,true)}`);
 s=fill(s,'__UPDATED__',updatedText(schedule.updated));
 if(parent){
  s=replaceOnce(s,'<title>Mijn lessenrooster · PXL</title>','<title>Lessenrooster · PXL</title>');
  s=replaceOnce(s,'<h1>Mijn lessenrooster</h1>','<h1>Lessenrooster</h1>');
  s=replaceOnce(s,'const PARENT=false;','const PARENT=true;');
  s=replaceOnce(s,' Grijs en doorgestreept = een les die je niet volgt.','');
  if(web)s=replaceOnce(s,' Je vinkjes en kleuren gaan mee.','');
 }
 return s;
}
function prerender(html,file){
 const tmp=path.join(path.dirname(file),'tmp-'+path.basename(file));
 fs.writeFileSync(tmp,html);
 let dom;
 try{dom=chromeRun(['--dump-dom',fileUrl(tmp)])}finally{fs.unlinkSync(tmp)}
 if(!dom.includes('class="listday'))throw new Error('Rooster niet gerenderd: '+file);
 dom=dom.replace(/<html\b[^>]*>/,'<html lang="nl" class="static">');
 if(!/^\s*<!doctype/i.test(dom))dom='<!doctype html>\n'+dom;
 fs.writeFileSync(file,dom);
 console.log(path.relative(root,file),Math.round(fs.statSync(file).size/1024)+' kB');
}

async function main(){
 // 1. Rooster bijwerken vanuit TimeEdit (bij een fout: verder met de bewaarde lessen)
 const urlFile=path.join(src,'timeedit-url.txt');
 const url=process.env.TIMEEDIT_URL||(fs.existsSync(urlFile)?fs.readFileSync(urlFile,'utf8').trim():'');
 if(process.env.SKIP_TIMEEDIT)console.log('TimeEdit overgeslagen (SKIP_TIMEEDIT)');
 else if(url){try{await syncFromTimeEdit(url)}catch(err){console.warn('TimeEdit niet bijgewerkt:',err.message)}}
 else console.log('Geen TimeEdit-link ingesteld: bewaarde lessen gebruikt');
 // 2. Iconen, manifests, service worker
 if(process.argv.includes('--icons')||!fs.existsSync(out('icons','apple-touch-icon.png')))buildIcons();
 writeManifestsAndWorker();
 // Gegevens voor de widget (Scriptable): alle lessen met hetzelfde id als in het rooster
 const data=loadSchedule();
 const addDays=(iso,n)=>{const [y,m,d]=iso.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+n)).toISOString().slice(0,10)};
 fs.writeFileSync(out('rooster.json'),JSON.stringify({updated:data.updated,subjects:Object.fromEntries(Object.entries(data.subjects).map(([k,v])=>[k,{name:v.name,short:v.short||v.name.split(/\s+/).map(w=>w[0]).join('').slice(0,4),color:v.color}])),lessons:data.weeks.flatMap(w=>w.events.map(e=>({id:`${w.start}|${e.day}|${e.start}|${e.key}`,date:addDays(w.start,e.day),start:e.start,end:e.end,key:e.key,room:e.room==='Online'?'Online':e.room,...(e.exam?{exam:true}:{})})))}));
 fs.writeFileSync(out('widget.js'),fs.readFileSync(path.join(src,'widget.js'),'utf8').replace('__VERSION__',updatedText(new Date().toISOString()))); // de eigenlijke widget, opgehaald door het opstartscript
 // 3. Pagina's
 fs.mkdirSync(out('bestanden'),{recursive:true});
 const base=fs.readFileSync(path.join(src,'rooster.src.html'),'utf8'),schedule=loadSchedule();
 prerender(variant(base,schedule,{web:true,parent:false}),out('index.html'));
 prerender(variant(base,schedule,{web:true,parent:true}),out('ouders.html'));
 prerender(variant(base,schedule,{web:false,parent:false}),out('bestanden','Lessenrooster_Tymo.html'));
 prerender(variant(base,schedule,{web:false,parent:true}),out('bestanden','Lessenrooster.html'));
}
main().catch(err=>{console.error(err);process.exit(1)});
