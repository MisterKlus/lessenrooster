// Bouwt de lessenroosters uit src/rooster.src.html, voor elke persoon in PEOPLE:
//  - haalt eerst het rooster op uit TimeEdit (geheim TIMEEDIT_URL / TIMEEDIT_URL_<ID> of een lokaal timeedit-url.txt)
//  - index.html (GitHub Pages: installeerbaar als app, werkt offline), manifest, sw.js, rooster.json en widget.js
//  - voor Tymo ook ouders.html en de losse bestanden in bestanden/ om door te sturen
//  - iconen alleen als ze ontbreken of met --icons (vraagt Windows); iedereen gebruikt dezelfde
// Alle pagina's worden vooraf gerenderd, zodat het rooster ook zichtbaar is zonder JavaScript.
// Gebruik: node src/build.js [--icons]
const fs=require('fs'),path=require('path'),{execFileSync}=require('child_process'),{pathToFileURL}=require('url');
const {timeEdit}=require('./timeedit');
const src=__dirname,root=path.join(src,'..');

// Wie een eigen rooster krijgt. Tymo staat in de hoofdmap; ieder ander in een eigen map (bv. thomas/),
// met vakken en lessen in src/<id>/ en een eigen TimeEdit-link (geheim TIMEEDIT_URL_<ID>).
const PEOPLE=[
 {id:'tymo',name:'Tymo',main:true,program:'Graduaat Programmeren',note:'Weggelaten: het C#-monitoraat, Project management van andere klasgroepen dan 2PROB en Data Expert op dinsdag.'},
 {id:'thomas',name:'Thomas',program:'Elektromechanica',androidApp:'https://github.com/MisterKlus/lessenrooster/releases/download/widget-app-thomas/lessenrooster-widget.apk',note:'Het toont je vakken van het eerste en het tweede jaar, zoals gekozen in TimeEdit.'},
];
const siteDir=p=>p.main?'':p.id; // map op de site
const srcDir=p=>p.main?src:path.join(src,p.id);
const urlEnv=p=>p.main?'TIMEEDIT_URL':'TIMEEDIT_URL_'+p.id.toUpperCase();
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

