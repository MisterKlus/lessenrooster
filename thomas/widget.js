// LESSENROOSTER_WIDGET — de eigenlijke widget voor Scriptable (iPhone).
// Wordt gestart door het opstartscript (src/widget-loader.js) dat je in Scriptable plakt:
// dat geeft SITE (adres van het rooster) en SKIP (lessen die je niet volgt) mee.
// Toont je les van nu met een voortgangsbalkje (of -ring) en de volgende les.
// Werkt op het beginscherm (klein, middel, groot) en op het vergrendelscherm.
//
// iOS bepaalt zelf wanneer een widget opnieuw getekend wordt, met een beperkt aantal keer per dag.
// Daarom: aftellen met tekst die iOS zelf elke minuut bijwerkt, op het vergrendelscherm vaste uren
// ("tot 11:45") die niet verouderen, en zo weinig mogelijk vragen om opnieuw te tekenen.

const VERSION = "30 september 2026 om 10:56"; // ingevuld door src/build.js
const DATA_URL = SITE + "rooster.json?t=" + Date.now(); // altijd de verse versie, niet uit de cache
const DATA_MAX_AGE = 60; // minuten: het rooster verandert hoogstens 's nachts, dus niet elke keer ophalen
console.log("Lessenrooster-widget, versie " + VERSION);
const SKIPSET = new Set(SKIP || []);

const bg = Color.dynamic(new Color("#ffffff"), new Color("#182236"));
const ink = Color.dynamic(new Color("#17223b"), new Color("#e6eaf4"));
const muted = Color.dynamic(new Color("#65718a"), new Color("#9aa6bf"));
const accent = Color.dynamic(new Color("#7c4ddb"), new Color("#a07cf0"));
const days = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];

async function loadData() {
  const fm = FileManager.local();
  const cache = fm.joinPath(fm.documentsDirectory(), "lessenrooster-cache-" + SITE.replace(/[^a-z0-9]+/gi, "-") + ".json"); // per rooster
  const cached = fm.fileExists(cache);
  if (cached && config.runsInWidget && Date.now() - fm.modificationDate(cache) < DATA_MAX_AGE * 60000) return JSON.parse(fm.readString(cache));
  try {
    const req = new Request(DATA_URL);
    req.timeoutInterval = 8; // een trage verbinding mag de widget niet blokkeren
    const data = await req.loadJSON();
    fm.writeString(cache, JSON.stringify(data));
    return data;
  } catch (e) {
    return cached ? JSON.parse(fm.readString(cache)) : null;
  }
}

function at(date, time) {
  const [y, m, d] = date.split("-").map(Number), [h, mi] = time.split(":").map(Number);
  return new Date(y, m - 1, d, h, mi);
}
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function dayLabel(date, now) {
  const diff = Math.round((startOfDay(date) - startOfDay(now)) / 864e5);
  return diff === 0 ? "Vandaag" : diff === 1 ? "Morgen" : days[date.getDay()][0].toUpperCase() + days[date.getDay()].slice(1);
}

// Dun afgerond balkje: grijs spoor, gevuld in de kleur van het vak
function progressBar(pct, width, color) {
  const h = 4, ctx = new DrawContext();
  ctx.size = new Size(width, h); ctx.opaque = false; ctx.respectScreenScale = true;
  const track = new Path(); track.addRoundedRect(new Rect(0, 0, width, h), h / 2, h / 2);
  ctx.addPath(track); ctx.setFillColor(new Color("#8a94a5", 0.3)); ctx.fillPath();
  const fill = new Path(); fill.addRoundedRect(new Rect(0, 0, Math.max(h, width * pct), h), h / 2, h / 2);
  ctx.addPath(fill); ctx.setFillColor(color); ctx.fillPath();
  return ctx.getImage();
}
// Ring met tekst in het midden, als één afbeelding voor het ronde vergrendelscherm-widget
// (iOS kleurt die zelf in; achtergrondafbeeldingen werken daar niet altijd)
function progressRing(pct, size, label, sub) {
  const line = 5, r = size / 2 - line / 2, c = size / 2, ctx = new DrawContext();
  ctx.size = new Size(size, size); ctx.opaque = false; ctx.respectScreenScale = true; ctx.setLineWidth(line);
  const arc = (to) => {
    const p = new Path(), steps = Math.max(2, Math.round(72 * to));
    for (let i = 0; i <= steps; i++) {
      const a = -Math.PI / 2 + 2 * Math.PI * to * i / steps, pt = new Point(c + r * Math.cos(a), c + r * Math.sin(a));
      if (i) p.addLine(pt); else p.move(pt);
    }
    return p;
  };
  ctx.addPath(arc(1)); ctx.setStrokeColor(new Color("#ffffff", 0.25)); ctx.strokePath();
  if (pct > 0) { ctx.addPath(arc(pct)); ctx.setStrokeColor(Color.white()); ctx.strokePath(); }
  ctx.setTextColor(Color.white()); ctx.setTextAlignedCenter();
  ctx.setFont(Font.semiboldSystemFont(label.length > 3 ? 13 : 15));
  ctx.drawTextInRect(label, new Rect(4, c - 17, size - 8, 20));
  if (sub) { ctx.setFont(Font.systemFont(11)); ctx.drawTextInRect(sub, new Rect(4, c + 2, size - 8, 16)); }
  return ctx.getImage();
}

