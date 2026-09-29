// Haalt het rooster op uit TimeEdit (iCal-abonnement) en voegt het samen met src/rooster-data.json.
// - Lessen vóór het begin van de TimeEdit-periode blijven bewaard (geschiedenis).
// - Binnen de periode geldt TimeEdit, behalve voor vakken met "keepIfMissing" die volledig ontbreken.
// - Regels om lessen weg te laten en de vakken/kleuren staan in src/timeedit-config.json.
const fs=require('fs'),path=require('path');
const config=JSON.parse(fs.readFileSync(path.join(__dirname,'timeedit-config.json'),'utf8'));
const dataFile=path.join(__dirname,'rooster-data.json');

function unescapeText(s){return s.replace(/\\n/gi,'\n').replace(/\\([,;\\])/g,'$1')}
function parseIcs(text){
 const unfolded=text.replace(/\r?\n[ \t]/g,'');
 return unfolded.split('BEGIN:VEVENT').slice(1).map(block=>{
  const field=name=>{const m=block.match(new RegExp(`^${name}(;[^:]*)?:(.*)$`,'m'));return m?{params:m[1]||'',value:m[2].trim()}:null};
  return {start:field('DTSTART'),end:field('DTEND'),summary:unescapeText(field('SUMMARY')?.value||''),location:unescapeText(field('LOCATION')?.value||''),description:unescapeText(field('DESCRIPTION')?.value||'')};
 });
}
const localParts=new Intl.DateTimeFormat('en-CA',{timeZone:config.timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function toLocal(value){
 const utc=new Date(value.replace(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/,'$1-$2-$3T$4:$5:$6Z'));
 const p=Object.fromEntries(localParts.formatToParts(utc).map(x=>[x.type,x.value]));
 return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}`};
}

function findSubject(code,title){
 const lower=title.toLowerCase();
 return config.subjects.find(s=>s.codes.includes(code))||config.subjects.find(s=>s.title&&lower.includes(s.title.toLowerCase()));
}
function isExcluded(lesson){
 return config.exclude.find(rule=>(!rule.code||rule.code===lesson.code)&&(!rule.teacher||lesson.teacher===rule.teacher)&&(!rule.descriptionContains||lesson.notes.toLowerCase().includes(rule.descriptionContains.toLowerCase())));
}

async function syncFromTimeEdit(url){
 const response=await fetch(url);
 if(!response.ok)throw new Error(`TimeEdit gaf HTTP ${response.status}`);
 const text=await response.text();
 if(!text.includes('BEGIN:VCALENDAR'))throw new Error('TimeEdit gaf geen agenda terug');
 const extra={};let extraIndex=0;
 const feed=[],skipped=[];
 for(const ev of parseIcs(text)){
  if(!ev.start||!ev.end||!/T\d{6}Z$/.test(ev.start.value)||!ev.summary)continue; // lege dagmarkeringen overslaan
  const start=toLocal(ev.start.value),end=toLocal(ev.end.value);
  const [code,...rest]=ev.summary.split(' '),title=rest.join(' ')||code;
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
  feed.push({date:lesson.date,start:lesson.start,end:lesson.end,key:subject.key,room,old,teacher:lesson.teacher});
 }
 if(!feed.length)throw new Error('Geen lessen gevonden in TimeEdit; bestaande gegevens blijven behouden');

 const stored=JSON.parse(fs.readFileSync(dataFile,'utf8'));
 const windowStart=feed.reduce((min,l)=>l.date<min?l.date:min,feed[0].date);
 const inFeed=new Set(feed.map(l=>l.key));
 const kept=stored.lessons.filter(l=>l.date<windowStart||(config.subjects.find(s=>s.key===l.key)?.keepIfMissing&&!inFeed.has(l.key)));
 const missing=config.subjects.filter(s=>s.keepIfMissing&&!inFeed.has(s.key)).map(s=>s.name);
 const lessons=[...kept,...feed].sort((a,b)=>(a.date+a.start+a.key).localeCompare(b.date+b.start+b.key));
 const changed=JSON.stringify(lessons)!==JSON.stringify(stored.lessons);
 const result={updated:changed?new Date().toISOString():stored.updated,extraSubjects:Object.values(extra),lessons};
 if(changed||JSON.stringify(stored.extraSubjects||[])!==JSON.stringify(result.extraSubjects))fs.writeFileSync(dataFile,JSON.stringify(result,null,1));
 console.log(`TimeEdit: ${feed.length} lessen vanaf ${windowStart}, ${skipped.length} weggelaten, ${changed?'rooster gewijzigd':'geen wijzigingen'}`);
 skipped.forEach(s=>console.log('  weggelaten:',s));
 if(missing.length)console.log('  let op, ontbreekt in TimeEdit (bekende lessen behouden):',missing.join(', '));
}

// Vakken en weken voor de pagina's
function loadSchedule(){
 const data=JSON.parse(fs.readFileSync(dataFile,'utf8'));
 const subjects={};
 for(const s of [...config.subjects,...(data.extraSubjects||[])])subjects[s.key]={name:s.name,group:s.group||'',color:s.color};
 const dayMs=864e5,toUtc=iso=>{const [y,m,d]=iso.split('-').map(Number);return Date.UTC(y,m-1,d)},isoOf=ms=>new Date(ms).toISOString().slice(0,10);
 const mondayOf=iso=>{const t=toUtc(iso),wd=(new Date(t).getUTCDay()+6)%7;return t-wd*dayMs};
 const isoWeek=monday=>{const thursday=monday+3*dayMs,jan4=Date.UTC(new Date(thursday).getUTCFullYear(),0,4),firstThursday=jan4+(3-(new Date(jan4).getUTCDay()+6)%7)*dayMs;return 1+Math.round((thursday-firstThursday)/(7*dayMs))};
 const lessons=data.lessons.filter(l=>subjects[l.key]);
 const first=mondayOf(lessons[0].date),last=mondayOf(lessons.at(-1).date),weeks=[];
 for(let t=first;t<=last;t+=7*dayMs){
  weeks.push({num:isoWeek(t),start:isoOf(t),end:isoOf(t+4*dayMs),events:lessons.filter(l=>mondayOf(l.date)===t).map(l=>({day:Math.round((toUtc(l.date)-t)/dayMs),start:l.start,end:l.end,key:l.key,room:l.room,old:l.old,teacher:l.teacher||''}))});
 }
 return {subjects,weeks,updated:data.updated,firstDate:lessons[0].date,lastDate:lessons.at(-1).date};
}

module.exports={syncFromTimeEdit,loadSchedule};
