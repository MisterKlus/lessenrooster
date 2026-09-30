// Lessenrooster-widget voor Scriptable — opstartscript (gemaakt op __CREATED__)
// Haalt de eigenlijke widget op van je rooster-site, zodat verbeteringen vanzelf binnenkomen.
// Zonder internet gebruikt hij de laatst opgehaalde versie.
// Vink je in je rooster lessen aan of uit? Kopieer het script dan opnieuw.
const SITE = "__SITE__";
const SKIP = __SKIP__; // lessen die je niet volgt

const fm = FileManager.local();
const cache = fm.joinPath(fm.documentsDirectory(), "lessenrooster-widget-code.js");
const cached = fm.fileExists(cache);
// In de widget hoogstens om de 6 uur ophalen (dan tekent hij sneller); in de app altijd de verse versie
let code = cached && config.runsInWidget && Date.now() - fm.modificationDate(cache) < 6 * 3600000 ? fm.readString(cache) : null;
if (!code) {
  try {
    const req = new Request(SITE + "widget.js?t=" + Date.now());
    req.timeoutInterval = 8; // een trage verbinding mag de widget niet blokkeren
    const fresh = await req.loadString();
    if (!fresh.includes("LESSENROOSTER_WIDGET")) throw new Error("onverwacht antwoord");
    fm.writeString(cache, fresh);
    code = fresh;
  } catch (e) {
    if (cached) code = fm.readString(cache);
  }
}
if (code) {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction("SITE", "SKIP", code)(SITE, SKIP);
} else {
  const w = new ListWidget();
  w.addText("Lessenrooster: nog geen verbinding. Probeer het later opnieuw.");
  if (config.runsInWidget) Script.setWidget(w); else await w.presentSmall();
  Script.complete();
}
