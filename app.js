// Stoic Reps: a small offline training log. All data stays on this device (localStorage), with JSON backup.
"use strict";

// ---------- exercises ----------
const EX = {
  pullup: { name: "Pull-ups", one: "pull-up", step: 2.5 },
  pushup: { name: "Push-ups", one: "push-up", step: 2.5 },
  squat:  { name: "Squats",   one: "squat",   step: 2.5 },
  lunge:  { name: "Lunges",   one: "lunge",   step: 2.5, perLeg: true },
  kneeraise: { name: "Knee raises", one: "knee raise", step: 2.5 },
};
const QUICK_KG = ["pullup", "kneeraise"];   // quick sets that can carry added weight
const PUSH_VAR = ["Floor", "Feet up", "Backpack"];   // push-up variations, easiest first
const PULL_VAR = ["Standard", "L-sit"];              // pull-up types; each keeps its own max, records and progression
const VARS = { pullup: PULL_VAR, pushup: PUSH_VAR };
const varName = (ex, v) => ex === "pullup" ? PULL_VAR[v] : PUSH_VAR[v].toLowerCase();
const gtgV = () => ((S.settings.gtgVar || {}).pullup) || 0;   // type used by the quick pull-up button
const KEY = "stoicreps.v1";
const BODYWEIGHT_DEFAULT = 67;

function defaults() {
  return {
    v: 1,
    settings: {
      theme: "dark",
      ranges: { pullup: { bw: [10, 15], wt: [5, 8] }, pushup: [15, 25], squat: [10, 15], lunge: [10, 12], kneeraise: [10, 15] },
      gtg: { pullup: 6, pushup: 10, kneeraise: 10 }, // usual grease-the-groove set
      gtgKg: { pullup: 0, kneeraise: 0 },          // added kg on the quick set
      rest: { bw: 120, wt: 180 },                  // rest timer after a working set, seconds (0 = off)
      baseline: { pullup: 17, pushup: 25 },       // bests before the app
      bodyweight: BODYWEIGHT_DEFAULT,
    },
    goals: [
      { id: 1, ex: "pushup", reps: 40, kg: 0, label: "40 push-ups unbroken" },
      { id: 2, ex: "pullup", reps: 20, kg: 0, label: "20 pull-ups unbroken" },
      { id: 3, ex: "pullup", reps: 5, kg: 20, label: "5 pull-ups with +20 kg" },
      { id: 4, ex: "squat", reps: 20, kg: 0, label: "20 bodyweight squats, clean form", manual: true },
      { id: 5, ex: "squat", reps: 10, kg: 20, label: "10 goblet squats with 20 kg" },
    ],
    sets: [],          // { t, ex, reps, kg, v (push-up variation / pull-up type), gtg }
    body: {},          // "YYYY-MM-DD": kg
    daily: {},         // "YYYY-MM-DD": { creatine, protein }
    favs: [],          // quote ids
    qotd: null,        // { d, id }
  };
}

// ---------- storage ----------
let S = load();
function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return fillIn(Object.assign(defaults(), JSON.parse(raw))); } catch (e) {}
  return defaults();
}
function fillIn(s) {
  const d = defaults().settings;
  s.settings = Object.assign({}, d, s.settings);
  for (const k of ["ranges", "gtg", "gtgKg", "rest", "baseline"]) s.settings[k] = Object.assign({}, d[k], s.settings[k]);
  return s;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast("Could not save on this device", true); } }

// ---------- dates ----------
const pad = n => String(n).padStart(2, "0");
const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const keyToDate = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = keyToDate(k); d.setDate(d.getDate() + n); return dayKey(d.getTime()); };
const weekStart = k => { const d = keyToDate(k); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return dayKey(d.getTime()); }; // Monday

// the day being logged: today, or a past day picked on Home (not saved, so the app always opens on today)
let logDay = null;
const curDay = () => logDay || dayKey();
const stamp = () => logDay ? keyToDate(logDay).setHours(12, 0, 0, 0) : Date.now();
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function dayLabel(k) {
  if (k === dayKey()) return "Today";
  if (k === addDays(dayKey(), -1)) return "Yesterday";
  const d = keyToDate(k); return `${WD[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`;
}

// ---------- helpers ----------
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const fmtKg = kg => (Math.round(kg * 10) / 10).toString();
const setsOf = ex => S.sets.filter(s => s.ex === ex);
const bwOn = k => { const ks = Object.keys(S.body).filter(d => d <= k).sort(); return ks.length ? S.body[ks[ks.length - 1]] : S.settings.bodyweight; };
const epley = (w, r) => w * (1 + r / 30);

function range(ex, kg) {
  const r = S.settings.ranges[ex];
  if (ex === "pullup") return kg > 0 ? r.wt : r.bw;
  return r;
}
// one number per load so loads can be compared: push-up variation first, then added kg
const loadVal = s => (VARS[s.ex] ? (s.v || 0) * 1000 : 0) + (s.kg || 0);
function loadText(ex, kg, v) {
  const parts = [];
  if (VARS[ex] && v) parts.push(varName(ex, v));
  if (kg > 0) parts.push(`+${fmtKg(kg)} kg`);
  return parts.length ? " @ " + parts.join(" ") : "";
}
function maxBw(ex, v = 0) {   // best bodyweight reps (v: pull-up type), including the bests from before the app
  let m = v ? 0 : (S.settings.baseline[ex] || 0);
  for (const s of setsOf(ex)) if (!s.kg && (s.v || 0) === v) m = Math.max(m, s.reps);
  return m;
}