const now = new Date();
const data = await loadData();
const family = config.widgetFamily || "medium";
const widget = new ListWidget();
widget.backgroundColor = bg;
widget.url = SITE;

if (!data) {
  addText(widget, "Lessenrooster", 13, accent, true);
  addText(widget, "Nog geen verbinding. Open de widget later opnieuw.", 12, muted);
} else {
  const lessons = data.lessons
    .filter(l => !SKIPSET.has(l.id))
    .map(l => ({ ...l, s: at(l.date, l.start), e: at(l.date, l.end), name: data.subjects[l.key]?.name || l.key, short: data.subjects[l.key]?.short || (data.subjects[l.key]?.name || l.key).slice(0, 4), color: data.subjects[l.key]?.color || "#7c4ddb" }))
    .sort((a, b) => a.s - b.s);
  const current = lessons.find(l => l.s <= now && now < l.e);
  const next = lessons.find(l => l.s > now);
  const focus = current || next;
  const pct = current ? (now - current.s) / (current.e - current.s) : 0;
  const isToday = focus && dayLabel(focus.s, now) === "Vandaag";
  // Vrije dag (of alle lessen van vandaag uitgevinkt): zeg dat erbij, zodat de volgende les niet op vandaag lijkt
  const weekend = now.getDay() === 0 || now.getDay() === 6;
  const freeToday = !lessons.some(l => startOfDay(l.s).getTime() === startOfDay(now).getTime());
  const dayShort = focus ? days[focus.s.getDay()].slice(0, 2) : "";
  const label = !focus ? "" : current ? "Nu" : isToday ? "Straks" : weekend ? "Weekend · " + dayLabel(next.s, now).toLowerCase()
    : freeToday ? "Vandaag vrij · " + dayLabel(next.s, now).toLowerCase()
    : dayLabel(next.s, now);
  // Aftellen: iOS werkt de tijd zelf bij ("nog 45 min", "over 12 min"); voor een andere dag gewoon de datum
  const when = !focus ? null : current ? { prefix: "nog", date: current.e } : isToday ? { prefix: "over", date: next.s } : { text: next.s.getDate() + "/" + (next.s.getMonth() + 1) };

  if (family === "accessoryInline") {
    widget.addText(focus ? (current ? "Nu " + focus.name + " · tot " + focus.end : (isToday ? "" : dayShort + " ") + focus.start + " " + focus.name + " · " + focus.room) : "Geen lessen gepland");
  } else if (family === "accessoryCircular") {
    // Bovenaan het vak (kort), eronder het einduur of het beginuur: klopt ook als iOS de widget later hertekent
    const time = current ? "tot " + focus.end : focus ? (isToday ? "" : dayShort + " ") + focus.start : "";
    widget.setPadding(0, 0, 0, 0);
    const img = widget.addImage(progressRing(pct, 72, focus ? focus.short : "–", time));
    img.imageSize = new Size(72, 72); img.centerAlignImage();
  } else if (family === "accessoryRectangular") {
    if (!focus) addText(widget, "Geen lessen gepland", 13, ink, true);
    else {
      addText(widget, current ? "Nu · tot " + focus.end : isToday ? "Straks · " + focus.start + "–" + focus.end : label + " · " + focus.start, 12, ink, false, 1);
      addText(widget, focus.name, 14, ink, true);
      if (current) { widget.addSpacer(3); const img = widget.addImage(progressBar(pct, 130, Color.white())); img.imageSize = new Size(130, 4); }
      else addText(widget, focus.room, 12, ink);
    }
  } else if (!focus) {
    addText(widget, "Lessenrooster", 12, accent, true);
    widget.addSpacer(6);
    addText(widget, "Geen lessen meer gepland in dit rooster.", 13, muted);
  } else if (family === "small") {
    lessonBlock(widget, focus, label, when, true, pct);
  } else {
    // Links de les van nu of de volgende les, rechts de rest van die dag
    const row = widget.addStack(); row.topAlignContent();
    const main = row.addStack(); main.layoutVertically();
    lessonBlock(main, focus, label, when, false, pct);
    row.addSpacer(12);
    const side = row.addStack(); side.layoutVertically();
    const day = startOfDay(focus.s).getTime();
    const later = lessons.filter(l => l !== focus && l.s > focus.s && startOfDay(l.s).getTime() === day).slice(0, family === "large" ? 6 : 3);
    addText(side, later.length ? "Daarna" : "Daarna vrij", 12, muted, true);
    side.addSpacer(4);
    for (const l of later) addText(side, l.start + "  " + l.name, 13, ink, false, 1);
  }
  // Opnieuw tekenen bij het begin of einde van een les, en tijdens een les elke 15 min voor het balkje.
  // Niet vaker: iOS geeft een widget maar een beperkt aantal beurten per dag en slaat er anders over.
  const changes = [current?.e, next?.s, new Date(now.getTime() + (current ? 15 : 60) * 60000)].filter(Boolean);
  widget.refreshAfterDate = new Date(Math.min(...changes.map(d => d.getTime())));
}

