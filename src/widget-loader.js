// Lessenrooster-widget voor Scriptable — opstartscript (gemaakt op __CREATED__)
// Haalt de eigenlijke widget op van je rooster-site, zodat verbeteringen vanzelf binnenkomen.
// Zonder internet gebruikt hij de laatst opgehaalde versie.
// Vink je in je rooster lessen aan of uit? Kopieer het script dan opnieuw.
const SITE = "__SITE__";
const SKIP = __SKIP__; // lessen die je niet volgt

const fm = FileManager.local();
const cache = fm.joinPath(fm.documentsDirectory(), "lessenrooster-widget-code.js");
let code = null;
try {
  code = await new Request(SITE + "widget.js").loadString();
  if (!code.includes("LESSENROOSTER_WIDGET")) throw new Error("onverwacht antwoord");
  fm.writeString(cache, code);
} catch (e) {
  if (fm.fileExists(cache)) code = fm.readString(cache);
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