// ---------- double progression ----------
function sessions(ex, beforeToday) {   // working sets (not grease-the-groove) grouped by day, oldest first
  const by = {}, today = dayKey();
  for (const s of setsOf(ex)) if (!s.gtg && !(beforeToday && dayKey(s.t) === today)) (by[dayKey(s.t)] = by[dayKey(s.t)] || []).push(s);
  return Object.keys(by).sort().map(d => ({ d, sets: by[d] }));
}
function stepUp(ex, kg, v) {
  if (ex === "pushup") { if (v < 2) return { kg: v + 1 === 2 ? 5 : 0, v: v + 1 }; return { kg: kg + 2.5, v: 2 }; }
  return { kg: kg + EX[ex].step, v: ex === "pullup" ? v : 0 };
}
function stepDown(ex, kg, v) {
  if (ex === "pushup") { if (v === 2 && kg > 5) return { kg: kg - 2.5, v: 2 }; if (v > 0) return { kg: 0, v: v - 1 }; return { kg: 0, v: 0 }; }
  return { kg: Math.max(0, kg - EX[ex].step), v: ex === "pullup" ? v : 0 };
}
// -> { sets, reps, kg, v, kind: "start" | "up" | "down" | "build", text }
// today = true: the plan for today's session (judged on sessions before today), so it stays put while you log sets
function suggest(ex, today) {
  const ss = sessions(ex, today);
  if (!ss.length) {
    const r = range(ex, 0);
    return { sets: 3, reps: r[0], kg: 0, v: 0, kind: "start", text: `Start: 3 × ${r[0]}` };
  }
  const last = ss[ss.length - 1], lastSet = last.sets[last.sets.length - 1];
  const L = loadVal(lastSet), kg = lastSet.kg || 0, v = lastSet.v || 0;
  const work = last.sets.filter(s => loadVal(s) === L), [bot, top] = range(ex, kg);
  const n = Math.min(5, Math.max(2, work.length));
  const reps = work.map(s => s.reps);
  if (reps.every(r => r >= top)) {                       // top of the range on every working set
    const u = stepUp(ex, kg, v), r2 = range(ex, u.kg);
    return { sets: n, reps: r2[0], kg: u.kg, v: u.v, kind: "up", text: `Next: ${n} × ${r2[0]}${loadText(ex, u.kg, u.v)} ↑` };
  }
  const missed = sess => sess.sets.filter(s => loadVal(s) === L).some(s => s.reps < bot);
  const prev = ss.length > 1 ? ss[ss.length - 2] : null;
  if (missed(last) && prev && prev.sets.some(s => loadVal(s) === L) && missed(prev)) {   // missed the bottom twice in a row
    const d = stepDown(ex, kg, v), r2 = range(ex, d.kg);
    const same = d.kg === kg && d.v === v;
    return { sets: n, reps: r2[0], kg: d.kg, v: d.v, kind: "down",
      text: same ? `Hold: ${n} × ${bot}${loadText(ex, kg, v)}` : `Hold or step back: ${n} × ${r2[0]}${loadText(ex, d.kg, d.v)}` };
  }
  const target = Math.min(top, Math.max(bot, Math.min(...reps) + 1));
  return { sets: n, reps: target, kg, v, kind: "build", text: `Next: ${n} × ${target}${loadText(ex, kg, v)}` };
}

