"use strict";
// Shared code for the public website and online shop: header, footer, cart, product cards, database connection.
(function (root) {
  const W = { name: "Franksomi Solution Ltd", phone: "0711 952 924", tel: "+254711952924", wa: "254711952924", email: "franksomi@gmail.com", tagline: "For Quality Solutions in Tech" };
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const kes = v => "KES " + Number(v || 0).toLocaleString("en-KE", { maximumFractionDigits: 0 });
  const waLink = msg => "https://wa.me/" + W.wa + (msg ? "?text=" + encodeURIComponent(msg) : "");
  const $ = (s, r = document) => r.querySelector(s);
  const safe = (fn, d) => { try { return fn(); } catch (_) { return d; } };

  // ---- database (public key only: visitors can call a few safe functions and nothing else) ----
  const cfg = root.APP_CONFIG || {};
  const configured = !!root.__MOCK_DB__ || (cfg.SUPABASE_URL && !/YOUR-/.test(cfg.SUPABASE_URL) && root.supabase);
  const db = root.__MOCK_DB__ || (configured ? root.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { persistSession: false } }) : null);

  // ---- icons (stroke icons, 24x24) ----
  const IC = {
    phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>', plug: '<path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0zM12 17v5"/>',
    audio: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="7" rx="1"/><rect x="17" y="14" width="4" height="7" rx="1"/>',
    cctv: '<path d="M3 7l13-4 2.2 6.6L5.2 13.6z"/><path d="M18 9l3 .8M10 14l-1.5 6h6"/>', laptop: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2 20h20"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>', chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
    wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0"/><circle cx="12" cy="20" r="1"/>', printer: '<path d="M6 9V2h12v7M6 18H4v-7h16v7h-2"/><rect x="6" y="14" width="12" height="8"/>',
    tool: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>', truck: '<path d="M2 6h12v10H2zM14 9h4l4 4v3h-8z"/><circle cx="6.5" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/>',
    box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/>', check: '<path d="M5 12l5 5 9-10"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'
  };
  const svgIcon = (k, size = 26, extra = "") => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${IC[k] || IC.chip}</svg>`;
  const iconFor = t => { t = String(t || "").toLowerCase();
    const pick = s => /head|ear|speaker|audio|sound|buds/.test(s) ? "audio" : /charg|cable|power|plug|bank|adapter|battery/.test(s) ? "plug" : /cctv|camera|dvr|nvr/.test(s) ? "cctv"
      : /laptop|computer|keyboard|mouse|desktop/.test(s) ? "laptop" : /electric|bulb|socket|switch|wire|breaker/.test(s) ? "bolt" : /router|wifi|network|modem/.test(s) ? "wifi" : /print|toner|ink|paper|stationery/.test(s) ? "printer"
      : /smartphone|phone|itel|tecno|infinix|samsung|redmi|oppo/.test(s) ? "phone" : null;
    const [title, cat] = t.split("|"); return pick(title) || pick(cat || "") || "chip"; };
  // a branded picture for products that have no photo yet
  const art = p => `<svg viewBox="0 0 200 200" role="img" aria-label="${esc(p.title)}" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="g${p.id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0B4DA2"/><stop offset="1" stop-color="#34B2F9"/></linearGradient></defs>
    <rect width="200" height="200" fill="url(#g${p.id})"/><path d="M0 40h60l20 20h50M200 150h-70l-20-20H60M30 200v-40l20-20" stroke="#fff" stroke-opacity=".28" stroke-width="2" fill="none"/>
    <g fill="#0E152B" stroke="#FF914D" stroke-width="3"><circle cx="150" cy="60" r="6"/><circle cx="50" cy="150" r="6"/></g>
    <g transform="translate(64 64) scale(3.1)" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${IC[iconFor(p.title + "|" + p.category)]}</g></svg>`;
  const picture = p => p.image ? `<img src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy" data-id="${esc(p.id)}" data-c="${esc(p.category || "")}" onerror="this.onerror=null;var d=document.createElement('div');d.innerHTML=WEB.art({id:this.dataset.id,title:this.alt,category:this.dataset.c});this.replaceWith(d.firstChild)">` : art(p);

  // ---- products ----
  let _prods = null;
  async function products() {
    if (_prods) return _prods;
    if (!db) return (_prods = { list: [], offline: true });
    const r = await db.rpc("shop_products");
    if (r.error) return (_prods = { list: [], error: true });
    const list = (r.data || []).map(p => ({ ...p, price: Number(p.price), available: Number(p.available) }));
    safe(() => localStorage.setItem("fk_pc", JSON.stringify(Object.fromEntries(list.map(p => [p.id, p])))));
    return (_prods = { list });
  }
  const cachedProduct = id => safe(() => (JSON.parse(localStorage.getItem("fk_pc") || "{}"))[id]);
  const card = p => `<article class="prod" data-id="${p.id}" tabindex="0" aria-label="${esc(p.title)}"><div class="img">${picture(p)}${p.featured ? '<span class="badge">Popular</span>' : p.available <= 3 ? `<span class="badge low">Only ${p.available} left</span>` : ""}</div>
    <div class="body"><span class="cat-l">${esc(p.category || "")}</span><h3>${esc(p.title)}</h3><div class="buy"><span class="price">${kes(p.price)}</span><button class="btn sm" data-add="${p.id}" type="button">Add</button></div></div></article>`;

  // ---- cart (kept in this browser only) ----
  const cart = {
    get() { return safe(() => JSON.parse(localStorage.getItem("fk_cart") || "{}"), {}); },
    set(c) { safe(() => localStorage.setItem("fk_cart", JSON.stringify(c))); root.dispatchEvent(new Event("cart")); },
    add(id, n = 1, max = 20) { const c = this.get(); c[id] = Math.min(max, Math.max(1, (Number(c[id]) || 0) + n)); this.set(c); },
    setQty(id, n, max = 20) { const c = this.get(); if (n < 1) delete c[id]; else c[id] = Math.min(max, n); this.set(c); },
    remove(id) { const c = this.get(); delete c[id]; this.set(c); }, clear() { this.set({}); },
    count() { return Object.values(this.get()).reduce((s, n) => s + Number(n || 0), 0); }
  };
  async function cartLines() {
    const c = cart.get(), ids = Object.keys(c); if (!ids.length) return [];
    const all = await products(), by = Object.fromEntries(all.list.map(p => [p.id, p]));
    return ids.map(id => { const p = by[id]; return p ? { ...p, qty: Math.min(Number(c[id]), p.available) } : { id, gone: true, qty: Number(c[id]), title: (cachedProduct(id) || {}).title || "Item no longer available", price: 0, available: 0 }; });
  }

  // ---- header, footer, cart drawer ----
  const NAV = [["index.html", "Home"], ["services.html", "Services"], ["shop.html", "Shop"], ["track.html", "Track my order"], ["index.html#contact", "Contact"]];
  function chrome(active) {
    const hd = $("#siteHeader"); if (hd) hd.outerHTML = `<header class="top"><div class="wrap"><a class="brand" href="index.html"><img src="media/emblem.png" alt="" width="42" height="42"><span>Franksomi Solution Ltd<small>${W.tagline}</small></span></a>
      <a class="cartmini" href="#" data-cart aria-label="Open cart">Cart <b data-count>0</b></a><button class="burger" aria-label="Menu" aria-expanded="false">☰</button>
      <nav class="nav" aria-label="Main">${NAV.map(([h, l]) => `<a href="${h}" class="${h === active ? "on" : ""}">${l}</a>`).join("")}<a href="#" class="cartbtn" data-cart>Cart <b data-count>0</b></a></nav></div></header>`;
    const ft = $("#siteFooter"); if (ft) ft.outerHTML = `<footer class="foot"><div class="wrap"><div class="grid"><div><a class="brand" href="index.html"><img src="media/emblem.png" alt="" width="46" height="46"><span>Franksomi Solution Ltd<small>${W.tagline}</small></span></a>
      <p style="margin-top:14px">Phones, laptops, CCTV, electrical, Landlord WiFi, printing and cyber. Fixed right. Tracked live.</p></div>
      <div><h4>Visit the website</h4><a href="services.html">Services</a><a href="shop.html">Online shop</a><a href="track.html">Track an order or repair</a><a href="index.html#contact">Request a quote</a></div>
      <div><h4>Talk to us</h4><a href="tel:${W.tel}">Call ${W.phone}</a><a href="${waLink("Hello Franksomi, ")}" target="_blank" rel="noopener">WhatsApp ${W.phone}</a><a href="mailto:${W.email}">${W.email}</a><span>Kenya</span></div>
      <div><h4>Pay safely</h4><span>M-Pesa prompt to your phone, or pay on delivery / pickup. A receipt every time.</span></div></div>
      <div class="copy"><span>© ${new Date().getFullYear()} Franksomi Solution Ltd. All rights reserved.</span><a href="app.html" style="display:inline">Staff sign-in</a></div></div></footer>
      <a class="wa" href="${waLink("Hello Franksomi, ")}" target="_blank" rel="noopener" aria-label="Chat on WhatsApp">${svgIcon("phone", 20)} <span>WhatsApp</span></a>
      <div class="drawer" id="drawer" role="dialog" aria-modal="true" aria-label="Your cart"><div class="bg" data-close></div><div class="panel"><header><h3>Your cart</h3><button class="btn sm line" data-close style="color:var(--txt)" type="button">Close</button></header><div class="lines" id="cartLines"></div><footer id="cartFoot"></footer></div></div>`;
    const b = $(".burger"); if (b) b.onclick = () => { const n = $(".nav"); const o = n.classList.toggle("open"); b.setAttribute("aria-expanded", o); };
    document.addEventListener("click", e => {
      const c = e.target.closest("[data-cart]"); if (c) { e.preventDefault(); openCart(); }
      if (e.target.closest("[data-close]")) $("#drawer").classList.remove("open");
    });
    document.addEventListener("keydown", e => { if (e.key === "Escape") $("#drawer").classList.remove("open"); });
    const upd = () => document.querySelectorAll("[data-count]").forEach(x => x.textContent = cart.count()); upd(); root.addEventListener("cart", () => { upd(); if ($("#drawer").classList.contains("open")) drawCart(); });
  }
  async function drawCart() {
    const L = await cartLines(), el = $("#cartLines"), ft = $("#cartFoot"); if (!el) return;
    if (!L.length) { el.innerHTML = `<div class="empty"><img src="media/emblem.png" alt="">Your cart is empty.<br><a href="shop.html">Browse the shop</a></div>`; ft.innerHTML = ""; return; }
    el.innerHTML = L.map(l => `<div class="cl"><div class="t">${l.gone ? "" : picture(l)}</div><div><b>${esc(l.title)}</b><br>${l.gone ? '<small style="color:var(--bad)">No longer available</small>' : `<small>${kes(l.price)} each</small>`}
      <div style="margin-top:6px">${l.gone ? "" : `<span class="qty"><button data-q="${l.id}" data-d="-1" aria-label="Fewer">−</button><span>${l.qty}</span><button data-q="${l.id}" data-d="1" aria-label="More" ${l.qty >= Math.min(20, l.available) ? "disabled" : ""}>+</button></span>`} <button class="x2" data-rm="${l.id}">Remove</button></div></div><b>${kes(l.price * l.qty)}</b></div>`).join("");
    const sub = L.filter(l => !l.gone).reduce((s, l) => s + l.price * l.qty, 0);
    ft.innerHTML = `<div class="sum"><span>Items</span><span>${kes(sub)}</span></div><small style="color:var(--mut)">Delivery fee is added at checkout.</small><a class="btn" href="checkout.html" ${L.some(l => l.gone) || !sub ? 'aria-disabled="true" style="opacity:.5;pointer-events:none"' : ""}>Checkout</a>`;
    el.onclick = e => { const q = e.target.closest("[data-q]"), r = e.target.closest("[data-rm]"); if (q) { const l = L.find(x => String(x.id) === q.dataset.q); cart.setQty(l.id, l.qty + Number(q.dataset.d), Math.min(20, l.available)); } if (r) cart.remove(r.dataset.rm); };
  }
  async function openCart() { $("#drawer").classList.add("open"); await drawCart(); }

  // product detail dialog
  function showProduct(p) {
    let dlg = $("#pdlg"); if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "pdlg"; document.body.appendChild(dlg); }
    const max = Math.min(20, p.available);
    dlg.innerHTML = `<div class="pd" style="position:relative"><button class="x" aria-label="Close" data-x>×</button><div class="img">${picture(p)}</div><div class="info"><span class="cat-l" style="color:var(--mut)">${esc(p.category || "")}</span><h2 style="font-size:1.5rem">${esc(p.title)}</h2>
      <div class="price" style="font-size:1.6rem">${kes(p.price)}</div><p style="color:var(--mut)">${esc(p.descr || "Genuine, tested before you leave. Pay by M-Pesa or on delivery.")}</p>
      <p style="margin:0">${p.available <= 5 ? `<span class="pill">Only ${p.available} left</span>` : '<span class="pill ok">In stock</span>'}</p>
      <div style="display:flex;gap:12px;align-items:center;margin-top:auto"><span class="qty"><button data-d="-1" aria-label="Fewer">−</button><span id="pq">1</span><button data-d="1" aria-label="More">+</button></span><button class="btn" id="padd" type="button">Add to cart</button></div>
      <a href="${waLink("Hello Franksomi, I'm interested in: " + p.title)}" target="_blank" rel="noopener" style="font-size:.9rem">Ask about this on WhatsApp</a></div></div>`;
    let n = 1; dlg.onclick = e => { if (e.target === dlg || e.target.closest("[data-x]")) dlg.close(); const d = e.target.closest("[data-d]"); if (d) { n = Math.min(max, Math.max(1, n + Number(d.dataset.d))); $("#pq").textContent = n; } };
    $("#padd").onclick = () => { cart.add(p.id, n, max); dlg.close(); openCart(); };
    dlg.showModal();
  }
  function wireProducts(container, byId) {
    container.addEventListener("click", e => {
      const a = e.target.closest("[data-add]"); if (a) { e.stopPropagation(); const p = byId(a.dataset.add); cart.add(p.id, 1, Math.min(20, p.available)); openCart(); return; }
      const c = e.target.closest(".prod"); if (c) showProduct(byId(c.dataset.id));
    });
    container.addEventListener("keydown", e => { if (e.key === "Enter") { const c = e.target.closest(".prod"); if (c && e.target === c) showProduct(byId(c.dataset.id)); } });
  }

  // M-Pesa prompt for an order, then wait for the result. Used by checkout and the tracking page.
  async function payOrder(orderNo, phone, amount, say) {
    say("Sending a payment prompt to your phone…");
    const res = await db.functions.invoke("stk-push", { body: { job: orderNo, phone, amount } });
    if (res.error || !res.data || !res.data.ok) {
      let msg = "We could not start the payment. You can pay on delivery or at the shop instead.";
      try { const j = res.error && res.error.context ? await res.error.context.json() : res.data; if (j && j.message) msg = j.message; } catch (_) {}
      return { ok: false, message: msg };
    }
    say("Check your phone and enter your M-Pesa PIN…");
    const id = res.data.public_id;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, root.__POLL_MS__ || 3000));
      if (i === 14) await db.functions.invoke("stk-push", { body: { action: "check", public_id: id } });
      const s = await db.rpc("pay_status", { p_public: id }); const st = s.data && s.data.status;
      if (st === "Success") return { ok: true, receipt: s.data.receipt };
      if (st === "Cancelled" || st === "Failed") return { ok: false, message: (s.data.message || "The payment did not go through.") + " You can try again." };
      if (st === "Review") return { ok: true, review: true };
    }
    return { ok: false, message: "We did not get a reply yet. If money left your M-Pesa, we will confirm it shortly. You can check again from the tracking page." };
  }

  const api = { W, esc, kes, waLink, $, db, configured: !!db, svgIcon, iconFor, art, picture, products, card, cart, cartLines, chrome, openCart, showProduct, wireProducts, payOrder, safe };
  root.WEB = api; if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
