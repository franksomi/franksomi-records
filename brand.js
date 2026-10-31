"use strict";
// Franksomi brand graphics: icons, empty-state art and small charts, all drawn as inline SVG (no images to download).
(function (root) {
  const P = {
    dashboard: "M3 3h8v8H3z M13 3h8v5h-8z M13 12h8v9h-8z M3 15h8v6H3z",
    repairs: "M14.7 6.3a4 4 0 0 0-5.4 5.2L3.5 17.3a1.8 1.8 0 0 0 2.5 2.5l5.8-5.8a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.2-.6-.6-2.2z",
    sales: "M3 12V4h8l10 10-8 8z M7.5 8.5h.01",
    services: "M7 9V3h10v6 M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2 M7 14h10v7H7z",
    jobs: "M13 2 4 14h7l-1 8 9-12h-7z",
    docs: "M6 2h8l5 5v15H6z M14 2v5h5 M9 13h6 M9 17h6",
    income: "M12 3v12 M7 10l5 5 5-5 M4 20h16",
    expenses: "M12 16V4 M7 9l5-5 5 5 M4 20h16",
    inventory: "M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10",
    mpay: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M10 18h4 M9.5 10.5l2 2 3.5-4.5",
    sms: "M4 4h16v12H8l-4 4z M8 9h8 M8 12h5",
    eod: "M4 5h16v16H4z M4 10h16 M8 3v4 M16 3v4 M9 15l2 2 4-4",
    monthly: "M4 20V10 M10 20V4 M16 20v-8 M22 20H2",
    summary: "M12 3v9h9 M20.5 15A9 9 0 1 1 9 3.5",
    mpesa: "M9 11l3 3 8-8 M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9",
    suppliers: "M3 6h11v10H3z M14 10h4l3 3v3h-7z M7 19.5a1.5 1.5 0 1 0 .01 0 M17 19.5a1.5 1.5 0 1 0 .01 0",
    lists: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
    audit: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M9 12l2 2 4-4",
    users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.9 M16 3.1a4 4 0 0 1 0 7.8",
    profit: "M3 17l6-6 4 4 8-8 M15 7h6v6",
    owed: "M12 8v4l3 2 M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
    deposit: "M3 8h18v12H3z M3 8l3-4h12l3 4 M12 12v4 M10 14h4"
  };
  const icon = (n, size = 20) => `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${(P[n] || P.dashboard).split(" M").map((d, i) => `<path d="${i ? "M" : ""}${d}"/>`).join("")}</svg>`;

  // a small version of the logo's idea: a core with circuit traces ending in ring nodes
  const emptyArt = (w = 150) => `<svg width="${w}" height="${Math.round(w * 0.7)}" viewBox="0 0 150 105" fill="none" role="img" aria-label="Nothing here yet">
    <g stroke="#ff914d" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M57 40H34L22 28"/><circle cx="17" cy="23" r="5"/><path d="M57 66H30"/><circle cx="24" cy="66" r="5"/><path d="M93 40h24l10-10"/><circle cx="132" cy="25" r="5"/><path d="M93 66h26l9 12"/><circle cx="132" cy="84" r="5"/><path d="M75 88v12"/><circle cx="75" cy="102" r="0"/></g>
    <circle cx="75" cy="53" r="26" fill="#33adff"/><circle cx="75" cy="53" r="33" stroke="#ff914d" stroke-width="3" stroke-dasharray="52 20" fill="none"/>
    <path d="M65 53h20M75 43v20" stroke="#0f172a" stroke-width="5" stroke-linecap="round"/></svg>`;

  const STAGES = [["Received", "#5aa9e6"], ["Diagnosing", "#3d8fd1"], ["Waiting for approval", "#ff914d"], ["Waiting for parts", "#f5b97a"], ["Repairing", "#0d6eae"], ["Testing", "#1a8f7a"], ["Ready for collection", "#12b76a"]];
  const pipeline = counts => {
    const tot = STAGES.reduce((s, [n]) => s + (counts[n] || 0), 0);
    if (!tot) return `<p style="color:var(--mut);margin:6px 0">No repairs in the shop right now.</p>`;
    return `<div class="pipe" role="img" aria-label="Repairs in the shop by stage">${STAGES.filter(([n]) => counts[n]).map(([n, c]) => `<span style="flex:${counts[n]};background:${c}" title="${n}: ${counts[n]}">${counts[n]}</span>`).join("")}</div>
      <div class="legend">${STAGES.filter(([n]) => counts[n]).map(([n, c]) => `<span><i style="background:${c}"></i>${n} <b>${counts[n]}</b></span>`).join("")}</div>`;
  };

  const nice = v => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))), f = v / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; };
  const short = v => v >= 1e6 ? (v / 1e6).toFixed(v % 1e6 ? 1 : 0) + "M" : v >= 1e3 ? (v / 1e3).toFixed(v % 1e3 ? 1 : 0) + "k" : String(v);
  const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const bars = months => {
    const W = 640, H = 230, L = 44, B = 190, T = 14, top = nice(Math.max(1, ...months.map(m => Math.max(Number(m.total_income) || 0, Number(m.expenses) || 0))));
    const y = v => B - (v / top) * (B - T), step = (W - L - 8) / 12, bw = Math.min(16, step / 2 - 3);
    const grid = [0, 1, 2, 3, 4].map(i => { const v = top * i / 4; return `<line x1="${L}" x2="${W - 4}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="12" fill="var(--mut)">${short(v)}</text>`; }).join("");
    const cols = months.map((m, i) => { const cx = L + step * i + step / 2, inc = Number(m.total_income) || 0, ex = Number(m.expenses) || 0;
      return `<g><title>${M[i]}: income KES ${Math.round(inc).toLocaleString("en-KE")}, expenses KES ${Math.round(ex).toLocaleString("en-KE")}</title><rect x="${cx - bw - 1}" y="${y(inc)}" width="${bw}" height="${Math.max(0, B - y(inc))}" rx="3" fill="#0d6eae"/><rect x="${cx + 1}" y="${y(ex)}" width="${bw}" height="${Math.max(0, B - y(ex))}" rx="3" fill="#ff914d"/><text x="${cx}" y="${B + 16}" text-anchor="middle" font-size="12" fill="var(--mut)">${M[i]}</text></g>`; }).join("");
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Income and expenses by month">${grid}${cols}</svg>
      <div class="legend"><span><i style="background:#0d6eae"></i>Income</span><span><i style="background:#ff914d"></i>Expenses</span></div>`;
  };
  const donut = (parts, centre) => {
    const tot = parts.reduce((s, p) => s + p.v, 0), R = 40, C = 2 * Math.PI * R; let off = 0;
    if (!tot) return `<p style="color:var(--mut);margin:6px 0">No money recorded yet.</p>`;
    return `<div class="donut"><svg viewBox="0 0 120 120" width="150" height="150" role="img" aria-label="Money received by payment method"><circle cx="60" cy="60" r="${R}" fill="none" stroke="var(--line)" stroke-width="16"/>${parts.map(p => { const len = p.v / tot * C, el = `<circle cx="60" cy="60" r="${R}" fill="none" stroke="${p.c}" stroke-width="16" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 60 60)"><title>${p.n}: ${Math.round(p.v).toLocaleString("en-KE")}</title></circle>`; off += len; return el; }).join("")}
      <text x="60" y="58" text-anchor="middle" font-size="11" fill="var(--mut)">${centre || "Total"}</text><text x="60" y="74" text-anchor="middle" font-size="14" font-weight="700" fill="var(--txt)">${short(Math.round(tot))}</text></svg>
      <div class="legend col">${parts.map(p => `<span><i style="background:${p.c}"></i>${p.n} <b>KES ${Math.round(p.v).toLocaleString("en-KE")}</b></span>`).join("")}</div></div>`;
  };
  // horizontal tracker for the customer page: dots joined by a line, current stage glows
  const track = (steps) => {
    const n = steps.length, W = 600, pad = 28, gap = (W - 2 * pad) / (n - 1), cur = Math.max(0, steps.findIndex(s => s.state === "cur"));
    const done = steps.every(s => s.state === "done") ? n - 1 : cur;
    return `<svg viewBox="0 0 ${W} 74" width="100%" role="img" aria-label="Repair progress: step ${done + 1} of ${n}"><line x1="${pad}" x2="${W - pad}" y1="26" y2="26" stroke="#dfe4ea" stroke-width="5" stroke-linecap="round"/><line x1="${pad}" x2="${pad + gap * done}" y1="26" y2="26" stroke="#0d6eae" stroke-width="5" stroke-linecap="round"/>
      ${steps.map((s, i) => { const x = pad + gap * i, c = s.state === "done" ? "#0d6eae" : s.state === "cur" ? "#ff914d" : "#fff", st = s.state === "todo" ? "#c3ccd8" : c;
        return `<g>${s.state === "cur" ? `<circle cx="${x}" cy="26" r="17" fill="#ff914d" opacity=".22"/>` : ""}<circle cx="${x}" cy="26" r="${s.state === "cur" ? 11 : 9}" fill="${c}" stroke="${st}" stroke-width="3"/>${s.state === "done" ? `<path d="M${x - 4} 26l3 3 5-6" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` : ""}<text x="${x}" y="64" text-anchor="middle" font-size="10.5" fill="${s.state === "todo" ? "#8a96a8" : "#1b2430"}" font-weight="${s.state === "cur" ? 700 : 400}">${String(s.name).replace("Ready for collection", "Ready").replace("Waiting for approval", "Approval").replace("Waiting for parts", "Parts").replace("&", "&amp;")}</text></g>`; }).join("")}</svg>`;
  };
  root.BRAND = { icon, emptyArt, pipeline, bars, donut, track, STAGES, TAGLINE: "For Quality Solutions in Tech" };
})(typeof window !== "undefined" ? window : globalThis);
