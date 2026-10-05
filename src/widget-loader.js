// Lessenrooster-widget voor Scriptable — opstartscript (gemaakt op __CREATED__)
// Haalt de eigenlijke widget op van je rooster-site, zodat verbeteringen vanzelf binnenkomen.
// Zonder internet gebruikt hij de laatst opgehaalde versie.
// Vink je in je rooster lessen aan of uit? Tik dan in je rooster op "Stuur mijn vinkjes naar de widget".
const SITE = "__SITE__";
const SKIP = __SKIP__; // lessen die je niet volgt, op het moment van kopiëren
const MADE = __MADE__; // tijdstip van kopiëren: een later doorgestuurde lijst gaat voor

const fm = FileManager.local();
// Vinkjes die je rooster doorstuurt (scriptable:///run/Lessenrooster?skip=[...]) worden hier bewaard
const skipFile = fm.joinPath(fm.documentsDirectory(), "lessenrooster-vinkjes.json");
const sent = args.queryParameters && args.queryParameters.skip;
if (sent) {
  try { JSON.parse(sent); fm.writeString(skipFile, sent); } catch (e) {}
}
let skip = SKIP;
if (fm.fileExists(skipFile) && fm.modificationDate(skipFile).getTime() > MADE) {
  try { skip = JSON.parse(fm.readString(skipFile)); } catch (e) {}
}
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
if (sent) {
  // Geopend vanuit je rooster: kort bevestigen; de widget zelf neemt het bij de volgende update over
  const a = new Alert();
  a.title = "Widget bijgewerkt";
  a.message = "Je widget toont nu alleen de lessen die je volgt. Je kunt terug naar je rooster.";
  a.addAction("OK");
  await a.present();
  Script.complete();
} else if (code) {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction("SITE", "SKIP", code)(SITE, skip);
} else {
  const w = new ListWidget();
  w.addText("Lessenrooster: nog geen verbinding. Probeer het later opnieuw.");
  if (config.runsInWidget) Script.setWidget(w); else await w.presentSmall();
  Script.complete();
}