// ---------- quotes ----------
const TRAIN_THEMES = ["discipline", "effort"];
function hash(str) { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function quoteOfDay() {
  // one quote per day; once you have trained that day it switches to a discipline or effort quote
  const d = dayKey(), trained = S.sets.some(s => dayKey(s.t) === d);
  const stale = !S.qotd || S.qotd.d !== d || !QUOTES[S.qotd.id] || (trained && !TRAIN_THEMES.includes(QUOTES[S.qotd.id].th));
  if (stale) {
    const pool = trained ? QUOTES.filter(q => TRAIN_THEMES.includes(q.th)) : QUOTES;
    S.qotd = { d, id: pool[hash(d) % pool.length].id }; save();
  }
  return QUOTES[S.qotd.id];
}
let lastQuoteId = -1;
function nextQuote(themes, strict) {      // 70% from the given themes (always, if strict)
  const prefer = strict || Math.random() < 0.7;
  let pool = QUOTES.filter(q => q.id !== lastQuoteId && (!prefer || (themes || TRAIN_THEMES).includes(q.th)));
  if (!pool.length) pool = QUOTES;
  const q = pool[Math.floor(Math.random() * pool.length)]; lastQuoteId = q.id; return q;
}
function quoteCard(q) {
  const on = S.favs.includes(q.id);
  return `<div class="card quote"><blockquote>${esc(q.q)}</blockquote><cite>— ${esc(q.a)}, <i>${esc(q.s)}</i></cite>
    <button class="fav ${on ? "on" : ""}" data-fav="${q.id}" aria-label="Favorite">${on ? "♥" : "♡"}</button></div>`;
}
function toggleFav(id) {
  id = +id; const i = S.favs.indexOf(id);
  if (i >= 0) S.favs.splice(i, 1); else S.favs.push(id);
  save(); document.querySelectorAll(`[data-fav="${id}"]`).forEach(b => { const on = S.favs.includes(id); b.classList.toggle("on", on); b.textContent = on ? "♥" : "♡"; });
}

// ---------- streak / totals ----------
function streak() {
  const days = new Set(S.sets.map(s => dayKey(s.t)));
  let k = dayKey(); if (!days.has(k)) k = addDays(k, -1);
  let n = 0; while (days.has(k)) { n++; k = addDays(k, -1); }
  return n;
}
function weekReps(ex, wk) {
  return setsOf(ex).filter(s => weekStart(dayKey(s.t)) === wk).reduce((a, s) => a + s.reps, 0);
}

// ---------- logging ----------
let lastSet = null;   // the set the "Undo" button removes
function logSet(set) {
  const pv = set.ex === "pullup" ? (set.v || 0) : 0, prBw = maxBw(set.ex, pv);
  const prior = setsOf(set.ex).filter(s => (s.v || 0) === (set.v || 0));
  S.sets.push(set); lastSet = set; save();
  // records
  let pr = null;
  if (!set.kg && (set.v || 0) === pv && set.reps > prBw) pr = `${set.reps} ${pv ? "L-sit " : ""}${EX[set.ex].one}s unbroken. Your best ever.`;
  else if (set.kg > 0 && !prior.some(s => s.kg >= set.kg && s.reps >= set.reps)) pr = `${set.reps} × +${fmtKg(set.kg)} kg is a new ${EX[set.ex].one} record.`;
  return pr;
}
const gtgKg = ex => QUICK_KG.includes(ex) ? (S.settings.gtgKg[ex] || 0) : 0;
function gtgWarn(reps, v = gtgV()) { const m = maxBw("pullup", v); return m > 0 && reps > 0.6 * m; }
function quickSet(ex) {
  const reps = S.settings.gtg[ex], kg = gtgKg(ex);
  const v = ex === "pullup" ? gtgV() : 0;
  const warn = ex === "pullup" && !kg && gtgWarn(reps, v), max = maxBw("pullup", v);   // judged on the max before this set
  const pr = logSet({ t: stamp(), ex, reps, kg, v, gtg: true });
  if (warn) toast(`Logged ${reps}. That's over 60% of your ${v ? "L-sit " : ""}max (${max}) — keep groove sets easy for your elbows.`, true, true);
  else toast(`Logged ${reps} ${v ? "L-sit " : ""}${EX[ex].one}s${kg ? ` +${fmtKg(kg)} kg` : ""}. Groove greased.`, false, true);
  if (pr) celebrate(pr); else render();
  $("#home-quote") && ($("#home-quote").innerHTML = quoteCard(nextQuote()));
}

// ---------- log sheet ----------
let cur = null;   // { ex, reps, kg, v }
let pendingDel = null;   // index in S.sets of the set chip waiting for a second tap
function openSheet(ex) {
  pendingDel = null;
  const sg = suggest(ex, true), last = setsOf(ex).filter(s => !s.gtg).pop();
  const sameLoad = last && (last.kg || 0) === sg.kg && (last.v || 0) === sg.v;
  cur = { ex, reps: sameLoad ? last.reps : sg.reps, kg: sg.kg, v: sg.v };
  $("#sh-title").textContent = EX[ex].name + (logDay ? " · " + dayLabel(logDay) : "");
  $("#sh-next").textContent = sg.text.replace(/^Next:/, logDay ? "Plan:" : "Today:");
  $("#sh-per").textContent = EX[ex].perLeg ? "(per leg)" : "";
  $("#sh-var").hidden = !VARS[ex];
  if (VARS[ex]) $("#sh-var label").textContent = ex === "pullup" ? "Pull-up type" : "Push-up variation";
  $("#sh-quote").innerHTML = "";
  drawSheet(); $("#sheet").hidden = false;
}
function drawSheet() {
  $("#sh-reps").textContent = cur.reps;
  $("#sh-kg").textContent = cur.kg ? "+" + fmtKg(cur.kg) : "0";
  if (VARS[cur.ex]) $("#sh-var-seg").innerHTML = VARS[cur.ex].map((n, i) => `<button data-var="${i}" class="${cur.v === i ? "on" : ""}">${n}</button>`).join("");
  const today = S.sets.map((s, i) => [s, i]).filter(([s]) => s.ex === cur.ex && dayKey(s.t) === curDay());
  $("#sh-today").innerHTML = today.length ? today.map(([s, i]) => `<button data-del-set="${i}" class="${s.gtg ? "gtg" : ""} ${pendingDel === i ? "del" : ""}" aria-label="${pendingDel === i ? "Tap again to remove this set" : "Set of " + s.reps + ", tap to remove"}">${pendingDel === i ? "Remove?" : `${s.reps}${loadText(s.ex, s.kg, s.v).replace(" @ ", " ")}${s.gtg ? " · GTG" : ""}`}</button>`).join("") + '<span class="muted tip">tap a set to remove it</span>' : `<span class="muted" style="background:none;padding:0">No sets yet ${logDay ? "that day" : "today"}</span>`;
}
function closeSheet() { $("#sheet").hidden = true; cur = null; render(); }

// ---------- PR celebration ----------
function celebrate(msg) {
  const q = nextQuote(["effort", "better", "discipline"], true);
  $("#modal-body").innerHTML = `<div class="pr-card"><div class="big-emoji">🏛️</div><h2>New record</h2><p>${esc(msg)}</p></div>
    ${quoteCard(q)}<p class="muted" style="text-align:center">Well done. Now rest, eat your protein, and come back tomorrow.</p>
    <button class="big primary" data-close-modal>Continue</button>`;
  $("#modal").hidden = false;
}

// ---------- toast ----------
let toastT = 0;
function toast(msg, warn, undo) {
  const t = $("#toast"); t.className = "toast" + (warn ? " warn" : "") + (undo ? " has-undo" : ""); t.hidden = false;
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button data-undo>Undo</button>' : ""}`;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, warn || undo ? 5000 : 2200);
}
function undoLast() {
  const i = S.sets.indexOf(lastSet); lastSet = null;
  if (i < 0) return;
  S.sets.splice(i, 1); save(); stopRest(); pendingDel = null;
  if (cur) drawSheet(); else render();
  toast("Set removed");
}

// ---------- rest timer: counts down after a working set; beeps (and buzzes where the phone allows) at zero ----------
let rest = null, restT = 0, beepCtx = null;
function unlockBeep() {   // iPhone only plays sound from a context first touched during a tap
  try { beepCtx = beepCtx || new (window.AudioContext || window.webkitAudioContext)(); if (beepCtx.state === "suspended") beepCtx.resume(); } catch (e) {}
}
function startRest(sec) { if (!(sec > 0)) return; rest = { end: Date.now() + sec * 1000 }; clearInterval(restT); restT = setInterval(tickRest, 250); tickRest(); }
function stopRest() { rest = null; clearInterval(restT); $("#rest").hidden = true; }
function tickRest() {
  if (!rest) return;
  const left = Math.ceil((rest.end - Date.now()) / 1000);
  if (left <= 0) { stopRest(); restDone(); return; }
  $("#rest").hidden = false; $("#rest-t").textContent = `${Math.floor(left / 60)}:${pad(left % 60)}`;
}
function restDone() {
  try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
  try {
    if (beepCtx) for (const at of [0, .25]) {
      const o = beepCtx.createOscillator(), g = beepCtx.createGain(), t0 = beepCtx.currentTime + at;
      o.frequency.value = 880; g.gain.setValueAtTime(.3, t0); g.gain.exponentialRampToValueAtTime(.001, t0 + .2);
      o.connect(g); g.connect(beepCtx.destination); o.start(t0); o.stop(t0 + .2);
    }
  } catch (e) {}
  toast("Rest over. Next set when you're ready.");
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) tickRest(); });

