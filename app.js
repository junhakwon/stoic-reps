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
      rest: { bw: 120, wt: 180 },
      quickEx: "pullup",                           // exercise picked in the quick-add bar                  // rest timer after a working set, seconds (0 = off)
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
// the streak counts training days; one rest day in any 7 keeps it going, two missed days in a row end it.
// status per day: on (trained), rday (the allowed rest day), off (missed), now (today, not trained yet)
function streakInfo() {
  const days = new Set(S.sets.map(s => dayKey(s.t))), today = dayKey(), status = {};
  if (!days.size) return { n: 0, best: 0, status, restOk: false, row: 0 };
  let run = 0, best = 0, lastRest = null, row = 0;
  for (let k = [...days].sort()[0]; k <= today; k = addDays(k, 1)) {
    const prev = addDays(k, -1);
    if (days.has(k)) { run++; row = days.has(prev) ? row + 1 : 1; status[k] = "on"; }
    else if (k === today) status[k] = "now";
    else if (run && days.has(prev) && (!lastRest || addDays(lastRest, 7) <= k)) { lastRest = k; status[k] = "rday"; row = 0; }
    else { if (status[prev] === "rday") status[prev] = "off"; run = 0; lastRest = null; row = 0; status[k] = "off"; }
    best = Math.max(best, run);
  }
  const restOk = !days.has(today) && days.has(addDays(today, -1)) && run > 0 && (!lastRest || addDays(lastRest, 7) <= today);
  return { n: run, best, status, restOk, row };
}
const streak = () => streakInfo().n;
const bestStreak = () => streakInfo().best;
// Stoic ranks earned by an unbroken run of training days
const RANKS = [[0, "Beginner"], [3, "Initiate"], [7, "Student"], [14, "Practitioner"], [30, "Disciple"], [60, "Stoic"], [100, "Philosopher"], [180, "Sage"], [365, "Marcus"]];
function rankOf(n) {
  let i = 0; while (i + 1 < RANKS.length && n >= RANKS[i + 1][0]) i++;
  return { name: RANKS[i][1], from: RANKS[i][0], next: RANKS[i + 1] || null };
}
function weekReps(ex, wk) {
  return setsOf(ex).filter(s => weekStart(dayKey(s.t)) === wk).reduce((a, s) => a + s.reps, 0);
}

// ---------- clips: sprite sheets (fx-*.webp, cut from the GIFs) played frame by frame ----------
const CLIPS = {
  dive: { w: 400, h: 225, cols: 10, rows: 3, n: 25, ms: 83 }, suit: { w: 271, h: 360, cols: 14, rows: 2, n: 24, ms: 100 },
  land: { w: 400, h: 225, cols: 10, rows: 2, n: 16, ms: 60 }, shoot: { w: 400, h: 225, cols: 10, rows: 2, n: 18, ms: 60 },
  walk: { w: 360, h: 180, cols: 11, rows: 2, n: 20, ms: 70 }, swing: { w: 400, h: 224, cols: 10, rows: 3, n: 30, ms: 98 },
};
const clip = (name, cls = "") => `<div class="clip ${cls}" data-clip="${name}" style="aspect-ratio:${CLIPS[name].w}/${CLIPS[name].h}" aria-hidden="true"></div>`;
function startClips() {
  document.querySelectorAll(".clip[data-clip]:not([data-on])").forEach(el => {
    const c = CLIPS[el.dataset.clip], loop = el.classList.contains("loop"); el.dataset.on = "1";
    el.style.backgroundImage = `url(fx-${el.dataset.clip}.webp)`; el.style.backgroundSize = `${c.cols * 100}% ${c.rows * 100}%`;
    const show = i => { el.style.backgroundPosition = `${c.cols > 1 ? (i % c.cols) / (c.cols - 1) * 100 : 0}% ${c.rows > 1 ? Math.floor(i / c.cols) / (c.rows - 1) * 100 : 0}%`; };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { show(Math.floor(c.n / 2)); return; }
    let i = 0; show(0);
    const t = setInterval(() => {
      if (!el.isConnected) { clearInterval(t); return; }
      if (++i >= c.n) { if (!loop) { clearInterval(t); return; } i = 0; }
      show(i);
    }, c.ms);
  });
}

