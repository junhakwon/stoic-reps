// Unbowed widget for Scriptable (https://scriptable.app). Name this script exactly: Unbowed
// The Unbowed app opens scriptable:///run/Unbowed?data=... when you tap "Send to widget"; this script saves that summary
// and the widget shows it: your streak and today's workout. Sizes: small, medium, large, and the lock-screen ones.
// Nothing leaves your phone.

const FILE = "unbowed-widget.json";
const fm = FileManager.local(), path = fm.joinPath(fm.documentsDirectory(), FILE);
const C = {
  bg: new Color("#111214"), card: new Color("#1c1d21"), text: new Color("#f2efe9"), muted: new Color("#9b978f"),
  accent: new Color("#d9a441"), good: new Color("#6fbf73"), warn: new Color("#e5874a"),
};
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = n => String(n).padStart(2, "0");
const dayKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const keyToDate = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const daysBetween = (a, b) => Math.round((keyToDate(b) - keyToDate(a)) / 864e5);

// ---------- save what the app sent ----------
const q = args.queryParameters || {};
let data = null, justSent = false;
try { if (fm.fileExists(path)) data = JSON.parse(fm.readString(path)); } catch (e) {}
const take = raw => {   // keep a summary from the app if it's newer than the one saved
  try { const d = JSON.parse(raw); if (d && d.v === 1 && d.d && (!data || !(d.at < data.at))) { fm.writeString(path, JSON.stringify(d)); data = d; justSent = true; return true; } } catch (e) {}
  return false;
};
if (q.data) take(q.data);
// backup route: the app also copies the summary; when this script is opened in Scriptable without it, look on the clipboard
if (!justSent && !config.runsInWidget && !config.runsInAccessoryWidget) {
  try { const clip = Pasteboard.pasteString(); if (clip && clip.indexOf('"v":1') >= 0) take(clip); } catch (e) {}
}

// ---------- what to show, given how old the data is ----------
function view(d) {
  if (!d) return { empty: true };
  const today = dayKey(new Date()), age = daysBetween(d.d, today);
  if (age <= 0) {
    const pending = d.first.items.find(i => i.s < 2) || (d.first.done && d.second ? d.second.find(i => i.s < 2) : null);
    const status = d.done ? (d.first.done ? "Done today ✓" : "Trained today ✓") : d.restOk ? "Rest day OK · streak safe" : d.n ? `Train today → ${d.n + 1}` : "Start a streak today";
    const showNext = d.first.started && d.first.done && d.second;
    return { n: d.n, rank: d.rank, status, warn: !d.done && !d.restOk && d.n > 0, title: showNext ? "Next workout" : "Today's workout",
      items: showNext ? d.second : d.first.items, pending, rest: d.first.rest && !d.done, fresh: true,
      next: d.next && d.next.in >= 0 ? `${d.next.name} ${d.next.in <= 0 ? "today" : d.next.in === 1 ? "tomorrow" : `in ${d.next.in} days`}` : "" };
  }
  // sent on an earlier day: the streak still counts if you trained that day; today's plan needs a fresh send
  return { n: d.n, rank: d.rank, stale: true, warn: !(age === 1 && d.done && d.restTmrw),
    status: age === 1 && d.done ? (d.restTmrw ? "Rest day OK · streak safe" : `Train today → ${d.n + 1}`) : `Last update ${WD[keyToDate(d.d).getDay()]}`,
    title: "Today's workout", items: [], hint: "Open Unbowed and tap ⇪ Widget for today's plan" };
}