// ---------- screens ----------
let tab = "home", progEx = "pullup";
function render() {
  document.documentElement.dataset.theme = S.settings.theme;
  document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
  $("#view").innerHTML = tab === "home" ? homeView() : tab === "progress" ? progressView() : moreView();
}

function homeView() {
  const d = curDay(), daily = S.daily[d] || {};
  const ex = Object.keys(EX).map(k => {
    const sg = suggest(k), last = setsOf(k).filter(s => !s.gtg).pop();
    return `<button class="ex" data-ex="${k}"><span class="name">${EX[k].name}</span>
      <span class="nx ${sg.kind === "down" ? "down" : ""}">${esc(sg.text)}</span>
      <span class="last">${last ? `Last: ${last.reps}${EX[k].perLeg ? "/leg" : ""}${loadText(k, last.kg, last.v)}` : "No sets yet"}</span></button>`;
  }).join("");
  const g = S.settings.gtg;
  return `<h1>Stoic Reps</h1>
    <div id="home-quote">${quoteCard(quoteOfDay())}</div>
    <div class="daybar ${logDay ? "past" : ""}"><button data-day="-1" aria-label="Previous day" ${d <= addDays(dayKey(), -30) ? "disabled" : ""}>‹</button>
      <span>${logDay ? "Logging for " : ""}<b>${dayLabel(d)}</b></span>
      <button data-day="1" aria-label="Next day" ${logDay ? "" : "disabled"}>›</button></div>
    ${logDay ? `<p class="muted daynote">Creatine, protein and any sets you log now go to ${dayLabel(d).toLowerCase() === "yesterday" ? "yesterday" : dayLabel(d)}. <button class="link" data-day="0">Back to today</button></p>` : ""}
    <div class="row">
      <div class="pill"><b>${streak()}</b><span class="muted">day streak</span></div>
      <button class="pill check ${daily.creatine ? "on" : ""}" data-daily="creatine"><span class="box">${daily.creatine ? "✓" : ""}</span>Creatine</button>
      <button class="pill check ${daily.protein ? "on" : ""}" data-daily="protein"><span class="box">${daily.protein ? "✓" : ""}</span>Protein</button>
    </div>
    <div class="grid">${ex}</div>
    <div class="quick">${quickBox("pullup", "pull-ups", g.pullup)}${quickBox("pushup", "push-ups", g.pushup)}${quickBox("kneeraise", "knee raises", g.kneeraise)}</div>`;
}

// a quick-set button (tap to log) with − / + underneath to change how many reps it logs
function quickBox(ex, name, n) {
  const kg = gtgKg(ex), v = ex === "pullup" ? gtgV() : 0, warn = ex === "pullup" && !kg && gtgWarn(n, v);
  const kgRow = QUICK_KG.includes(ex) ? `<div class="qstep kg"><button data-gkg="${ex}:-1" aria-label="Less weight" ${kg <= 0 ? "disabled" : ""}>−</button><span>${kg ? "+" + fmtKg(kg) : 0} kg</span><button data-gkg="${ex}:1" aria-label="More weight">+</button></div>` : "";
  const type = ex === "pullup" ? `<div class="qvar">${PULL_VAR.map((t, i) => `<button data-gvar="${i}" class="${i === v ? "on" : ""}">${t}</button>`).join("")}</div>` : "";
  return `<div class="qbox"><button data-quick="${ex}" class="${warn ? "warn" : ""}">Quick ${v ? "L-sit " : ""}${name} ×${n}${kg ? ` <span class="nw">+${fmtKg(kg)} kg</span>` : ""}<small>${warn ? "over 60% of max" : "grease the groove"}</small></button>${type}
    <div class="qstep"><button data-gstep="${ex}:-1" aria-label="Fewer ${name}" ${n <= 1 ? "disabled" : ""}>−</button><span>${n}</span><button data-gstep="${ex}:1" aria-label="More ${name}">+</button></div>${kgRow}</div>`;
}

// --- charts (inline SVG) ---
function lineChart(points, opts = {}) {      // points: [{ x: label, y, tag }]
  if (points.length < 1) return `<p class="muted">Log a few sessions to see the line.</p>`;
  const W = 340, H = 170, P = { l: 30, r: 10, t: 14, b: 22 };
  const ys = points.map(p => p.y), lo = Math.floor(Math.min(...ys) * 0.9), hi = Math.ceil(Math.max(...ys) * 1.05) || 1;
  const x = i => P.l + (points.length === 1 ? (W - P.l - P.r) / 2 : i * (W - P.l - P.r) / (points.length - 1));
  const y = v => P.t + (H - P.t - P.b) * (1 - (v - lo) / Math.max(1, hi - lo));
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join("");
  const dots = points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.y).toFixed(1)}" r="3.5" fill="var(--accent)"/>`).join("");
  const lastP = points[points.length - 1];
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || "chart")}">
    <line x1="${P.l}" x2="${W - P.r}" y1="${y(hi)}" y2="${y(hi)}" stroke="var(--line)"/><line x1="${P.l}" x2="${W - P.r}" y1="${y(lo)}" y2="${y(lo)}" stroke="var(--line)"/>
    <text x="2" y="${y(hi) + 4}" font-size="11" fill="var(--muted)">${hi}</text><text x="2" y="${y(lo) + 4}" font-size="11" fill="var(--muted)">${lo}</text>
    <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>${dots}
    <text x="${P.l}" y="${H - 4}" font-size="11" fill="var(--muted)">${esc(points[0].x)}</text>
    <text x="${W - P.r}" y="${H - 4}" font-size="11" fill="var(--muted)" text-anchor="end">${esc(lastP.x)}</text>
    <text x="${Math.min(W - P.r, x(points.length - 1))}" y="${y(lastP.y) - 8}" font-size="12" font-weight="700" fill="var(--text)" text-anchor="end">${esc(lastP.tag || lastP.y)}</text></svg>`;
}
function barChart(bars) {          // [{ x, y }]
  const W = 340, H = 150, P = { l: 6, r: 6, t: 18, b: 22 }, max = Math.max(1, ...bars.map(b => b.y));
  const bw = (W - P.l - P.r) / bars.length;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="weekly reps">${bars.map((b, i) => {
    const h = (H - P.t - P.b) * b.y / max, x = P.l + i * bw + 4, yy = H - P.b - h;
    return `<rect x="${x}" y="${yy}" width="${bw - 8}" height="${Math.max(h, 1)}" rx="4" fill="${i === bars.length - 1 ? "var(--accent)" : "var(--card2)"}"/>
      ${b.y ? `<text x="${x + (bw - 8) / 2}" y="${yy - 4}" font-size="11" fill="var(--text)" text-anchor="middle">${b.y}</text>` : ""}
      <text x="${x + (bw - 8) / 2}" y="${H - 6}" font-size="10" fill="var(--muted)" text-anchor="middle">${esc(b.x)}</text>`;
  }).join("")}</svg>`;
}
const shortDate = k => { const d = keyToDate(k); return `${d.getMonth() + 1}/${d.getDate()}`; };

