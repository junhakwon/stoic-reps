// Garmin activity files -> one run summary, read on the phone (nothing is uploaded anywhere).
// Reads .fit (also inside the .zip that Garmin Connect's "Export Original" gives), .gpx and .tcx.
// Result: { t (start, ms), dur (moving s), dist (m), kcal, avgHr, maxHr, sport, hr: { bpm: seconds }, trace: [bpm...], src }
// plus, for a swim: swim { pool (m), yd (pool set in yards), lengths, strokes, stroke, open }; for soccer: top (m/s), sprints
"use strict";
const Garmin = (() => {
  const FIT_EPOCH = 631065600;   // 1989-12-31 00:00 UTC, in Unix seconds
  const FIT_SPORT = { 1: "run", 11: "walk", 17: "hike", 2: "ride", 5: "swim", 7: "soccer" };
  const STROKES = ["freestyle", "backstroke", "breaststroke", "butterfly", "drill", "mixed"];

  async function parse(name, buf) {
    let u = new Uint8Array(buf);
    if (u[0] === 0x50 && u[1] === 0x4b) u = await unzip(u);   // "PK": a zip
    if (u.length > 12 && u[8] === 0x2e && u[9] === 0x46 && u[10] === 0x49 && u[11] === 0x54) return fit(u);   // ".FIT"
    const txt = new TextDecoder().decode(u);
    if (/<TrainingCenterDatabase/i.test(txt)) return tcx(txt);
    if (/<gpx[\s>]/i.test(txt)) return gpx(txt);
    throw new Error("that isn't a .fit, .gpx or .tcx file");
  }

  // ---------- zip: take the first activity file inside ----------
  async function unzip(u) {
    const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
    let e = u.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error("damaged zip file");
    let p = dv.getUint32(e + 16, true);
    for (let n = dv.getUint16(e + 10, true); n > 0; n--) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true);
      const name = new TextDecoder().decode(u.subarray(p + 46, p + 46 + nl)), local = dv.getUint32(p + 42, true);
      p += 46 + nl + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
      if (!/\.(fit|gpx|tcx)$/i.test(name)) continue;
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true), data = u.subarray(start, start + csize);
      if (method === 0) return data;
      if (method !== 8 || typeof DecompressionStream === "undefined") throw new Error("can't open this zip here — unzip it in Files first");
      const out = new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw")));
      return new Uint8Array(await out.arrayBuffer());
    }
    throw new Error("no .fit, .gpx or .tcx file in that zip");
  }

  // ---------- FIT ----------
  const SZ = [1, 1, 1, 2, 2, 4, 4, 0, 4, 8, 1, 2, 4, 1, 8, 8, 8];   // bytes per base type (low 5 bits)
  function val(dv, p, f, le) {
    const t = f.type, s = SZ[t];
    if (!s || f.size !== s || t >= 14) return null;   // arrays, strings and 64-bit numbers aren't needed
    let v;
    if (t === 1) { v = dv.getInt8(p); return v === 0x7f ? null : v; }
    if (t === 3) { v = dv.getInt16(p, le); return v === 0x7fff ? null : v; }
    if (t === 5) { v = dv.getInt32(p, le); return v === 0x7fffffff ? null : v; }
    if (t === 8) { v = dv.getFloat32(p, le); return isFinite(v) ? v : null; }
    if (t === 9) { v = dv.getFloat64(p, le); return isFinite(v) ? v : null; }
    v = s === 1 ? dv.getUint8(p) : s === 2 ? dv.getUint16(p, le) : dv.getUint32(p, le);
    if (t >= 10 && t <= 12) return v === 0 ? null : v;
    return v === (s === 1 ? 0xff : s === 2 ? 0xffff : 0xffffffff) ? null : v;
  }
  function fit(u) {
    const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
    const hs = u[0], end = Math.min(u.length, hs + dv.getUint32(4, true));
    const defs = {}, recs = [], sess = [], lens = [];
    let p = hs, lastTs = 0;
    while (p < end) {
      const h = u[p++];
      let local, ts = null;
      if (h & 0x80) {   // compressed timestamp header
        local = (h >> 5) & 3; const off = h & 0x1f;
        ts = (lastTs & ~0x1f) + off; if (off < (lastTs & 0x1f)) ts += 0x20; lastTs = ts;
      } else if (h & 0x40) {   // definition message
        if (p + 5 > end) break;
        const le = u[p + 1] === 0, g = dv.getUint16(p + 2, le), n = u[p + 4]; p += 5;
        const fields = []; for (let i = 0; i < n; i++, p += 3) fields.push({ num: u[p], size: u[p + 1], type: u[p + 2] & 0x1f });
        let dev = 0; if (h & 0x20) { const nd = u[p++]; for (let i = 0; i < nd; i++, p += 3) dev += u[p + 1]; }
        defs[h & 0x0f] = { g, le, fields, dev, size: fields.reduce((a, f) => a + f.size, 0) + dev };
        continue;
      } else local = h & 0x0f;
      const d = defs[local];
      if (!d) throw new Error("this .fit file looks damaged");
      if (p + d.size > end) break;
      if (d.g === 20 || d.g === 18 || d.g === 101) {   // record, session, length (one pool length)
        const m = {};
        let q = p; for (const f of d.fields) { m[f.num] = val(dv, q, f, d.le); q += f.size; }
        if (m[253] != null) lastTs = m[253]; else if (ts != null) m[253] = ts;
        (d.g === 20 ? recs : d.g === 18 ? sess : lens).push(m);
      } else if (d.fields.length && d.fields[0].num === 253) {   // keep the clock right for compressed timestamps
        const f = d.fields.find(f => f.num === 253); let q = p; for (const g of d.fields) { if (g === f) break; q += g.size; }
        const v = val(dv, q, f, d.le); if (v != null) lastTs = v;
      }
      p += d.size;
    }
    const samples = recs.filter(r => r[253] != null).map(r => ({ t: r[253], hr: r[3], dist: r[5] != null ? r[5] / 100 : null,
      v: r[73] != null ? r[73] / 1000 : r[6] != null ? r[6] / 1000 : null }));
    const s = sess[0];
    if (!s && !samples.length) throw new Error("no activity found in that .fit file");
    const sum = (k, div = 1) => sess.reduce((a, x) => a + (x[k] || 0), 0) / div;
    const lastDist = samples.reduce((a, x) => x.dist != null ? x.dist : a, null);
    const sport = s ? FIT_SPORT[s[5]] || "activity" : "run", extra = {};
    if (sport === "swim") {
      // pool swims: the lengths you swam (idle lengths are rests), the pool size, strokes and the stroke you used most
      const act = lens.filter(l => l[12] !== 0), unit = s[46], dist = sum(9, 100);
      let pool = s[44] != null ? s[44] / 100 : null;
      const open = s[6] === 18 || (!act.length && !pool);
      if (!open && !(pool >= 10 && pool <= 100) && act.length && dist) pool = Math.round(dist / act.length);
      const by = {}; for (const l of act) if (l[7] != null && STROKES[l[7]]) by[l[7]] = (by[l[7]] || 0) + 1;
      const top = Object.keys(by).sort((x, y) => by[y] - by[x])[0];
      const strokes = act.reduce((t, l) => t + (l[5] || 0), 0) || s[10] || null;
      extra.swim = open ? { open: true, strokes } : { pool, yd: unit === 1, lengths: act.length || (pool && dist ? Math.round(dist / pool) : null), strokes, stroke: top != null ? STROKES[top] : null };
    }
    if (sport === "soccer") {
      // top speed, and sprints: each time you got over 20 km/h (5.5 m/s) after dropping under 14 km/h
      const sp = samples.map(x => x.v).filter(v => v != null && v < 12);   // over 12 m/s is a GPS jump
      const max = s[125] != null ? s[125] / 1000 : s[15] != null ? s[15] / 1000 : null;
      let n = 0, armed = true; for (const v of sp) { if (armed && v >= 5.5) { n++; armed = false; } else if (v < 3.9) armed = true; }
      extra.top = Math.round(100 * (max != null && max < 12 ? max : sp.length ? Math.max(...sp) : 0)) / 100 || null;
      if (sp.length) extra.sprints = n;
    }
    return summary({
      start: s && s[2] != null ? s[2] : samples[0].t, sport, extra, noSplits: sport === "swim" || sport === "soccer",
      dur: s && s[8] != null ? sum(8, 1000) : null, elapsed: s && s[7] != null ? sum(7, 1000) : null,
      dist: s && s[9] != null ? sum(9, 100) : lastDist, kcal: s ? sum(11) || null : null,
      avgHr: s ? s[16] : null, maxHr: s ? sess.reduce((a, x) => Math.max(a, x[17] || 0), 0) || null : null,
      samples, src: "fit", fitTime: true, gap: sport === "swim" ? 150 : 30,   // a swim logs a point per pool length, so allow longer gaps
    });
  }

  // ---------- GPX / TCX (plain text, read with a few patterns) ----------
  const tag = (s, name) => { const m = s.match(new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>([^<]*)<`)); return m ? m[1].trim() : null; };
  const num = x => x == null || x === "" ? null : +x;
  function gpx(txt) {
    const pts = [];
    for (const m of txt.matchAll(/<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/g)) {
      const lat = num((m[1].match(/lat="([^"]+)"/) || [])[1]), lon = num((m[1].match(/lon="([^"]+)"/) || [])[1]), time = tag(m[2], "time");
      if (time) pts.push({ t: Date.parse(time) / 1000, hr: num(tag(m[2], "hr")), lat, lon });
    }
    if (!pts.length) throw new Error("no track points in that .gpx file");
    let d = 0; if (pts.length) pts[0].dist = 0;
    for (let i = 1; i < pts.length; i++) { if (pts[i].lat != null && pts[i - 1].lat != null) d += hav(pts[i - 1], pts[i]); pts[i].dist = d; }
    const type = (tag(txt, "type") || "running").toLowerCase();
    const sport = /walk/.test(type) ? "walk" : /hik/.test(type) ? "hike" : /cycl|bik/.test(type) ? "ride" : /swim/.test(type) ? "swim" : /soccer|football/.test(type) ? "soccer" : "run";
    return summary({ start: pts[0].t, sport, noSplits: sport === "swim" || sport === "soccer",
      dist: d || null, samples: pts, src: "gpx" });
  }
  function tcx(txt) {
    const sport = ((txt.match(/<Activity\s+Sport="([^"]+)"/) || [])[1] || "Running").toLowerCase();
    let dur = 0, dist = 0, kcal = 0, maxHr = 0, hrSum = 0;
    for (const m of txt.matchAll(/<Lap\b[^>]*>([\s\S]*?)<\/Lap>/g)) {
      const head = m[1].split(/<Track\b/)[0], t = num(tag(head, "TotalTimeSeconds")) || 0;
      dur += t; dist += num(tag(head, "DistanceMeters")) || 0; kcal += num(tag(head, "Calories")) || 0;
      const avg = head.match(/<AverageHeartRateBpm>\s*<Value>(\d+)/), mx = head.match(/<MaximumHeartRateBpm>\s*<Value>(\d+)/);
      if (avg) hrSum += +avg[1] * t; if (mx) maxHr = Math.max(maxHr, +mx[1]);
    }
    const pts = [];
    for (const m of txt.matchAll(/<Trackpoint>([\s\S]*?)<\/Trackpoint>/g)) {
      const time = tag(m[1], "Time"), hr = m[1].match(/<HeartRateBpm>\s*<Value>(\d+)/);
      if (time) pts.push({ t: Date.parse(time) / 1000, hr: hr ? +hr[1] : null, dist: num(tag(m[1], "DistanceMeters")) });
    }
    const id = tag(txt, "Id");
    if (!pts.length && !dur) throw new Error("no activity found in that .tcx file");
    return summary({ start: pts.length ? pts[0].t : Date.parse(id) / 1000, sport: /walk/.test(sport) ? "walk" : /bik|cycl/.test(sport) ? "ride" : "run",
      dur: dur || null, dist: dist || null, kcal: kcal || null, avgHr: hrSum && dur ? Math.round(hrSum / dur) : null, maxHr: maxHr || null,
      samples: pts, src: "tcx" });
  }
  function hav(a, b) {
    const R = 6371e3, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  // ---------- Apple Health text from the "Run to Stoic Reps" shortcut ----------
  // [HR] lines: start, bpm   [DIST] lines: start, end, value, unit, source. The run is found in today's samples:
  // first Garmin's distance samples (they belong to the synced activity), else a stretch of raised heart rate.
  function fromHealth(txt, maxHr = 185) {
    if (!/STOICREPS-HEALTH/.test(txt || "")) throw new Error("no run on the clipboard. Run the \"Run to Stoic Reps\" shortcut first");
    const hr = [], dist = []; let sec = "";
    if (/STOICREPS-HEALTH 2/.test(txt)) return fromHealth2(txt, maxHr);
    for (const raw of txt.split(/\r?\n/)) {
      const l = raw.trim(); if (!l) continue;
      if (l === "[HR]") { sec = "hr"; continue; } if (l === "[DIST]") { sec = "dist"; continue; }
      const p = l.split(",").map(s => s.trim());
      if (sec === "hr" && p.length >= 2) {   // a decimal comma would split the number: glue it back
        const t = Date.parse(p[0]) / 1000, v = parseFloat(p.slice(1).join(".").replace(/[^\d.]/g, ""));
        if (t && v > 30 && v < 240) hr.push({ t, hr: Math.round(v) });
      } else if (sec === "dist" && p.length >= 5) {
        const a = Date.parse(p[0]) / 1000, b = Date.parse(p[1]) / 1000, src = p[p.length - 1], unit = p[p.length - 2].toLowerCase();
        const v = parseFloat(p.slice(2, -2).join(".").replace(/[^\d.]/g, ""));
        const k = /^mi/.test(unit) ? 1609.344 : /^km/.test(unit) ? 1000 : /^m$|^met/.test(unit) ? 1 : /^ft/.test(unit) ? .3048 : /^y/.test(unit) ? .9144 : 1000;
        if (a && b >= a && v >= 0) dist.push({ a, b, m: v * k, garmin: /garmin/i.test(src) });
      }
    }
    hr.sort((x, y) => x.t - y.t); dist.sort((x, y) => x.a - y.a);
    let win = null;
    // 1. Garmin distance samples, grouped where they're under 5 minutes apart; the latest group of 300 m or more
    const gd = dist.filter(d => d.garmin), groups = [];
    for (const d of gd) { const g = groups[groups.length - 1]; if (g && d.a - g.e <= 300) { g.e = Math.max(g.e, d.b); g.m += d.m; } else groups.push({ s: d.a, e: d.b, m: d.m }); }
    const big = groups.filter(g => g.m >= 300 && g.e - g.s >= 180);
    if (big.length) win = big[big.length - 1];
    // 2. otherwise: heart rate at 60% of max or more, gaps under 3 minutes; the latest stretch of 10+ minutes (else the longest of 5+)
    if (!win) {
      const thr = Math.max(100, .6 * maxHr), segs = [];
      for (const x of hr) { if (x.hr < thr) continue; const g = segs[segs.length - 1]; if (g && x.t - g.e <= 180) g.e = x.t; else segs.push({ s: x.t, e: x.t }); }
      const long = segs.filter(g => g.e - g.s >= 600);
      win = long.length ? long[long.length - 1] : segs.filter(g => g.e - g.s >= 300).sort((x, y) => (y.e - y.s) - (x.e - x.s))[0] || null;
    }
    if (!win) throw new Error(hr.length || dist.length ? "couldn't find a run in today's Health data" : "no heart rate or distance from today in Health yet. Has Garmin Connect synced?");
    // distance in the window: Garmin's samples if there are any (the iPhone counts its own too), shared out by overlap
    const inWin = dist.filter(d => d.b > win.s - 60 && d.a < win.e + 60), use = inWin.some(d => d.garmin) ? inWin.filter(d => d.garmin) : inWin;
    const m = use.reduce((t, d) => { const len = d.b - d.a, ov = Math.min(d.b, win.e + 60) - Math.max(d.a, win.s - 60); return t + (len > 0 ? d.m * Math.max(0, Math.min(1, ov / len)) : d.m); }, 0);
    return summary({ start: win.s, dur: win.e - win.s, dist: m || null, sport: "run", samples: hr.filter(x => x.t >= win.s - 30 && x.t <= win.e + 30), gap: 300, src: "health" });
  }

  // v2: Health grouped the samples per minute. "[HR] first|last" then one bpm per line; "[DIST] first|last|unit" then one distance
  // per line. Times are spread evenly from first to last. Grouped distance is already merged across sources by Health.
  function fromHealth2(txt, maxHr) {
    const sec = {}; let cur = null;
    for (const raw of txt.split(/\r?\n/)) {
      const l = raw.trim(), h = l.match(/^\[(HR|DIST)\]\s*(.*)$/);
      if (h) { const p = h[2].split("|").map(s => s.trim()); cur = sec[h[1]] = { a: Date.parse(p[0]) / 1000, b: Date.parse(p[1]) / 1000, unit: (p[2] || "km").toLowerCase(), v: [] }; continue; }
      if (cur && l) cur.v.push(parseFloat(l.replace(",", ".").replace(/[^\d.]/g, "")) || 0);
    }
    const times = s => { const n = s.v.length, step = n > 1 && s.b && s.a ? (s.b - s.a) / (n - 1) : 60; return { step: Math.abs(step) || 60, t: i => step < 0 ? s.b + i * -step : s.a + i * step, rev: step < 0 }; };
    const hr = [], dist = [];
    if (sec.HR && sec.HR.a) { const T = times(sec.HR), v = T.rev ? sec.HR.v.slice().reverse() : sec.HR.v; v.forEach((x, i) => { if (x > 30 && x < 240) hr.push({ t: T.t(i), hr: Math.round(x) }); }); }
    let step = 60;
    if (sec.DIST && sec.DIST.a) {
      const T = times(sec.DIST), u = sec.DIST.unit, v = T.rev ? sec.DIST.v.slice().reverse() : sec.DIST.v; step = T.step;
      const k = /^mi/.test(u) ? 1609.344 : /^km/.test(u) ? 1000 : /^m$|^met/.test(u) ? 1 : /^ft/.test(u) ? .3048 : /^y/.test(u) ? .9144 : 1000;
      v.forEach((x, i) => { if (x > 0) dist.push({ a: T.t(i), b: T.t(i) + step, m: x * k }); });
    }
    if (!hr.length && !dist.length) throw new Error("no heart rate or distance in Health from the last 12 hours. Has Garmin Connect synced?");
    // the run: heart rate at 60% of max or more, gaps under 3 minutes; the latest stretch of 10+ minutes (else the longest of 5+)
    const thr = Math.max(100, .6 * maxHr), segs = [];
    for (const x of hr) { if (x.hr < thr) continue; const g = segs[segs.length - 1]; if (g && x.t - g.e <= 180) g.e = x.t; else segs.push({ s: x.t, e: x.t }); }
    const long = segs.filter(g => g.e - g.s >= 600);
    let win = long.length ? long[long.length - 1] : segs.filter(g => g.e - g.s >= 300).sort((x, y) => (y.e - y.s) - (x.e - x.s))[0] || null;
    if (win) {   // the last minute counts too; then take in the minutes on either side spent moving at running pace (heart rate lags at the start)
      win = { s: win.s, e: win.e + 60 };
      const fastAt = t => dist.some(d => Math.abs(d.a - t) < step / 2 && d.m / (d.b - d.a) >= 2);
      while (fastAt(win.s - step)) win.s -= step;
      while (fastAt(win.e)) win.e += step;
    }
    // no heart rate: minutes moving at running pace (2 m/s or more), gaps under 3 minutes, the latest stretch of 500 m or more
    if (!win) {
      const fast = [];
      for (const d of dist) { if (d.m / (d.b - d.a) < 2) continue; const g = fast[fast.length - 1]; if (g && d.a - g.e <= 180) { g.e = d.b; g.m += d.m; } else fast.push({ s: d.a, e: d.b, m: d.m }); }
      win = fast.filter(g => g.m >= 500).pop() || null;
    }
    if (!win) throw new Error("couldn't find a run in the last 12 hours of Health data");
    const m = dist.filter(d => d.a >= win.s - 30 && d.a < win.e).reduce((t, d) => t + d.m, 0);
    return summary({ start: win.s, dur: win.e - win.s, dist: m || null, sport: "run", samples: hr.filter(x => x.t >= win.s && x.t < win.e).concat([{ t: win.e, hr: null }]), gap: 300, src: "health" });
  }

  // ---------- shared: time at each heart rate, a short heart-rate line, and the totals ----------
  function summary(o) {
    const off = o.fitTime ? FIT_EPOCH : 0, S = o.samples || [], gap = o.gap || 30;
    const hr = {}; let moving = 0, hrTime = 0, hrSum = 0, maxHr = 0;
    if (S.length) S[0].mt = 0;
    for (let i = 1; i < S.length; i++) {
      const dt = S[i].t - S[i - 1].t;
      S[i].mt = moving + (dt > 0 && dt <= gap ? dt : 0);   // moving time so far (for splits)
      if (!(dt > 0 && dt <= gap)) continue;   // longer gaps are pauses
      moving += dt;
      const b = S[i - 1].hr;
      if (b > 30 && b < 240) { hr[b] = (hr[b] || 0) + dt; hrTime += dt; hrSum += b * dt; }
    }
    for (const x of S) if (x.hr > 30 && x.hr < 240) maxHr = Math.max(maxHr, x.hr);
    // the heart-rate line: up to 60 points, each the average of its slice of the run
    const withHr = S.filter(x => x.hr > 30 && x.hr < 240), trace = [];
    if (withHr.length > 1) {
      const t0 = withHr[0].t, span = withHr[withHr.length - 1].t - t0 || 1, n = Math.min(60, withHr.length), acc = Array.from({ length: n }, () => [0, 0]);
      for (const x of withHr) { const i = Math.min(n - 1, Math.floor((x.t - t0) / span * n)); acc[i][0] += x.hr; acc[i][1]++; }
      for (const [s, c] of acc) if (c) trace.push(Math.round(s / c));
    }
    // splits: moving seconds for each full kilometre, and the part after the last one (if 100 m or more)
    let splits = null, splitLast = null;
    const D = S.filter(x => x.dist != null);
    if (!o.noSplits && D.length > 1 && D[D.length - 1].dist - D[0].dist >= 1000) {
      splits = []; let next = 1000, prev = D[0].mt; const d0 = D[0].dist;
      for (let i = 1; i < D.length; i++) {
        const a = D[i - 1], b = D[i];
        while (b.dist - d0 >= next) {
          const f = (next - (a.dist - d0)) / ((b.dist - a.dist) || 1), at = a.mt + f * (b.mt - a.mt);
          splits.push(Math.round(at - prev)); prev = at; next += 1000;
        }
      }
      const rest = D[D.length - 1].dist - d0 - (next - 1000);
      if (rest >= 100) splitLast = [Math.round(D[D.length - 1].mt - prev), Math.round(rest)];
    }
    const dur = Math.round(o.dur || moving || o.elapsed || (S.length ? S[S.length - 1].t - S[0].t : 0));
    if (!(dur > 0)) throw new Error("couldn't find how long the activity was");
    return {
      t: Math.round((o.start + off) * 1000), dur, dist: o.dist ? Math.round(o.dist) : null, kcal: o.kcal ? Math.round(o.kcal) : null,
      avgHr: o.avgHr || (hrTime ? Math.round(hrSum / hrTime) : null), maxHr: o.maxHr || maxHr || null,
      sport: o.sport, hr, trace, src: o.src, ...(splits ? { splits, splitLast } : {}), ...(o.extra || {}),
    };
  }
  return { parse, fromHealth };
})();
if (typeof module !== "undefined") module.exports = Garmin;