// ---------- drawing ----------
function text(stack, s, size, color, weight) {
  const t = stack.addText(String(s));
  t.font = weight === "bold" ? Font.boldSystemFont(size) : weight === "medium" ? Font.mediumSystemFont(size) : Font.systemFont(size);
  t.textColor = color; t.lineLimit = 1; t.minimumScaleFactor = .7;
  return t;
}
function mark(stack, item) {
  if (item.s === 2) {
    const img = stack.addImage(SFSymbol.named("checkmark.circle.fill").image); img.imageSize = new Size(15, 15); img.tintColor = C.good;
  } else if (item.s === 1 && item.p) {
    const b = stack.addStack(); b.size = new Size(15, 15); b.centerAlignContent(); text(b, item.p, 7, C.accent, "bold");
  } else {
    const img = stack.addImage(SFSymbol.named("circle").image); img.imageSize = new Size(15, 15); img.tintColor = C.muted;
  }
}
function itemRow(parent, item, size) {
  const r = parent.addStack(); r.layoutHorizontally(); r.centerAlignContent(); r.spacing = 6;
  mark(r, item);
  const col = r.addStack(); col.layoutVertically();
  text(col, item.n, size, item.s === 2 ? C.muted : C.text, "medium");
  if (item.t && item.s !== 2) text(col, item.t, size - 2, C.accent, "medium");
}
function streakBlock(parent, v, big) {
  const s = parent.addStack(); s.layoutVertically();
  text(s, "UNBOWED", 9, C.accent, "bold");
  s.addSpacer(big ? 6 : 2);
  const row = s.addStack(); row.layoutHorizontally(); row.bottomAlignContent(); row.spacing = 4;
  text(row, v.n, big ? 40 : 30, C.text, "bold");
  text(row, "day streak", 11, C.muted, "medium");
  text(s, v.rank, 12, C.accent, "medium");
  s.addSpacer(4);
  const st = text(s, v.status, 11, v.warn ? C.warn : C.good, "medium"); st.lineLimit = 2;
  if (v.next && !v.stale) text(s, v.next, 10, C.muted);
}
function listBlock(parent, v, max, size) {
  const s = parent.addStack(); s.layoutVertically(); s.spacing = 5;
  text(s, v.title.toUpperCase(), 9, C.muted, "bold");
  if (v.stale) { const h = text(s, v.hint, 11, C.muted); h.lineLimit = 3; return; }
  if (v.rest) { const h = text(s, "Everything is recovering. Rest, or an easy walk.", 11, C.muted); h.lineLimit = 3; return; }
  if (!v.items.length) { text(s, "Nothing planned", 11, C.muted); return; }
  for (const it of v.items.slice(0, max)) itemRow(s, it, size);
  if (v.items.length > max) text(s, `+${v.items.length - max} more`, 10, C.muted);
}
function build(v, fam) {
  const w = new ListWidget();
  // ask iPhone to redraw soon (it decides when; usually within 15 minutes), and right after midnight
  const soon = new Date(Date.now() + 10 * 60000), midnight = new Date(); midnight.setHours(24, 0, 5, 0);
  w.refreshAfterDate = soon < midnight ? soon : midnight;
  if (fam.startsWith("accessory")) {
    if (v.empty) { text(w, "Unbowed: tap Send to widget", 12, Color.white()); return w; }
    const left = v.items ? v.items.filter(i => i.s < 2) : [];
    const doneN = v.items ? v.items.filter(i => i.s === 2).length : 0;
    if (fam === "accessoryCircular") {
      w.addAccessoryWidgetBackground = true;
      const a = text(w, v.n, 20, Color.white(), "bold"); a.centerAlignText();
      const b = text(w, "days", 9, Color.white()); b.centerAlignText(); return w;
    }
    if (fam === "accessoryInline") { text(w, `${v.n}-day streak · ${v.stale ? v.status : left.length ? `${doneN}/${v.items.length} done` : "done ✓"}`, 12, Color.white()); return w; }
    text(w, `${v.n}-day streak · ${v.rank}`, 13, Color.white(), "bold");
    text(w, v.stale ? v.status : v.pending ? `Next: ${v.pending.n} ${v.pending.t || ""}` : v.status, 12, Color.white());
    if (!v.stale && v.items.length) text(w, `${doneN} of ${v.items.length} done`, 12, Color.white());
    return w;
  }
  w.backgroundColor = C.bg; w.setPadding(14, 14, 14, 14);
  if (v.empty) {
    text(w, "UNBOWED", 10, C.accent, "bold"); w.addSpacer(6);
    const t = text(w, "Open Unbowed → More → Send to widget", 13, C.text, "medium"); t.lineLimit = 3; return w;
  }
  if (fam === "small") {
    streakBlock(w, v, false);
    w.addSpacer();
    if (!v.stale && v.pending) { text(w, v.pending.n, 12, C.text, "medium"); if (v.pending.t) text(w, v.pending.t, 11, C.accent, "medium"); }
    return w;
  }
  if (fam === "medium") {
    const row = w.addStack(); row.layoutHorizontally(); row.topAlignContent();
    const left = row.addStack(); left.size = new Size(112, 0); streakBlock(left, v, false);
    row.addSpacer(10);
    listBlock(row, v, 4, 12);
    row.addSpacer();
    return w;
  }
  // large (and extra large): streak on top, then the list
  const top = w.addStack(); top.layoutHorizontally(); streakBlock(top, v, true); top.addSpacer();
  w.addSpacer(14);
  listBlock(w, v, 7, 14);
  w.addSpacer();
  if (data && data.at) text(w, `Updated ${new Date(data.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`, 9, C.muted);
  return w;
}

const v = view(data);
if (config.runsInWidget || config.runsInAccessoryWidget) {
  Script.setWidget(build(v, config.widgetFamily || "medium"));
} else {
  // opened in Scriptable (or from the app): say what happened, then show the medium widget as a preview
  if (justSent || v.empty) {
    const a = new Alert(); a.title = justSent ? "Widget updated ✓" : "Nothing from Unbowed yet";
    a.message = justSent ? "Your home-screen widget picks this up within a few minutes." :
      "In Unbowed, go to More → Home-screen widget and tap Send to widget. This script must be named exactly Unbowed.";
    a.addAction("OK"); await a.present();
  }
  await build(v, "medium").presentMedium();
}
Script.complete();