function writeManifestAndWorker(p){
 // Manifest zonder start_url: zo blijft de link met je keuzes bewaard als je de app toevoegt
 const dir=siteDir(p),up=p.main?'':'../';
 const icons=[{src:up+'icons/icon-192.png',sizes:'192x192',type:'image/png'},{src:up+'icons/icon-512.png',sizes:'512x512',type:'image/png'},{src:up+'icons/icon-maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}];
 const manifestBase={lang:'nl',display:'standalone',background_color:'#f5f7fc',theme_color:'#f5f7fc',icons};
 fs.writeFileSync(out(dir,'manifest.webmanifest'),JSON.stringify({name:p.main?'Mijn lessenrooster':`Lessenrooster ${p.name}`,short_name:'Lessenrooster',description:'Lessenrooster PXL '+p.program,...manifestBase},null,1));
 if(p.main)fs.writeFileSync(out('ouders.webmanifest'),JSON.stringify({name:`Lessenrooster van ${p.name}`,short_name:'Rooster '+p.name,description:`Lessenrooster van ${p.name}, PXL ${p.program}`,start_url:'ouders.html',...manifestBase},null,1));
 // Service worker: eerst het netwerk (roosterwijzigingen komen meteen door), zonder internet de bewaarde versie
 const pages=p.main?['./','index.html','ouders.html','manifest.webmanifest','ouders.webmanifest']:['./','index.html','manifest.webmanifest'];
 const cached=[...pages,...['favicon-48','icon-192','icon-512','icon-maskable-512','apple-touch-icon'].map(name=>`${up}icons/${name}.png`)];
 const prefix=`lessenrooster-${p.id}-`; // elke persoon zijn eigen cache: ze delen dezelfde site
 fs.writeFileSync(out(dir,'sw.js'),`const CACHE='${prefix}${Date.now().toString(36)}';
const FILES=${JSON.stringify(cached)};
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()))});
// Oude versies opruimen (ook de oude naam zonder persoon), niet die van de andere roosters
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE&&(key.startsWith('${prefix}')||/^lessenrooster-[^-]+$/.test(key))).map(key=>caches.delete(key)))).then(()=>self.clients.claim()))});
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

// Agenda-abonnement (rooster.ics): voor Google Agenda en zijn widget op Android.
// Bevat alle lessen van het rooster; wat je in de app uitvinkt, staat alleen op je toestel.
const addDays=(iso,n)=>{const [y,m,d]=iso.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+n)).toISOString().slice(0,10)};
function calendarIcs(p,schedule){
 const esc=s=>String(s).replace(/[\\,;]/g,m=>'\\'+m).replace(/\n/g,'\\n');
 const fold=line=>line.length<=74?line:line.match(/.{1,73}/g).join('\r\n '); // regels van hoogstens 75 tekens
 const local=(iso,time)=>iso.replace(/-/g,'')+'T'+time.replace(':','')+'00';
 const stamp=new Date(schedule.updated||Date.now()).toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z');
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Lessenrooster//NL','CALSCALE:GREGORIAN','METHOD:PUBLISH',
  'X-WR-CALNAME:'+esc('Lessenrooster '+p.name),'X-WR-TIMEZONE:Europe/Brussels','X-PUBLISHED-TTL:PT6H',
  'BEGIN:VTIMEZONE','TZID:Europe/Brussels',
  'BEGIN:DAYLIGHT','TZOFFSETFROM:+0100','TZOFFSETTO:+0200','TZNAME:CEST','DTSTART:19700329T020000','RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU','END:DAYLIGHT',
  'BEGIN:STANDARD','TZOFFSETFROM:+0200','TZOFFSETTO:+0100','TZNAME:CET','DTSTART:19701025T030000','RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU','END:STANDARD',
  'END:VTIMEZONE'];
 for(const w of schedule.weeks)for(const e of w.events){
  const date=addDays(w.start,e.day);
  lines.push('BEGIN:VEVENT',`UID:${p.id}-${date}-${e.start.replace(':','')}-${e.key}@misterklus.github.io`,'DTSTAMP:'+stamp,
   `DTSTART;TZID=Europe/Brussels:${local(date,e.start)}`,`DTEND;TZID=Europe/Brussels:${local(date,e.end)}`,
   'SUMMARY:'+esc(schedule.subjects[e.key].name+(e.exam?' (examen)':'')),
   'LOCATION:'+esc(e.room+(e.old&&e.room!=='Online'?` (${e.old})`:'')),
   ...(e.teacher?['DESCRIPTION:'+esc(e.teacher)]:[]),'END:VEVENT');
 }
 lines.push('END:VCALENDAR');
 return lines.map(fold).join('\r\n')+'\r\n';
}

const months=['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
function longDate(iso,withYear){const [y,m,d]=iso.split('-').map(Number);return `${d} ${months[m-1]}${withYear?' '+y:''}`}
function updatedText(iso){
 if(!iso)return 'nog niet';
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso)).map(x=>[x.type,x.value]));
 return `${longDate(`${p.year}-${p.month}-${p.day}`,true)} om ${p.hour}:${p.minute}`;
}

function variant(base,schedule,p,{web,parent}){
 const faviconBase64=fs.readFileSync(out('icons','favicon-48.png')).toString('base64');
 const pngBase64=fs.readFileSync(out('icons','apple-touch-icon.png')).toString('base64');
 let s=base;
 s=dropLines(s,web?'data-file-only':'data-web-only');
 s=dropBlock(s,web?'file':'web').replace(/<!--@\/?(web|file)-->\n?/g,'');
 s=dropLines(s,parent?'data-tymo-only':'data-parent-only');
 if(web)s=replaceOnce(s,'const WEB=false;','const WEB=true;');
 else s=replaceOnce(replaceOnce(s,'__FAVICON_PNG__',faviconBase64),'__ICON_PNG__',pngBase64);
 s=fill(s,'__MANIFEST__',parent?'ouders.webmanifest':'manifest.webmanifest');
 if(!p.main)s=fill(s,'href="icons/','href="../icons/'); // iconen staan in de hoofdmap
 s=replaceOnce(s,'__APP_TITLE__',parent?'Rooster '+p.name:'Lessenrooster');
 s=replaceOnce(s,'__PERSON__',JSON.stringify({id:p.id,name:p.name}));
 s=fill(s,'__NAME__',p.name);
 s=fill(s,'__PROGRAM__',p.program);
 s=fill(s,'__NOTE__',p.note);
 // Eigen Android widget-app (android/): downloadknop in het widgetvenster, anders alleen Google Agenda
 s=p.androidApp?fill(s,'__ANDROID_APP__',p.androidApp).replace(/<!--@\/?androidapp-->/g,''):dropBlock(s,'androidapp');
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
 if(process.argv.includes('--icons')||!fs.existsSync(out('icons','apple-touch-icon.png')))buildIcons();
 const base=fs.readFileSync(path.join(src,'rooster.src.html'),'utf8');
 for(const p of PEOPLE){
  console.log(`\n${p.name}`);
  const te=timeEdit(srcDir(p)),dir=siteDir(p);
  // 1. Rooster bijwerken vanuit TimeEdit (bij een fout: verder met de bewaarde lessen)
  const urlFile=path.join(srcDir(p),'timeedit-url.txt');
  const url=process.env[urlEnv(p)]||(fs.existsSync(urlFile)?fs.readFileSync(urlFile,'utf8').trim():'');
  if(process.env.SKIP_TIMEEDIT)console.log('TimeEdit overgeslagen (SKIP_TIMEEDIT)');
  else if(url){try{await te.syncFromTimeEdit(url)}catch(err){console.warn('TimeEdit niet bijgewerkt:',err.message)}}
  else console.log(`Geen TimeEdit-link ingesteld (${urlEnv(p)}): bewaarde lessen gebruikt`);
  const schedule=te.loadSchedule();
  if(!schedule){console.warn('Nog geen lessen: dit rooster wordt overgeslagen');continue}
  // 2. Manifest en service worker
  fs.mkdirSync(out(dir),{recursive:true});
  writeManifestAndWorker(p);
  // Gegevens voor de widget (Scriptable): alle lessen met hetzelfde id als in het rooster
  fs.writeFileSync(out(dir,'rooster.json'),JSON.stringify({updated:schedule.updated,subjects:Object.fromEntries(Object.entries(schedule.subjects).map(([k,v])=>[k,{name:v.name,short:v.short||v.name.split(/\s+/).map(w=>w[0]).join('').slice(0,4),color:v.color}])),lessons:schedule.weeks.flatMap(w=>w.events.map(e=>({id:`${w.start}|${e.day}|${e.start}|${e.key}`,date:addDays(w.start,e.day),start:e.start,end:e.end,key:e.key,room:e.room==='Online'?'Online':e.room,...(e.exam?{exam:true}:{})})))}));
  fs.writeFileSync(out(dir,'widget.js'),fs.readFileSync(path.join(src,'widget.js'),'utf8').replace('__VERSION__',updatedText(new Date().toISOString()))); // de eigenlijke widget, opgehaald door het opstartscript
  fs.writeFileSync(out(dir,'rooster.ics'),calendarIcs(p,schedule)); // agenda-abonnement, voor de widget van Google Agenda (Android)
  // 3. Pagina's
  prerender(variant(base,schedule,p,{web:true,parent:false}),out(dir,'index.html'));
  if(!p.main)continue;
  prerender(variant(base,schedule,p,{web:true,parent:true}),out('ouders.html'));
  fs.mkdirSync(out('bestanden'),{recursive:true});
  prerender(variant(base,schedule,p,{web:false,parent:false}),out('bestanden',`Lessenrooster_${p.name}.html`));
  prerender(variant(base,schedule,p,{web:false,parent:true}),out('bestanden','Lessenrooster.html'));
 }
}
main().catch(err=>{console.error(err);process.exit(1)});