function goalProgress(g) {
  const best = setsOf(g.ex).filter(s => (s.kg || 0) >= g.kg && (!(s.v > 0) || (g.ex === "pushup" && g.kg > 0))).reduce((m, s) => Math.max(m, s.reps), 0);
  const base = g.kg === 0 ? (S.settings.baseline[g.ex] || 0) : 0;
  const b = Math.max(best, base);
  return { best: b, done: g.done || (!g.manual && b >= g.reps) };
}

// ---------- body map: muscles light up in color when trained recently, gray when not ----------
// regions are polygons in the 182 x 450 pixels of spidey.png (both sides of the body)
const MUSCLES = {
  shoulders: { name: "Shoulders", p: ["52,70 40,76 30,93 30,112 43,111 53,97 58,80", "130,70 143,76 151,93 150,112 137,111 126,97 120,80"] },
  chest:     { name: "Chest", p: ["53,79 70,70 96,70 118,79 122,100 114,120 90,124 78,125 58,120 51,100"] },
  lats:      { name: "Lats", p: ["44,100 56,104 57,150 50,152 46,130", "124,100 113,104 112,150 119,152 122,130"] },
  arms:      { name: "Biceps & triceps", p: ["31,110 45,108 47,130 41,156 25,156 25,130", "137,108 151,110 157,130 159,156 144,156 138,130"] },
  forearms:  { name: "Forearms & grip", p: ["24,152 42,152 36,180 24,213 6,213 12,180", "141,152 160,152 166,180 175,213 158,213 150,180"] },
  core:      { name: "Abs & core", p: ["58,124 112,124 115,150 112,190 95,197 70,197 56,190 54,150"] },
  quads:     { name: "Quads", p: ["42,228 86,232 82,268 72,305 64,323 36,323 36,290 40,255", "95,232 130,228 134,260 140,295 143,323 120,323 112,290 100,262"] },
  calves:    { name: "Calves", p: ["36,328 60,328 56,360 52,400 40,402 33,365", "124,328 146,328 150,360 152,400 138,402 130,365"] },
};
const HEAD = "68,8 100,8 106,40 99,64 84,70 70,63 65,40";   // the mask always keeps its color
const MUSCLE_OF = { pullup: ["lats", "arms", "forearms"], pushup: ["chest", "shoulders", "arms"], squat: ["quads"],
  lunge: ["quads", "calves"], kneeraise: ["core", "forearms"] };
const musclesOf = s => (MUSCLE_OF[s.ex] || []).concat(s.ex === "pullup" && s.v === 1 ? ["core"] : []);   // L-sit adds core
const glow = d => d <= 1 ? 1 : d === 2 ? .8 : d === 3 ? .6 : d <= 6 ? .35 : 0;   // days since trained -> color strength
function muscleState() {
  const last = {}, by = {}, today = dayKey();
  for (const s of S.sets) { const k = dayKey(s.t); for (const m of musclesOf(s)) if (!last[m] || k >= last[m]) { last[m] = k; by[m] = s.ex; } }
  const st = {};
  for (const m in MUSCLES) {
    const d = last[m] ? Math.round((keyToDate(today) - keyToDate(last[m])) / 864e5) : null;
    st[m] = { d, g: d === null ? 0 : glow(d), ex: by[m] };
  }
  return st;
}
const agoText = d => d === null ? "not yet" : d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
function bodyMap() {
  const st = muscleState(), today = dayKey(), since = addDays(today, -29);
  let days = 0, creatine = 0;
  const trained = new Set(S.sets.map(s => dayKey(s.t)));
  for (let k = since; k <= today; k = addDays(k, 1)) { if (trained.has(k)) days++; if ((S.daily[k] || {}).creatine) creatine++; }
  const lit = Object.keys(MUSCLES).filter(m => st[m].g > 0);
  const mask = lit.map(m => MUSCLES[m].p.map(p => `<polygon points="${p}" fill="#fff" fill-opacity="${st[m].g}"/>`).join("")).join("");
  const hits = Object.keys(MUSCLES).map(m => MUSCLES[m].p.map(p => `<polygon points="${p}" data-muscle="${m}"/>`).join("")).join("");
  const rows = Object.keys(MUSCLES).map(m => `<button class="mrow ${st[m].g ? "" : "off"}" data-muscle="${m}">
      <i style="opacity:${st[m].g ? .3 + .7 * st[m].g : 1}"></i><span>${MUSCLES[m].name}</span><small>${agoText(st[m].d)}</small></button>`).join("");
  return `<h3>This week's body</h3><div class="card"><div class="bodymap">
    <svg class="body" viewBox="0 0 182 450" role="img" aria-label="Trained in the last week: ${lit.map(m => MUSCLES[m].name).join(", ") || "nothing yet"}">
      <defs>
        <filter id="bm-gray" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/>
          <feComponentTransfer><feFuncR type="linear" slope=".48" intercept=".06"/><feFuncG type="linear" slope=".48" intercept=".06"/><feFuncB type="linear" slope=".48" intercept=".07"/></feComponentTransfer></filter>
        <filter id="bm-pop" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="1.8" result="s"/>
          <feFlood flood-color="#ff5a2e" flood-opacity=".35"/><feComposite in2="SourceAlpha" operator="in" result="t"/><feBlend in="t" in2="s" mode="multiply"/></filter>
        <filter id="bm-soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2.2"/></filter>
        <mask id="bm-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="182" height="450"><g filter="url(#bm-soft)">${mask}</g></mask>
        <mask id="bm-head" maskUnits="userSpaceOnUse" x="0" y="0" width="182" height="450"><polygon points="${HEAD}" fill="#fff" filter="url(#bm-soft)"/></mask>
      </defs>
      <image href="spidey.png" width="182" height="450" filter="url(#bm-gray)"/>
      <image href="spidey.png" width="182" height="450" filter="url(#bm-pop)" mask="url(#bm-mask)"/>
      <image href="spidey.png" width="182" height="450" mask="url(#bm-head)"/>
      <g class="hit">${hits}</g></svg>
    <div class="mlist">${rows}</div></div>
    <div class="hm-foot"><span><b>${days}</b> training day${days === 1 ? "" : "s"} · <b>${creatine}</b> creatine day${creatine === 1 ? "" : "s"} <span class="muted">(last 30)</span></span></div></div>`;
}
function muscleInfo(m) {
  const s = muscleState()[m], how = Object.keys(MUSCLE_OF).filter(ex => MUSCLE_OF[ex].includes(m)).map(ex => EX[ex].name.toLowerCase());
  if (m === "core") how.push("L-sit pull-ups");
  toast(s.d === null ? `${MUSCLES[m].name}: not trained yet. Try ${how.join(" or ")}.`
    : `${MUSCLES[m].name}: last trained ${agoText(s.d)} (${EX[s.ex].name.toLowerCase()}).${s.g ? "" : " Gone gray — time for " + how.join(" or ") + "."}`);
}

