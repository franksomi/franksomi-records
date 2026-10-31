"use strict";
// "Download PDF" for any printable page. Draws the page to an image (A4 pages, never cutting a table row in half) and packs it into a PDF.
// If a browser cannot do this (some older iPhones), it falls back to the normal Print dialog, where "Save as PDF" is a choice.
(function (root) {
  const W = 718;                       // layout width in CSS px = 190 mm of an A4 page (10 mm margins)
  const PAGE_H = Math.floor(W * 277 / 190);
  const SCALE = 2.4;                   // ~170 dpi: sharp when printed
  let cssCache = null, logoCache = null;

  async function css() {
    if (cssCache !== null) return cssCache;
    try { cssCache = await (await fetch("style.css")).text(); } catch (_) { cssCache = ""; }
    // always draw documents on white, whatever the viewer's dark mode says
    cssCache = cssCache.replace(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{[^{}]*\{[^{}]*\}\s*\}/g, "").replace(/@media print\s*\{[\s\S]*$/, "");
    cssCache += "\n" + [...document.querySelectorAll("style")].map(x => x.textContent).join("\n");
    return cssCache;
  }
  async function logoData() {
    if (logoCache !== null) return logoCache;
    try { const b = await (await fetch("logo.png")).blob(); logoCache = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(b); }); }
    catch (_) { logoCache = ""; }
    return logoCache;
  }
  const loadImg = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("image")); i.src = src; });

  async function fromElement(el, filename) {
    if (!root.PDFLib) throw new Error("PDF library not loaded");
    const logo = await logoData(), style = await css();
    const clone = el.cloneNode(true);
    clone.querySelectorAll(".noprint, button").forEach(n => n.remove());
    if (logo) clone.querySelectorAll("img").forEach(i => { if (/logo\.png/.test(i.getAttribute("src") || "") || i.dataset.logo) i.setAttribute("src", logo); });
    if (!clone.classList.contains("doc")) { const w = document.createElement("div"); w.className = "doc"; w.style.cssText = `padding:0;max-width:none;margin:0;width:${W}px`; w.appendChild(clone); clone.__wrap = w; }
    clone.classList.add("pdf-root"); clone.style.cssText += `;width:${W}px;max-width:none;margin:0;padding:0;background:#fff;color:#000;box-sizing:border-box`;
    // measure where pages may break
    const holder = document.createElement("div");
    holder.style.cssText = `position:fixed;left:-20000px;top:0;width:${W}px;background:#fff`;
    holder.innerHTML = `<style>${style}</style>`; holder.appendChild(clone.__wrap || clone); document.body.appendChild(holder);
    await Promise.all([...clone.querySelectorAll("img")].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
    const top0 = clone.getBoundingClientRect().top, H = Math.ceil(clone.getBoundingClientRect().height);
    const cuts = [...clone.querySelectorAll("tr, .box, p, table, ul, li, h1")].map(n => Math.round(n.getBoundingClientRect().bottom - top0)).filter(y => y > 40).sort((a, b) => a - b);
    const heads = new Set([...clone.querySelectorAll("h2, h3")].map(n => Math.round(n.getBoundingClientRect().bottom - top0)));
    const xml = new XMLSerializer().serializeToString(clone.__wrap || clone);
    holder.remove();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject x="0" y="0" width="${W}" height="${H}"><div xmlns="http://www.w3.org/1999/xhtml" style="width:${W}px;background:#fff"><style>${style.replace(/</g, "&lt;")}</style>${xml}</div></foreignObject></svg>`;
    const img = await loadImg("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg));
    const full = document.createElement("canvas"); full.width = W * SCALE; full.height = Math.ceil(H * SCALE);
    const g = full.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, full.width, full.height); g.scale(SCALE, SCALE); g.drawImage(img, 0, 0, W, H);
    // pick page breaks
    const pages = []; let y = 0;
    while (y < H - 1) {
      let end = Math.min(y + PAGE_H, H);
      if (end < H) {
        const ok = cuts.filter(c => c > y + PAGE_H * 0.35 && c <= y + PAGE_H && ![...heads].some(h => c - h >= 0 && c - h <= 30)); if (ok.length) end = ok[ok.length - 1];
      }
      pages.push([y, end]); y = end;
    }
    const { PDFDocument } = root.PDFLib, pdf = await PDFDocument.create();
    pdf.setTitle(filename.replace(/\.pdf$/i, "")); pdf.setProducer("Franksomi Records"); pdf.setCreator("Franksomi Solution Ltd");
    const mm = 72 / 25.4, pw = 210 * mm, ph = 297 * mm, m = 10 * mm;
    for (const [a, b] of pages) {
      const c = document.createElement("canvas"); c.width = full.width; c.height = Math.max(1, Math.round((b - a) * SCALE));
      const cg = c.getContext("2d"); cg.fillStyle = "#fff"; cg.fillRect(0, 0, c.width, c.height); cg.drawImage(full, 0, Math.round(a * SCALE), full.width, c.height, 0, 0, c.width, c.height);
      const jpg = await new Promise((ok, no) => { try { c.toBlob(bl => bl ? ok(bl) : no(new Error("canvas")), "image/jpeg", 0.92); } catch (e) { no(e); } });
      const emb = await pdf.embedJpg(new Uint8Array(await jpg.arrayBuffer()));
      const page = pdf.addPage([pw, ph]), wpt = pw - 2 * m, hpt = (b - a) * (wpt / W);
      page.drawImage(emb, { x: m, y: ph - m - hpt, width: wpt, height: hpt });
    }
    const bytes = await pdf.save();
    return { blob: new Blob([bytes], { type: "application/pdf" }), pages: pages.length };
  }

  async function download(el, filename) {
    const { blob } = await fromElement(el, filename);
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  }
  root.PDF = { fromElement, download, logoData };
})(typeof window !== "undefined" ? window : globalThis);
