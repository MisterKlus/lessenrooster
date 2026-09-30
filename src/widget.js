// Lessenrooster-widget voor Scriptable (iPhone)
// Toont je les van nu en de volgende les. Werkt op het beginscherm (klein, middel, groot)
// en op het vergrendelscherm. Zonder internet gebruikt hij de laatst opgehaalde versie.
// Gemaakt op __CREATED__. Vink je in je rooster lessen aan of uit? Kopieer het script dan opnieuw.

const SITE = "__SITE__";
const DATA_URL = SITE + "rooster.json";
const SKIP = new Set(__SKIP__); // lessen die je niet volgt

const bg = Color.dynamic(new Color("#ffffff"), new Color("#182236"));
const ink = Color.dynamic(new Color("#17223b"), new Color("#e6eaf4"));
const muted = Color.dynamic(new Color("#65718a"), new Color("#9aa6bf"));
const accent = Color.dynamic(new Color("#7c4ddb"), new Color("#a07cf0"));
const days = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];

async function loadData() {
  const fm = FileManager.local();
  const cache = fm.joinPath(fm.documentsDirectory(), "lessenrooster-cache.json");
  try {
    const data = await new Request(DATA_URL).loadJSON();
    fm.writeString(cache, JSON.stringify(data));
    return data;
  } catch (e) {
    if (fm.fileExists(cache)) return JSON.parse(fm.readString(cache));
    return null;
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
function duration(ms) {
  const m = Math.max(1, Math.round(ms / 60000));
  return m < 60 ? m + " min" : Math.floor(m / 60) + " u" + (m % 60 ? " " + (m % 60) + " min" : "");
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
    .filter(l => !SKIP.has(l.id))
    .map(l => ({ ...l, s: at(l.date, l.start), e: at(l.date, l.end), name: data.subjects[l.key]?.name || l.key, color: data.subjects[l.key]?.color || "#7c4ddb" }))
    .sort((a, b) => a.s - b.s);
  const current = lessons.find(l => l.s <= now && now < l.e);
  const next = lessons.find(l => l.s > now);
  const focus = current || next;
  const label = !focus ? "" : current ? "Nu" : dayLabel(next.s, now) === "Vandaag" ? "Straks" : dayLabel(next.s, now);
  const when = !focus ? "" : current ? "nog " + duration(current.e - now) : dayLabel(next.s, now) === "Vandaag" ? "over " + duration(next.s - now) : next.s.getDate() + "/" + (next.s.getMonth() + 1);

  if (family === "accessoryInline") {
    widget.addText(focus ? focus.start + " " + focus.name + " · " + focus.room : "Geen lessen gepland");
  } else if (family === "accessoryCircular") {
    const stack = widget.addStack(); stack.layoutVertically(); stack.centerAlignContent();
    addText(stack, focus ? (current ? "nu" : focus.start) : "–", 14, ink, true);
  } else if (family === "accessoryRectangular") {
    if (!focus) addText(widget, "Geen lessen gepland", 13, ink, true);
    else {
      addText(widget, label + " · " + focus.start + "–" + focus.end, 12, ink);
      addText(widget, focus.name, 14, ink, true);
      addText(widget, focus.room, 12, ink);
    }
  } else if (!focus) {
    addText(widget, "Lessenrooster", 12, accent, true);
    widget.addSpacer(6);
    addText(widget, "Geen lessen meer gepland in dit rooster.", 13, muted);
  } else if (family === "small") {
    lessonBlock(widget, focus, label, when, true);
  } else {
    // Links de les van nu of de volgende les, rechts de rest van die dag
    const row = widget.addStack(); row.topAlignContent();
    const main = row.addStack(); main.layoutVertically();
    lessonBlock(main, focus, label, when, false);
    row.addSpacer(12);
    const side = row.addStack(); side.layoutVertically();
    const day = startOfDay(focus.s).getTime();
    const later = lessons.filter(l => l !== focus && l.s > focus.s && startOfDay(l.s).getTime() === day).slice(0, family === "large" ? 6 : 3);
    addText(side, later.length ? "Daarna" : "Daarna vrij", 12, muted, true);
    side.addSpacer(4);
    for (const l of later) addText(side, l.start + "  " + l.name, 13, ink, false, 1);
  }
  // Opnieuw tekenen zodra er iets verandert (einde van de les, begin van de volgende) of na 30 min
  const changes = [current?.e, next?.s, new Date(now.getTime() + 30 * 60000)].filter(Boolean);
  widget.refreshAfterDate = new Date(Math.min(...changes.map(d => d.getTime())));
}

function lessonBlock(parent, l, label, when, small) {
  if (small) {
    addText(parent, label, 12, accent, true);
    parent.addSpacer(4);
    addText(parent, l.name, 15, ink, true, 2);
    parent.addSpacer(2);
    addText(parent, l.start + "–" + l.end, 13, muted);
    addText(parent, l.room, 13, muted);
    parent.addSpacer();
    addText(parent, when, 12, accent, true);
    return;
  }
  const line = parent.addStack();
  const bar = line.addStack();
  bar.size = new Size(4, 58); bar.cornerRadius = 2; bar.backgroundColor = new Color(l.color);
  line.addSpacer(8);
  const text = line.addStack(); text.layoutVertically();
  addText(text, label + " · " + when, 12, accent, true);
  text.addSpacer(2);
  addText(text, l.name, 15, ink, true, 2);
  addText(text, l.start + "–" + l.end + " · " + l.room, 13, muted);
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