function progressView() {
  const ex = progEx, all = setsOf(ex);
  const chips = Object.keys(EX).map(k => `<button data-prog="${k}" class="${k === ex ? "on" : ""}">${EX[k].name}</button>`).join("");
  // records
  const bwMax = maxBw(ex);
  const byReps = {};
  for (const s of all) if (s.kg > 0) byReps[s.reps] = Math.max(byReps[s.reps] || 0, s.kg);
  const heavy = Object.entries(byReps).sort((a, b) => b[1] - a[1] || b[0] - a[0]).slice(0, 4);
  let e1 = "";
  if (ex === "pullup") {
    const w = all.filter(s => s.kg > 0).map(s => epley(bwOn(dayKey(s.t)) + s.kg, s.reps));
    e1 = w.length ? `<div class="stat"><b>${Math.round(Math.max(...w))} kg</b><span>est. 1-rep max (body + belt, Epley)</span></div>` : `<div class="stat"><b>—</b><span>est. 1-rep max (log a weighted set)</span></div>`;
  }
  const wk = weekStart(dayKey());
  const stats = `<div class="stats">
    <div class="stat"><b>${bwMax}</b><span>max reps, bodyweight${S.settings.baseline[ex] && bwMax === S.settings.baseline[ex] ? " (pre-app best)" : ""}</span></div>
    <div class="stat"><b>${heavy.length ? "+" + fmtKg(heavy[0][1]) + " kg" : "—"}</b><span>${heavy.length ? `heaviest, ${heavy[0][0]} reps` : "heaviest added weight"}</span></div>
    ${e1}<div class="stat"><b>${weekReps(ex, wk)}</b><span>reps this week</span></div></div>`;
  const recTable = heavy.length ? `<h3>Heaviest for a given number of reps</h3><div class="card">${Object.entries(byReps).sort((a, b) => a[0] - b[0]).map(([r, kg]) => `<div class="item"><span>${r} reps</span><b>+${fmtKg(kg)} kg</b></div>`).join("")}</div>` : "";
  // best set per day
  const days = {};
  for (const s of all) { if (s.gtg) continue; const d = dayKey(s.t); if (!days[d] || s.reps > days[d].reps) days[d] = s; }
  const pts = Object.keys(days).sort().slice(-30).map(d => ({ x: shortDate(d), y: days[d].reps, tag: days[d].reps + loadText(ex, days[d].kg, days[d].v).replace(" @ ", " ") }));
  let e1Chart = "";
  if (ex === "pullup") {
    const wd = {};
    for (const s of all) if (s.kg > 0) { const d = dayKey(s.t), v = epley(bwOn(d) + s.kg, s.reps); wd[d] = Math.max(wd[d] || 0, v); }
    const p2 = Object.keys(wd).sort().slice(-30).map(d => ({ x: shortDate(d), y: Math.round(wd[d]), tag: Math.round(wd[d]) + " kg" }));
    e1Chart = `<h3>Estimated 1-rep max (weighted pull-ups)</h3><div class="card">${lineChart(p2, { label: "estimated 1RM" })}</div>`;
  }
  const weeks = []; for (let i = 7; i >= 0; i--) { const w = addDays(wk, -7 * i); weeks.push({ x: shortDate(w), y: weekReps(ex, w) }); }
  const goals = S.goals.map(g => {
    const p = goalProgress(g), pct = Math.min(100, Math.round(100 * p.best / g.reps));
    return `<div class="goal ${p.done ? "done" : ""}"><div class="t">${p.done ? "✓ " : ""}${esc(g.label)}<div class="muted" style="font-size:13px">${g.manual ? "tick it when your form is clean" : `best: ${p.best} / ${g.reps}`}</div>
      <div class="bar"><i style="width:${p.done ? 100 : pct}%"></i></div></div>
      ${g.manual ? `<button data-goal-done="${g.id}">${g.done ? "↺" : "✓"}</button>` : ""}</div>`;
  }).join("");
  return `<h1>Progress</h1>${bodyMap()}<h3>By exercise</h3><div class="chips">${chips}</div>${stats}
    <h3>Best set by day</h3><div class="card">${lineChart(pts, { label: "best set" })}</div>
    ${e1Chart}
    <h3>Total reps per week</h3><div class="card">${barChart(weeks)}</div>
    ${recTable}
    <h3>Goals</h3><div class="card">${goals || '<p class="muted">No goals. Add one under More.</p>'}</div>`;
}

