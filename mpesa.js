"use strict";
// M-Pesa statement parsing and matching (pure functions, unit-tested in test/mpesa.test.js)
(function (root) {
  function parseCsv(text) {
    const rows = []; let row = [], cur = "", q = false;
    text = text.replace(/^﻿/, "");
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(cur); cur = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); if (row.some(x => x.trim() !== "")) rows.push(row); row = []; cur = ""; }
      else cur += c;
    }
    row.push(cur); if (row.some(x => x.trim() !== "")) rows.push(row);
    return rows;
  }
  const num = v => { const n = parseFloat(String(v ?? "").replace(/[,\sKESksh]/gi, "").replace(/^\((.*)\)$/, "-$1")); return isFinite(n) ? n : 0; };
  function parseTime(v) {
    v = String(v || "").trim(); let m;
    if ((m = v.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/))) return `${m[1]}-${m[2]}-${m[3]}T${m[4].padStart(2, "0")}:${m[5]}:${m[6] || "00"}+03:00`;
    if ((m = v.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/))) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T${m[4].padStart(2, "0")}:${m[5]}:${m[6] || "00"}+03:00`;
    if ((m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return `${m[1]}-${m[2]}-${m[3]}T12:00:00+03:00`;
    return null;
  }
  function parseMpesa(text) {
    const rows = parseCsv(text);
    const hi = rows.findIndex(r => r.some(c => /receipt/i.test(c)) && r.some(c => /paid\s*-?\s*in/i.test(c)));
    if (hi < 0) throw new Error("This does not look like an M-Pesa statement. It needs Receipt No, Completion Time, Details, Paid In and Withdrawn columns.");
    const h = rows[hi].map(c => c.trim().toLowerCase());
    const col = (...names) => h.findIndex(x => names.some(n => x.includes(n)));
    const ix = { rec: col("receipt"), time: col("completion", "time"), det: col("details"), st: col("status"), pin: col("paid in", "paid-in", "paidin"), out: col("withdrawn", "withdrawal"), bal: col("balance") };
    if (ix.rec < 0 || ix.pin < 0 || ix.out < 0 || ix.time < 0) throw new Error("Missing a Receipt No, Completion Time, Paid In or Withdrawn column.");
    const out = [];
    for (const r of rows.slice(hi + 1)) {
      const rec = (r[ix.rec] || "").trim().toUpperCase();
      if (!/^[A-Z0-9]{8,12}$/.test(rec)) continue;
      const status = ix.st >= 0 ? (r[ix.st] || "").trim() : "Completed";
      if (status && !/complete/i.test(status)) continue;
      out.push({ receipt_no: rec, txn_time: parseTime(r[ix.time]), details: ix.det >= 0 ? (r[ix.det] || "").trim() : "", paid_in: Math.abs(num(r[ix.pin])), withdrawn: Math.abs(num(r[ix.out])),
        balance: ix.bal >= 0 ? num(r[ix.bal]) : null, status: status || "Completed" });
    }
    return out;
  }
  const dayOf = iso => (iso || "").slice(0, 10);
  const dd = (a, b) => Math.abs((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 864e5);
  const norm = s => String(s || "").trim().toUpperCase().replace(/\s+/g, "");
  // txns: [{receipt_no, txn_time, paid_in, withdrawn, matched_table}], recs: [{table,id,date,amount,ref,dir}]
  function matchAll(txns, recs) {
    const open = txns.filter(t => !t.matched_table);
    const usedRec = new Set(txns.filter(t => t.matched_table && t.matched_id != null).map(t => t.matched_table + ":" + t.matched_id));
    const free = recs.filter(r => !usedRec.has(r.table + ":" + r.id));
    const exact = [], suggested = [], ambiguous = [], unrecorded = []; const taken = new Set();
    for (const t of open) {
      const dir = t.paid_in > 0 ? "in" : "out", amt = t.paid_in > 0 ? t.paid_in : t.withdrawn;
      const hit = free.find(r => !taken.has(r.table + ":" + r.id) && r.dir === dir && r.ref && norm(r.ref) === t.receipt_no);
      if (hit) { taken.add(hit.table + ":" + hit.id); exact.push({ txn: t, rec: hit, amountDiffers: Math.abs(hit.amount - amt) > 0.5 }); t._done = true; }
    }
    for (const t of open) {
      if (t._done) continue;
      const dir = t.paid_in > 0 ? "in" : "out", amt = t.paid_in > 0 ? t.paid_in : t.withdrawn, d = dayOf(t.txn_time);
      const c = free.filter(r => !taken.has(r.table + ":" + r.id) && r.dir === dir && !r.ref && Math.abs(r.amount - amt) <= 0.5 && dd(r.date, d) <= 1);
      if (c.length === 1) { taken.add(c[0].table + ":" + c[0].id); suggested.push({ txn: t, rec: c[0] }); }
      else if (c.length > 1) ambiguous.push({ txn: t, options: c });
      else unrecorded.push(t);
    }
    open.forEach(t => delete t._done);
    const dates = txns.map(t => dayOf(t.txn_time)).filter(Boolean).sort();
    const lo = dates[0], hi = dates[dates.length - 1];
    const amb = new Set(ambiguous.flatMap(x => x.options.map(r => r.table + ":" + r.id)));
    const missing = free.filter(r => !taken.has(r.table + ":" + r.id) && !amb.has(r.table + ":" + r.id) && lo && r.date >= lo && r.date <= hi);
    const stmtIn = txns.reduce((s, t) => s + (t.paid_in || 0), 0), stmtOut = txns.reduce((s, t) => s + (t.withdrawn || 0), 0);
    return { exact, suggested, ambiguous, unrecorded, missing, stmtIn, stmtOut, lo, hi };
  }
  const api = { parseCsv, parseMpesa, parseTime, matchAll };
  if (typeof module !== "undefined") module.exports = api; else root.Mpesa = api;
})(typeof window !== "undefined" ? window : globalThis);