// ---------- logging ----------
let lastSet = null;   // the set the "Undo" button removes
// after a set is logged: a new rank plays the dive clip; the first set of the day plays the suit-up clip
function afterLog(before, first, set) {
  const n = streak(), r0 = rankOf(before), r1 = rankOf(n), up = n > before && r1.name !== r0.name && r1.from > 0;
  // the exercise is done for today when its planned number of working sets is reached
  const planned = suggest(set.ex, true).sets, working = S.sets.filter(s => s.ex === set.ex && !s.gtg && dayKey(s.t) === dayKey()).length;
  const done = !logDay && !set.gtg && working === planned;
  if (!up && !first && !done) return;
  setTimeout(() => {   // after the caller has shown its own toast or record card
    const open = !$("#modal").hidden, card = $("#modal-body .pr-card");
    if (up && open) card.insertAdjacentHTML("beforeend", `<p class="rankup">And a new rank: <b>${r1.name}</b> · ${n} days</p>`);
    else if (up) rankCard(r1, n);
    else if (done && open) card.insertAdjacentHTML("beforeend", `<p class="rankup">${EX[set.ex].name} done for today.</p>`);
    else if (done) doneCard(set.ex);
    else if (!open) suitUp(n);
  }, 60);
}
function doneCard(ex) {
  const today = S.sets.filter(s => dayKey(s.t) === dayKey()), mine = today.filter(s => s.ex === ex && !s.gtg);
  const reps = arr => arr.reduce((t, s) => t + s.reps, 0);
  $("#modal-body").innerHTML = `<div class="pr-card">${clip("land", "fxclip loop")}<h2>${EX[ex].name} done</h2>
    <p>${mine.length} sets · ${reps(mine)} reps${mine[0] && mine[0].kg ? ` at +${fmtKg(mine[0].kg)} kg` : ""}. Today so far: ${today.length} sets, ${reps(today)} reps.</p></div>
    ${quoteCard(nextQuote(["discipline", "effort"], true))}<button class="big primary" data-close-modal>Done for now</button>`;
  $("#modal").hidden = false;
}
function rankCard(r, n) {
  $("#modal-body").innerHTML = `<div class="pr-card">${clip("swing", "fxclip")}<h2>${r.name}</h2>
    <p>${n} days without a break. ${r.next ? `Next: <b>${r.next[1]}</b> at ${r.next[0]} days.` : "The highest rank there is."}</p></div>
    ${quoteCard(nextQuote(["discipline", "effort"], true))}<button class="big primary" data-close-modal>Keep going</button>`;
  $("#modal").hidden = false;
}
let suitT = 0;
function suitUp(n) {
  const el = $("#suit"); el.innerHTML = `${clip("suit")}<p>Day ${n}. <b>Suit up.</b></p>`; el.hidden = false;
  clearTimeout(suitT); suitT = setTimeout(() => { el.hidden = true; }, 2600);
}
function logSet(set) {
  const pv = set.ex === "pullup" ? (set.v || 0) : 0, prBw = maxBw(set.ex, pv);
  const prior = setsOf(set.ex).filter(s => (s.v || 0) === (set.v || 0));
  const before = streak(), first = !logDay && !S.sets.some(s => dayKey(s.t) === dayKey());
  S.sets.push(set); lastSet = set; save();
  flashAt = Date.now(); flashM = musclesOf(set); afterLog(before, first, set);
  // records
  let pr = null;
  if (!set.kg && (set.v || 0) === pv && set.reps > prBw) pr = `${set.reps} ${pv ? "L-sit " : ""}${EX[set.ex].one}s unbroken. Your best ever.`;
  else if (set.kg > 0 && !prior.some(s => s.kg >= set.kg && s.reps >= set.reps)) pr = `${set.reps} × +${fmtKg(set.kg)} kg is a new ${EX[set.ex].one} record.`;
  flashWord = pr ? "NEW PR!" : set.gtg ? "THWIP!" : ["POW!", "WHAM!", "BAM!"][S.sets.length % 3];
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
  $("#modal-body").innerHTML = `<div class="pr-card">${clip("dive", "fxclip")}<h2>New record</h2><p>${esc(msg)}</p></div>
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
let goT = 0;
function restDone() {
  try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
  try {
    if (beepCtx) for (const at of [0, .25]) {
      const o = beepCtx.createOscillator(), g = beepCtx.createGain(), t0 = beepCtx.currentTime + at;
      o.frequency.value = 880; g.gain.setValueAtTime(.3, t0); g.gain.exponentialRampToValueAtTime(.001, t0 + .2);
      o.connect(g); g.connect(beepCtx.destination); o.start(t0); o.stop(t0 + .2);
    }
  } catch (e) {}
  const go = $("#restgo"); go.innerHTML = `${clip("shoot")}<b>GO</b>`; go.hidden = false;
  clearTimeout(goT); goT = setTimeout(() => { go.hidden = true; }, CLIPS.shoot.n * CLIPS.shoot.ms + 900);
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
  const d = curDay(), daily = S.daily[d] || {}, st = muscleState();
  const rows = Object.keys(EX).map(k => {
    const sg = suggest(k), g = st[MUSCLE_OF[k][0]].g;   // the main muscle it trains
    return `<button class="exrow" data-ex="${k}"><i class="mdot" style="${g ? `opacity:${(.35 + .65 * g).toFixed(2)}` : ""}" data-lit="${g ? 1 : 0}"></i>
      <span class="t"><b>${EX[k].name}</b><span class="nx ${sg.kind === "down" ? "down" : ""}">${esc(sg.text.replace(/^Next: /, "Next "))}</span></span>
      <span class="plus" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></span></button>`;
  }).join("");
  return `<div class="hdr"><h1>Stoic Reps</h1>
      <div class="dayctl ${logDay ? "past" : ""}"><button data-day="-1" aria-label="Previous day" ${d <= addDays(dayKey(), -30) ? "disabled" : ""}>‹</button>
        <span>${dayLabel(d)}</span><button data-day="1" aria-label="Next day" ${logDay ? "" : "disabled"}>›</button></div></div>
    ${logDay ? `<p class="muted daynote">Creatine, protein and any sets you log now go to ${dayLabel(d).toLowerCase() === "yesterday" ? "yesterday" : dayLabel(d)}. <button class="link" data-day="0">Back to today</button></p>` : ""}
    <div class="card hero">${bodySvg(st, "mini")}
      <div class="side">${streakCard()}
        <button class="tick ${daily.creatine ? "on" : ""}" data-daily="creatine"><span class="box">${daily.creatine ? "✓" : ""}</span>Creatine</button>
        <button class="tick ${daily.protein ? "on" : ""}" data-daily="protein"><span class="box">${daily.protein ? "✓" : ""}</span>Protein</button>
        <p class="hint">${nextHint(st)}</p></div></div>
    ${restDayCard()}
    <div id="home-quote">${quoteCard(quoteOfDay())}</div>
    <div class="card list">${rows}</div>
    ${quickBar()}`;
}

// streak: number, Stoic rank, the last 7 days, progress to the next rank
let lastBarPct = null;   // the web bar shoots out when its length changes (and once when the app opens)
function streakCard() {
  const info = streakInfo(), n = info.n, best = info.best, r = rankOf(n), today = dayKey(), st = info.status;
  const done = st[today] === "on";
  const ks = [6, 5, 4, 3, 2, 1, 0].map(i => addDays(today, -i)), kind = k => st[k] || (k === today ? "now" : "off");
  const dots = ks.map(k => `<span class="sd ${kind(k)}" title="${k}${kind(k) === "rday" ? " · rest day" : ""}"><i></i>${WD[keyToDate(k).getDay()][0]}</span>`).join("");
  // threads: whole between two kept days (dashed across a rest day), broken where a day was missed
  const held = k => kind(k) === "on" || kind(k) === "rday";
  const threads = ks.slice(0, 6).map((k, i) => {
    const x1 = i * 100 + 50, x2 = x1 + 100, nx = ks[i + 1];
    if (held(k) && (held(nx) || kind(nx) === "now")) return `<path class="${kind(k) === "rday" || kind(nx) === "rday" ? "rd" : ""}${kind(nx) === "now" ? " pend" : ""}" d="M${x1} 7Q${x1 + 50} 12 ${x2} 7"/>`;
    return (held(k) ? `<path class="cut" d="M${x1} 7Q${x1 + 22} 10 ${x1 + 34} 14"/>` : "") + (held(nx) ? `<path class="cut" d="M${x2} 7Q${x2 - 22} 10 ${x2 - 34} 14"/>` : "");
  }).join("");
  const pct = r.next ? Math.round(100 * (n - r.from) / (r.next[0] - r.from)) : 100;
  const shoot = lastBarPct !== pct ? "shoot" : ""; lastBarPct = pct;
  const line = !n ? "Log a set to start a streak."
    : done ? (r.next ? `${r.next[0] - n} more day${r.next[0] - n === 1 ? "" : "s"} to <b>${r.next[1]}</b>` : "The highest rank. Keep going.")
    : info.restOk ? "Rest day available. Your streak is safe today."
    : `<span class="risk">Train today to make it ${n + 1}.</span>`;
  return `<div class="streak"><div class="sn"><b>${n}</b><span>day streak<br><em>${r.name}</em></span></div>
    <div class="sdots" aria-label="Last 7 days: ${ks.filter(k => kind(k) === "on").length} trained${ks.some(k => kind(k) === "rday") ? ", 1 rest day" : ""}">
      <svg class="threads" viewBox="0 0 700 20" preserveAspectRatio="none" aria-hidden="true">${threads}</svg>${dots}</div>
    <div class="sbar web ${shoot}"><i style="width:${pct}%"></i></div><p class="sline">${line}${best > n ? ` · best ${best}` : ""}</p></div>`;
}
// on the day after two training days in a row, offer a recovery day (it doesn't break the streak)
function restDayCard() {
  const info = streakInfo();
  if (logDay || !info.restOk || info.row < 2) return "";
  return `<div class="card restday">${clip("walk", "loop")}<div><b>Recovery day</b>
    <p>Two days in a row. You can rest today: a walk keeps the blood moving, and your streak holds.</p></div></div>`;
}

// one bar for grease-the-groove sets: pick the exercise, set reps (and kg / pull-up type), Add
function quickBar() {
  const ex = S.settings.quickEx || "pullup", n = S.settings.gtg[ex], kg = gtgKg(ex), v = ex === "pullup" ? gtgV() : 0;
  const warn = ex === "pullup" && !kg && gtgWarn(n, v), one = EX[ex].one + (n === 1 ? "" : "s");
  return `<div class="card qbar"><div class="qhead"><span>Quick groove set</span>
      ${ex === "pullup" ? `<span class="qtype">${PULL_VAR.map((t, i) => `<button data-gvar="${i}" class="${i === v ? "on" : ""}">${t}</button>`).join("")}</span>` : ""}</div>
    <div class="qseg">${["pullup", "pushup", "kneeraise"].map(e => `<button data-qex="${e}" class="${e === ex ? "on" : ""}">${EX[e].name}</button>`).join("")}</div>
    <div class="qrow"><div class="qst"><button data-gstep="${ex}:-1" aria-label="Fewer reps" ${n <= 1 ? "disabled" : ""}>−</button><b>${n}</b><button data-gstep="${ex}:1" aria-label="More reps">+</button><small>reps</small></div>
      ${QUICK_KG.includes(ex) ? `<div class="qst"><button data-gkg="${ex}:-1" aria-label="Less weight" ${kg <= 0 ? "disabled" : ""}>−</button><b>${kg ? "+" + fmtKg(kg) : 0}</b><button data-gkg="${ex}:1" aria-label="More weight">+</button><small>kg</small></div>` : ""}</div>
    <button class="qadd ${warn ? "warn" : ""}" data-quick="${ex}">Add ${n} ${v ? "L-sit " : ""}${one}${kg ? ` +${fmtKg(kg)} kg` : ""}</button>
    ${warn ? `<p class="qwarn">That's over 60% of your max — groove sets should feel easy.</p>` : ""}</div>`;
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
// ---------- the figure ----------
// the arms are cut out along the shoulder so they can sway on their own (points in spidey.png pixels)
const ARM_L = "41,74 27,90 21,130 9,175 1,212 0,266 33,266 33,214 40,180 46,150 48,118 48,100 46,86";
const ARM_R = "141,74 155,90 161,130 173,175 181,212 182,266 149,266 149,214 142,180 136,150 134,118 134,100 136,86";
let figImg = null, figKey = "", figUrl = "", flashAt = 0, flashM = [], flashWord = "";
function loadFig() {
  if (figImg !== null) return; figImg = false;
  const im = new Image(); im.onload = () => { figImg = im; render(); }; im.src = "spidey.png";
}
// one picture: gray body, muscles in warm color by how recently they were trained, the mask in its own color
function figure(st) {
  if (!figImg) { loadFig(); return ""; }
  const key = Object.keys(MUSCLES).map(m => st[m].g).join(",");
  if (key === figKey) return figUrl;
  const W = 182, H = 450, c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d"); x.drawImage(figImg, 0, 0, W, H);
  const img = x.getImageData(0, 0, W, H), p = img.data;
  const mc = document.createElement("canvas"); mc.width = W; mc.height = H; const mx = mc.getContext("2d");
  const poly = (pts, al) => { mx.fillStyle = `rgba(255,255,255,${al})`; mx.beginPath();
    pts.split(" ").forEach((q, i) => { const [u, v] = q.split(",").map(Number); if (i) mx.lineTo(u, v); else mx.moveTo(u, v); }); mx.closePath(); mx.fill(); };
  for (const m in MUSCLES) if (st[m].g) MUSCLES[m].p.forEach(q => poly(q, st[m].g));
  const lit = softAlpha(mx.getImageData(0, 0, W, H).data, W, H);
  mx.clearRect(0, 0, W, H); poly(HEAD, 1);
  const head = softAlpha(mx.getImageData(0, 0, W, H).data, W, H);
  for (let i = 0, j = 0; i < p.length; i += 4, j++) {
    const r = p[i], g = p[i + 1], b = p[i + 2], l = .2126 * r + .7152 * g + .0722 * b, gray = l * .48 + 15;
    const vr = l + (r - l) * 1.8, vg = (l + (g - l) * 1.8) * (.65 + .35 * 90 / 255), vb = (l + (b - l) * 1.8) * (.65 + .35 * 46 / 255);
    let R = gray + (vr - gray) * lit[j], G = gray + (vg - gray) * lit[j], B = gray + (vb - gray) * lit[j];
    p[i] = R + (r - R) * head[j]; p[i + 1] = G + (g - G) * head[j]; p[i + 2] = B + (b - B) * head[j];
  }
  x.putImageData(img, 0, 0);
  const bin = atob(c.toDataURL("image/png").split(",")[1]), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  if (figUrl) URL.revokeObjectURL(figUrl);
  figUrl = URL.createObjectURL(new Blob([u8], { type: "image/png" })); figKey = key;
  return figUrl;
}
function softAlpha(d, W, H) {   // a mask's alpha (0-1), box-blurred twice so muscle edges blend softly
  let a = new Float32Array(W * H); for (let j = 0; j < W * H; j++) a[j] = d[j * 4 + 3] / 255;
  const R = 2;
  for (let pass = 0; pass < 2; pass++) {
    const t = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0, n = 0;
      for (let k = -R; k <= R; k++) { const xx = x + k; if (xx >= 0 && xx < W) { s += a[y * W + xx]; n++; } } t[y * W + x] = s / n; }
    for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) { let s = 0, n = 0;
      for (let k = -R; k <= R; k++) { const yy = y + k; if (yy >= 0 && yy < H) { s += t[yy * W + x]; n++; } } a[y * W + x] = s / n; }
  }
  return a;
}
function bodySvg(st, cls) {
  const lit = Object.keys(MUSCLES).filter(m => st[m].g > 0), src = figure(st);
  const hits = Object.keys(MUSCLES).map(m => MUSCLES[m].p.map(p => `<polygon points="${p}" data-muscle="${m}"/>`).join("")).join("");
  const label = `Trained in the last week: ${lit.map(m => MUSCLES[m].name).join(", ") || "nothing yet"}`;
  if (!src) return `<svg class="body ${cls}" viewBox="0 0 182 450" role="img" aria-label="${label}"><g class="hit">${hits}</g></svg>`;
  const rank = RANKS.indexOf(RANKS.find(r => r[1] === rankOf(streak()).name));
  const phase = `animation-delay:-${((performance.now() / 1000) % 8.4).toFixed(2)}s`;   // keeps the breathing smooth across re-renders
  const since = Date.now() - flashAt, pts = flashM.length ? MUSCLES[flashM[0]].p[0].split(" ").map(q => q.split(",").map(Number)) : [];
  const wx = pts.length ? Math.min(132, Math.max(50, pts.reduce((t, p) => t + p[0], 0) / pts.length)) : 91, wy = pts.length ? pts.reduce((t, p) => t + p[1], 0) / pts.length : 150;
  const word = since < 1500 && flashWord ? `<text class="pow${flashWord.length > 6 ? " big" : ""}" x="${wx.toFixed(0)}" y="${wy.toFixed(0)}" text-anchor="middle" style="animation-delay:-${(since / 1000).toFixed(2)}s">${flashWord}</text>` : "";
  const flash = since < 1500 ? `<g class="flash" filter="url(#bm-glow)" style="animation-delay:-${((Date.now() - flashAt) / 1000).toFixed(2)}s">${flashM.map(m => MUSCLES[m].p.map(p => `<polygon points="${p}"/>`).join("")).join("")}</g>` : "";
  return `<svg class="body live ${cls}" viewBox="0 0 182 450" role="img" aria-label="${label}">
      <defs>
        <radialGradient id="bm-aura"><stop offset="0" stop-color="#ff7a3a" stop-opacity=".6"/><stop offset=".72" stop-color="#ff7a3a" stop-opacity="0"/></radialGradient>
        <mask id="bm-upper" maskUnits="userSpaceOnUse" x="0" y="0" width="182" height="450"><rect width="182" height="199" fill="#fff"/><polygon points="${ARM_L}" fill="#000" stroke="#fff" stroke-width="2.5"/><polygon points="${ARM_R}" fill="#000" stroke="#fff" stroke-width="2.5"/></mask>
        <mask id="bm-legs" maskUnits="userSpaceOnUse" x="0" y="0" width="182" height="450"><rect y="197" width="182" height="253" fill="#fff"/><polygon points="${ARM_L}" fill="#000" stroke="#fff" stroke-width="2.5"/><polygon points="${ARM_R}" fill="#000" stroke="#fff" stroke-width="2.5"/></mask>
        <filter id="bm-pitblur" x="-30%" y="-10%" width="160%" height="120%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="3.5"/>
          <feComponentTransfer><feFuncR type="linear" slope=".7"/><feFuncG type="linear" slope=".7"/><feFuncB type="linear" slope=".7"/></feComponentTransfer></filter>
        <clipPath id="bm-pit"><polygon points="40,98 54,98 54,190 38,190"/><polygon points="128,98 142,98 144,190 128,190"/></clipPath>
        <clipPath id="bm-al"><polygon points="${ARM_L}"/></clipPath><clipPath id="bm-ar"><polygon points="${ARM_R}"/></clipPath>
        <filter id="bm-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
      </defs>
      ${rank > 0 ? `<ellipse class="aura" cx="91" cy="215" rx="${62 + rank * 5}" ry="${150 + rank * 10}" fill="url(#bm-aura)" opacity="${(.22 + rank * .08).toFixed(2)}" style="${phase}"/>` : ""}
      <g filter="url(#bm-pitblur)"><image href="${src}" width="182" height="450" clip-path="url(#bm-pit)"/></g>
      <image href="${src}" width="182" height="450" mask="url(#bm-legs)"/>
      <g class="fig breath" style="${phase}"><image href="${src}" width="182" height="450" mask="url(#bm-upper)"/></g>
      <g class="fig al" style="${phase}"><image href="${src}" width="182" height="450" clip-path="url(#bm-al)"/></g>
      <g class="fig ar" style="${phase}"><image href="${src}" width="182" height="450" clip-path="url(#bm-ar)"/></g>
      ${flash}${word}
      <g class="hit">${hits}</g></svg>`;
}
function bodyMap() {
  const st = muscleState(), today = dayKey(), since = addDays(today, -29);
  let days = 0, creatine = 0;
  const trained = new Set(S.sets.map(s => dayKey(s.t)));
  for (let k = since; k <= today; k = addDays(k, 1)) { if (trained.has(k)) days++; if ((S.daily[k] || {}).creatine) creatine++; }
  const rows = Object.keys(MUSCLES).map(m => `<button class="mrow ${st[m].g ? "" : "off"}" data-muscle="${m}">
      <i style="opacity:${st[m].g ? .3 + .7 * st[m].g : 1}"></i><span>${MUSCLES[m].name}</span><small>${agoText(st[m].d)}</small></button>`).join("");
  return `<h3>This week's body</h3><div class="card"><div class="bodymap">${bodySvg(st, "")}
    <div class="mlist">${rows}</div></div>
    <div class="hm-foot"><span><b>${days}</b> training day${days === 1 ? "" : "s"} · <b>${creatine}</b> creatine day${creatine === 1 ? "" : "s"} <span class="muted">(last 30)</span></span></div></div>`;
}
// what to train next: exercises that would light up the gray muscles
const FIX_FOR = { core: "kneeraise", quads: "squat", calves: "lunge", chest: "pushup", shoulders: "pushup", lats: "pullup", arms: "pullup", forearms: "pullup" };
function nextHint(st) {
  const gray = Object.keys(MUSCLES).filter(m => !st[m].g);
  if (!gray.length) return "Every muscle is lit this week. Rest well, then keep the fire going.";
  const legs = gray.filter(m => m === "quads" || m === "calves"), upper = gray.filter(m => !legs.includes(m));
  const SHORT = { core: "core", arms: "arms", forearms: "forearms", shoulders: "shoulders", chest: "chest", lats: "lats" };
  const names = upper.slice(0, 2).map(m => SHORT[m]).concat(legs.length ? ["legs"] : []);
  const exs = [...new Set(gray.map(m => FIX_FOR[m]))].slice(0, 2);
  const list = names.length > 1 ? names.slice(0, -1).join(", ") + " and " + names[names.length - 1] : names[0];
  return `${list[0].toUpperCase() + list.slice(1)} ${names.length > 1 || !["core", "chest"].includes(names[0]) ? "are" : "is"} gray. Try ${exs.map(e => `<button class="link" data-ex="${e}">${EX[e].name.toLowerCase()}</button>`).join(" or ")}.`;
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
  const b = e.target.closest("button, [data-muscle], #suit, #restgo"); if (!b) return;
  const d = b.dataset;
  if (d.muscle) { muscleInfo(d.muscle); return; }
  if (d.tab) { tab = d.tab; render(); window.scrollTo(0, 0); return; }
  if (d.fav !== undefined) { toggleFav(d.fav); if (tab === "more") render(); return; }
  if (d.ex) { openSheet(d.ex); return; }
  if (d.quick) { quickSet(d.quick); return; }
  if (d.qex) { S.settings.quickEx = d.qex; save(); render(); return; }
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
  if (b.id === "suit" || b.id === "restgo") { b.hidden = true; return; }
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
  startClips();
  document.querySelectorAll(".tabs button").forEach(b => b.classList.contains("on") ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current"));
  document.querySelectorAll(".seg button, .qvar button, .chips button, .check, .tick, .qseg button, .qtype button").forEach(b => b.setAttribute("aria-pressed", b.classList.contains("on")));
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
