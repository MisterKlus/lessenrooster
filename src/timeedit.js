// Haalt een rooster op uit TimeEdit (iCal-abonnement) en voegt het samen met het bewaarde rooster (rooster-data.json).
// - Lessen vóór het begin van de TimeEdit-periode blijven bewaard (geschiedenis).
// - Binnen de periode geldt TimeEdit, behalve voor vakken met "keepIfMissing" die volledig ontbreken.
// - Vakken, kleuren en regels om lessen weg te laten staan per persoon in timeedit-config.json.
//   Kalender, weer en examenherkenning zijn voor iedereen dezelfde: die komen uit src/timeedit-config.json.
const fs=require('fs'),path=require('path');
const shared=JSON.parse(fs.readFileSync(path.join(__dirname,'timeedit-config.json'),'utf8'));
const CHANGE_DAYS=7; // zo lang blijft het label "Gewijzigd" zichtbaar

function unescapeText(s){return s.replace(/\\n/gi,'\n').replace(/\\([,;\\])/g,'$1')}
function parseIcs(text){
 const unfolded=text.replace(/\r?\n[ \t]/g,'');
 return unfolded.split('BEGIN:VEVENT').slice(1).map(block=>{
  const field=name=>{const m=block.match(new RegExp(`^${name}(;[^:]*)?:(.*)$`,'m'));return m?{params:m[1]||'',value:m[2].trim()}:null};
  return {uid:field('UID')?.value||'',start:field('DTSTART'),end:field('DTEND'),summary:unescapeText(field('SUMMARY')?.value||''),location:unescapeText(field('LOCATION')?.value||''),description:unescapeText(field('DESCRIPTION')?.value||'')};
 });
}
const localParts=new Intl.DateTimeFormat('en-CA',{timeZone:shared.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function toLocal(value){
 const utc=new Date(value.replace(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/,'$1-$2-$3T$4:$5:$6Z'));
 const p=Object.fromEntries(localParts.formatToParts(utc).map(x=>[x.type,x.value]));
 return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`};
}
function todayLocal(){return toLocal(new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z')).date}
function isStillRelevant(change){return change.date>=todayLocal()&&Date.now()-new Date(change.detected)<CHANGE_DAYS*864e5}

// Wijzigingen tussen de vorige en de nieuwe versie: ander lokaal/uur, nieuwe les of les die vervalt.
// Alleen vanaf vandaag en binnen de periode die beide versies kennen (zodat een langer TimeEdit-venster
// geen stapel "nieuwe lessen" oplevert).
function detectChanges(before,after,windowStart){
 const maxDate=list=>list.reduce((max,l)=>l.date>max?l.date:max,'');
 const from=[windowStart,todayLocal()].sort()[1],to=[maxDate(before),maxDate(after)].sort()[0];
 const afterKeys=new Set(after.map(l=>l.key));
 const inRange=l=>l.date>=from&&l.date<=to&&afterKeys.has(l.key);
 const groups={};
 for(const l of before.filter(inRange))(groups[l.date+'|'+l.key]??={before:[],after:[]}).before.push(l);
 for(const l of after.filter(inRange))(groups[l.date+'|'+l.key]??={before:[],after:[]}).after.push(l);
 const detected=new Date().toISOString(),out=[];
 const record=(kind,l,was)=>out.push({kind,date:l.date,key:l.key,start:l.start,end:l.end,room:l.room,old:l.old,was:was?{start:was.start,end:was.end,room:was.room,old:was.old}:null,detected});
 for(const {before:olds,after:news} of Object.values(groups)){
  const restOld=[...olds],restNew=[];
  for(const n of news){ // zelfde uur: hoogstens een ander lokaal
   const i=restOld.findIndex(o=>o.start===n.start&&o.end===n.end);
   if(i<0){restNew.push(n);continue}
   const o=restOld.splice(i,1)[0];
   if(o.room!==n.room)record('changed',n,o);
  }
  restNew.forEach((n,i)=>{if(restOld[i])record('changed',n,restOld[i]);else record('new',n)}); // ander uur
  restOld.slice(restNew.length).forEach(o=>record('cancelled',o));
 }
 return out;
}

// TimeEdit-koppeling voor één persoon: dir bevat timeedit-config.json en rooster-data.json
function timeEdit(dir){
 const config={...shared,...JSON.parse(fs.readFileSync(path.join(dir,'timeedit-config.json'),'utf8'))};
 const dataFile=path.join(dir,'rooster-data.json');

 function findSubject(code,title){
  const lower=title.toLowerCase();
  return config.subjects.find(s=>s.codes.includes(code))||config.subjects.find(s=>s.title&&lower.includes(s.title.toLowerCase()));
 }
 const dayName=iso=>['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'][new Date(iso+'T12:00:00Z').getUTCDay()];
 function isExcluded(lesson){
  return config.exclude.find(rule=>(!rule.code||rule.code===lesson.code)&&(!rule.teacher||lesson.teacher===rule.teacher)&&(!rule.day||dayName(lesson.date)===rule.day)&&(!rule.descriptionContains||lesson.notes.toLowerCase().includes(rule.descriptionContains.toLowerCase())));
 }

 // links: één of meer TimeEdit-links (gescheiden door een spatie of nieuwe regel). Past niet alles in één
 // TimeEdit-selectie, dan worden de links samengevoegd; lessen die in meer links staan tellen één keer (zelfde UID).
 async function syncFromTimeEdit(links){
  const events=new Map(),urls=links.split(/\s+/).filter(Boolean);
  for(const url of urls){ // lukt één link niet, dan niets bijwerken (anders lijken die lessen te vervallen)
   const response=await fetch(url);
   if(!response.ok)throw new Error(`TimeEdit gaf HTTP ${response.status}`);
   const text=await response.text();
   if(!text.includes('BEGIN:VCALENDAR'))throw new Error('TimeEdit gaf geen agenda terug');
   for(const ev of parseIcs(text))events.set(ev.uid||`${ev.start?.value}|${ev.summary}`,ev);
  }
  const extra={};let extraIndex=0;
  const feed=[],skipped=[];
  for(const ev of events.values()){
   if(!ev.start||!ev.end||!/T\d{6}Z$/.test(ev.start.value)||!ev.summary)continue; // lege dagmarkeringen overslaan
   const start=toLocal(ev.start.value),end=toLocal(ev.end.value);
   // Gedeelde lessen staan er soms meermaals in ("11EMA1190 Mechanische machines 1, 11EMA1190 ..."): de eerste telt
   const [code,...rest]=ev.summary.split(/,\s*(?=[0-9A-Z]{6,}\s)/)[0].split(' '),title=rest.join(' ')||code;
   const lines=ev.description.split('\n').map(l=>l.trim()).filter(l=>l&&!/^ID \d+$/.test(l));
   const loc=ev.location.match(/Nieuwe lokaalnaam:\s*(.*?)\.\s*Oude lokaalnaam:\s*(.*)$/);
   let room=loc?loc[1].trim():ev.location.trim(),old=loc?loc[2].trim():'';
   if(/online/i.test(room)){old=room.replace(/^\*/,'');room='Online'}
   const lesson={date:start.date,start:start.time,end:end.time,code,title,room,old,teacher:lines[0]||'',notes:lines.slice(1).join(' ')};
   const rule=isExcluded(lesson);
   if(rule){skipped.push(`${lesson.date} ${lesson.start} ${title} (${rule.reason})`);continue}
   let subject=findSubject(code,title);
   if(!subject){ // nieuw vak: automatisch toevoegen met een eigen kleur
    subject=extra[code]||(extra[code]={key:code.toLowerCase(),codes:[code],name:title,group:'',color:config.extraColors[extraIndex++%config.extraColors.length]});
   }
   const exam=new RegExp(config.examPattern||'examen','i').test(`${ev.summary} ${ev.description}`); // examens krijgen een eigen stijl
   feed.push({date:lesson.date,start:lesson.start,end:lesson.end,key:subject.key,room,old,teacher:lesson.teacher,...(lesson.notes?{note:lesson.notes}:{}),...(exam?{exam:true}:{})}); // note: extra regel uit TimeEdit, bv. "PE-test Uitbreiding Atrium"
  }
  if(!feed.length)throw new Error('Geen lessen gevonden in TimeEdit; bestaande gegevens blijven behouden');

  const stored=JSON.parse(fs.readFileSync(dataFile,'utf8'));
  const windowStart=feed.reduce((min,l)=>l.date<min?l.date:min,feed[0].date);
  const inFeed=new Set(feed.map(l=>l.key));
  const kept=stored.lessons.filter(l=>l.date<windowStart||(config.subjects.find(s=>s.key===l.key)?.keepIfMissing&&!inFeed.has(l.key)));
  const missing=config.subjects.filter(s=>s.keepIfMissing&&!inFeed.has(s.key)).map(s=>s.name);
  const lessons=[...kept,...feed].sort((a,b)=>(a.date+a.start+a.key).localeCompare(b.date+b.start+b.key));
  const changed=JSON.stringify(lessons)!==JSON.stringify(stored.lessons);
  const found=changed?detectChanges(stored.lessons,feed,windowStart):[];
  const changes=[...(stored.changes||[]).filter(isStillRelevant),...found];
  const result={updated:changed?new Date().toISOString():stored.updated,extraSubjects:Object.values(extra),changes,lessons};
  if(changed||JSON.stringify(stored.extraSubjects||[])!==JSON.stringify(result.extraSubjects)||JSON.stringify(stored.changes||[])!==JSON.stringify(changes))fs.writeFileSync(dataFile,JSON.stringify(result,null,1));
  console.log(`TimeEdit: ${feed.length} lessen vanaf ${windowStart} (${urls.length} ${urls.length===1?'link':'links'}), ${skipped.length} weggelaten, ${changed?'rooster gewijzigd':'geen wijzigingen'}`);
  found.forEach(c=>console.log(`  ${c.kind}: ${c.date} ${c.start} ${c.key}${c.was?` (was ${c.was.start} ${c.was.room})`:''}`));
  skipped.forEach(s=>console.log('  weggelaten:',s));
  if(missing.length)console.log('  let op, ontbreekt in TimeEdit (bekende lessen behouden):',missing.join(', '));
 }

 // Vakken en weken voor de pagina's (null als er nog geen lessen zijn)
 function loadSchedule(){
  const data=JSON.parse(fs.readFileSync(dataFile,'utf8'));
  const subjects={};
  for(const s of [...config.subjects,...(data.extraSubjects||[])])subjects[s.key]={name:s.name,group:s.group||'',color:s.color,short:s.short||''};
  const dayMs=864e5,toUtc=iso=>{const [y,m,d]=iso.split('-').map(Number);return Date.UTC(y,m-1,d)},isoOf=ms=>new Date(ms).toISOString().slice(0,10);
  const mondayOf=iso=>{const t=toUtc(iso),wd=(new Date(t).getUTCDay()+6)%7;return t-wd*dayMs};
  const isoWeek=monday=>{const thursday=monday+3*dayMs,jan4=Date.UTC(new Date(thursday).getUTCFullYear(),0,4),firstThursday=jan4+(3-(new Date(jan4).getUTCDay()+6)%7)*dayMs;return 1+Math.round((thursday-firstThursday)/(7*dayMs))};
  const lessons=data.lessons.filter(l=>subjects[l.key]);
  if(!lessons.length)return null;
  const first=mondayOf(lessons[0].date),last=mondayOf(lessons.at(-1).date),weeks=[];
  for(let t=first;t<=last;t+=7*dayMs){
   weeks.push({num:isoWeek(t),start:isoOf(t),end:isoOf(t+4*dayMs),events:lessons.filter(l=>mondayOf(l.date)===t).map(l=>({day:Math.round((toUtc(l.date)-t)/dayMs),start:l.start,end:l.end,key:l.key,room:l.room,old:l.old,teacher:l.teacher||'',...(l.note?{note:l.note}:{}),...(l.exam?{exam:true}:{})}))});
  }
  return {subjects,weeks,updated:data.updated,firstDate:lessons[0].date,lastDate:lessons.at(-1).date,changes:(data.changes||[]).filter(isStillRelevant),holidays:config.holidays||[],semesters:config.semesters||[],weather:config.weather||null};
 }

 return {syncFromTimeEdit,loadSchedule};
}

module.exports={timeEdit};