function moreView() {
  const st = S.settings, today = dayKey();
  const bwRows = Object.keys(S.body).sort().slice(-5).reverse().map(d => `<div class="item"><span>${d}</span><b>${fmtKg(S.body[d])} kg</b></div>`).join("");
  const favs = S.favs.map(id => QUOTES[id]).filter(Boolean).map(quoteCard).join("") || '<p class="muted">Tap ♡ on any quote to keep it here.</p>';
  const r = st.ranges;
  const rangeRow = (label, key, a) => `<div class="inrow"><label>${label}</label><input type="number" inputmode="numeric" data-range="${key}:0" value="${a[0]}"> – <input type="number" inputmode="numeric" data-range="${key}:1" value="${a[1]}"></div>`;
  const goalRows = S.goals.map(g => `<div class="item"><span>${esc(g.label)}</span><button class="small-btn" data-goal-del="${g.id}">Remove</button></div>`).join("");
  return `<h1>More</h1>
    <h3>Body weight</h3><div class="card">
      <div class="inrow"><label>Today (${today})</label><input id="bw-in" type="number" inputmode="decimal" step="0.1" placeholder="${fmtKg(bwOn(today))}" value="${S.body[today] ?? ""}"><button class="small-btn" data-act="bw">Save</button></div>
      ${bwRows}</div>
    <h3>Favorite quotes</h3>${favs}
    <h3>Grease the groove</h3><div class="card">
      <div class="inrow"><label>Quick pull-up set</label><input type="number" inputmode="numeric" data-gtg="pullup" value="${st.gtg.pullup}"></div>
      <div class="inrow"><label>Quick push-up set</label><input type="number" inputmode="numeric" data-gtg="pushup" value="${st.gtg.pushup}"></div>
      <div class="inrow"><label>Quick knee-raise set</label><input type="number" inputmode="numeric" data-gtg="kneeraise" value="${st.gtg.kneeraise}"></div>
      <p class="muted" style="font-size:14px">Keep groove pull-up sets at or under ${Math.floor(0.6 * maxBw("pullup"))} (60% of your max of ${maxBw("pullup")}).</p></div>
    <h3>Rest timer</h3><div class="card">
      <div class="inrow"><label>After a bodyweight set (sec)</label><input type="number" inputmode="numeric" data-rest-set="bw" value="${st.rest.bw}"></div>
      <div class="inrow"><label>After a weighted set (sec)</label><input type="number" inputmode="numeric" data-rest-set="wt" value="${st.rest.wt}"></div>
      <p class="muted" style="font-size:14px">Starts when you log a set from an exercise card. 0 turns it off.</p></div>
    <h3>Rep ranges</h3><div class="card">
      ${rangeRow("Pull-ups, bodyweight", "pullup.bw", r.pullup.bw)}${rangeRow("Pull-ups, weighted", "pullup.wt", r.pullup.wt)}
      ${rangeRow("Push-ups", "pushup", r.pushup)}${rangeRow("Squats", "squat", r.squat)}${rangeRow("Lunges (per leg)", "lunge", r.lunge)}${rangeRow("Knee raises", "kneeraise", r.kneeraise)}</div>
    <h3>Goals</h3><div class="card">${goalRows}
      <div class="inrow" style="flex-wrap:wrap"><select id="g-ex">${Object.keys(EX).map(k => `<option value="${k}">${EX[k].name}</option>`).join("")}</select>
        <input id="g-reps" type="number" inputmode="numeric" placeholder="reps"><input id="g-kg" type="number" inputmode="decimal" placeholder="+kg">
        <button class="small-btn" data-act="goal-add">Add goal</button></div></div>
    <h3>Appearance</h3><div class="card"><div class="seg">
      <button data-theme-set="dark" class="${st.theme === "dark" ? "on" : ""}">Dark</button><button data-theme-set="light" class="${st.theme === "light" ? "on" : ""}">Light</button></div></div>
    <h3>Backup</h3><div class="card">
      <button class="big" data-act="export">Export data (JSON)</button>
      <button class="big" data-act="import">Import data…</button><input id="imp" type="file" accept="application/json,.json" hidden>
      <p class="muted" style="font-size:14px">Your data lives only on this phone. Export now and then and keep the file in iCloud Drive or Files.</p></div>
    <h3>About the quotes</h3><div class="card muted" style="font-size:14px">${QUOTES.length} quotes, each checked word for word against public-domain translations:
      Marcus Aurelius and Epictetus tr. George Long; Seneca tr. Richard M. Gummere. Musonius Rufus is left out because the usual English translation may still be under copyright.</div>`;
}

