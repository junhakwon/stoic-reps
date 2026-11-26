// Unbothered (formerly Stoic Reps): a small offline training log. All data stays on this device (localStorage), with JSON backup.
"use strict";

// ---------- exercises ----------
const EX = {
  pullup: { name: "Pull-ups", one: "pull-up", step: 2.5 },
  pushup: { name: "Push-ups", one: "push-up", step: 2.5 },
  squat:  { name: "Squats",   one: "squat",   step: 2.5 },
  lunge:  { name: "Lunges",   one: "lunge",   step: 2.5, perLeg: true },
  kneeraise: { name: "Hanging knee raises", short: "Knee raises", one: "hanging knee raise", step: 2.5 },
  legraise: { name: "Hanging leg raises", short: "Leg raises", one: "hanging leg raise", step: 2.5 },
};
const QUICK_KG = ["pullup", "kneeraise", "legraise"];   // quick sets that can carry added weight
const PUSH_VAR = ["Floor", "Feet up", "Backpack"];   // push-up variations, easiest first
const PULL_VAR = ["Standard", "L-sit"];              // pull-up types; each keeps its own max, records and progression
const VARS = { pullup: PULL_VAR, pushup: PUSH_VAR };
const varName = (ex, v) => ex === "pullup" ? PULL_VAR[v] : PUSH_VAR[v].toLowerCase();
const gtgV = () => ((S.settings.gtgVar || {}).pullup) || 0;   // type used by the quick pull-up button
const KEY = "stoicreps.v1";   // kept from the old name: your logs live under this key, so it must never change
const BODYWEIGHT_DEFAULT = 67;

function defaults() {
  return {
    v: 1,
    settings: {
      theme: "dark",
      ranges: { pullup: { bw: [10, 15], wt: [5, 8] }, pushup: [15, 25], squat: [10, 15], lunge: [10, 12], kneeraise: [10, 15], legraise: [8, 12] },
      gtg: { pullup: 6, pushup: 10, kneeraise: 10, legraise: 6 }, // usual grease-the-groove set
      gtgKg: { pullup: 0, kneeraise: 0, legraise: 0 },         // added kg on the quick set
      rest: { bw: 120, wt: 180 },
      quickEx: "pullup",                           // exercise picked in the quick-add bar                  // rest timer after a working set, seconds (0 = off)
      baseline: { pullup: 17, pushup: 25 },       // bests before the app
      bodyweight: BODYWEIGHT_DEFAULT,
      backupEvery: 7,                              // days between backup reminders (0 = off)
      maxHr: 0,                                    // for heart-rate zones; 0 = use the highest seen on a run (at least 185)
    },
    goals: [
      { id: 1, ex: "pushup", reps: 40, kg: 0, label: "40 push-ups unbroken" },
      { id: 2, ex: "pullup", reps: 20, kg: 0, label: "20 pull-ups unbroken" },
      { id: 3, ex: "pullup", reps: 5, kg: 20, label: "5 pull-ups with +20 kg" },
      { id: 4, ex: "squat", reps: 20, kg: 0, label: "20 bodyweight squats, clean form", manual: true },
      { id: 5, ex: "squat", reps: 10, kg: 20, label: "10 goblet squats with 20 kg" },
    ],
    sets: [],          // { t, ex, reps, kg, v (push-up variation / pull-up type), gtg }
    wods: [],          // workouts of the day: { t, t0, id, fmt, res, vol, load } (see "WOD of the day")
    runs: [],          // { t (start), dur (s), dist (m), kcal, avgHr, maxHr, sport, hr: { bpm: s }, trace, src: fit|gpx|tcx|hand }
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
  if (!Array.isArray(s.runs)) s.runs = [];
  if (!Array.isArray(s.wods)) s.wods = [];
  return s;
}
function save() { memoBox.clear(); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast("Could not save on this device", true); } }
// results of the heavier calculations, kept until the data changes (save) or the screen is drawn again (render)
const memoBox = new Map();
function memo(key, fn) { if (memoBox.has(key)) return memoBox.get(key); const v = fn(); memoBox.set(key, v); return v; }