function lessonBlock(parent, l, label, when, small, pct) {
  if (small) {
    addText(parent, label, 12, accent, true);
    parent.addSpacer(4);
    addText(parent, l.name, 15, ink, true, 2);
    parent.addSpacer(2);
    addText(parent, l.start + "–" + l.end, 13, muted);
    addText(parent, l.room, 13, muted);
    parent.addSpacer();
    addWhen(parent, "", when, 12, accent);
    if (pct > 0) { parent.addSpacer(4); const img = parent.addImage(progressBar(pct, 120, new Color(l.color))); img.imageSize = new Size(120, 4); }
    return;
  }
  const line = parent.addStack();
  const bar = line.addStack();
  bar.size = new Size(4, 58); bar.cornerRadius = 2; bar.backgroundColor = new Color(l.color);
  line.addSpacer(8);
  const text = line.addStack(); text.layoutVertically();
  addWhen(text, label + " · ", when, 12, accent);
  text.addSpacer(2);
  addText(text, l.name, 15, ink, true, 2);
  addText(text, l.start + "–" + l.end + " · " + l.room, 13, muted);
  if (pct > 0) { text.addSpacer(6); const img = text.addImage(progressBar(pct, 140, new Color(l.color))); img.imageSize = new Size(140, 4); }
}

// Eén regel met vaste tekst en eventueel een tijd die iOS zelf bijwerkt ("over 12 min")
function addWhen(parent, lead, when, size, color) {
  const row = parent.addStack(); row.centerAlignContent();
  addText(row, lead + (when.date ? when.prefix + " " : when.text), size, color, true, 1);
  if (when.date) {
    const d = row.addDate(when.date);
    d.applyRelativeStyle(); d.font = Font.semiboldSystemFont(size); d.textColor = color; d.lineLimit = 1;
  }
}

function addText(parent, value, size, color, bold, lines) {
  const t = parent.addText(String(value));
  t.font = bold ? Font.semiboldSystemFont(size) : Font.systemFont(size);
  t.textColor = color;
  if (lines) t.lineLimit = lines;
  return t;
}

if (config.runsInWidget) Script.setWidget(widget);
else await widget.presentMedium();
Script.complete();