// ---------- events ----------
document.addEventListener("click", e => {
  const b = e.target.closest("button, [data-muscle]"); if (!b) return;
  const d = b.dataset;
  if (d.muscle) { muscleInfo(d.muscle); return; }
  if (d.tab) { tab = d.tab; render(); window.scrollTo(0, 0); return; }
  if (d.fav !== undefined) { toggleFav(d.fav); if (tab === "more") render(); return; }
  if (d.ex) { openSheet(d.ex); return; }
  if (d.quick) { quickSet(d.quick); return; }
  if (d.gvar !== undefined) { S.settings.gtgVar = Object.assign({}, S.settings.gtgVar, { pullup: +d.gvar }); save(); render(); return; }
  if (d.gstep) { const [ex, n] = d.gstep.split(":"), v = Math.max(1, Math.min(50, S.settings.gtg[ex] + +n));
    if (v === S.settings.gtg[ex]) return;
    const bw = ex === "pullup" && !gtgKg(ex), was = bw && gtgWarn(S.settings.gtg[ex]);
    S.settings.gtg[ex] = v; save(); render();
    if (bw && gtgWarn(v) && !was) toast(`${v} is over 60% of your ${gtgV() ? "L-sit " : ""}max (${maxBw("pullup", gtgV())}). Groove sets should feel easy.`, true);
    return; }
  if (d.gkg) { const [ex, n] = d.gkg.split(":"), kg = Math.max(0, Math.min(100, gtgKg(ex) + EX[ex].step * n));
    S.settings.gtgKg[ex] = kg; save(); render(); return; }
  if (d.day !== undefined) { const n = +d.day, k = n === 0 ? dayKey() : addDays(curDay(), n);
    logDay = k >= dayKey() ? null : k < addDays(dayKey(), -30) ? logDay : k; render(); return; }
  if (d.daily) { const k = curDay(); S.daily[k] = S.daily[k] || {}; S.daily[k][d.daily] = !S.daily[k][d.daily]; save(); render(); return; }
  if (d.close !== undefined) { closeSheet(); return; }
  if (d.closeModal !== undefined) { $("#modal").hidden = true; render(); return; }
  if (d.step) { const [f, n] = d.step.split(":"); cur[f] = Math.max(f === "reps" ? 1 : 0, Math.round((cur[f] + +n) * 10) / 10); if (cur.ex === "pushup" && f === "kg" && cur.kg > 0) cur.v = 2; drawSheet(); return; }
  if (d.var !== undefined) { cur.v = +d.var; if (cur.ex === "pushup" && cur.v < 2) cur.kg = 0; drawSheet(); return; }
  if (d.undo !== undefined) { undoLast(); return; }
  if (d.rest !== undefined) { if (rest && +d.rest) { rest.end += +d.rest * 1000; tickRest(); } else stopRest(); return; }
  if (d.delSet !== undefined) { const i = +d.delSet;
    if (pendingDel === i) { S.sets.splice(i, 1); pendingDel = null; save(); toast("Set removed"); } else pendingDel = i;
    drawSheet(); return; }
  if (b.id === "sh-log") {
    unlockBeep(); pendingDel = null;
    const pr = logSet({ t: stamp(), ex: cur.ex, reps: cur.reps, kg: cur.kg, v: VARS[cur.ex] ? cur.v : 0, gtg: false });
    drawSheet();
    if (!logDay) startRest(S.settings.rest[cur.kg > 0 ? "wt" : "bw"]);
    if (pr) celebrate(pr); else { $("#sh-quote").innerHTML = quoteCard(nextQuote()); toast(`Logged ${cur.reps}${loadText(cur.ex, cur.kg, cur.v)}`, false, true); }
    return;
  }
  if (d.prog) { progEx = d.prog; render(); return; }
  if (d.goalDone) { const g = S.goals.find(x => x.id === +d.goalDone); g.done = !g.done; save(); render(); return; }
  if (d.goalDel) { S.goals = S.goals.filter(x => x.id !== +d.goalDel); save(); render(); return; }
  if (d.themeSet) { S.settings.theme = d.themeSet; save(); render(); return; }
  if (d.act === "bw") { const v = parseFloat($("#bw-in").value); if (v > 30 && v < 250) { S.body[dayKey()] = v; save(); toast("Body weight saved"); render(); } else toast("Enter your weight in kg", true); return; }
  if (d.act === "goal-add") {
    const ex = $("#g-ex").value, reps = parseInt($("#g-reps").value), kg = parseFloat($("#g-kg").value) || 0;
    if (!(reps > 0)) { toast("Enter the reps for the goal", true); return; }
    S.goals.push({ id: Date.now(), ex, reps, kg, label: `${reps} ${EX[ex].one}s${kg ? ` with +${fmtKg(kg)} kg` : " unbroken"}` }); save(); render(); return;
  }
  if (d.act === "export") {
    const blob = new Blob([JSON.stringify(S, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `stoic-reps-${dayKey()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000); return;
  }
  if (d.act === "import") { $("#imp").click(); return; }
});
document.addEventListener("change", e => {
  const t = e.target;
  if (t.id === "imp" && t.files[0]) {
    t.files[0].text().then(txt => {
      const j = JSON.parse(txt);
      if (!j || !Array.isArray(j.sets) || !j.settings) throw new Error("not a Stoic Reps backup");
      S = fillIn(Object.assign(defaults(), j)); save(); toast(`Imported ${S.sets.length} sets`); render();
    }).catch(err => toast("Import failed: " + err.message, true));
    return;
  }
  if (t.dataset.range) {
    const [key, i] = t.dataset.range.split(":"), v = parseInt(t.value); if (!(v > 0)) return;
    const [ex, sub] = key.split("."); const arr = sub ? S.settings.ranges[ex][sub] : S.settings.ranges[ex];
    arr[+i] = v; if (arr[0] > arr[1]) arr.reverse(); save(); return;
  }
  if (t.dataset.restSet) { const v = parseInt(t.value); if (v >= 0 && v <= 900) { S.settings.rest[t.dataset.restSet] = v; save(); } return; }
  if (t.dataset.gtg) {
    const v = parseInt(t.value); if (!(v > 0)) return; S.settings.gtg[t.dataset.gtg] = v; save();
    if (t.dataset.gtg === "pullup" && !gtgKg("pullup") && gtgWarn(v)) toast(`${v} is over 60% of your max. Groove sets should feel easy.`, true);
  }
});
$("#sheet").addEventListener("click", e => { if (e.target.id === "sheet") closeSheet(); });

render();
// accessibility: tell screen readers which tab is current and which toggles are on; Escape closes an open sheet
let a11yQueued = false;
function syncA11y() {
  a11yQueued = false;
  document.querySelectorAll(".tabs button").forEach(b => b.classList.contains("on") ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"));
  document.querySelectorAll(".seg button, .qvar button, .chips button, .check").forEach(b => b.setAttribute("aria-pressed", b.classList.contains("on")));
}
new MutationObserver(() => { if (!a11yQueued) { a11yQueued = true; queueMicrotask(syncA11y); } })
  .observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
syncA11y();
document.addEventListener("keydown", e => { if (e.key === "Escape") { if (!$("#modal").hidden) { $("#modal").hidden = true; render(); } else if (!$("#sheet").hidden) closeSheet(); } });
// service worker: check for a new version whenever the app comes back to the screen, and reload once it takes over
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  const hadSW = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("sw.js").then(reg => {
    document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadSW && !reloaded) { reloaded = true; location.reload(); } });
}