// ---------- dates ----------
const pad = n => String(n).padStart(2, "0");
// "YYYY-MM-DD" in local time; set and run times repeat a lot, so their keys are cached
const dkCache = new Map();
const dayKey = t => {
  if (t === undefined) t = Date.now(); else { const k = dkCache.get(t); if (k !== undefined) return k; }
  const d = new Date(t), k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (dkCache.size > 50000) dkCache.clear();
  dkCache.set(t, k); return k;
};
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
// a day counts as active when you logged a set, a run or a WOD
const activeDays = () => memo("active", () => new Set(S.sets.map(s => dayKey(s.t)).concat(S.runs.map(r => dayKey(r.t)), S.wods.map(x => dayKey(x.t)))));

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
const sessions = (ex, beforeToday) => memo(`ses:${ex}:${!!beforeToday}`, () => sessionsRaw(ex, beforeToday));
function sessionsRaw(ex, beforeToday) {   // working sets (not grease-the-groove) grouped by day, oldest first
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
const suggest = (ex, today) => memo(`sg:${ex}:${!!today}`, () => suggestRaw(ex, today));
function suggestRaw(ex, today) {
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
  const d = dayKey(), trained = activeDays().has(d);
  const stale = !S.qotd || S.qotd.d !== d || !QUOTE_BY_ID[S.qotd.id] || (trained && !TRAIN_THEMES.includes(QUOTE_BY_ID[S.qotd.id].th));
  if (stale) {
    let pool = trained ? QUOTES.filter(q => TRAIN_THEMES.includes(q.th)) : QUOTES;
    pool = spiritMix(pool, hash(d + "k") % 100 < SPIRIT_PCT);
    S.qotd = { d, id: pool[hash(d) % pool.length].id }; save();
  }
  return QUOTE_BY_ID[S.qotd.id];
}
// about 40% of quotes come from the ones in the Stoic spirit (films, poems, speeches), the rest from the Stoics
const SPIRIT_PCT = 40;
const spiritMix = (pool, spirit) => { const p = pool.filter(q => spirit ? q.k === "spirit" : !q.k); return p.length ? p : pool; };
let lastQuoteId = -1;
function nextQuote(themes, strict) {      // 70% from the given themes (always, if strict)
  const prefer = strict || Math.random() < 0.7;
  let pool = QUOTES.filter(q => q.id !== lastQuoteId && (!prefer || (themes || TRAIN_THEMES).includes(q.th)));
  if (!pool.length) pool = QUOTES;
  pool = spiritMix(pool, Math.random() * 100 < SPIRIT_PCT);
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
// the streak counts training days (a run counts on its own); one rest day in any 7 keeps it going, two missed days in a row end it.
// status per day: on (trained), rday (the allowed rest day), off (missed), now (today, not trained yet)
const streakInfo = () => memo("streak", streakInfoRaw);
function streakInfoRaw() {
  const days = activeDays(), today = dayKey(), status = {};
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
  return { n: run, best, status, restOk, row, lastRest };
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
    ${quoteCard(nextQuote(["discipline", "effort"], true))}${S.settings.widgetOn ? `<button class="big" data-act="widget-send">⇪ Update widget</button>` : ""}<button class="big primary" data-close-modal>Done for now</button>`;
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
  const before = streak(), first = !logDay && !activeDays().has(dayKey());
  if (!logDay && dayKey(set.t) === dayKey()) startRound(set.ex, null, set.gtg, set.t);
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
  const sg = suggest(ex, true), rt = roundTarget(ex);
  cur = rt ? { ex, reps: rt.reps, kg: rt.kg, v: rt.v } : { ex, reps: sg.reps, kg: sg.kg, v: sg.v };   // start at today's target; "Same as last" gives last session's set
  $("#sh-title").textContent = EX[ex].name + (logDay ? " · " + dayLabel(logDay) : "");
  $("#sh-per").textContent = EX[ex].perLeg ? "(per leg)" : "";
  $("#sh-var").hidden = !VARS[ex];
  if (VARS[ex]) $("#sh-var label").textContent = ex === "pullup" ? "Pull-up type" : "Push-up variation";
  $("#sh-quote").innerHTML = "";
  drawSheet(); $("#sheet").hidden = false;
}
function drawSheet() {
  const sg = suggest(cur.ex, true), rt = roundTarget(cur.ex), n = rt ? rt.n : S.sets.filter(s => s.ex === cur.ex && !s.gtg && dayKey(s.t) === curDay()).length, of = rt ? rt.planned : sg.sets;
  $("#sh-next").innerHTML = esc(rt ? `Back-off: ${rt.planned} × ${rt.reps}${loadText(cur.ex, rt.kg, rt.v)}` : sg.text.replace(/^Next:/, logDay ? "Plan:" : "Today:")) +
    `<span class="setn">${n >= of ? `all ${of} sets done ✓` : `set ${n + 1} of ${of}`}</span>`;
  $("#sh-reps").textContent = cur.reps;
  $("#sh-kg").textContent = cur.kg ? "+" + fmtKg(cur.kg) : "0";
  if (VARS[cur.ex]) $("#sh-var-seg").innerHTML = VARS[cur.ex].map((n, i) => `<button data-var="${i}" class="${cur.v === i ? "on" : ""}">${n}</button>`).join("");
  drawLast();
  const today = S.sets.map((s, i) => [s, i]).filter(([s]) => s.ex === cur.ex && dayKey(s.t) === curDay());
  $("#sh-today").innerHTML = today.length ? today.map(([s, i]) => `<button data-del-set="${i}" class="${s.gtg ? "gtg" : ""} ${pendingDel === i ? "del" : ""}" aria-label="${pendingDel === i ? "Tap again to remove this set" : "Set of " + s.reps + ", tap to remove"}">${pendingDel === i ? "Remove?" : `${s.reps}${loadText(s.ex, s.kg, s.v).replace(" @ ", " ")}${s.gtg ? " · GTG" : ""}`}</button>`).join("") + '<span class="muted tip">tap a set to remove it</span>' : `<span class="muted" style="background:none;padding:0">No sets yet ${logDay ? "that day" : "today"}</span>`;
}
function closeSheet() { $("#sheet").hidden = true; cur = null; render(); }
// last time: the previous session's working sets for this exercise, and the set that matches the one you're on now
function lastSession(ex) { const ss = sessions(ex).filter(x => x.d < curDay()); return ss[ss.length - 1] || null; }
function sameRef(ex) {
  const last = lastSession(ex); if (!last) return null;
  const done = S.sets.filter(s => s.ex === ex && !s.gtg && dayKey(s.t) === curDay()).length;
  return last.sets[Math.min(done, last.sets.length - 1)];
}
function drawLast() {
  const ex = cur.ex, last = lastSession(ex), el = $("#sh-last");
  if (!last) { el.innerHTML = ""; return; }
  const one = new Set(last.sets.map(loadVal)).size === 1, lt = (s) => loadText(ex, s.kg, s.v).replace(" @ ", " ");
  const txt = last.sets.map(s => s.reps + (one ? "" : lt(s))).join(", ") + (one ? loadText(ex, last.sets[0].kg, last.sets[0].v) : "");
  const ref = sameRef(ex);
  el.innerHTML = `<span>Last time · ${dayLabel(last.d)}<b>${esc(txt)}</b></span>
    <button class="small-btn" data-same>Same as last<small>${ref.reps}${esc(lt(ref))}</small></button>`;
}
// log the set shown in the sheet
function logCur() {
  unlockBeep(); pendingDel = null;
  const pr = logSet({ t: stamp(), ex: cur.ex, reps: cur.reps, kg: cur.kg, v: VARS[cur.ex] ? cur.v : 0, gtg: false });
  drawSheet();
  if (!logDay) startRest(S.settings.rest[cur.kg > 0 ? "wt" : "bw"]);
  // no toast here: the new set shows as a chip in the sheet (tap it twice to remove), and a toast would sit over the sheet's buttons
  if (pr) celebrate(pr); else { $("#sh-quote").innerHTML = quoteCard(nextQuote()); const c = document.querySelectorAll("#sh-today button"); if (c.length) c[c.length - 1].classList.add("new"); }
}

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

// ---------- runs: from a Garmin file (garmin.js reads it on the phone) or typed in by hand ----------
const KIND = { run: "run", walk: "walk", hike: "hike", ride: "ride", swim: "swim", soccer: "soccer", activity: "activity" };
const ON_FOOT = ["run", "walk", "hike"];   // counted in running kilometres
const RUN_MUSCLES = { run: ["quads", "calves"], walk: ["quads", "calves"], hike: ["quads", "calves"], ride: ["quads"], swim: ["shoulders", "lats", "arms"], soccer: ["quads", "calves"], activity: ["quads", "calves"] };
const cap = s => s[0].toUpperCase() + s.slice(1);
const fmtDur = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`; };
const fmtKm = m => (m / 1000).toFixed(2);
const paceOf = r => r.dist > 0 && r.sport !== "ride" && r.sport !== "swim" && r.sport !== "soccer" ? fmtDur(r.dur / (r.dist / 1000)) + " /km" : "";
const pace100 = r => r.dist > 0 ? fmtDur(r.dur / (r.dist / 100)) : "";   // swim pace, per 100 m
const fmtDist = r => r.dist ? (r.sport === "swim" ? `${r.dist.toLocaleString()} m` : `${fmtKm(r.dist)} km`) : "";
const maxHr = () => S.settings.maxHr || Math.max(185, ...S.runs.map(r => r.maxHr || 0));
// Garmin's default zones, as % of max heart rate: Z1 under 60, Z2 60–70, Z3 70–80, Z4 80–90, Z5 90 and up
const ZONES = [["Z1", "Warm-up"], ["Z2", "Easy"], ["Z3", "Aerobic"], ["Z4", "Threshold"], ["Z5", "Maximum"]];
function zonesOf(r) {
  const mx = maxHr(), z = [0, 0, 0, 0, 0];
  for (const b in r.hr || {}) z[Math.max(0, Math.min(4, Math.floor((b / mx * 100 - 50) / 10)))] += r.hr[b];
  return z;
}
// effort: minutes in each zone weighted 1-5 (a heart-rate training load), so runs of any length can be compared
function effortOf(r) {
  const z = zonesOf(r); if (!z.some(Boolean)) return null;
  return Math.round(z.reduce((t, s, i) => t + s / 60 * (i + 1), 0));
}
const effortWord = e => e < 40 ? "easy" : e < 80 ? "moderate" : e < 140 ? "hard" : "very hard";
let pendingRunDel = null;   // start time of the run waiting for a second tap on Remove
function runCard(r) {
  const z = zonesOf(r), tot = z.reduce((a, b) => a + b, 0), top = tot ? z.indexOf(Math.max(...z)) : -1;
  const at = new Date(r.t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const tr = r.trace || [], lo = Math.min(...tr), hi = Math.max(...tr);
  const line = tr.length > 1 ? `<svg class="hrline" viewBox="0 0 300 44" preserveAspectRatio="none" aria-hidden="true"><polyline points="${tr.map((v, i) =>
    `${(i / (tr.length - 1) * 300).toFixed(1)},${(40 - (v - lo) / Math.max(1, hi - lo) * 36).toFixed(1)}`).join(" ")}"/></svg>` : "";
  const stat = (v, l) => v ? `<div><b>${v}</b><span>${l}</span></div>` : "";
  const eff = effortOf(r);
  // splits: a bar per km, longest bar = fastest km
  const sp = r.splits || [], fast = Math.min(...sp), slow = Math.max(...sp);
  const splits = sp.length ? `<div class="splits" aria-label="Splits per kilometre">${sp.map((s, i) => `<div class="sp${sp.length > 1 && s === fast ? " fast" : ""}${sp.length > 1 && s === slow ? " slow" : ""}">
      <span>${i + 1}</span><i style="width:${Math.round(100 * fast / s)}%"></i><b>${fmtDur(s)}</b></div>`).join("")}
      ${r.splitLast ? `<div class="sp part"><span>+${(r.splitLast[1] / 1000).toFixed(2)}</span><i style="width:${Math.min(100, Math.round(100 * fast / (r.splitLast[0] / r.splitLast[1] * 1000)))}%"></i><b>${fmtDur(r.splitLast[0] / r.splitLast[1] * 1000)}</b></div>` : ""}
      <p class="muted zsum">${sp.length > 1 ? `Fastest km ${sp.indexOf(fast) + 1} (${fmtDur(fast)}) · slowest km ${sp.indexOf(slow) + 1} (${fmtDur(slow)})${sp[sp.length - 1] < sp[0] ? " · negative split" : ""}` : "Pace per km"}</p></div>` : "";
  return `<div class="card runcard"><div class="rhead"><b>${cap(KIND[r.sport] || "run")}</b><span class="muted">${at} · ${r.src === "hand" ? "by hand" : r.src === "health" ? "Apple Health" : "Garmin"}</span>
      <button class="small-btn ${pendingRunDel === r.t ? "del" : ""}" data-run-del="${r.t}">${pendingRunDel === r.t ? "Remove?" : "Remove"}</button></div>
    <div class="rstats">${stat(fmtDur(r.dur), "time")}${sportStats(r, stat)}
      ${stat(r.avgHr, "avg bpm")}${stat(r.maxHr, "max bpm")}${stat(r.kcal, "kcal")}${stat(eff, `effort · ${eff ? effortWord(eff) : ""}`)}</div>
    ${splits}
    ${tot ? `<div class="zbar" role="img" aria-label="Heart-rate zones: ${z.map((s, i) => `${ZONES[i][0]} ${Math.round(100 * s / tot)}%`).join(", ")}">${z.map((s, i) => s ? `<i class="z${i + 1}" style="flex:${s}"></i>` : "").join("")}</div>
      <div class="zleg">${z.map((s, i) => `<span class="${i === top ? "top" : ""}"><i class="z${i + 1}"></i>${ZONES[i][0]} ${fmtDur(s)}</span>`).join("")}</div>
      <p class="muted zsum">Mostly ${ZONES[top][0]} (${ZONES[top][1].toLowerCase()}) · zones from max ${maxHr()} bpm</p>` : ""}
    ${line ? `<div class="hrwrap">${line}<span class="muted">${lo}–${hi} bpm</span></div>` : ""}</div>`;
}
// the numbers that matter for each sport
function sportStats(r, stat) {
  if (r.sport === "swim") {
    const w = r.swim || {}, pool = w.pool ? (w.yd ? `${Math.round(w.pool / .9144)} yd` : `${Math.round(w.pool)} m`) : "";
    return stat(r.dist ? r.dist.toLocaleString() : "", "metres") + stat(pace100(r), "per 100 m") + stat(w.lengths, `lengths${pool ? ` (${pool})` : ""}`)
      + stat(w.strokes && w.lengths ? Math.round(w.strokes / w.lengths) : "", "strokes / length") + stat(w.stroke ? cap(w.stroke) : w.open ? "Open water" : "", w.stroke ? "mostly" : "");
  }
  if (r.sport === "soccer") return stat(r.dist ? fmtKm(r.dist) : "", "km covered") + stat(r.top ? (r.top * 3.6).toFixed(1) : "", "top km/h") + stat(r.sprints, "sprints (20+ km/h)");
  return stat(r.dist ? fmtKm(r.dist) : "", "km") + stat(paceOf(r).replace(" /km", ""), "per km");
}
function runRow(st) {
  const last = S.runs[S.runs.length - 1], g = Math.max(st.quads.g, st.calves.g);
  const sub = last ? `Last ${KIND[last.sport] || "run"}: ${last.dist ? fmtDist(last) + ", " : ""}${fmtDur(last.dur)} · ${agoText(Math.round((keyToDate(dayKey()) - keyToDate(dayKey(last.t))) / 864e5))}` : "Add from a Garmin file or by hand";
  return `<button class="exrow" data-run-add><i class="mdot" style="${g ? `opacity:${(.35 + .65 * g).toFixed(2)}` : ""}" data-lit="${g ? 1 : 0}"></i>
      <span class="t"><b>Run</b><span class="nx">${esc(sub)}</span>${recNote("run", st)}</span>
      <span class="plus" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></span></button>`;
}
let handSport = "run";   // sport picked for a by-hand entry
function openRunSheet() {
  $("#modal-body").innerHTML = `<div class="sheet-head"><h2>Add a run, swim or match</h2><button class="x" data-close-modal aria-label="Close">×</button></div>
    <button class="big primary" data-act="run-paste">Paste from Health</button>
    <p class="muted rhelp">Run the <b>Run to Stoic Reps</b> shortcut first. It copies today's run from Apple Health (synced from Garmin Connect).</p>
    <div id="rn-pastebox" hidden><textarea id="rn-text" rows="3" placeholder="Paste here (touch and hold → Paste)"></textarea>
      <button class="big" data-act="run-paste-text">Add pasted run</button></div>
    <button class="big" data-act="run-file">Choose Garmin file</button><input id="run-file" type="file" hidden>
    <p class="muted rhelp">Runs, pool and open-water swims, and soccer all work. Or, in Safari, open the activity on connect.garmin.com, tap ⚙ → <b>Export Original</b>, then pick the .zip here. GPX and TCX files work too. Files are read on this phone; nothing is uploaded.</p>
    <h3>Or by hand${logDay ? ` · ${dayLabel(logDay)}` : ""}</h3>
    <div class="seg" id="rn-sport">${["run", "swim", "soccer"].map(k => `<button data-hand="${k}" class="${k === handSport ? "on" : ""}">${cap(k)}</button>`).join("")}</div>
    <div class="inrow"><label>Minutes</label><input id="rn-min" type="number" inputmode="decimal" placeholder="${handSport === "soccer" ? 90 : handSport === "swim" ? 45 : 30}"></div>
    <div class="inrow"><label>Distance (${handSport === "swim" ? "m" : "km"})</label><input id="rn-km" type="number" inputmode="decimal" step="${handSport === "swim" ? 25 : 0.01}" placeholder="${handSport === "swim" ? 1500 : handSport === "soccer" ? 8 : 5}"></div>
    <div class="inrow"><label>Average heart rate</label><input id="rn-hr" type="number" inputmode="numeric" placeholder="bpm"></div>
    <button class="big" data-act="run-save">Save ${handSport === "soccer" ? "match" : handSport}</button>`;
  $("#modal").hidden = false;
}
function addRun(r) {
  // the same run again: a Garmin file (exact) replaces an Apple Health or by-hand entry (approximate); otherwise it's a repeat
  // the same activity again (same sport, starting within 5 minutes or overlapping in time); a swim never duplicates a match
  const FILE = ["fit", "gpx", "tcx"], same = x => (x.sport || "run") === (r.sport || "run") || x.sport === "activity" || r.sport === "activity";
  const dup = S.runs.find(x => same(x) && (Math.abs(x.t - r.t) < 5 * 60000 || (x.t < r.t + r.dur * 1000 && r.t < x.t + x.dur * 1000)));
  if (dup && !(FILE.includes(r.src) && !FILE.includes(dup.src))) { toast("That run is already in", true); return; }
  if (dup) S.runs.splice(S.runs.indexOf(dup), 1);
  const k = dayKey(r.t), before = streak(), first = !dup && k === dayKey() && !activeDays().has(k);
  if (k === dayKey()) startRound(null, r);
  S.runs.push(r); S.runs.sort((a, b) => a.t - b.t); save();
  if (dup) { $("#modal").hidden = true; render(); toast(`Replaced with the Garmin file: ${r.dist ? fmtDist(r) + " in " : ""}${fmtDur(r.dur)}${r.avgHr ? `, avg ${r.avgHr} bpm` : ""}`); return; }
  $("#modal").hidden = true; pendingRunDel = null;
  // show the day the run went to
  logDay = k === dayKey() || k < addDays(dayKey(), -30) ? null : k; tab = "home";
  flashAt = Date.now(); flashM = RUN_MUSCLES[r.sport] || RUN_MUSCLES.run; flashWord = "ZOOM!";
  render(); window.scrollTo(0, 0);
  toast(`${cap(KIND[r.sport] || "run")} added: ${r.dist ? fmtDist(r) + " in " : ""}${fmtDur(r.dur)}${r.avgHr ? `, avg ${r.avgHr} bpm` : ""}${k === dayKey() ? "" : ` (${dayLabel(k)})`}`);
  const n = streak(), r0 = rankOf(before), r1 = rankOf(n);
  if (n > before && r1.name !== r0.name && r1.from > 0) setTimeout(() => rankCard(r1, n), 60);
  else if (first) setTimeout(() => suitUp(n), 60);
}
function addHealthRun(txt) {
  try { addRun(Garmin.fromHealth(txt, maxHr())); } catch (e) { toast(cap(e.message), true); }
}
function saveHandRun() {
  const min = parseFloat($("#rn-min").value), km = parseFloat($("#rn-km").value), hr = parseInt($("#rn-hr").value);
  if (!(min > 0 && min < 1440)) { toast("Enter how many minutes it took", true); return; }
  const dur = Math.round(min * 60);
  addRun({ t: logDay ? stamp() : Date.now() - dur * 1000, dur, dist: km > 0 ? Math.round(handSport === "swim" ? km : km * 1000) : null, kcal: null,
    avgHr: hr > 30 && hr < 240 ? hr : null, maxHr: null, sport: handSport, hr: hr > 30 && hr < 240 ? { [hr]: dur } : {}, trace: [], src: "hand" });
}
function runsProgress() {
  if (!S.runs.length) return "";
  const wk = weekStart(dayKey()), weeks = [], foot = S.runs.filter(r => ON_FOOT.includes(r.sport || "run"));
  for (let i = 7; i >= 0; i--) { const w = addDays(wk, -7 * i), rs = foot.filter(r => weekStart(dayKey(r.t)) === w);
    weeks.push({ x: shortDate(w), y: Math.round(rs.reduce((a, r) => a + (r.dist || 0), 0) / 100) / 10 }); }
  const thisWk = foot.filter(r => weekStart(dayKey(r.t)) === wk), since = addDays(dayKey(), -29);
  const month = foot.filter(r => dayKey(r.t) >= since), withHr = month.filter(r => r.avgHr);
  const sw = S.runs.filter(r => r.sport === "swim" && dayKey(r.t) >= since), sc = S.runs.filter(r => r.sport === "soccer" && dayKey(r.t) >= since);
  const list = S.runs.slice().sort((a, b) => b.t - a.t).slice(0, 8).map(r => `<div class="act"${dayKey(r.t) >= addDays(dayKey(), -30) ? ` role="button" tabindex="0" data-goday="${dayKey(r.t)}"` : ""}><i class="sp-${r.sport || "run"}"></i><span><b>${cap(KIND[r.sport] || "run")}</b><small>${dayLabel(dayKey(r.t))}</small></span>
      <em>${r.dist ? fmtDist(r) + " · " : ""}${fmtDur(r.dur)}${r.avgHr ? ` · ${r.avgHr} bpm` : ""}</em></div>`).join("");
  return `<h3>Runs, swims & soccer</h3><div class="stats">${foot.length ? `
      <div class="stat"><b>${fmtKm(thisWk.reduce((a, r) => a + (r.dist || 0), 0))}</b><span>km on foot this week</span></div>
      <div class="stat"><b>${fmtDur(thisWk.reduce((a, r) => a + r.dur, 0))}</b><span>time this week</span></div>
      <div class="stat"><b>${month.length}</b><span>runs & walks, last 30 days</span></div>
      <div class="stat"><b>${withHr.length ? Math.round(withHr.reduce((a, r) => a + r.avgHr, 0) / withHr.length) : "—"}</b><span>avg heart rate, last 30 days</span></div>` : ""}
      ${sw.length ? `<div class="stat"><b>${sw.reduce((a, r) => a + (r.dist || 0), 0).toLocaleString()} m</b><span>swum in ${sw.length} swim${sw.length === 1 ? "" : "s"}, last 30 days</span></div>` : ""}
      ${sc.length ? `<div class="stat"><b>${(sc.reduce((a, r) => a + r.dur, 0) / 3600).toFixed(1)} h</b><span>soccer in ${sc.length} game${sc.length === 1 ? "" : "s"}, last 30 days</span></div>` : ""}</div>
    ${foot.length ? `<div class="card" style="margin-top:10px"><p class="muted" style="margin:0 0 4px;font-size:13px">Kilometres on foot per week</p>${barChart(weeks, "kilometres per week")}</div>` : ""}
    <div class="card list">${list}</div>`;
}

// ---------- screens ----------
let tab = "home", progEx = "pullup";
const LOOKS = { gotham: { name: "Gotham", theme: "dark", color: "#0b0822" }, marble: { name: "Marble", theme: "light", color: "#ece6da" }, classic: { name: "Classic", theme: null, color: "#111214" } };
function render() {
  memoBox.clear();
  // the look (Gotham, Marble or Classic) sets the whole visual style; Classic keeps its own dark/light switch
  const look = LOOKS[S.settings.look] ? S.settings.look : "gotham", root = document.documentElement;
  root.dataset.look = look; root.dataset.theme = look === "classic" ? S.settings.theme : LOOKS[look].theme;
  const tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.content = look === "classic" ? (S.settings.theme === "light" ? "#f4f1ea" : "#111214") : LOOKS[look].color;
  document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
  $("#view").innerHTML = tab === "home" ? homeView() : tab === "progress" ? progressView() : moreView();
}

// Train screen (design C): body + readiness, the 10-day path, daily ticks, the quote, exercise tiles
function homeView() {
  const d = curDay(), daily = S.daily[d] || {}, st = muscleState();
  return `<div class="hdr"><h1>Unbothered</h1>
      <div class="dayctl ${logDay ? "past" : ""}"><button data-day="-1" aria-label="Previous day" ${d <= addDays(dayKey(), -30) ? "disabled" : ""}>‹</button>
        <span>${dayLabel(d)}</span><button data-day="1" aria-label="Next day" ${logDay ? "" : "disabled"}>›</button></div></div>
    ${logDay ? `<p class="muted daynote">Creatine, protein and any sets you log now go to ${dayLabel(d).toLowerCase() === "yesterday" ? "yesterday" : dayLabel(d)}. <button class="link" data-day="0">Back to today</button></p>` : ""}
    ${backupBanner()}
    ${wodCard()}
    ${readyCard(st)}
    ${pathCard()}
    <div id="home-quote">${quoteCard(quoteOfDay())}</div>
    ${restDayCard()}
    ${logDay ? "" : fold("strength", "Strength work", "Sets and progression, if you want more", planCard())}
    <h3 class="sec">All exercises</h3>
    <div class="tiles">${Object.keys(EX).map(k => tile(k, st)).join("")}${runTile(st)}</div>
    ${S.runs.filter(r => dayKey(r.t) === d).map(runCard).join("")}
    ${quickBar()}`;
}
const recColor = v => v >= 70 ? "var(--good)" : v >= 40 ? "var(--rec-mid, var(--accent))" : "var(--rec-low, var(--warn))";   // a look can recolour mid and low
// creatine and protein: one tap each, inside the readiness card
const tickRow = () => { const dl = S.daily[curDay()] || {};
  return `<div class="rticks">${[["creatine", "Creatine"], ["protein", "Protein"]].map(([k, l]) => `<button class="tick mini ${dl[k] ? "on" : ""}" data-daily="${k}" aria-pressed="${!!dl[k]}"><span class="box">${dl[k] ? "✓" : ""}</span>${l}</button>`).join("")}</div>`; };
// readiness: the average recovery of all muscles, a ring, a line, and upper / core / legs bars
function readyCard(st) {
  const avg = a => Math.round(a.reduce((t, m) => t + st[m].rec, 0) / a.length), all = avg(Object.keys(MUSCLES));
  const G = [["upper body", ["shoulders", "chest", "lats", "arms", "forearms"]], ["core", ["core"]], ["legs", ["quads", "calves"]]].map(([n, a]) => [n, avg(a)]);
  const fresh = G.filter(g => g[1] >= 80).map(g => g[0]), tired = G.filter(g => g[1] < 50).map(g => g[0]);
  const plural = a => a.length > 1 || a[0] === "legs", join = a => a.length > 1 ? a.slice(0, -1).join(", ") + " and " + a[a.length - 1] : a[0];
  const msg = !tired.length ? (fresh.length === 3 ? "Fresh all over. Ready for anything." : "Good to train.")
    : tired.length === 3 ? "Rest is training too, today."
    : `${fresh.length ? `${cap(join(fresh))} ${plural(fresh) ? "are" : "is"} fresh.<br>` : ""}<span class="tired">${cap(join(tired))} need${plural(tired) ? "" : "s"} a day.</span>`;
  const dash = (314 * all / 100).toFixed(1);
  return `<div class="card ready">${bodySvg(st, "mini")}
    <div class="rside"><div class="gauge" role="img" aria-label="${all}% ready"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="50" class="gt"/>
        <circle cx="60" cy="60" r="50" class="gv" style="stroke:${all < 50 ? "var(--warn)" : "var(--accent)"}" stroke-dasharray="${dash} 314" transform="rotate(-90 60 60)"/></svg>
        <div><b>${all}%</b><span>READY</span></div></div>
      <p class="rmsg">${msg}</p>
      <div class="rbars">${G.map(([n, v]) => `<div><span>${n === "upper body" ? "Upper" : cap(n)}</span><i><i style="width:${v}%;background:${recColor(v)}"></i></i><b style="${v < 40 ? "color:var(--warn)" : ""}">${v}</b></div>`).join("")}</div>${tickRow()}</div></div>`;
}
// ---------- today's workout: picked from your past sessions ----------
// one exercise per area (pull, push, legs, core). Each is scored by how overdue it is against your own rhythm
// (how often you did it in the last 4 weeks), how much you usually do it, and how fresh its muscles are.
// Areas under 55% recovered sit out. A run joins when you run regularly, it's due, and your legs are fresh.
// Workouts come in rounds, as many as you want (see "rounds" below).
const AREAS = [["pull", ["pullup"]], ["push", ["pushup"]], ["legs", ["squat", "lunge"]], ["core", ["kneeraise", "legraise"]]];
const AREA_OF = {}; for (const [a, xs] of AREAS) for (const x of xs) AREA_OF[x] = a;
const daysSince = k => k ? Math.round((keyToDate(dayKey()) - keyToDate(k)) / 864e5) : null;
const readiness = rec => Math.round(Object.keys(MUSCLES).reduce((t, m) => t + rec[m], 0) / Object.keys(MUSCLES).length);
const workedToday = () => { const t = dayKey(); return S.sets.filter(s => !s.gtg && dayKey(s.t) === t); };
const isRun = r => (r.sport || "run") === "run";
const actsToday = () => S.runs.filter(r => dayKey(r.t) === dayKey());   // runs, swims, soccer...
const ranToday = () => actsToday().some(isRun);
const runsOf4w = () => S.runs.filter(r => isRun(r) && dayKey(r.t) >= addDays(dayKey(), -27));
const lastRunOf = () => S.runs.filter(isRun).reduce((a, r) => !a || r.t > a.t ? r : a, null);
function exInfo(ex, rec, win) {   // win: [from, to) times; sets logged in it count as done (default: all of today)
  const today = dayKey(), from = addDays(today, -27), mine = S.sets.filter(s => s.ex === ex && !s.gtg);
  const days = new Set(mine.map(s => dayKey(s.t)).filter(k => k >= from && k < today));
  const past = mine.map(s => dayKey(s.t)).filter(k => k < today).sort(), d = daysSince(past[past.length - 1]);
  const m = MUSCLE_OF[ex].reduce((a, b) => rec[b] < rec[a] ? b : a);
  const gap = days.size ? Math.max(1.5, 28 / days.size) : 3;       // your usual days between sessions
  const due = d === null ? .7 : d / gap;                            // 1 = right on your rhythm
  return { ex, area: AREA_OF[ex], m, rec: rec[m], d, due, doneN: mine.filter(s => win ? s.t >= win[0] && s.t < win[1] : dayKey(s.t) === today).length,
    planned: suggest(ex, true).sets, score: Math.min(due, 3) + Math.min(days.size, 8) * .06 + rec[m] / 200 };
}
// one pick per area from the exercises not excluded; anything already started counts as picked
function pickPlan(rec, exclude = []) {
  const items = [], out = [];
  for (const [area, exs] of AREAS) {
    const opts = exs.filter(x => !exclude.includes(x)).map(x => exInfo(x, rec)); if (!opts.length) continue;
    const pick = opts.find(o => o.doneN) || opts.filter(o => o.rec >= 55).sort((a, b) => b.score - a.score)[0];
    if (pick) items.push(pick); else out.push(area);
  }
  items.sort((a, b) => (b.doneN ? 9 : 0) + b.score - ((a.doneN ? 9 : 0) + a.score));
  const want = readiness(rec) >= 60 ? 3 : 2;   // 3 on a good day, 2 when you're carrying fatigue
  return { plan: items.slice(0, Math.max(want, items.filter(o => o.doneN).length)), out };
}
// the plan before you've trained today
function livePlan() {
  const rec = recovery(keyToDate(dayKey()).getTime()), { plan, out } = pickPlan(rec);
  const runs = runsOf4w(), last = lastRunOf(), legs = Math.min(rec.quads, rec.calves);
  let run = null;
  if (runs.length >= 2 && legs >= 60) {
    const d = daysSince(dayKey(last.t)), gap = Math.max(1.5, 28 / runs.length);
    if (d >= gap * .8) { run = { d, last }; if (plan.length > 2 && plan[plan.length - 1].area === "legs") plan.pop(); }
  }
  return { plan, run, out };
}
// ---------- WOD of the day (wods.js): one CrossFit-style workout a day, picked by how fresh you are and variety ----------
// Results are kept in S.wods = [{ t (finished), t0 (started), id, fmt, res, vol: { move: reps }, load: { muscle: units } }].
// load feeds recovery, the body map, the streak, the path and the calendar like sets and runs do; vol never touches set records.
const WOD_BY = Object.fromEntries(WODS.map(w => [w.id, w]));
const MV = { run: "Run", hang: "Hang", pushsquat: "Push-up + squat" };
const moveName = m => m[0] === "pushup" && m[3] ? `Push-ups (${PUSH_VAR[m[3]].toLowerCase()})` : EX[m[0]] ? EX[m[0]].name : MV[m[0]];
const moveQty = (m, n = m[1]) => m[0] === "run" ? `${n} m` : m[0] === "hang" ? `${n} s` : m[0] === "lunge" ? `${n}/leg` : `${n}`;
const swapNote = m => m[2] ? ` <span class="wsw">for ${esc(m[2])}</span>` : "";
const SEC = { pullup: 3, pushup: 2, squat: 2, lunge: 4, kneeraise: 3, legraise: 3.5, pushsquat: 5, run: .3, hang: 1 };   // seconds per rep, metre or second
const PER_UNIT = { pullup: 5, pushup: 10, squat: 12, lunge: 6, kneeraise: 10, legraise: 8, run: 500, hang: 60 };       // this much ≈ one working set
function wodFmt(w) {   // only the line for this workout's format is built
  const F = { rft: () => w.rounds === 1 ? "For time" : `${w.rounds} rounds for time`, amrap: () => `${w.min}-min AMRAP: as many rounds as you can`,
    emom: () => `EMOM ${w.min} min: a new start every minute`, tabata: () => "Tabata: 8 × 20 s work / 10 s rest, the moves take turns",
    ladder: () => `Ladder: 1 of each, then 2, 3… up to ${w.top}. For time`, scheme: () => `${w.scheme.join("-")} reps of each, for time`,
    climb: () => `Every minute: ${w.start} reps in minute 1, one more each minute, until you can't finish inside the minute`,
    rounds: () => `${w.rounds} rounds, ${w.rest} s rest between` };
  return F[w.fmt] ? F[w.fmt]() : "";
}
const fmtShort = w => ({ rft: w.rounds === 1 ? "For time" : `${w.rounds} RFT`, amrap: `${w.min}' AMRAP`, emom: `EMOM ${w.min}'`, tabata: "Tabata", ladder: "Ladder", scheme: w.scheme && w.scheme.join("-"), climb: "Climb", rounds: `${w.rounds} rounds` }[w.fmt]);
// how much of each move a workout is: the whole thing as written (AMRAP and climb: a fair guess), or what a result says was done
function wodVolume(w, res) {
  const V = {}, add = (k, n) => { if (n > 0) V[k] = (V[k] || 0) + n; }, once = l => l.reduce((t, m) => t + SEC[m[0]] * m[1], 0);
  if (w.fmt === "rft" || w.fmt === "rounds") { const r = res && res.rounds != null ? res.rounds : w.rounds; for (const m of w.moves) add(m[0], m[1] * r); }
  else if (w.fmt === "amrap") {
    const r = res ? res.rounds || 0 : w.min * 60 / (once(w.moves) + 6); let extra = res ? res.reps || 0 : 0;
    for (const m of w.moves) { add(m[0], m[1] * r); const e = Math.min(extra, m[1]); add(m[0], e); extra -= e; }
  } else if (w.fmt === "ladder") for (const m of w.moves) add(m[0], w.top * (w.top + 1) / 2);
  else if (w.fmt === "scheme") for (const m of w.moves) add(m[0], w.scheme.reduce((a, b) => a + b, 0));
  else if (w.fmt === "tabata") for (const m of w.moves) add(m[0], 4 * Math.round(20 / SEC[m[0]]));
  else if (w.fmt === "emom") { for (const m of w.odd) add(m[0], m[1] * Math.ceil(w.min / 2)); for (const m of w.even) add(m[0], m[1] * Math.floor(w.min / 2)); }
  else if (w.fmt === "climb") { const n = res ? res.minutes || 0 : 6; add(w.moves[0][0], n * w.start + n * (n - 1) / 2); }
  for (const k in V) V[k] = Math.round(V[k]);
  return V;
}
function wodLoad(V) {
  const L = {}, put = (ms, u) => { for (const m of ms) L[m] = (L[m] || 0) + u; };
  for (const [k, n] of Object.entries(V)) {
    if (k === "pushsquat") { put(MUSCLE_OF.pushup, n / PER_UNIT.pushup); put(MUSCLE_OF.squat, n / PER_UNIT.squat); }
    else if (k === "run") put(["quads", "calves"], n / PER_UNIT.run);
    else if (k === "hang") put(["forearms", "lats"], n / PER_UNIT.hang);
    else put(MUSCLE_OF[k], n / PER_UNIT[k]);
  }
  for (const m in L) L[m] = Math.round(Math.min(REC_FULL, L[m]) * 100) / 100;
  return L;
}
function wodMinutes(w) {
  if (w.min) return w.min; if (w.fmt === "tabata") return 4; if (w.fmt === "climb") return 8;
  const V = wodVolume(w); let s = 0;
  for (const [k, n] of Object.entries(V)) s += SEC[k] * n;
  return Math.max(4, Math.round((s + (w.rest || 0) * ((w.rounds || 1) - 1)) / 60));
}
// best first: little work for tired muscles, not done lately, a sensible length; a daily shuffle breaks ties
function wodPicks() {
  return memo("wodPicks", () => {
    const rec = recovery(keyToDate(dayKey()).getTime()), last = {};
    for (const x of S.wods) { const d = daysSince(dayKey(x.t)); if (last[x.id] == null || d < last[x.id]) last[x.id] = d; }
    const score = w => {
      const L = wodLoad(wodVolume(w)); let pen = 0;
      for (const m in L) pen += L[m] * Math.max(0, 70 - rec[m]) / 70;
      const d = last[w.id] == null ? 30 : last[w.id], mins = wodMinutes(w);
      return Math.min(d, 21) / 21 * 2 - pen * .6 - (mins > 35 ? 1.2 : 0) + (hash(dayKey() + w.id) % 100) / 150;
    };
    return WODS.map(w => ({ w, s: score(w) })).sort((a, b) => b.s - a.s).map(x => x.w);
  });
}
const wodDay = () => { const t = dayKey(); return S.daily[t] || (S.daily[t] = {}); };
function wodChoice() { const d = wodDay(), p = wodPicks(); return d.wodId && WOD_BY[d.wodId] ? WOD_BY[d.wodId] : p[(d.wodSkip || 0) % p.length]; }
const wodScore = (w, res) => !res ? "" : res.secs != null ? fmtDur(res.secs) : w.fmt === "amrap" ? `${res.rounds} round${res.rounds === 1 ? "" : "s"}${res.reps ? ` + ${res.reps}` : ""}`
  : w.fmt === "climb" ? `${res.minutes} minute${res.minutes === 1 ? "" : "s"}` : res.rounds != null && w.fmt === "rounds" ? `${res.rounds} of ${w.rounds} rounds` : "done";
const wodRank = (w, res) => !res ? -Infinity : res.secs != null ? -res.secs : w.fmt === "amrap" ? (res.rounds || 0) * 1000 + (res.reps || 0) : w.fmt === "climb" ? res.minutes || 0 : null;
function wodBest(id, sc = "rx") {   // bests are kept per scale (easier / as written / harder)
  const w = WOD_BY[id]; let b = null;
  for (const x of S.wods) if (x.id === id && (x.scale || "rx") === sc && wodRank(w, x.res) != null && (!b || wodRank(w, x.res) > wodRank(w, b.res))) b = x;
  return b;
}
function wodMoves(w) {
  const li = m => `<li><b>${m[1] ? moveQty(m) : ""}</b><span>${moveName(m)}${swapNote(m)}</span></li>`;
  if (w.fmt === "emom") return `<p class="wgrp">Odd minutes</p><ol class="wmoves">${w.odd.map(li).join("")}</ol><p class="wgrp">Even minutes</p><ol class="wmoves">${w.even.map(li).join("")}</ol>`;
  if (w.fmt === "climb") { const m = w.moves[0]; return `<ol class="wmoves"><li><b>${w.start}, ${w.start + 1}, ${w.start + 2}…</b><span>${moveName(m)}${swapNote(m)}</span></li></ol>`; }
  const tag = w.fmt === "ladder" ? `1→${w.top}` : w.fmt === "scheme" ? w.scheme.join("-") : w.fmt === "tabata" ? "20 s" : "";
  return `<ol class="wmoves">${w.moves.map(m => tag ? `<li><b>${tag}</b><span>${moveName(m)}${swapNote(m)}</span></li>` : li(m)).join("")}</ol>`;
}
// Scaling, like Rx / Scaled on a gym whiteboard: easier = about 70% of the reps, half the running, knee raises instead of
// leg raises; harder = leg raises instead of knee raises and feet-up push-ups. Bests are kept per scale.
const SCALES = [["easy", "Easier"], ["rx", "As written"], ["hard", "Harder"]];
const scaleTag = sc => sc && sc !== "rx" ? ` <small class="wsc">${sc === "easy" ? "easier" : "harder"}</small>` : "";
function wodOf(id, sc = "rx") {
  const w = WOD_BY[id]; if (!w || !sc || sc === "rx") return w;
  const mv = m => {
    const o = m.slice();
    if (sc === "easy") {
      if (o[0] === "run" && o[1]) o[1] = Math.max(50, Math.round(o[1] * .5 / 50) * 50);
      else if (o[1]) o[1] = Math.max(1, Math.round(o[1] * .7));
      if (o[0] === "legraise") o[0] = "kneeraise";
    } else { if (o[0] === "kneeraise") o[0] = "legraise"; if (o[0] === "pushup" && !o[3]) o[3] = 1; }
    return o;
  };
  const c = Object.assign({}, w, { scale: sc });
  for (const k of ["moves", "odd", "even"]) if (w[k]) c[k] = w[k].map(mv);
  if (w.top) c.top = sc === "easy" ? 7 : 12;
  if (w.scheme) c.scheme = sc === "easy" ? w.scheme.map(n => Math.round(n * .7)) : w.scheme;
  if (w.start) c.start = sc === "easy" ? 3 : w.start + 1;
  if (w.min && sc === "easy" && w.min > 12) c.min = Math.round(w.min * .75);
  return c;
}
// the move checklist: how many of a move this round asks for, and how many rounds there are
const CHECKLIST = ["rft", "amrap", "rounds", "ladder", "scheme"];
const qtyAt = (w, i, m) => w.fmt === "ladder" ? i + 1 : w.fmt === "scheme" ? w.scheme[Math.min(i, w.scheme.length - 1)] : m[1];
const totalRounds = w => w.fmt === "ladder" ? w.top : w.fmt === "scheme" ? w.scheme.length : w.fmt === "amrap" ? Infinity : w.rounds;
const wodNeeds = w => { const ex = (w.moves || []).concat(w.odd || [], w.even || []).map(m => m[0]); return { run: ex.includes("run"), bar: ex.some(x => ["pullup", "kneeraise", "legraise", "hang"].includes(x)) }; };
let wodCancelArm = false, wodFilter = "all";
function wodRunCard(run) {
  const w = wodOf(run.id, run.scale), list = CHECKLIST.includes(w.fmt), i = run.rounds || 0, done = run.done || [], tot = totalRounds(w);
  const next = list ? w.moves.findIndex((m, k) => !done.includes(k)) : -1, nm = next >= 0 ? w.moves[next] : null;
  const roundTxt = w.fmt === "amrap" ? `Round ${i + 1}` : w.fmt === "ladder" ? `Rung ${i + 1} of ${tot}` : w.fmt === "scheme" ? `Set ${i + 1} of ${tot}` : `Round ${Math.min(i + 1, tot)} of ${tot}`;
  const rows = list ? `<div class="wchk">${w.moves.map((m, k) => { const on = done.includes(k);
      return `<button class="wmv${on ? " on" : ""}${k === next ? " nx" : ""}" data-act="wod-move" data-i="${k}" aria-pressed="${on}"><i aria-hidden="true">${on ? "✓" : ""}</i><b>${moveQty(m, qtyAt(w, i, m))}</b><span>${moveName(m)}${swapNote(m)}</span></button>`; }).join("")}</div>` : wodMoves(w);
  return `<div class="card wod wrun${run.paused ? " paused" : ""}"><div class="plhead"><b>${esc(w.name)}${scaleTag(run.scale)}</b><span class="muted">${fmtShort(w)}</span></div>
    <div class="wclock" id="wclock">0:00</div><p class="wnow" id="wnow"></p><p class="sr" id="wlive" aria-live="polite"></p>
    ${list ? `<div class="wround"><b>${roundTxt}</b>${nm ? `<span>Next: ${moveQty(nm, qtyAt(w, i, nm))} ${esc(moveName(nm).toLowerCase())}</span>` : ""}</div>` : ""}
    ${rows}${list ? `<p class="muted wtip">Tap each move as you finish it; the round counts itself.</p>` : ""}
    <div class="wctl"><button class="big" data-act="wod-pause">${run.paused ? "Resume" : "Pause"}</button><button class="big primary" data-act="wod-finish">Finish</button></div>
    <button class="link wcancel" data-act="wod-cancel">${wodCancelArm ? "Tap again to cancel the workout" : "Cancel workout"}</button></div>`;
}
function wodCard() {
  if (logDay) return "";
  const d = wodDay(), run = d.wodRun, doneToday = S.wods.filter(x => dayKey(x.t) === dayKey());
  if (run && WOD_BY[run.id]) return wodRunCard(run);
  const rows = doneToday.map(x => { const w = WOD_BY[x.id]; return w ? `<div class="rdone"><span class="plck" aria-hidden="true">✓</span><b>${esc(w.name)}${scaleTag(x.scale)}</b><span>${wodScore(w, x.res)}</span></div>` : ""; }).join("");
  if (doneToday.length && !d.wodMore) return `<div class="card plan wod"><div class="plhead"><b>Today's WOD</b><span class="muted">done</span>${widgetBtn()}</div>${rows}
      <button class="big wmore" data-act="wod-more">Another WOD</button></div>`;
  const base = wodChoice(); if (!base) return "";
  const sc = d.wodScale || "rx", w = wodOf(base.id, sc);
  const rec = recovery(), rd = readiness(rec), best = wodBest(w.id, sc), L = wodLoad(wodVolume(w));
  const tired = Object.keys(L).filter(m => L[m] >= 1 && rec[m] < 50).map(m => MUSCLES[m].name.split(" ")[0].toLowerCase());
  const lastDone = S.wods.filter(x => x.id === w.id).pop(), nd = wodNeeds(w);
  const why = [lastDone ? `Last done ${agoText(daysSince(dayKey(lastDone.t)))}` : "New for you", best ? `best ${wodScore(w, best.res)}` : ""].filter(Boolean).join(" · ");
  return `${rows ? `<div class="card plan rdlist"><div class="plhead"><b>Done today</b></div>${rows}</div>` : ""}
    <div class="card wod"><div class="plhead"><b>${doneToday.length ? "Another WOD" : "Today's WOD"}</b><span class="muted">${fmtShort(w)} · ~${wodMinutes(w)} min${nd.bar ? " · bar" : ""}</span>${doneToday.length ? "" : widgetBtn()}</div>
    <h2 class="wname">${esc(w.name)}</h2><p class="wfmt">${wodFmt(w)}</p>
    <div class="seg wscale" role="group" aria-label="How hard">${SCALES.map(([k, l]) => `<button data-wscale="${k}" class="${k === sc ? "on" : ""}" aria-pressed="${k === sc}">${l}</button>`).join("")}</div>
    ${wodMoves(w)}${w.note ? `<p class="muted wnote">${esc(w.note)}</p>` : ""}
    <p class="muted wwhy">${why}${tired.length ? ` · <span class="tired">${cap(tired.join(" and "))} still tired: try Easier</span>` : ""}</p>
    ${rd < 45 && !doneToday.length ? `<p class="wwarn">You're ${rd}% recovered. An easy walk would also be a good day's work.</p>` : ""}
    <button class="big primary" data-act="wod-start">Start</button>
    <div class="wbtns"><button class="small-btn" data-act="wod-pick">Choose another</button><button class="small-btn" data-act="wod-log">Log without timer</button></div></div>`;
}
// the chooser: every workout, the ones that suit today first, with filters
function wodPicker() {
  const p = wodPicks(), rec = recovery(keyToDate(dayKey()).getTime()), cur = wodChoice(), sc = wodDay().wodScale || "rx";
  const F = { all: () => true, short: w => wodMinutes(w) <= 10, norun: w => !wodNeeds(w).run, nobar: w => !wodNeeds(w).bar };
  const fit = w => { const L = wodLoad(wodVolume(w)), t = Object.keys(L).filter(m => L[m] >= 1 && rec[m] < 50);
    return t.length ? `<span class="wtired">${MUSCLES[t[0]].name.split(" ")[0]} tired</span>` : `<span class="wfresh">Good today</span>`; };
  const rows = p.filter(F[wodFilter]).map(w => { const n = wodNeeds(w), b = wodBest(w.id, sc);
    return `<button class="wpick${w.id === cur.id ? " on" : ""}" data-wpick="${w.id}"><span class="wpn"><b>${esc(w.name)}</b><small>${fmtShort(w)} · ~${wodMinutes(w)} min${n.run ? " · run" : ""}${n.bar ? " · bar" : ""}${b ? ` · best ${wodScore(w, b.res)}` : ""}</small></span>${fit(w)}</button>`; }).join("")
    || `<p class="muted">Nothing matches. Try another filter.</p>`;
  $("#modal-body").innerHTML = `<div class="sheet-head"><h2>Choose a WOD</h2><button class="x" data-close-modal aria-label="Close">×</button></div>
    <div class="chips wfil">${[["all", "All"], ["short", "10 min or less"], ["norun", "No running"], ["nobar", "No bar"]].map(([k, l]) => `<button data-wfil="${k}" class="${k === wodFilter ? "on" : ""}" aria-pressed="${k === wodFilter}">${l}</button>`).join("")}</div>
    <p class="muted fnote">Best for today first: fresh muscles, not done lately.</p><div class="wplist">${rows}</div>`;
  $("#modal").hidden = false;
}
// ---- the timer: a 3-2-1 lead-in, then count up (for time), count down (AMRAP) or intervals (EMOM, Tabata, climb) ----
let wodT = 0, wodPhase = null, wodLock = null, wodPending = null;
function beep(n = 1, f = 880) {
  try { if (navigator.vibrate) navigator.vibrate(n > 1 ? [150, 80, 150] : 150); } catch (e) {}
  try { if (beepCtx) for (let i = 0; i < n; i++) { const o = beepCtx.createOscillator(), g = beepCtx.createGain(), t0 = beepCtx.currentTime + i * .22;
    o.frequency.value = f; g.gain.setValueAtTime(.3, t0); g.gain.exponentialRampToValueAtTime(.001, t0 + .18); o.connect(g); g.connect(beepCtx.destination); o.start(t0); o.stop(t0 + .18); } } catch (e) {}
}
async function keepAwake(on) {
  try { if (on && navigator.wakeLock && !wodLock) wodLock = await navigator.wakeLock.request("screen"); else if (!on && wodLock) { await wodLock.release(); wodLock = null; } } catch (e) { wodLock = null; }
}
function wodStart() {
  unlockBeep(); const w = wodChoice(), d = wodDay();
  d.wodId = w.id; d.wodRun = { id: w.id, scale: d.wodScale || "rx", t0: Date.now() + 3000, rounds: 0, done: [] }; delete d.wodMore; save();
  wodPhase = null; beep(1, 660); keepAwake(true); render(); wodTicking(); window.scrollTo(0, 0);
}
function wodTicking() { clearInterval(wodT); if (wodDay().wodRun) { wodT = setInterval(wodTick, 250); wodTick(); } }
// what the clock shows now: { clock, now, phase (a change = a beep), end (true = time is up) }
function wodState(w, el) {
  const mmss = s => `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}`;
  if (el < 0) return { clock: String(Math.ceil(-el)), now: "Get ready", phase: "r" + Math.ceil(-el), end: false };
  if (w.fmt === "amrap") { const left = w.min * 60 - el; return { clock: mmss(Math.max(0, left)), now: "left · as many rounds as you can", phase: left <= 3 ? `c${Math.ceil(left)}` : "go", end: left <= 0 }; }
  if (w.fmt === "emom") {
    const i = Math.floor(el / 60), list = i % 2 === 0 ? w.odd : w.even;
    return { clock: mmss(60 - el % 60), now: `Minute ${Math.min(i + 1, w.min)} of ${w.min} · ${list.map(m => `${moveQty(m)} ${moveName(m).toLowerCase()}`).join(", ")}`, phase: `m${i}`, end: el >= w.min * 60 };
  }
  if (w.fmt === "tabata") {
    const i = Math.floor(el / 30), s = el % 30, work = s < 20, m = w.moves[i % w.moves.length];
    return { clock: `${Math.ceil(work ? 20 - s : 30 - s)}`, now: `Round ${Math.min(i + 1, 8)} of 8 · ${work ? moveName(m) : "Rest"}`, phase: `${i}${work}`, end: el >= 240 };
  }
  if (w.fmt === "climb") { const i = Math.floor(el / 60); return { clock: mmss(60 - el % 60), now: `Minute ${i + 1}: ${w.start + i} × ${moveName(w.moves[0]).toLowerCase()}`, phase: `m${i}`, end: false }; }
  return { clock: mmss(el), now: w.fmt === "rounds" ? `${w.rest} s rest between rounds` : "Steady pace", phase: "go", end: false };
}
function wodTick() {
  const run = wodDay().wodRun; if (!run) { clearInterval(wodT); return; }
  const w = wodOf(run.id, run.scale), el = ((run.paused || Date.now()) - run.t0) / 1000, st = wodState(w, el);
  const c = $("#wclock"); if (c) { c.textContent = st.clock; $("#wnow").textContent = run.paused ? "Paused" : st.now; }
  if (run.paused) return;
  if (wodPhase !== null && st.phase !== wodPhase && !st.end) {
    const lead = /^[cr]/.test(st.phase); beep(lead ? 1 : 2, lead ? 660 : 990);
    const live = $("#wlive"); if (live) live.textContent = st.now;   // screen readers hear each new phase once
  }
  wodPhase = st.phase;
  if (st.end && !run.ended) { run.ended = true; save(); beep(3, 1100); wodFinish(); }
}
// a move ticked off; when every move of the round is ticked, the round counts and the list resets
function wodMove(k) {
  const r = wodDay().wodRun; if (!r) return;
  const w = wodOf(r.id, r.scale); r.done = r.done || [];
  r.done = r.done.includes(k) ? r.done.filter(x => x !== k) : r.done.concat(k);
  if (r.done.length === w.moves.length) {
    r.rounds = (r.rounds || 0) + 1; r.done = []; beep(2, 990); save();
    if (r.rounds >= totalRounds(w)) { render(); wodFinish(); return; }
  } else { beep(1, 770); save(); }
  render();
}
function wodPause() {
  const r = wodDay().wodRun; if (!r) return;
  if (r.paused) { r.t0 += Date.now() - r.paused; delete r.paused; keepAwake(true); } else { r.paused = Date.now(); keepAwake(false); }
  save(); render(); wodTick();
}
// the result sheet: prefilled from the timer and the checklist
function wodFinish(quick) {
  const d = wodDay(), run = quick ? { id: wodChoice().id, scale: d.wodScale || "rx", t0: Date.now(), rounds: 0, done: [], quick: true } : d.wodRun; if (!run) return;
  wodPending = run; const w = wodOf(run.id, run.scale), el = Math.max(0, Math.round(((run.paused || Date.now()) - run.t0) / 1000));
  const extra = (run.done || []).reduce((t, k) => t + (qtyAt(w, run.rounds || 0, w.moves[k]) || 0), 0);
  const timeIn = s => `<div class="inrow"><label>Time</label><input id="wd-min" type="number" inputmode="numeric" min="0" value="${s != null ? Math.floor(s / 60) : ""}" placeholder="min" aria-label="Minutes"> :
    <input id="wd-sec" type="number" inputmode="numeric" min="0" max="59" value="${s != null ? s % 60 : ""}" placeholder="sec" aria-label="Seconds"></div>`;
  const num = (id, label, v) => `<div class="inrow"><label for="${id}">${label}</label><input id="${id}" type="number" inputmode="numeric" min="0" value="${v}"></div>`;
  const fields = ["rft", "ladder", "scheme"].includes(w.fmt) ? timeIn(quick ? null : el)
    : w.fmt === "amrap" ? num("wd-rounds", "Full rounds", run.rounds || 0) + num("wd-reps", "Extra reps", extra)
    : w.fmt === "climb" ? num("wd-minutes", "Minutes you finished", quick ? "" : Math.max(0, Math.floor(el / 60)))
    : w.fmt === "rounds" ? num("wd-rounds", "Rounds done", run.rounds || w.rounds) : `<p class="muted">Every interval done? Save it.</p>`;
  $("#modal-body").innerHTML = `<div class="sheet-head"><h2>${esc(w.name)}${scaleTag(run.scale)}</h2><button class="x" data-close-modal aria-label="Close">×</button></div>
    <p class="wfmt">${wodFmt(w)}</p>${fields}<button class="big primary" data-act="wod-save">Save result</button>
    ${quick ? "" : `<button class="big" data-close-modal>Back to the timer</button>`}`;
  $("#modal").hidden = false;
}
function wodSave() {
  const run = wodPending; if (!run) return;
  const sc = run.scale || "rx", w = wodOf(run.id, sc), v = id => { const e = $("#" + id); return e && e.value !== "" ? Math.max(0, parseInt(e.value) || 0) : null; };
  let res = {};
  if (["rft", "ladder", "scheme"].includes(w.fmt)) { const m = v("wd-min"), s = v("wd-sec"); if (m == null && s == null) { toast("Enter your time", true); return; } res.secs = (m || 0) * 60 + Math.min(59, s || 0); }
  else if (w.fmt === "amrap") res = { rounds: v("wd-rounds") || 0, reps: v("wd-reps") || 0 };
  else if (w.fmt === "climb") { res.minutes = v("wd-minutes"); if (res.minutes == null) { toast("Enter the minutes you finished", true); return; } }
  else if (w.fmt === "rounds") res.rounds = Math.min(w.rounds, v("wd-rounds") ?? w.rounds);
  const vol = wodVolume(w, res), load = wodLoad(vol), prev = wodBest(w.id, sc);
  const before = streak(), t0 = Math.min(run.t0, Date.now());
  const x = { t: Date.now(), t0, id: w.id, scale: sc, fmt: w.fmt, res, vol, load };
  S.wods.push(x);
  const d = wodDay(); delete d.wodRun; d.wodId = w.id; delete d.wodMore; wodPending = null; wodCancelArm = false;
  clearInterval(wodT); keepAwake(false); save();
  flashAt = Date.now(); flashM = Object.keys(load).filter(m => load[m] >= 1); flashWord = "WOD!";
  render(); window.scrollTo(0, 0);
  const n = streak(), r0 = rankOf(before), r1 = rankOf(n), up = n > before && r1.name !== r0.name && r1.from > 0 ? r1 : null;
  const better = !!prev && wodRank(w, res) != null && wodRank(w, res) > wodRank(w, prev.res);
  wodSummary(w, x, prev, better, up);
}
// the finish screen, every time: the score, how it compares, what you did, what it worked
function wodSummary(w, x, prev, better, up) {
  const reps = Object.entries(x.vol).filter(([k]) => k !== "run" && k !== "hang").reduce((a, [, n]) => a + n, 0), runM = x.vol.run || 0;
  const top = Object.entries(x.load).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([m]) => MUSCLES[m].name.split(" ")[0].toLowerCase());
  const secs = x.res.secs != null ? x.res.secs : Math.round((x.t - x.t0) / 1000), score = wodScore(w, x.res), n = streak();
  $("#modal-body").innerHTML = `<div class="pr-card wsum">${clip(better ? "dive" : "land", "fxclip")}<p class="wsk">${better ? "New best" : prev ? "Workout done" : "First time"}</p>
      <h2>${esc(w.name)}${scaleTag(x.scale)}</h2><div class="wscore">${score === "done" ? "Done" : score}</div>
      <p class="wvs">${prev ? (better ? `Your best was ${wodScore(w, prev.res)}` : `Your best: ${wodScore(w, prev.res)}`) : "This is your mark to beat next time."}</p>
      <div class="stats wst"><div class="stat"><b>${reps}</b><span>reps</span></div>${runM ? `<div class="stat"><b>${runM >= 1000 ? (runM / 1000).toFixed(1) + " km" : runM + " m"}</b><span>run</span></div>` : ""}
        <div class="stat"><b>${fmtDur(secs)}</b><span>time</span></div><div class="stat"><b>${n}</b><span>day streak</span></div></div>
      <p class="muted">Worked: ${top.join(", ")}</p>${up ? `<p class="rankup">And a new rank: <b>${up.name}</b> · ${n} days</p>` : ""}</div>
    ${quoteCard(nextQuote(["discipline", "effort"], true))}<button class="big primary" data-close-modal>Done</button>`;
  $("#modal").hidden = false;
}
// Progress → Lifts: your best on each workout (with the trend of your last two tries), then the latest results
function wodHistory() {
  if (!S.wods.length) return `<h3>WODs</h3><div class="card empty"><p>No WODs yet. Each result you save lands here, with your best on every workout.</p>
    <button class="small-btn primary" data-tab="home">Go to today's WOD</button></div>`;
  const groups = {};
  for (const x of S.wods) { const k = x.id + "|" + (x.scale || "rx"); (groups[k] = groups[k] || []).push(x); }
  const bests = Object.entries(groups).map(([k, xs]) => {
    const [id, sc] = k.split("|"), w = WOD_BY[id]; if (!w) return null;
    const b = wodBest(id, sc), last = xs[xs.length - 1], prev = xs[xs.length - 2], rl = wodRank(w, last.res), rp = prev ? wodRank(w, prev.res) : null;
    const tr = rl != null && rp != null ? (rl > rp ? `<span class="wtr up" aria-label="better than the time before">↑</span>` : rl < rp ? `<span class="wtr dn" aria-label="not as good as the time before">↓</span>` : "") : "";
    return { t: last.t, h: `<div class="item"><span>${esc(w.name)}${scaleTag(sc)} <small class="muted">${xs.length}×</small></span><b>${b ? wodScore(w, b.res) : "done"} ${tr}</b></div>` };
  }).filter(Boolean).sort((a, b) => b.t - a.t).map(o => o.h).join("");
  const recent = S.wods.slice(-5).reverse().map(x => { const w = WOD_BY[x.id]; return w ? `<div class="item"><span>${dayLabel(dayKey(x.t))} · ${esc(w.name)}</span><b>${wodScore(w, x.res)}</b></div>` : ""; }).join("");
  const wk = S.wods.filter(x => weekStart(dayKey(x.t)) === weekStart(dayKey())).length;
  return `<h3>WODs · your bests</h3><div class="card"><p class="muted cnote">${S.wods.length} done · ${wk} this week · arrow = your last try against the one before</p>${bests}</div>
    <h3>Latest WODs</h3><div class="card">${recent}</div>`;
}
// for the widget: today's WOD as rows
function wodWidget() {
  const d = wodDay(), done = S.wods.filter(x => dayKey(x.t) === dayKey());
  const w = d.wodRun ? wodOf(d.wodRun.id, d.wodRun.scale) : done.length && !d.wodMore ? WOD_BY[done[done.length - 1].id] : wodOf(wodChoice().id, d.wodScale);
  if (!w) return null;
  const finished = !d.wodRun && done.some(x => x.id === w.id), list = w.fmt === "emom" ? w.odd.concat(w.even) : w.moves;
  return { title: `WOD · ${w.name}`, started: !!d.wodRun, done: finished,
    items: (finished ? [{ n: fmtShort(w), t: wodScore(w, done.filter(x => x.id === w.id).pop().res), s: 2 }] : [{ n: fmtShort(w), t: `~${wodMinutes(w)} min`, s: 0 }])
      .concat(list.map(m => ({ n: moveName(m), t: m[1] ? moveQty(m) : w.fmt === "ladder" ? `1→${w.top}` : w.fmt === "scheme" ? w.scheme.join("-") : "", s: finished ? 2 : 0 }))) };
}

// ---------- backup: a full JSON (for Import) + an activities CSV laid out like Garmin Connect's export ----------
// A web app can't run on a schedule by itself, so "every N days" is a reminder on the Train screen; one tap makes both files
// and opens the share sheet (Save to Files / iCloud Drive). Where the share sheet can't take files, both download instead.
const csvCell = v => v == null || v === "" ? "--" : /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
const hms = s => { s = Math.max(0, Math.round(s || 0)); return pad(Math.floor(s / 3600)) + ":" + pad(Math.floor(s % 3600 / 60)) + ":" + pad(s % 60); };
const gDate = t => { const d = new Date(t); return dayKey(t) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()); };
const G_TYPE = { run: "Running", walk: "Walking", hike: "Hiking", ride: "Cycling", swim: "Pool Swimming", openwater: "Open Water Swimming", soccer: "Soccer", activity: "Other" };
function activitiesCsv() {
  const cols = ["Activity Type", "Date", "Favorite", "Title", "Distance", "Calories", "Time", "Avg HR", "Max HR", "Avg Pace", "Total Reps", "Total Sets", "Number of Laps", "Moving Time", "Elapsed Time"];
  const rows = [];
  for (const r of S.runs) {
    const km = r.dist ? r.dist / 1000 : null, sw = /swim|openwater/.test(r.sport || "");
    rows.push({ t: r.t, v: [G_TYPE[r.sport || "run"] || "Other", gDate(r.t), "false", cap(KIND[r.sport] || r.sport || "run") + (r.src === "hand" ? " (by hand)" : ""),
      km ? (sw ? Math.round(r.dist) : km.toFixed(2)) : null, r.kcal, hms(r.dur), r.avgHr, r.maxHr,
      km && !sw ? fmtDur(r.dur / km) : km && sw ? fmtDur(r.dur / (r.dist / 100)) : null, null, null, r.laps || null, hms(r.dur), hms(r.dur)] });
  }
  for (const x of S.wods) {
    const w = WOD_BY[x.id], reps = Object.entries(x.vol || {}).filter(([k]) => k !== "run" && k !== "hang").reduce((a, [, n]) => a + n, 0);
    const secs = x.res && x.res.secs != null ? x.res.secs : (x.t - (x.t0 || x.t)) / 1000;
    rows.push({ t: x.t0 || x.t, v: ["HIIT", gDate(x.t0 || x.t), "false", "WOD: " + (w ? w.name + " (" + wodScore(w, x.res) + ")" : x.id),
      x.vol && x.vol.run ? (x.vol.run / 1000).toFixed(2) : null, null, hms(secs), null, null, null, reps || null, null, null, hms(secs), hms((x.t - (x.t0 || x.t)) / 1000)] });
  }
  const byDay = {};
  for (const s of S.sets) (byDay[dayKey(s.t)] = byDay[dayKey(s.t)] || []).push(s);
  for (const list of Object.values(byDay)) {
    list.sort((a, b) => a.t - b.t);
    const per = {}; for (const s of list) (per[s.ex] = per[s.ex] || []).push(s);
    const title = Object.entries(per).map(([ex, ss]) => (EX[ex] ? EX[ex].short || EX[ex].name : ex) + " " + ss.map(s => s.reps + (s.kg ? "@+" + fmtKg(s.kg) : "")).join("/")).join("; ");
    let span = 60; for (let i = 1; i < list.length; i++) span += Math.min(1200, (list[i].t - list[i - 1].t) / 1000) < 1200 ? (list[i].t - list[i - 1].t) / 1000 : 60;   // time between sets 20+ min apart is not training
    rows.push({ t: list[0].t, v: ["Strength Training", gDate(list[0].t), "false", title, null, null, hms(span), null, null, null, list.reduce((a, s) => a + s.reps, 0), list.length, null, hms(span), hms(span)] });
  }
  rows.sort((a, b) => b.t - a.t);   // newest first, as Garmin Connect lists them
  return "﻿" + [cols.map(csvCell).join(","), ...rows.map(r => r.v.map(csvCell).join(","))].join("\r\n");
}
async function doBackup() {
  const day = dayKey(), files = [
    new File([JSON.stringify(S, null, 1)], "unbothered-" + day + ".json", { type: "application/json" }),
    new File([activitiesCsv()], "unbothered-activities-" + day + ".csv", { type: "text/csv" })];
  const done = () => { S.settings.lastBackup = Date.now(); delete S.settings.backupSnooze; save(); render(); toast("Backed up: 2 files"); };
  try {
    if (navigator.canShare && navigator.canShare({ files })) { await navigator.share({ files, title: "Unbothered backup" }); done(); return; }
  } catch (e) { if (e && e.name === "AbortError") { toast("Backup not saved"); return; } }
  for (const f of files) { const a = document.createElement("a"); a.href = URL.createObjectURL(f); a.download = f.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  done();
}
function backupBanner() {
  const st = S.settings, every = st.backupEvery ?? 7; if (!every || logDay) return "";
  const since = st.lastBackup || 0, due = Date.now() - since >= every * 864e5, snoozed = st.backupSnooze && Date.now() - st.backupSnooze < 864e5;
  if (!due || snoozed || (!S.sets.length && !S.runs.length && !S.wods.length)) return "";
  return '<div class="card bkup" role="status"><div><b>Back up your training</b><span>' + (since ? "Last backup " + agoMin(since) : "Never backed up") + '. It lives only on this phone.</span></div>'
    + '<button class="small-btn primary" data-act="backup">Back up</button><button class="xbtn" data-act="backup-later" aria-label="Remind me tomorrow">×</button></div>';
}

// ---------- rounds: today's workouts, one after another, as many as you want ----------
// Round 1 is planned from how you were before today. A round starts when its first set or activity is logged and is
// then kept in S.daily[day].rounds = [{ kind, ex, run, acts, back, t0 }]: sets count toward the round they were logged
// in (from its t0 until the next round's), activities by their start time listed in acts. When a round is done, the
// next one is planned from how fresh you are now: exercises not done today first, then 2 lighter back-off sets of what
// still has something left, then easy groove sets, then an easy walk.
const KEEP = r => ({ kind: r.kind || "plan", ex: r.ex || [], run: r.run === true ? "last" : r.run || false, acts: r.acts || [], back: r.back || [], t0: r.t0 });
function rounds() {
  const t = dayKey(), dly = S.daily[t] || {}, start = keyToDate(t).getTime();
  if (dly.plan && !dly.rounds) { dly.rounds = [KEEP({ ...dly.plan, t0: start })]; delete dly.plan; S.daily[t] = dly; save(); }   // from before rounds
  if (!dly.rounds) {   // trained today before rounds were kept: what you did is round 1
    const worked = workedToday(), acts = actsToday();
    if (!worked.length && !acts.length) return [];
    S.daily[t] = Object.assign(dly, { rounds: [KEEP({ ex: [...new Set(worked.map(s => s.ex))], run: acts.some(isRun), acts: acts.map(r => r.t), t0: start })] }); save();
  }
  // a round with nothing logged in it any more (everything undone) is dropped
  const rs = S.daily[t].rounds, keep = rs.filter((r, i) => roundLogged(r, rs[i + 1]));
  if (keep.length !== rs.length) { S.daily[t].rounds = keep; save(); }
  return S.daily[t].rounds;
}
const winOf = (r, next) => [r.t0, next ? next.t0 : Infinity];
function roundLogged(r, next) {
  const [a, b] = winOf(r, next);
  return r.acts.some(t => S.runs.some(x => x.t === t)) || S.sets.some(s => s.t >= a && s.t < b && (r.kind === "groove" ? s.gtg : !s.gtg));
}
// everything a round shows: its rows, and whether it's done
function roundView(r, next, rec) {
  const win = winOf(r, next), acts = S.runs.filter(x => r.acts.includes(x.t));
  if (r.kind === "groove") {
    const G = r.ex.map(x => { const m = MUSCLE_OF[x][0];
      return { x, m, rec: rec[m], n: S.sets.filter(s => s.ex === x && s.gtg && s.t >= win[0] && s.t < win[1]).length }; });
    return { r, kind: "groove", G, acts, done: G.every(g => g.n >= 3) };
  }
  if (r.kind === "walk" || r.kind === "act") return { r, kind: r.kind, acts, done: acts.length > 0 };
  const plan = r.ex.map(x => { const o = exInfo(x, rec, win); return r.back.includes(x) ? Object.assign(o, backOff(x)) : o; });
  const l = lastRunOf(), run = !r.run ? null : acts.some(isRun) ? { done: true } : r.run === "last" && l ? { d: daysSince(dayKey(l.t)), last: l } : { easy: true };
  return { r, kind: "plan", plan, run, acts: acts.filter(x => !isRun(x)), done: plan.every(o => o.doneN >= o.planned) && (!run || run.done) };
}
// back-off: 2 sets at about 70% of today's target reps, same load
function backOff(ex) { const sg = suggest(ex, true); return { back: true, planned: 2, reps: Math.max(1, Math.round(sg.reps * .7)), kg: sg.kg, v: sg.v }; }
// the next round, planned now (exclude: exercises an open round already has)
function proposal(exclude = []) {
  if (!rounds().length) { const lp = livePlan(); return { kind: "plan", ...lp }; }
  const rec = recovery(), done = [...new Set(workedToday().map(s => s.ex))];
  const fresh = pickPlan(rec, done.concat(exclude)), plan = fresh.plan.map(o => Object.assign(o, { doneN: 0 }));
  const run = !ranToday() && !exclude.includes("run") && runsOf4w().length && Math.min(rec.quads, rec.calves) >= 60 ? { easy: true } : null;
  if (plan.length || run) return { kind: "plan", plan, run, out: fresh.out };
  // back-off is judged on the exercise's main muscle (lats for pull-ups, chest for push-ups...): a shared helper like the arms
  // shouldn't rule out both pull-ups and push-ups
  const back = done.filter(x => !exclude.includes(x)).map(x => { const o = exInfo(x, rec, [Date.now(), Infinity]), m = MUSCLE_OF[x][0]; return Object.assign(o, { m, rec: rec[m] }); })
    .filter(o => o.rec >= 35).sort((a, b) => b.rec - a.rec).slice(0, 2);
  if (back.length) return { kind: "plan", plan: back.map(o => Object.assign(o, backOff(o.ex))), run: null, out: [], backoff: true };
  const G = ["pullup", "pushup", "kneeraise", "legraise"].filter(x => !exclude.includes(x)).map(x => { const m = MUSCLE_OF[x][0]; return { x, m, rec: rec[m], n: 0 }; })   // main muscle, as for back-off
    .filter(g => g.rec >= 20).sort((a, b) => b.rec - a.rec).slice(0, 2);
  return G.length ? { kind: "groove", G } : { kind: "walk" };
}
const openRound = () => { const rs = rounds(), last = rs[rs.length - 1]; return last && !roundView(last, null, recovery()).done ? last : null; };
// called just before a set or an activity of today is saved: start a round, or add to the open one
function startRound(ex, act, gtg, at) {   // at: the set's own time, so the set that starts a round counts in it
  const t = dayKey(), now = act ? act.t : at, rs = rounds(), open = openRound();
  if (open) {
    if (act) open.acts.push(act.t);
    else if (!gtg && open.kind === "plan" && !open.ex.includes(ex)) open.ex.push(ex);   // off-plan: it joins this round
    return;
  }
  const p = proposal(), t0 = Math.max(now, rs.length ? rs[rs.length - 1].t0 + 1 : 0);
  let r;
  if (gtg) { if (p.kind !== "groove" || !p.G.some(g => g.x === ex)) return; r = { kind: "groove", ex: p.G.map(g => g.x) }; }   // only a planned groove set starts a groove round
  else if (act) r = p.kind === "walk" ? { kind: "walk", acts: [act.t] } : isRun(act) && p.kind === "plan" && p.run ? { kind: "plan", ex: p.plan.map(o => o.ex), run: p.run.easy ? "easy" : "last", acts: [act.t], back: p.plan.filter(o => o.back).map(o => o.ex) } : { kind: "act", acts: [act.t] };
  else if (p.kind === "plan") {
    const exs = p.plan.map(o => o.ex), back = p.plan.filter(o => o.back).map(o => o.ex);
    if (!exs.includes(ex)) { const i = exs.findIndex(x => AREA_OF[x] === AREA_OF[ex] && !back.includes(x)); if (i >= 0) exs[i] = ex; else exs.push(ex); }   // you picked a different one: swap it in
    r = { kind: "plan", ex: exs, run: p.run ? (p.run.easy ? "easy" : "last") : false, back };
  } else r = { kind: "plan", ex: [ex] };
  S.daily[t] = Object.assign(S.daily[t] || {}, { rounds: rs.concat([KEEP({ ...r, t0 })]) });
}
// in the log sheet: the target from the open round (a back-off round lowers it)
function roundTarget(ex) {
  if (logDay) return null;
  const o = openRound();
  if (!o) { const p = proposal(); return p.kind === "plan" && p.backoff && p.plan.some(x => x.ex === ex) ? { ...backOff(ex), n: 0 } : null; }   // offered, not started yet
  if (!o.back.includes(ex)) return null;
  const win = winOf(o, null);
  return { ...backOff(ex), n: S.sets.filter(s => s.ex === ex && !s.gtg && s.t >= win[0] && s.t < win[1]).length };
}
const why = o => o.d === null ? "New for you" : o.d === 0 ? "Earlier today" : `${cap(agoText(o.d))}${o.due >= 1.3 ? " · overdue" : ""}`;
function planRow(o) {
  const sg = suggest(o.ex, true), done = o.doneN >= o.planned;
  const txt = o.back ? `${o.planned} × ${o.reps}${loadText(o.ex, o.kg, o.v)} · back-off` : sg.text.replace(/^(Next|Start): /, "");
  return `<button class="plrow${done ? " done" : ""}" data-ex="${o.ex}"><span class="plck" aria-hidden="true">${done ? "✓" : o.doneN ? `${o.doneN}/${o.planned}` : ""}</span>
    <span class="plt"><b>${EX[o.ex].name}</b><span class="pln${sg.kind === "down" && !o.back ? " down" : ""}">${esc(txt)}</span></span>
    ${done ? `<span class="plw">${o.doneN} set${o.doneN === 1 ? "" : "s"}</span>` : `<span class="plw">${why(o)}<br><span style="color:${recColor(o.rec)}">${MUSCLES[o.m].name.split(" ")[0]} ${o.rec}%</span></span>`}</button>`;
}
function runRowP(run) {
  if (!run) return "";
  const txt = run.done ? "Done today" : run.easy ? "Easy, 20–30 min, mostly Z2" : `About ${run.last.dist ? fmtKm(run.last.dist) + " km" : fmtDur(run.last.dur)}, like last time`;
  return `<button class="plrow run${run.done ? " done" : ""}" data-run-add><span class="plck" aria-hidden="true">${run.done ? "✓" : ""}</span>
    <span class="plt"><b>${run.easy ? "Easy run" : "Run"}</b><span class="pln">${txt}</span></span>
    <span class="plw">${run.done || run.d == null ? "" : cap(agoText(run.d))}</span></button>`;
}
// a swim, match or other activity already done today (runs have their own row)
const actRows = list => list.filter(r => !isRun(r)).map(r => `<button class="plrow run done" data-run-add><span class="plck" aria-hidden="true">✓</span>
    <span class="plt"><b>${cap(KIND[r.sport] || "activity")}</b><span class="pln">${r.dist ? fmtDist(r) + " · " : ""}${fmtDur(r.dur)}</span></span>
    <span class="plw">${effortOf(r) ? `Effort ${effortOf(r)}` : ""}</span></button>`).join("");
function goBtn(plan, run) {
  const left = plan.filter(o => o.doneN < o.planned);
  if (left.length) return `<button class="big primary plgo" data-ex="${left[0].ex}">${plan.some(o => o.doneN) ? "Next" : "Start"}: ${EX[left[0].ex].name}</button>`;
  if (run && !run.done) return `<button class="big primary plgo" data-run-add>Add the run</button>`;
  return "";
}
// the cards: done rounds as a short list, then the open round (or the next one, planned), then a peek at what follows
const roundName = i => i === 0 ? "Today's workout" : `Workout ${i + 1}`;
function roundSummary(v, i) {
  const names = v.kind === "groove" ? v.G.map(g => (EX[g.x].short || EX[g.x].name) + " groove") : v.kind === "plan" ? v.plan.map(o => EX[o.ex].short || EX[o.ex].name) : [];
  for (const a of v.acts) names.push(cap(KIND[a.sport] || "activity"));
  if (v.kind === "plan" && v.run && v.run.done && !v.acts.some(isRun)) names.push("Run");
  return `<div class="rdone"><span class="plck" aria-hidden="true">✓</span><b>${roundName(i)}</b><span>${esc(names.join(" · ") || "done")}</span></div>`;
}
function groovRows(G) {
  return G.map(g => `<button class="plrow${g.n >= 3 ? " done" : ""}" data-quick="${g.x}"><span class="plck" aria-hidden="true">${g.n >= 3 ? "✓" : g.n ? `${g.n}/3` : ""}</span>
      <span class="plt"><b>${EX[g.x].name}</b><span class="pln">3 × ${S.settings.gtg[g.x]}${gtgKg(g.x) ? ` +${fmtKg(gtgKg(g.x))} kg` : ""}, easy</span></span>
      <span class="plw">Groove<br><span style="color:${recColor(g.rec)}">${MUSCLES[g.m].name.split(" ")[0]} ${g.rec}%</span></span></button>`).join("");
}
const walkRow = `<button class="plrow run" data-run-add><span class="plck" aria-hidden="true"></span><span class="plt"><b>Easy walk</b><span class="pln">20–30 min, easy pace</span></span><span class="plw">Recovery</span></button>`;
function sizeOf(p) {
  if (p.kind === "groove") return "easy groove sets";
  if (p.kind === "walk") return "easy walk";
  return [p.plan.length ? `${p.plan.length} exercise${p.plan.length === 1 ? "" : "s"}${p.backoff ? " · back-off" : ""}` : "", p.run && !p.run.done ? (p.run.easy ? "easy run" : "run") : ""].filter(Boolean).join(" · ");
}
// one round's card body (rows + the go button); started: it has sets in it, so "Next" not "Start"
function roundBody(p, started) {
  if (p.kind === "groove") return `<p class="plsub muted">Every area got its work. Finish with easy groove sets — tap one to log it.</p>${groovRows(p.G)}`;
  if (p.kind === "walk") return `<p class="plsub muted">Every muscle got real work today. Keep moving without digging deeper:</p>${walkRow}`;
  if (p.kind === "act") return actRows(p.acts);
  return `${p.plan.map(planRow).join("")}${runRowP(p.run)}${actRows(p.acts || [])}${goBtn(p.plan, p.run)}`;
}
let nextOpen = false;   // the peek at the following round, opened by hand
function planCard() {
  if (logDay) return "";
  const rs = rounds(), rec = recovery(), views = rs.map((r, i) => roundView(r, rs[i + 1], rec));
  const last = views[views.length - 1], open = last && !last.done ? last : null;
  const done = (open ? views.slice(0, -1) : views);
  let out = done.length ? `<div class="card plan rdlist"><div class="plhead"><b>Done today</b><span class="muted">${done.length} round${done.length === 1 ? "" : "s"}</span>${open ? "" : widgetBtn()}</div>${done.map(roundSummary).join("")}</div>` : "";
  if (open) {
    const i = views.length - 1, n = open.kind === "plan" ? open.plan.filter(o => o.doneN >= o.planned).length + (open.run && open.run.done ? 1 : 0) : 0, of = open.kind === "plan" ? open.plan.length + (open.run ? 1 : 0) : 0;
    out += `<div class="card plan"><div class="plhead"><b>${roundName(i)}</b><span class="muted">${of ? `${n} of ${of} done` : ""}</span>${widgetBtn()}</div>${roundBody(open, true)}</div>`;
    const p = proposal(open.kind === "plan" ? open.r.ex.concat(open.run ? ["run"] : []) : open.kind === "groove" ? open.r.ex : []);
    out += nextOpen ? `<div class="card plan plnext"><div class="plhead"><b>${roundName(i + 1)}</b><span class="muted">after this one</span></div>${roundBody(p, false)}</div>`
      : `<button class="card plan plnext plpeek" data-act="next-open"><span class="plhead"><b>${roundName(i + 1)}</b><span class="muted">${esc(sizeOf(p))}</span><span class="plchev" aria-hidden="true">›</span></span></button>`;
    return out;
  }
  // nothing open: plan the next round now
  const i = views.length, p = proposal();
  if (i === 0 && p.kind === "plan" && !p.plan.length && !p.run) return `<div class="card plan"><div class="plhead"><b>Today's workout</b>${widgetBtn()}</div>
      <p class="plrest">Everything is still recovering. Rest today, or take an easy walk.</p></div>`;
  const sub = i === 0 ? `From your last 4 weeks: what's due, and what's fresh.${p.out && p.out.length ? ` ${cap(p.out.join(" and "))} rest${p.out.length === 1 && p.out[0] !== "legs" ? "s" : ""} today.` : ""}`
    : p.kind !== "plan" ? "" : p.backoff ? "Every area has had a turn today. Two lighter back-off sets of what still has something left."
    : `What's still fresh after ${i === 1 ? "your first workout" : `${i} rounds`}.${p.out && p.out.length ? ` ${cap(p.out.join(" and "))} need${p.out.length === 1 && p.out[0] !== "legs" ? "s" : ""} the rest.` : ""}`;
  return out + `<div class="card plan${i ? " plnext" : ""}"><div class="plhead"><b>${roundName(i)}</b><span class="muted">${i ? "if you're up for it" : esc(sizeOf(p))}</span>${done.length ? "" : widgetBtn()}</div>
    ${sub ? `<p class="plsub muted">${sub}</p>` : ""}${roundBody(p, false)}</div>`;
}
// for the widget: the round to do now, and the one after it
function widgetRounds() {
  const rs = rounds(), rec = recovery(), views = rs.map((r, i) => roundView(r, rs[i + 1], rec)), last = views[views.length - 1];
  if (last && !last.done) return { i: views.length - 1, now: last, started: true, after: proposal(last.kind === "plan" ? last.r.ex.concat(last.run ? ["run"] : []) : last.r.ex || []) };
  return { i: views.length, now: proposal(), started: false, after: null, doneRounds: views.length };
}

// ---------- home-screen widget (Scriptable) ----------
// A web app can't update an iPhone widget, so Unbothered hands a small summary to a Scriptable script named "Unbothered"
// (scriptable:///run/Unbothered?data=...), which saves it; the widget shows it. widget/unbothered-widget.js is that script.
const WIDGET_SCRIPT = "Unbothered";
function widgetPayload() {
  const info = streakInfo(), today = dayKey(), r = rankOf(info.n), done = info.status[today] === "on";
  const tmrw = addDays(today, 1);
  const exRow = o => { const sg = suggest(o.ex, true); return { n: EX[o.ex].short || EX[o.ex].name, t: o.back ? `${o.planned} × ${o.reps} back-off` : sg.text.replace(/^(Next|Start|Hold or step back|Hold): /, ""), s: o.doneN >= o.planned ? 2 : o.doneN ? 1 : 0, p: o.doneN ? `${Math.min(o.doneN, o.planned)}/${o.planned}` : "" }; };
  const runRow = run => run && { n: run.easy ? "Easy run" : "Run", t: run.done ? "Done" : run.easy ? "20–30 min, easy" : (run.last.dist ? fmtKm(run.last.dist) + " km" : fmtDur(run.last.dur)), s: run.done ? 2 : 0 };
  const actRow = a => ({ n: cap(KIND[a.sport] || "activity"), t: (a.dist ? fmtDist(a) + " · " : "") + fmtDur(a.dur), s: 2 });
  const rowsOf = p => !p ? null : p.kind === "plan" ? p.plan.map(exRow).concat(p.run ? [runRow(p.run)] : [], (p.acts || []).filter(a => !isRun(a)).map(actRow))
    : p.kind === "groove" ? p.G.map(g => ({ n: EX[g.x].short || EX[g.x].name, t: `3 × ${S.settings.gtg[g.x]} easy groove`, s: g.n >= 3 ? 2 : g.n ? 1 : 0, p: g.n ? `${Math.min(g.n, 3)}/3` : "" }))
    : p.kind === "act" ? (p.acts || []).map(actRow) : [{ n: "Easy walk", t: "20–30 min", s: 0 }];
  const w = widgetRounds(), items = rowsOf(w.now), next = rowsOf(w.after), wd = wodWidget();
  const rec = recovery(), ready = Math.round(Object.keys(MUSCLES).reduce((t, m) => t + rec[m], 0) / Object.keys(MUSCLES).length);
  return { v: 1, d: today, at: Date.now(), n: info.n, best: info.best, rank: r.name, ready, img: widgetFigure(),
    next: r.next && info.n ? { name: r.next[1], in: r.next[0] - info.n - (done ? 0 : 1) } : null,
    done, restOk: info.restOk, restTmrw: done && info.n > 0 && (!info.lastRest || addDays(info.lastRest, 7) <= tmrw),
    first: wd ? { title: wd.title, started: wd.started, done: wd.done, rest: false, items: wd.items } : { title: roundName(w.i), started: w.started, done: false, rest: w.i === 0 && w.now.kind === "plan" && !w.now.plan.length && !w.now.run, items },
    second: wd ? null : next,
    rounds: w.started ? w.i : w.i };
}
// the figure as the app shows it (muscles lit by how recently they were trained), on the widget's dark background
function widgetFigure() {
  figure(muscleState()); if (!figCanvas) return null;
  const c = document.createElement("canvas"); c.width = 182; c.height = 450; const x = c.getContext("2d");
  x.fillStyle = "#111214"; x.fillRect(0, 0, 182, 450); x.drawImage(figCanvas, 0, 0);
  return c.toDataURL("image/jpeg", .8).split(",")[1];
}
const widgetBtn = () => S.settings.widgetOn ? `<button class="small-btn wbtn" data-act="widget-send" aria-label="Send to widget">⇪ Widget</button>` : "";
function sendToWidget() {
  S.settings.widgetSent = Date.now(); save();
  const json = JSON.stringify(widgetPayload());
  try { navigator.clipboard.writeText(json).catch(() => {}); } catch (e) {}   // backup: the script also looks on the clipboard
  const a = document.createElement("a");
  a.href = `scriptable:///run/${encodeURIComponent(WIDGET_SCRIPT)}?data=${encodeURIComponent(json)}`;
  document.body.appendChild(a); a.click(); a.remove();
}
// copy the widget script (Safari wants the copy to start inside the tap, so the fetch goes into a ClipboardItem)
function copyWidgetScript() {
  const get = () => fetch("widget/unbothered-widget.js", { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(); return r.text(); });
  const ok = () => { S.settings.widgetOn = true; save(); render(); toast("Widget script copied. Paste it into a new Scriptable script named Unbothered."); };
  const fail = () => toast("Couldn't copy here. Open the script link below, select all and copy.", true);
  try {
    if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write)
      navigator.clipboard.write([new ClipboardItem({ "text/plain": get().then(t => new Blob([t], { type: "text/plain" })) })]).then(ok, () => get().then(t => navigator.clipboard.writeText(t)).then(ok, fail));
    else get().then(t => navigator.clipboard.writeText(t)).then(ok, fail);
  } catch (e) { fail(); }
}
function widgetSection() {
  const on = S.settings.widgetOn, sent = S.settings.widgetSent;
  if (on && sent) return `<h3>Home-screen widget</h3><div class="card wsetup"><div class="inrow"><span>Last sent ${agoMin(sent)}</span><button class="small-btn primary" data-act="widget-send">Send now</button></div>
    ${fold("widget", "Set up again", "Copy the script, steps", `<button class="big" data-act="widget-copy">Copy widget script</button>
      <p class="muted fnote">In Scriptable: open the <b>Unbothered</b> script, select all, paste. Then tap Send now. Script: <a href="widget/unbothered-widget.js" target="_blank">widget/unbothered-widget.js</a></p>`)}</div>`;
  return fold("widget-setup", "Home-screen widget", "Your streak and today's WOD on the home screen", `<div class="wsetup">
    <p>Your streak and today's workout on your home screen, through the free <b>Scriptable</b> app.</p>
    <ol>
      <li>Install <b>Scriptable</b> from the App Store.</li>
      <li>Tap <b>Copy widget script</b> below.</li>
      <li>In Scriptable, tap <b>+</b>, paste, and name the script <b>Unbothered</b> (tap the title at the top).</li>
      <li>Here, tap <b>Send to widget</b>. Scriptable opens and shows the widget.</li>
      <li>Long-press your home screen → <b>+</b> → Scriptable → pick a size → long-press the widget → <b>Edit Widget</b> → Script: <b>Unbothered</b>.</li>
    </ol>
    <button class="big" data-act="widget-copy">Copy widget script</button>
    <button class="big ${on ? "primary" : ""}" data-act="widget-send">Send to widget</button>
    <p class="muted rhelp">The widget updates when you tap <b>⇪ Widget</b> on the Train screen (after training, or in the morning for the day's plan). ${sent ? `Last sent ${agoMin(sent)}.` : ""}
      Script: <a href="widget/unbothered-widget.js" target="_blank">widget/unbothered-widget.js</a></p></div>`);
}
const agoMin = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
// the path: the last 7 days (height = how much you did) and the next 3 if you keep going
function pathCard() {
  const info = streakInfo(), n = info.n, r = rankOf(n), today = dayKey(), st = info.status;
  const lift = new Set(S.sets.map(s => dayKey(s.t)).concat(S.wods.map(x => dayKey(x.t)))), ran = new Set(S.runs.map(x => dayKey(x.t)));
  const past = [6, 5, 4, 3, 2, 1, 0].map(i => addDays(today, -i));
  const load = k => S.sets.reduce((t, s) => t + (dayKey(s.t) === k ? (s.gtg ? .4 : 1) : 0), 0) + S.runs.reduce((t, x) => t + (dayKey(x.t) === k ? (effortOf(x) || x.dur / 30) / 20 : 0), 0) + S.wods.reduce((t, x) => t + (dayKey(x.t) === k ? Object.values(x.load).reduce((a, b) => a + b, 0) / 2 : 0), 0);
  const L = past.map(load), mx = Math.max(1, ...L), doneToday = st[today] === "on";
  let nn = n + (doneToday ? 0 : 1), restShown = false;
  const fut = [1, 2, 3].map(i => {
    const k = addDays(today, i); nn++;
    const rk = n ? RANKS.find(x => x[0] === nn && x[0] > 0) : null, rest = !rk && !restShown && !!n && (!info.lastRest || addDays(info.lastRest, 7) <= k);
    if (rest) restShown = true;
    return { k, rk, rest };
  });
  const x = i => (14 + i * 312 / 9).toFixed(1), y = i => (L[i] ? 34 - 26 * L[i] / mx : 38).toFixed(1), FY = 18;
  const held = s => s === "on" || s === "rday";
  let lines = "";
  for (let i = 1; i < 7; i++) { const a = st[past[i - 1]], b = st[past[i]] || (past[i] === today ? "now" : "off");
    if (held(a) && (held(b) || b === "now")) lines += `<path class="pl${a === "rday" || b === "rday" ? " rd" : ""}" d="M${x(i - 1)} ${y(i - 1)} L${x(i)} ${y(i)}"/>`; }
  if (n) lines += `<path class="pl fut" d="M${x(6)} ${y(6)} ${fut.map((f, i) => `L${x(7 + i)} ${FY}`).join(" ")}"/>`;
  const dots = past.map((k, i) => {
    const s = st[k] || (k === today ? "now" : "off"), Lf = lift.has(k), R = ran.has(k);
    const cls = Lf && R ? "both" : Lf ? "lift" : R ? "run" : s === "rday" ? "rday" : s === "now" ? "now" : "off";
    return `<circle class="pd ${cls}" cx="${x(i)}" cy="${y(i)}" r="${k === today ? 6.5 : 4.5}"/>`;
  }).join("") + (n ? fut.map((f, i) => `<circle class="pd fut${f.rest ? " frest" : ""}${f.rk ? " frank" : ""}" cx="${x(7 + i)}" cy="${FY}" r="4.5"/>`).join("") : "");
  const labels = past.map(k => `<span class="${k === today ? "now" : ""}">${WD[keyToDate(k).getDay()][0]}</span>`).join("")
    + fut.map(f => `<span class="${f.rk ? "rk" : ""}">${WD[keyToDate(f.k).getDay()][0]}${f.rest ? "·rest" : ""}</span>`).join("");
  let next = "";
  if (r.next && n) { const when = r.next[0] - n - (doneToday ? 0 : 1); next = `${r.next[1]} ${when <= 0 ? "today" : when === 1 ? "tomorrow" : `in ${when} days`}`; }
  const line = !n ? "Start today: a WOD, a set or a run all count. One rest day in seven keeps a streak alive."
    : doneToday ? (r.next ? "Done for today. Keep the thread." : "The highest rank. Keep going.")
    : info.restOk ? "Rest day available. Your streak is safe today."
    : `<span class="risk">Train today to make it ${n + 1}.</span>`;
  return `<div class="card path"><div class="phead"><span><b>${n}</b>-day streak · <em>${r.name}</em>${info.best > n ? ` <small>best ${info.best}</small>` : ""}</span><span class="pnext">${next}</span></div>
    <svg viewBox="0 0 340 46" aria-hidden="true">${lines}${dots}</svg>
    <div class="plabels">${labels}</div><p class="sline">${line}</p></div>`;
}
// an exercise tile: the plan, and a bar for its least-recovered muscle
function tile(k, st) {
  // the same target as today's plan; sets already logged on the day being shown replace the + with a count
  const sg = suggest(k, true), m = MUSCLE_OF[k].reduce((a, b) => st[b].rec < st[a].rec ? b : a), rec = st[m].rec;
  const n = S.sets.filter(s => s.ex === k && !s.gtg && dayKey(s.t) === curDay()).length, done = n >= sg.sets;
  return `<button class="tile${rec < 40 ? " low" : ""}${done ? " tdone" : ""}" data-ex="${k}"><span class="th"><b>${EX[k].short || EX[k].name}</b><span class="tp${n ? " cnt" : ""}" aria-hidden="true">${done ? "✓" : n ? `${n}/${sg.sets}` : "+"}</span></span>
    <span class="tn${sg.kind === "down" ? " down" : ""}">${esc(sg.text.replace(/^(Next|Start): /, ""))}</span>
    ${rec < 60 ? `<span class="tr">${MUSCLES[m].name.split(" ")[0]} ${rec}% recovered</span>` : ""}
    <i class="tb" aria-hidden="true"><i style="width:${rec}%;background:${recColor(rec)}"></i></i></button>`;
}
function runTile(st) {
  const rs = S.runs.filter(r => dayKey(r.t) === curDay()), last = S.runs[S.runs.length - 1];
  if (rs.length) {
    const r = rs[rs.length - 1], e = effortOf(r);
    return `<button class="tile run done" data-run-add><span class="th"><b>${cap(KIND[r.sport] || "run")}</b><span class="tdone">DONE</span></span>
      <span class="tn2">${r.dist ? fmtDist(r) + " · " : ""}${fmtDur(r.dur)}</span>${e ? `<span class="te">Effort <b>${e}</b> · ${effortWord(e)}</span>` : ""}</button>`;
  }
  const rec = Math.min(st.quads.rec, st.calves.rec);
  const ago = last ? agoText(Math.round((keyToDate(dayKey()) - keyToDate(dayKey(last.t))) / 864e5)) : "";
  return `<button class="tile run" data-run-add><span class="th"><b>Run · Swim · Soccer</b><span class="tp" aria-hidden="true">+</span></span>
    <span class="tn2">${last ? `Last ${KIND[last.sport] || "run"}: ${last.dist ? fmtDist(last) : fmtDur(last.dur)} · ${ago}` : "From Garmin or by hand"}</span>
    ${rec < 60 ? `<span class="tr">Legs ${rec}% recovered</span>` : ""}
    <i class="tb" aria-hidden="true"><i style="width:${rec}%;background:${recColor(rec)}"></i></i></button>`;
}

// under an exercise: its least-recovered muscle, when under 60%
function recNote(ex, st) {
  const m = (ex === "run" ? ["quads", "calves"] : MUSCLE_OF[ex]).reduce((a, b) => st[b].rec < st[a].rec ? b : a);
  return st[m].rec < 60 ? `<span class="recn">${MUSCLES[m].name.split(" ")[0]} ${st[m].rec}% recovered${st[m].rec < 35 ? " · go light" : ""}</span>` : "";
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
    <div class="sbar web ${shoot}"><i style="width:${pct}%"></i></div><p class="sline">${line}${best > n ? ` · best ${best}` : ""}</p>${aheadRow(info)}</div>`;
}
// the next 3 days if you keep training: when a rest day is free, and when the next rank comes
function aheadRow(info) {
  if (logDay || !info.n) return "";
  const today = dayKey(); let n = info.n + (info.status[today] === "on" ? 0 : 1), restShown = false;
  const cells = [1, 2, 3].map(i => {
    const k = addDays(today, i); n++;
    const rk = RANKS.find(r => r[0] === n && r[0] > 0);
    let tag = rk ? `<b>${rk[1]}</b>` : "";
    if (!tag && !restShown && (!info.lastRest || addDays(info.lastRest, 7) <= k)) { tag = "rest free"; restShown = true; }
    return `<span class="ah${rk ? " rank" : tag ? " free" : ""}"><em>${i === 1 ? "Tmrw" : WD[keyToDate(k).getDay()]}</em>${tag || "train"}</span>`;
  }).join("");
  return `<div class="ahead" aria-label="Next three days">${cells}</div>`;
}
// Progress: the last five weeks, Monday first. Filled = lifted, blue = ran, both = ring; dashed = the free rest day
function calendarCard() {
  const info = streakInfo(), today = dayKey(), lift = new Set(S.sets.map(s => dayKey(s.t)).concat(S.wods.map(x => dayKey(x.t)))), ran = new Set(S.runs.map(r => dayKey(r.t)));
  const start = addDays(weekStart(today), -28), end = addDays(weekStart(today), 6), cells = [];
  let nLift = 0, nRun = 0, nRest = 0;
  for (let k = start; k <= end; k = addDays(k, 1)) {
    const L = lift.has(k), R = ran.has(k), st = info.status[k];
    const cls = k > today ? "fut" : L && R ? "both" : L ? "lift" : R ? "run" : st === "rday" ? "rday" : "off";
    if (k <= today) { if (L) nLift++; if (R) nRun++; if (st === "rday") nRest++; }
    const d = keyToDate(k).getDate();
    cells.push(`<span class="cd ${cls}${k === today ? " today" : ""}" title="${k}">${d}</span>`);
  }
  return `<h3>Five weeks · ${shortDate(start)} – ${shortDate(end)}</h3><div class="card cal"><div class="cgrid">${["M", "T", "W", "T", "F", "S", "S"].map(w => `<span class="cw">${w}</span>`).join("")}${cells.join("")}</div>
    <div class="cleg"><span><i class="lift"></i>Lifted ${nLift}</span><span><i class="run"></i>Ran ${nRun}</span><span><i class="both"></i>Both</span><span><i class="rday"></i>Rest day ${nRest}</span></div></div>`;
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
    <div class="qseg">${["pullup", "pushup", "kneeraise", "legraise"].map(e => `<button data-qex="${e}" class="${e === ex ? "on" : ""}">${EX[e].short || EX[e].name}</button>`).join("")}</div>
    <div class="qrow"><div class="qst"><button data-gstep="${ex}:-1" aria-label="Fewer reps" ${n <= 1 ? "disabled" : ""}>−</button><b>${n}</b><button data-gstep="${ex}:1" aria-label="More reps">+</button><small>reps</small></div>
      ${QUICK_KG.includes(ex) ? `<div class="qst"><button data-gkg="${ex}:-1" aria-label="Less weight" ${kg <= 0 ? "disabled" : ""}>−</button><b>${kg ? "+" + fmtKg(kg) : 0}</b><button data-gkg="${ex}:1" aria-label="More weight">+</button><small>kg</small></div>` : ""}</div>
    <button class="qadd ${warn ? "warn" : ""}" data-quick="${ex}">Add ${n} ${v ? "L-sit " : ""}${one}${kg ? ` +${fmtKg(kg)} kg` : ""}</button>
    ${warn ? `<p class="qwarn">That's over 60% of your max — groove sets should feel easy.</p>` : ""}</div>`;
}

// --- charts (inline SVG) ---
function lineChart(points, opts = {}) {      // points: [{ x: label, y, tag }]
  if (points.length < 1) return `<p class="muted">Log a few sessions to see the line.</p>`;
  const W = 340, H = 170, P = { l: 30, r: 10, t: 14, b: 22 };
  // tight: a narrow y range around the data (body weight), else from 90% of the lowest point
  const ys = points.map(p => p.y), lo = opts.tight ? Math.floor(Math.min(...ys) - 1) : Math.floor(Math.min(...ys) * 0.9), hi = opts.tight ? Math.ceil(Math.max(...ys) + 1) : Math.ceil(Math.max(...ys) * 1.05) || 1;
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
function barChart(bars, label = "weekly reps") {          // [{ x, y }]
  const W = 340, H = 150, P = { l: 6, r: 6, t: 18, b: 22 }, max = Math.max(1, ...bars.map(b => b.y));
  const bw = (W - P.l - P.r) / bars.length;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">${bars.map((b, i) => {
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
  // with added weight and not there yet: the heaviest set so far, so the goal shows movement
  const heavy = g.kg > 0 ? setsOf(g.ex).filter(s => s.kg > 0).sort((x, y) => y.kg - x.kg || y.reps - x.reps)[0] : null;
  return { best: b, done: g.done || (!g.manual && b >= g.reps), heavy, pct: g.kg > 0 && !b && heavy ? Math.min(.95, heavy.kg / g.kg * heavy.reps / g.reps) : b / g.reps };
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
  lunge: ["quads", "calves"], kneeraise: ["core", "forearms"], legraise: ["core", "forearms"] };
const musclesOf = s => (MUSCLE_OF[s.ex] || []).concat(s.ex === "pullup" && s.v === 1 ? ["core"] : []);   // L-sit adds core
const glow = d => d <= 1 ? 1 : d === 2 ? .8 : d === 3 ? .6 : d <= 6 ? .35 : 0;   // days since trained -> color strength
// recovery: how fresh each muscle is (0-100%). Every session leaves fatigue by how much was done (a working set = 1,
// weighted 1.2, groove set 0.4; a run by its effort), fading by about two thirds every 30 hours. 8 units = 0% recovered.
const REC_TAU = 30, REC_FULL = 8;
const setLoad = s => s.gtg ? .4 : s.kg > 0 ? 1.2 : 1;
const runLoad = r => Math.min(REC_FULL, (effortOf(r) || r.dur / 60 * 2) / 20);
function recovery(skipFrom = Infinity, skip = null) { return skip ? recoveryRaw(skipFrom, skip) : memo(`rec:${skipFrom}`, () => recoveryRaw(skipFrom)); }
function recoveryRaw(skipFrom = Infinity, skip = null) {   // leave out what was done from skipFrom on, and anything skip(set or run) picks
  const now = Date.now(), F = {};
  for (const m in MUSCLES) F[m] = 0;
  const add = (x, t, ms, l) => { const h = (now - t) / 36e5; if (h < 0 || h > 240 || t >= skipFrom || (skip && skip(x))) return; for (const m of ms) F[m] += l * Math.exp(-h / REC_TAU); };
  for (const s of S.sets) add(s, s.t, musclesOf(s), setLoad(s));
  for (const r of S.runs) add(r, r.t + r.dur * 1000, RUN_MUSCLES[r.sport] || RUN_MUSCLES.run, runLoad(r));
  for (const x of S.wods) for (const m in x.load) add(x, x.t, [m], x.load[m]);
  const out = {}; for (const m in MUSCLES) out[m] = Math.round(100 * Math.max(0, 1 - F[m] / REC_FULL));
  return out;
}
const muscleState = () => memo("muscles", muscleStateRaw);
function muscleStateRaw() {
  const last = {}, by = {}, today = dayKey();
  for (const s of S.sets) { const k = dayKey(s.t); for (const m of musclesOf(s)) if (!last[m] || k >= last[m]) { last[m] = k; by[m] = EX[s.ex].name.toLowerCase(); } }
  for (const r of S.runs) { const k = dayKey(r.t); for (const m of RUN_MUSCLES[r.sport] || RUN_MUSCLES.run) if (!last[m] || k >= last[m]) { last[m] = k; by[m] = KIND[r.sport] || "run"; } }
  for (const x of S.wods) { const k = dayKey(x.t); for (const m in x.load) if (x.load[m] >= .3 && (!last[m] || k >= last[m])) { last[m] = k; by[m] = "WOD"; } }
  const st = {}, rec = recovery();
  for (const m in MUSCLES) {
    const d = last[m] ? Math.round((keyToDate(today) - keyToDate(last[m])) / 864e5) : null;
    st[m] = { d, g: d === null ? 0 : glow(d), what: by[m], rec: rec[m] };
  }
  return st;
}
const agoText = d => d === null ? "not yet" : d === 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
// ---------- the figure ----------
// the arms are cut out along the shoulder so they can sway on their own (points in spidey.png pixels)
const ARM_L = "41,74 27,90 21,130 9,175 1,212 0,266 33,266 33,214 40,180 46,150 48,118 48,100 46,86";
const ARM_R = "141,74 155,90 161,130 173,175 181,212 182,266 149,266 149,214 142,180 136,150 134,118 134,100 136,86";
let figImg = null, figKey = "", figUrl = "", figCanvas = null, flashAt = 0, flashM = [], flashWord = "";
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
  x.putImageData(img, 0, 0); figCanvas = c;
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
  const trained = activeDays();
  for (let k = since; k <= today; k = addDays(k, 1)) { if (trained.has(k)) days++; if ((S.daily[k] || {}).creatine) creatine++; }
  const rows = Object.keys(MUSCLES).map(m => `<button class="mrow ${st[m].g ? "" : "off"}" data-muscle="${m}">
      <i style="opacity:${st[m].g ? .3 + .7 * st[m].g : 1}"></i><span>${MUSCLES[m].name}</span><small>${st[m].d === null ? "not yet" : st[m].d === 0 ? "today" : st[m].d === 1 ? "yesterday" : `${st[m].d}d ago`}${st[m].rec < 100 ? ` · <em class="${st[m].rec < 50 ? "low" : ""}">${st[m].rec}%</em>` : ""}</small></button>`).join("");
  return `<h3>This week's body</h3><div class="card"><div class="bodymap">${bodySvg(st, "")}
    <div class="mlist">${rows}</div></div>
    <div class="hm-foot"><span><b>${days}</b> training day${days === 1 ? "" : "s"} · <b>${creatine}</b> creatine day${creatine === 1 ? "" : "s"} <span class="muted">(last 30)</span></span></div></div>`;
}
// what to train next: exercises that would light up the gray muscles
function muscleInfo(m) {
  const s = muscleState()[m], how = Object.keys(MUSCLE_OF).filter(ex => MUSCLE_OF[ex].includes(m)).map(ex => EX[ex].name.toLowerCase());
  if (m === "core") how.push("L-sit pull-ups");
  if (m === "quads" || m === "calves") how.push("a run");
  toast(s.d === null ? `${MUSCLES[m].name}: not trained yet. Try ${how.join(" or ")}.`
    : `${MUSCLES[m].name}: last trained ${agoText(s.d)} (${s.what}), ${s.rec}% recovered.${s.rec < 50 ? " Give it rest or go light." : s.g ? "" : " Gone gray — time for " + how.join(" or ") + "."}`);
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
  // best bodyweight set per day, in the variation you use now (weighted sets have their own chart, so lines don't zigzag)
  const days = {}, lastBw = all.filter(s => !s.gtg && !s.kg).pop(), refV = lastBw ? lastBw.v || 0 : 0;
  for (const s of all) { if (s.gtg || s.kg || (s.v || 0) !== refV) continue; const d = dayKey(s.t); if (!days[d] || s.reps > days[d].reps) days[d] = s; }
  const pts = Object.keys(days).sort().slice(-30).map(d => ({ x: shortDate(d), y: days[d].reps, tag: days[d].reps + " reps" }));
  const bestTitle = `Best bodyweight set by day${VARS[ex] && refV ? ` (${varName(ex, refV)})` : ""}`;
  let e1Chart = "";
  if (ex === "pullup") {
    const wd = {};
    for (const s of all) if (s.kg > 0) { const d = dayKey(s.t), v = epley(bwOn(d) + s.kg, s.reps); wd[d] = Math.max(wd[d] || 0, v); }
    const p2 = Object.keys(wd).sort().slice(-30).map(d => ({ x: shortDate(d), y: Math.round(wd[d]), tag: Math.round(wd[d]) + " kg" }));
    e1Chart = `<h3>Estimated 1-rep max (weighted pull-ups)</h3><div class="card">${lineChart(p2, { label: "estimated 1RM" })}</div>`;
  }
  const weeks = []; for (let i = 7; i >= 0; i--) { const w = addDays(wk, -7 * i); weeks.push({ x: shortDate(w), y: weekReps(ex, w) }); }
  const goals = S.goals.map(g => {
    const p = goalProgress(g), pct = Math.min(100, Math.round(100 * p.pct));
    const sub = g.manual ? "tick it when your form is clean" : p.best || !p.heavy ? `best: ${p.best} / ${g.reps}${g.kg ? ` at +${fmtKg(g.kg)} kg` : ""}` : `heaviest so far: ${p.heavy.reps} × +${fmtKg(p.heavy.kg)} kg`;
    return `<div class="goal ${p.done ? "done" : ""}"><div class="t">${p.done ? "✓ " : ""}${esc(g.label)}<div class="muted" style="font-size:13px">${sub}</div>
      <div class="bar"><i style="width:${p.done ? 100 : pct}%"></i></div></div>
      ${g.manual ? `<button data-goal-done="${g.id}">${g.done ? "↺" : "✓"}</button>` : ""}</div>`;
  }).join("");
  const pt = S.settings.progTab || "body";
  const seg = `<div class="seg ptabs" role="tablist">${[["body", "Body"], ["lifts", "Lifts"], ["cardio", "Cardio"]].map(([k, n]) =>
    `<button role="tab" aria-selected="${k === pt}" data-ptab="${k}" class="${k === pt ? "on" : ""}">${n}</button>`).join("")}</div>`;
  if (pt === "body") return `<h1>Progress</h1>${seg}${bodyMap()}${calendarCard()}${bodyWeightCard()}`;
  if (pt === "cardio") return `<h1>Progress</h1>${seg}${runsProgress() || `<div class="card empty"><p>No runs, swims or games yet. Add one from a Garmin file, Apple Health or by hand, and your weekly distance and heart-rate zones show up here.</p><button class="small-btn primary" data-run-add>Add a run</button></div>`}`;
  return `<h1>Progress</h1>${seg}${wodHistory()}<div class="chips">${chips}</div>${stats}
    <h3>${bestTitle}</h3><div class="card">${lineChart(pts, { label: "best set" })}</div>
    ${e1Chart}
    <h3>Total reps per week</h3><div class="card">${barChart(weeks)}</div>
    ${recTable}
    <h3>Goals</h3><div class="card">${goals || '<p class="muted">No goals. Add one under More.</p>'}</div>`;
}

// body weight over the last 12 weeks, one point per weigh-in
function bodyWeightCard() {
  const ks = Object.keys(S.body).sort().filter(k => k >= addDays(dayKey(), -84));
  if (!ks.length) return "";
  const pts = ks.map(k => ({ x: shortDate(k), y: S.body[k], tag: fmtKg(S.body[k]) + " kg" })), first = S.body[ks[0]], last = S.body[ks[ks.length - 1]], d = last - first;
  return `<h3>Body weight</h3><div class="card">${lineChart(pts, { label: "body weight", tight: true })}
    <p class="muted cnote">${ks.length > 1 ? `${d > 0 ? "+" : ""}${fmtKg(d)} kg since ${shortDate(ks[0])}` : "Log your weight under More to see the trend."}</p></div>`;
}
// a collapsible card; which ones are open survives re-renders
const openFolds = new Set();
const fold = (id, title, sub, body) => `<details class="card fold" data-fold="${id}"${openFolds.has(id) ? " open" : ""}><summary><span><b>${title}</b>${sub ? `<small>${sub}</small>` : ""}</span><i aria-hidden="true">›</i></summary><div class="fbody">${body}</div></details>`;
let allFavs = false;
function moreView() {
  const st = S.settings, today = dayKey(), r = st.ranges;
  const wd = k => { const d = keyToDate(k); return `${WD[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}`; };
  const bwKeys = Object.keys(S.body).sort().reverse();
  const bwRows = bwKeys.slice(0, 3).map((d, i) => { const nx = bwKeys[i + 1], diff = nx ? S.body[d] - S.body[nx] : 0;
    return `<div class="item"><span>${d === today ? "Today" : wd(d)}</span><b>${fmtKg(S.body[d])} kg${nx && Math.abs(diff) >= .05 ? ` <small class="${diff < 0 ? "dn" : "up"}">${diff > 0 ? "+" : ""}${fmtKg(diff)}</small>` : ""}</b></div>`; }).join("");
  const favList = S.favs.map(id => QUOTE_BY_ID[id]).filter(Boolean).reverse();
  const favs = favList.length ? favList.slice(0, allFavs ? 99 : 2).map(quoteCard).join("") + (favList.length > 2 ? `<button class="link morefav" data-act="favs-all">${allFavs ? "Show fewer" : `Show all ${favList.length}`}</button>` : "")
    : '<div class="card muted">Tap ♡ on any quote to keep it here.</div>';
  const num = (label, attr, val, ph = "") => `<div class="inrow"><label>${label}</label><input type="number" inputmode="numeric" ${attr} ${ph ? `placeholder="${ph}"` : ""} value="${val}"></div>`;
  const rangeRow = (label, key, a) => `<div class="inrow"><label>${label}</label><input type="number" inputmode="numeric" data-range="${key}:0" value="${a[0]}"> – <input type="number" inputmode="numeric" data-range="${key}:1" value="${a[1]}"></div>`;
  const goalRows = S.goals.map(g => `<div class="item"><span>${esc(g.label)}</span><button class="xbtn" data-goal-del="${g.id}" aria-label="Remove goal: ${esc(g.label)}">×</button></div>`).join("");
  const training = `
    <h4>Quick groove sets</h4>
    ${num("Pull-ups", 'data-gtg="pullup"', st.gtg.pullup)}${num("Push-ups", 'data-gtg="pushup"', st.gtg.pushup)}${num("Knee raises", 'data-gtg="kneeraise"', st.gtg.kneeraise)}${num("Leg raises", 'data-gtg="legraise"', st.gtg.legraise)}
    <p class="muted fnote">Keep groove pull-up sets at or under ${Math.floor(0.6 * maxBw("pullup"))} (60% of your max of ${maxBw("pullup")}).</p>
    <h4>Rest timer (seconds)</h4>
    ${num("After a bodyweight set", 'data-rest-set="bw"', st.rest.bw)}${num("After a weighted set", 'data-rest-set="wt"', st.rest.wt)}
    <p class="muted fnote">Starts when you log a set. 0 turns it off.</p>
    <h4>Rep ranges</h4>
    ${rangeRow("Pull-ups, bodyweight", "pullup.bw", r.pullup.bw)}${rangeRow("Pull-ups, weighted", "pullup.wt", r.pullup.wt)}
    ${rangeRow("Push-ups", "pushup", r.pushup)}${rangeRow("Squats", "squat", r.squat)}${rangeRow("Lunges (per leg)", "lunge", r.lunge)}${rangeRow("Knee raises", "kneeraise", r.kneeraise)}${rangeRow("Leg raises", "legraise", r.legraise)}
    <p class="muted fnote">Hit the top of the range on every set and the plan adds weight (or a harder variation).</p>
    <h4>Heart rate</h4>
    ${num("Max heart rate (bpm)", "data-maxhr", st.maxHr || "", maxHr())}
    <p class="muted fnote">Sets your zones. Use the max from Garmin Connect. Left empty: ${maxHr()}, the highest seen on a run (never under 185).</p>`;
  const goals = `${goalRows}
    <div class="inrow goalnew"><select id="g-ex" aria-label="Exercise">${Object.keys(EX).map(k => `<option value="${k}">${EX[k].short || EX[k].name}</option>`).join("")}</select>
      <input id="g-reps" type="number" inputmode="numeric" placeholder="reps" aria-label="Reps"><input id="g-kg" type="number" inputmode="decimal" placeholder="+kg" aria-label="Added kg">
      <button class="small-btn" data-act="goal-add">Add</button></div>`;
  const about = `${QUOTES.filter(q => !q.k).length} Stoic quotes, each checked word for word against public-domain translations:
      Marcus Aurelius and Epictetus tr. George Long; Seneca tr. Richard M. Gummere. Musonius Rufus is left out because the usual English translation may still be under copyright.
      <br><br>And ${QUOTES.filter(q => q.k === "spirit").length} in the Stoic spirit, from films, poems and speeches: the Dark Knight trilogy, Rocky, Roosevelt's man in the arena, Invictus, Kipling, Shakespeare, Frankl and more.
      Poems and speeches follow the printed texts; film lines are kept short and match the common transcripts.`;
  return `<h1>More</h1>
    <h3>Backup</h3><div class="card">
      <button class="big primary" data-act="backup">Back up now</button>
      <div class="inrow"><label>Remind me every</label><select data-backup-every aria-label="Backup reminder">${[[1, "day"], [3, "3 days"], [7, "week"], [14, "2 weeks"], [0, "never"]].map(([v, l]) => `<option value="${v}"${(st.backupEvery ?? 7) === v ? " selected" : ""}>${l}</option>`).join("")}</select></div>
      <p class="muted fnote">Last backup: ${st.lastBackup ? `${dayLabel(dayKey(st.lastBackup))} (${agoMin(st.lastBackup)})` : "never"}. Each backup is two files: <b>unbothered-….json</b> (everything, for Import) and <b>unbothered-activities-….csv</b> (laid out like Garmin Connect's activity export: runs, swims, games, WODs and each day's strength work). Save them to iCloud Drive or Files.</p>
      <div class="btn2"><button class="big" data-act="export">JSON only</button><button class="big" data-act="import">Import…</button></div><input id="imp" type="file" accept="application/json,.json" hidden></div>
    <h3>Body weight</h3><div class="card">
      <div class="inrow bwin"><label for="bw-in">Today</label><input id="bw-in" type="number" inputmode="decimal" step="0.1" placeholder="${fmtKg(bwOn(today))}" value="${S.body[today] ?? ""}"><span class="unit">kg</span><button class="small-btn primary" data-act="bw">Save</button></div>
      ${bwRows}${bwKeys.length > 1 ? `<button class="link morelink" data-act="bw-trend">See the trend in Progress ›</button>` : ""}</div>
    ${widgetSection()}
    <h3>Favourite quotes</h3>${favs}
    <h3>Goals</h3><div class="card">${goals}</div>
    <h3>Settings</h3>
    ${fold("training", "Training", "Groove sets, rest timer, rep ranges, heart rate", training)}
    <div class="card"><label class="fl">Look</label><div class="looks">${Object.keys(LOOKS).map(k => `<button data-look-set="${k}" class="${(LOOKS[st.look] ? st.look : "gotham") === k ? "on" : ""}" aria-label="${LOOKS[k].name} look"><i class="lk-${k}"></i><span>${LOOKS[k].name}</span></button>`).join("")}</div>
      ${st.look === "classic" ? `<div class="inrow"><label>Classic</label><div class="seg mini">
      <button data-theme-set="dark" class="${st.theme === "dark" ? "on" : ""}">Dark</button><button data-theme-set="light" class="${st.theme === "light" ? "on" : ""}">Light</button></div></div>` : ""}</div>
    ${fold("about", "About the quotes", `${QUOTES.length} quotes and where they come from`, `<p class="muted fnote">${about}</p>`)}
    <p class="muted ver">Unbothered · formerly Unbowed and Stoic Reps</p>`;
}

// ---------- events ----------
document.addEventListener("click", e => {
  const b = e.target.closest("button, [data-muscle], [data-goday], #suit, #restgo"); if (!b) return;
  const d = b.dataset;
  if (d.muscle) { muscleInfo(d.muscle); return; }
  if (d.ptab) { S.settings.progTab = d.ptab; save(); render(); return; }
  if (d.tab) { tab = d.tab; render(); window.scrollTo(0, 0); return; }
  if (d.fav !== undefined) { toggleFav(d.fav); if (tab === "more") render(); return; }
  if (d.ex) { openSheet(d.ex); return; }
  if (d.runAdd !== undefined) { openRunSheet(); return; }
  if (d.hand) {   // keep what's typed while switching sport
    const keep = ["rn-min", "rn-km", "rn-hr"].map(id => $("#" + id).value), was = handSport; handSport = d.hand; openRunSheet();
    ["rn-min", "rn-km", "rn-hr"].forEach((id, i) => { $("#" + id).value = i === 1 && was !== handSport ? "" : keep[i]; }); return; }
  if (d.act === "run-file") { $("#run-file").click(); return; }
  if (d.act === "widget-send") { S.settings.widgetOn = true; sendToWidget(); return; }
  if (d.act === "widget-copy") { copyWidgetScript(); return; }
  if (d.act === "next-open") { nextOpen = true; render(); return; }
  if (d.act === "wod-pick") { wodPicker(); return; }
  if (d.wpick) { wodDay().wodId = d.wpick; save(); $("#modal").hidden = true; render(); window.scrollTo(0, 0); return; }
  if (d.wfil) { wodFilter = d.wfil; wodPicker(); return; }
  if (d.wscale) { wodDay().wodScale = d.wscale; save(); render(); return; }
  if (d.act === "wod-move") { wodMove(+d.i); return; }
  if (d.act === "wod-pause") { wodPause(); return; }
  if (d.act === "wod-start") { wodStart(); return; }
  if (d.act === "wod-another") { const x = wodDay(); x.wodSkip = (x.wodSkip || 0) + 1; delete x.wodId; save(); render(); return; }
  if (d.act === "wod-more") { const x = wodDay(); x.wodMore = true; x.wodSkip = (x.wodSkip || 0) + 1; delete x.wodId; save(); render(); return; }
  if (d.act === "wod-log") { wodFinish(true); return; }
  if (d.act === "wod-finish") { wodFinish(); return; }
  if (d.act === "wod-save") { wodSave(); return; }
  if (d.act === "wod-round") { const r = wodDay().wodRun; if (r) { r.rounds = (r.rounds || 0) + 1; save(); const e = $("#wrounds"); if (e) e.textContent = r.rounds; beep(1, 770); } return; }
  if (d.act === "wod-cancel") { if (!wodCancelArm) { wodCancelArm = true; render(); return; } const x = wodDay(); delete x.wodRun; wodCancelArm = false; clearInterval(wodT); keepAwake(false); save(); render(); toast("Workout cancelled"); return; }
  if (d.act === "favs-all") { allFavs = !allFavs; render(); return; }
  if (d.act === "bw-trend") { S.settings.progTab = "body"; save(); tab = "progress"; render(); window.scrollTo(0, document.body.scrollHeight); return; }
  if (d.goday) { logDay = d.goday === dayKey() ? null : d.goday; tab = "home"; render(); const c = document.querySelector(".runcard"); if (c) c.scrollIntoView({ block: "center" }); return; }
  if (d.act === "run-save") { saveHandRun(); return; }
  if (d.act === "run-paste") {   // read the shortcut's text from the clipboard; if the phone won't allow it, show a box to paste into
    const box = () => { $("#rn-pastebox").hidden = false; $("#rn-text").focus(); };
    if (!navigator.clipboard || !navigator.clipboard.readText) { box(); return; }
    const wait = setTimeout(box, 3000);   // no answer (prompt ignored): offer the box too
    navigator.clipboard.readText().then(t => { clearTimeout(wait); addHealthRun(t); }, () => { clearTimeout(wait); box(); });
    return;
  }
  if (d.act === "run-paste-text") { addHealthRun($("#rn-text").value); return; }
  if (d.runDel !== undefined) { const t = +d.runDel;
    if (pendingRunDel === t) { S.runs = S.runs.filter(r => r.t !== t); pendingRunDel = null; save(); toast("Removed"); } else pendingRunDel = t;
    render(); return; }
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
  if (b.id === "sh-log") { logCur(); return; }
  if (d.same !== undefined && cur) { const r = sameRef(cur.ex); if (r) { cur.reps = r.reps; cur.kg = r.kg || 0; cur.v = r.v || 0; logCur(); } return; }
  if (d.prog) { progEx = d.prog; render(); return; }
  if (d.goalDone) { const g = S.goals.find(x => x.id === +d.goalDone); g.done = !g.done; save(); render(); return; }
  if (d.goalDel) { S.goals = S.goals.filter(x => x.id !== +d.goalDel); save(); render(); return; }
  if (d.themeSet) { S.settings.theme = d.themeSet; save(); render(); return; }
  if (d.lookSet) { S.settings.look = d.lookSet; save(); render(); return; }
  if (d.act === "bw") { const v = parseFloat($("#bw-in").value); if (v > 30 && v < 250) { S.body[dayKey()] = v; save(); toast("Body weight saved"); render(); } else toast("Enter your weight in kg", true); return; }
  if (d.act === "goal-add") {
    const ex = $("#g-ex").value, reps = parseInt($("#g-reps").value), kg = parseFloat($("#g-kg").value) || 0;
    if (!(reps > 0)) { toast("Enter the reps for the goal", true); return; }
    S.goals.push({ id: Date.now(), ex, reps, kg, label: `${reps} ${EX[ex].one}s${kg ? ` with +${fmtKg(kg)} kg` : " unbroken"}` }); save(); render(); return;
  }
  if (d.act === "backup") { doBackup(); return; }
  if (d.act === "backup-later") { S.settings.backupSnooze = Date.now(); save(); render(); return; }
  if (d.act === "export") {
    const blob = new Blob([JSON.stringify(S, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `unbothered-${dayKey()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000); return;
  }
  if (d.act === "import") { $("#imp").click(); return; }
});
document.addEventListener("toggle", e => { const f = e.target.dataset && e.target.dataset.fold; if (f) { if (e.target.open) openFolds.add(f); else openFolds.delete(f); } }, true);
document.addEventListener("change", e => {
  const t = e.target;
  if (t.id === "imp" && t.files[0]) {
    t.files[0].text().then(txt => {
      const j = JSON.parse(txt);
      if (!j || !Array.isArray(j.sets) || !j.settings) throw new Error("not an Unbothered (Stoic Reps) backup");
      S = fillIn(Object.assign(defaults(), j)); save(); toast(`Imported ${S.sets.length} sets`); render();
    }).catch(err => toast("Import failed: " + err.message, true));
    return;
  }
  if (t.dataset.backupEvery !== undefined) { S.settings.backupEvery = parseInt(t.value) || 0; save(); render(); return; }
  if (t.dataset.range) {
    const [key, i] = t.dataset.range.split(":"), v = parseInt(t.value); if (!(v > 0)) return;
    const [ex, sub] = key.split("."); const arr = sub ? S.settings.ranges[ex][sub] : S.settings.ranges[ex];
    arr[+i] = v; if (arr[0] > arr[1]) arr.reverse(); save(); return;
  }
  if (t.id === "run-file" && t.files[0]) {
    const f = t.files[0]; toast("Reading " + f.name + "…");
    f.arrayBuffer().then(b => Garmin.parse(f.name, b)).then(addRun).catch(err => toast("Couldn't read that file: " + err.message, true));
    t.value = ""; return;
  }
  if (t.dataset.maxhr !== undefined) { const v = parseInt(t.value); S.settings.maxHr = v >= 120 && v <= 230 ? v : 0; save(); return; }
  if (t.dataset.restSet) { const v = parseInt(t.value); if (v >= 0 && v <= 900) { S.settings.rest[t.dataset.restSet] = v; save(); } return; }
  if (t.dataset.gtg) {
    const v = parseInt(t.value); if (!(v > 0)) return; S.settings.gtg[t.dataset.gtg] = v; save();
    if (t.dataset.gtg === "pullup" && !gtgKg("pullup") && gtgWarn(v)) toast(`${v} is over 60% of your max. Groove sets should feel easy.`, true);
  }
});
$("#sheet").addEventListener("click", e => { if (e.target.id === "sheet") closeSheet(); });

render();
wodTicking();
document.addEventListener("visibilitychange", () => { if (!document.hidden && wodDay().wodRun) { keepAwake(true); wodTick(); } });
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
