"use strict";
const $ = (s, r = document) => r.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const kes = v => v === null || v === undefined || v === "" ? "" : Number(v).toLocaleString("en-KE", { maximumFractionDigits: 2 });
const SHOP = { name: "Franksomi Solution Ltd", phone: "0711 952 924", email: "franksomi@gmail.com", place: "Kenya" };
const db = window.__MOCK_DB__ || supabase.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY);
let me = null, lists = { item_type: [], brand: [], stock_type: [] }, stockItems = [], suppliers = [];

function toast(m) { const t = $("#toast"); t.textContent = m; t.style.display = "block"; setTimeout(() => t.style.display = "none", 3000); }
const must = r => { if (r.error) { toast(r.error.message); throw r.error; } return r.data; };

// ---- field/table definitions ------------------------------------------------
const PAY = ["Cash", "M-Pesa", "Bank"];
const T = {
  repairs: { title: "Repairs", view: "repairs_calc", table: "repairs", order: "id", print: "jobcard",
    cols: [["id", "No."], ["received_on", "Received"], ["customer_name", "Customer"], ["contact", "Contact"], ["item_type", "Item"], ["brand_model", "Brand / model"], ["fault", "Fault"],
      ["total_cost", "Total (KES)", "n"], ["deposit_held", "Deposit held", "n"], ["status", "Status", "tag"]],
    fields: [["received_on", "Date received", "date"], ["customer_name", "Customer name", "text", { req: 1 }], ["contact", "Contact", "text"],
      ["item_type", "Item type", "list:item_type"], ["brand_model", "Brand / model", "list:brand"], ["serial_no", "Serial no. / IMEI", "text"],
      ["fault", "Fault reported", "text", { full: 1 }], ["diagnosis", "Diagnosis", "text", { full: 1 }],
      ["part1_id", "Part used 1 (from stock)", "stock"], ["part1_qty", "Qty", "number"], ["part2_id", "Part used 2 (from stock)", "stock"], ["part2_qty", "Qty", "number"],
      ["labor_hours", "Labor hours", "number"], ["labor_cost", "Labor cost (KES)", "number"],
      ["deposit_received", "Refundable deposit received", "number"], ["deposit_applied", "Deposit applied to bill", "number"], ["deposit_refunded", "Deposit refunded", "number"],
      ["returned_on", "Date returned", "date"], ["remarks", "Remarks", "text", { full: 1 }]] },
  sales: { title: "Sales", view: "sales_v", table: "sales", order: "id",
    cols: [["sold_on", "Date"], ["customer", "Customer / receipt"], ["item_name", "Item"], ["qty", "Qty", "n"], ["unit_cost", "Unit cost", "n"], ["unit_price", "Unit price", "n"],
      ["total_sales", "Total", "n"], ["profit", "Profit", "n"], ["payment", "Payment"]],
    fields: [["sold_on", "Date", "date"], ["customer", "Customer / receipt no.", "text"], ["item_id", "Item (pick from stock — name and unit cost fill in)", "stock", { full: 1 }],
      ["category", "Category", "list:stock_type"], ["qty", "Qty", "number", { req: 1 }], ["unit_price", "Unit price (KES)", "number", { req: 1 }],
      ["payment", "Payment method", "select:" + PAY.join()], ["notes", "Notes", "text", { full: 1 }]] },
  inventory: { title: "Inventory", view: "inventory_stock", table: "inventory_items", order: "code",
    cols: [["code", "Code"], ["description", "Description"], ["stock_type", "Type"], ["qty_received", "Received", "n"], ["qty_sold", "Sold", "n"], ["qty_used", "Used", "n"], ["on_hand", "On hand", "n"],
      ["unit_cost", "Unit cost", "n"], ["selling_price", "Selling price", "n"], ["stock_value", "Stock value", "n"], ["supplier", "Supplier"], ["status", "Status", "tag"]],
    fields: [["description", "Description (keep unique)", "text", { req: 1, full: 1 }], ["stock_type", "Type", "list:stock_type", { req: 1 }], ["qty_received", "Qty received (total in)", "number"],
      ["unit_cost", "Unit cost (KES)", "number"], ["selling_price", "Selling price (KES)", "number"], ["supplier_id", "Supplier", "supplier"], ["reorder_level", "Reorder level", "number"], ["notes", "Notes", "text", { full: 1 }]] },
  jobs: { title: "Field Jobs", view: "jobs_v", table: "field_jobs", order: "id", print: "fieldcard",
    cols: [["job_no", "Job No."], ["started_on", "Started"], ["client_name", "Client"], ["site", "Site"], ["job_type", "Type"], ["contract_price", "Price", "n"], ["paid", "Paid", "n"], ["balance", "Balance", "n"], ["status", "Status", "tag"]],
    fields: [["started_on", "Date started", "date"], ["client_name", "Client name", "text", { req: 1 }], ["contact", "Contact", "text"], ["site", "Site / location", "text"],
      ["job_type", "Job type", "select:Electrical installation,CCTV installation,Electrical repair,CCTV repair,Transport / logistics,Other"],
      ["contract_price", "Contract price (KES)", "number"], ["status", "Status", "select:Not started,In progress,Completed,On hold"], ["completed_on", "Date completed", "date"],
      ["scope", "Scope of work", "text", { full: 1 }], ["remarks", "Remarks", "text", { full: 1 }]] },
  income: { title: "Income", view: "income", table: "income", order: "received_on",
    cols: [["received_on", "Date"], ["ref", "Customer ID / Job No."], ["description", "Description"], ["amount", "Amount", "n"], ["payment", "Payment"], ["income_type", "Type"]],
    fields: [["received_on", "Date", "date"], ["ref", "Customer ID / Job No.", "text"], ["description", "Service description", "text", { full: 1 }], ["amount", "Amount (KES)", "number", { req: 1 }],
      ["payment", "Payment method", "select:" + PAY.join()], ["income_type", "Income type", "select:Repair,Electrical installation,CCTV installation,Other service"], ["notes", "Notes", "text", { full: 1 }]] },
  expenses: { title: "Expenses", view: "expenses", table: "expenses", order: "spent_on",
    cols: [["spent_on", "Date"], ["description", "Description"], ["category", "Category"], ["amount", "Amount", "n"], ["payment", "Payment"], ["job_no", "Job No."]],
    fields: [["spent_on", "Date", "date"], ["description", "Description", "text", { full: 1 }], ["category", "Category", "select:Job materials,Labor / Technician,Transport / Logistics,Fuel,Rent,Utilities,Stock purchase,Airtime / Internet,Other"],
      ["amount", "Amount (KES)", "number", { req: 1 }], ["payment", "Payment method", "select:" + PAY.join()], ["job_no", "Job No. (optional)", "text"], ["notes", "Notes", "text", { full: 1 }]] },
  suppliers: { title: "Suppliers", view: "suppliers", table: "suppliers", order: "name",
    cols: [["name", "Supplier"], ["contact_person", "Contact person"], ["phone", "Phone"], ["location", "Location"], ["supplies", "What they supply"]],
    fields: [["name", "Supplier name", "text", { req: 1 }], ["contact_person", "Contact person", "text"], ["phone", "Phone", "text"], ["location", "Location", "text"], ["supplies", "What they supply", "text", { full: 1 }], ["notes", "Notes", "text", { full: 1 }]] },
};
const NAV = [["dashboard", "Dashboard"], ["repairs", "Repairs"], ["sales", "Sales"], ["jobs", "Field Jobs"], ["docs", "Quote / Invoice / Receipt"], ["income", "Income"], ["expenses", "Expenses"], ["inventory", "Inventory"], ["suppliers", "Suppliers"], ["lists", "Lists"]];

// ---- form widgets -----------------------------------------------------------
function widget([k, l, t, o = {}], v) {
  const val = v ?? "", req = o.req ? "required" : "", cls = o.full ? "full" : "";
  let inner;
  if (t === "text") inner = `<input name="${k}" value="${esc(val)}" ${req} autocomplete="off">`;
  else if (t === "number") inner = `<input name="${k}" type="number" step="any" min="0" value="${esc(val)}" ${req} inputmode="decimal">`;
  else if (t === "date") inner = `<input name="${k}" type="date" value="${esc(val)}" ${req}>`;
  else if (t.startsWith("select:")) inner = `<select name="${k}"><option value=""></option>${t.slice(7).split(",").map(x => `<option ${x === val ? "selected" : ""}>${esc(x)}</option>`).join("")}</select>`;
  else if (t.startsWith("list:")) { const id = "dl_" + k; inner = `<input name="${k}" list="${id}" value="${esc(val)}" ${req} autocomplete="off"><datalist id="${id}">${lists[t.slice(5)].map(x => `<option value="${esc(x.value)}">`).join("")}</datalist>`; }
  else if (t === "stock") inner = `<select name="${k}"><option value=""></option>${stockItems.map(i => `<option value="${i.id}" ${String(i.id) === String(val) ? "selected" : ""}>${esc(i.code)} – ${esc(i.description)} (${i.on_hand} in stock)</option>`).join("")}</select>`;
  else if (t === "supplier") inner = `<select name="${k}"><option value=""></option>${suppliers.map(s => `<option value="${s.id}" ${String(s.id) === String(val) ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>`;
  return `<label class="${cls}">${esc(l)}${inner}</label>`;
}
function readForm(form, fields) {
  const out = {};
  for (const [k, , t] of fields) {
    const raw = form.elements[k].value.trim();
    out[k] = raw === "" ? null : (t === "number" || t === "stock" || t === "supplier") ? Number(raw) : raw;
  }
  return out;
}
async function openForm(key, row) {
  const def = T[key];
  await refreshLookups();
  const dlg = $("#dlg"), f = $("#dlgForm");
  f.innerHTML = `<h2>${row ? "Edit" : "New"} – ${esc(def.title)}</h2><div class="grid">${def.fields.map(fd => widget(fd, row && row[fd[0]])).join("")}</div>
    <div class="bar" style="margin-top:14px"><button class="btn" value="save">Save</button><button class="btn ghost" value="cancel" formnovalidate>Cancel</button></div>`;
  f.onsubmit = async e => {
    if (e.submitter.value !== "save") return;
    e.preventDefault();
    const data = readForm(f, def.fields);
    if (key === "repairs") { data.part1_qty ??= 1; data.part2_qty ??= 1; }
    for (const k of ["qty_received", "unit_cost", "selling_price", "reorder_level"]) if (key === "inventory") data[k] ??= 0;
    if (key === "sales" && data.item_id == null && !row) { const nm = prompt("This sale has no stock item. Item name:"); if (!nm) return; data.item_name = nm; data.unit_cost = Number(prompt("Unit cost (KES):", "0")) || 0; }
    const q = row ? db.from(def.table).update(data).eq("id", row.id) : db.from(def.table).insert(Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null)));
    const r = await q; if (r.error) return toast(r.error.message);
    dlg.close(); toast("Saved"); route();
  };
  dlg.showModal();
}

// ---- table pages ------------------------------------------------------------
async function tablePage(key) {
  const def = T[key];
  const rows = must(await db.from(def.view).select("*").order(def.order, { ascending: false }).limit(500)) || [];
  window.__rows = rows;
  const head = def.cols.map(c => `<th>${esc(c[1])}</th>`).join("") + "<th></th>";
  const body = rows.map((r, i) => `<tr class="${r.status === "REORDER" ? "low" : ""}">${def.cols.map(([k, , t]) => {
    const v = r[k]; if (t === "tag") return `<td><span class="tag ${v === "REORDER" || v === "In shop" ? "bad" : "ok"}">${esc(v)}</span></td>`;
    return `<td class="${t === "n" ? "n" : ""}">${t === "n" ? kes(v) : esc(v)}</td>`; }).join("")}
    <td><button class="btn sm" data-edit="${i}">Edit</button> ${def.print ? `<button class="btn sm ghost" data-print="${i}">Print card</button>` : ""}
    ${me.role === "owner" ? `<button class="btn sm warn" data-del="${i}">Delete</button>` : ""}</td></tr>`).join("");
  $("#view").innerHTML = `<h2>${esc(def.title)}</h2><div class="bar"><button class="btn" id="add">+ New</button><input id="q" placeholder="Search…" style="max-width:260px"><span style="color:var(--mut)">${rows.length} rows</span></div>
    <div class="wrap"><table><thead><tr>${head}</tr></thead><tbody id="tb">${body || `<tr><td colspan="99">Nothing yet. Press “+ New”.</td></tr>`}</tbody></table></div>`;
  $("#add").onclick = () => openForm(key);
  $("#q").oninput = e => { const s = e.target.value.toLowerCase(); document.querySelectorAll("#tb tr").forEach(tr => tr.hidden = !tr.textContent.toLowerCase().includes(s)); };
  $("#tb").onclick = async e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.edit) openForm(key, rows[b.dataset.edit]);
    if (b.dataset.del && confirm("Delete this record? This cannot be undone.")) { const r = await db.from(def.table).delete().eq("id", rows[b.dataset.del].id); if (r.error) toast(r.error.message); else route(); }
    if (b.dataset.print) printCard(def.print, rows[b.dataset.print]);
  };
}

// ---- dashboard --------------------------------------------------------------
async function dashboard() {
  const yr = Number(sessionStorage.getItem("yr")) || new Date().getFullYear();
  const d = must(await db.rpc("dashboard", { yr }));
  const c = (l, v, money) => `<div class="card"><small>${l}</small><b>${money ? "KES " + kes(v) : v}</b></div>`;
  $("#view").innerHTML = `<h2>Dashboard</h2><div class="bar"><label>Year <input id="yr" type="number" value="${yr}" style="width:100px"></label></div>
    <div class="cards">${c("Repairs still in shop", d.in_shop)}${c("Jobs in progress", d.jobs_open)}${c("Items to reorder", d.reorder)}</div>
    ${d.owner ? `<div class="cards">${c("Total income (year)", d.income, 1)}${c("Total expenses (year)", d.expenses, 1)}${c("Cash profit (year)", d.profit, 1)}${c("Owed by clients", d.owed, 1)}${c("Customer deposits held", d.deposits_held, 1)}</div>`
      : `<p style="color:var(--mut)">Money totals are shown to the owner only.</p>`}
    <div class="cards">${NAV.slice(1).map(([k, l]) => `<a class="btn" href="#${k}" style="text-decoration:none;text-align:center">${esc(l)}</a>`).join("")}</div>`;
  $("#yr").onchange = e => { sessionStorage.setItem("yr", e.target.value); route(); };
}

// ---- lists ------------------------------------------------------------------
async function listsPage() {
  await refreshLookups();
  const block = (kind, title) => `<div class="card"><b style="font-size:16px">${title}</b><div style="margin:8px 0">${lists[kind].map(x => `<span class="tag" style="margin:2px;display:inline-block">${esc(x.value)}${kind === "stock_type" ? " · " + esc(x.code) : ""}
    ${me.role === "owner" ? `<a href="#" data-rm="${x.id}">×</a>` : ""}</span>`).join("")}</div>
    <form data-kind="${kind}" class="bar"><input name="value" placeholder="Add new…" required>${kind === "stock_type" ? `<input name="code" placeholder="Code letters" maxlength="3" style="width:110px" required>` : ""}<button class="btn sm">Add</button></form></div>`;
  $("#view").innerHTML = `<h2>Lists</h2><p style="color:var(--mut)">These feed the dropdowns. Add new entries any time.</p><div class="cards" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
    ${block("item_type", "Item types (Repairs)")}${block("brand", "Brand / model (Repairs)")}${block("stock_type", "Stock types (Inventory) and code letters")}</div>`;
  $("#view").onsubmit = async e => { e.preventDefault(); const f = e.target; const row = { kind: f.dataset.kind, value: f.value.value.trim() }; if (f.code) row.code = f.code.value.trim().toUpperCase();
    const r = await db.from("list_items").insert(row); if (r.error) toast(r.error.message); else listsPage(); };
  $("#view").onclick = async e => { const a = e.target.closest("[data-rm]"); if (!a) return; e.preventDefault(); const r = await db.from("list_items").delete().eq("id", Number(a.dataset.rm)); if (r.error) toast(r.error.message); else listsPage(); };
}

// ---- documents (quotation / invoice / receipt) --------------------------------
function docTotals(d) {
  const items = d.items || [], sub = items.reduce((s, i) => s + Number(i.qty || 0) * Number(i.price || 0), 0);
  const vat = (sub - Number(d.discount || 0)) * Number(d.vat_rate || 0) / 100, total = sub - Number(d.discount || 0) + vat;
  return { sub, vat, total, balance: total - Number(d.paid_before || 0) };
}
async function docsPage() {
  const rows = must(await db.from("documents").select("*").order("id", { ascending: false }).limit(100)) || [];
  $("#view").innerHTML = `<h2>Quotation · Invoice · Receipt</h2><div class="bar"><button class="btn" id="nd">+ New document</button></div>
    <div class="wrap"><table><thead><tr><th>No.</th><th>Type</th><th>Date</th><th>Customer</th><th>Total</th><th></th></tr></thead><tbody id="tb">
    ${rows.map((r, i) => `<tr><td>${docNo(r)}</td><td>${r.doc_type}</td><td>${esc(r.doc_date)}</td><td>${esc(r.customer)}</td><td class="n">${kes(docTotals(r).total)}</td>
    <td><button class="btn sm" data-e="${i}">Edit</button> <button class="btn sm ghost" data-p="${i}">Print</button></td></tr>`).join("") || `<tr><td colspan="6">No documents yet.</td></tr>`}</tbody></table></div>`;
  $("#nd").onclick = () => docForm();
  $("#tb").onclick = e => { const b = e.target.closest("button"); if (!b) return; if (b.dataset.e) docForm(rows[b.dataset.e]); if (b.dataset.p) printCard("document", rows[b.dataset.p]); };
}
const docNo = r => ({ Quotation: "QT", Invoice: "INV", Receipt: "RCT" }[r.doc_type]) + "-" + String(r.id).padStart(4, "0");
function docForm(row) {
  const d = row ? { ...row, items: [...row.items] } : { doc_type: "Quotation", doc_date: new Date().toISOString().slice(0, 10), items: [{ desc: "", qty: 1, price: 0 }], vat_rate: 0, discount: 0, paid_before: 0 };
  const f = $("#dlgForm"), draw = () => {
    f.innerHTML = `<h2>${row ? "Edit" : "New"} document</h2><div class="grid">
      <label>Type<select name="doc_type">${["Quotation", "Invoice", "Receipt"].map(x => `<option ${x === d.doc_type ? "selected" : ""}>${x}</option>`).join("")}</select></label>
      <label>Date<input name="doc_date" type="date" value="${esc(d.doc_date)}"></label>
      <label>Customer<input name="customer" value="${esc(d.customer)}" required></label><label>Contact<input name="contact" value="${esc(d.contact)}"></label>
      <label class="full">Address / site<input name="address" value="${esc(d.address)}"></label><label>Reference (job no., LPO…)<input name="reference" value="${esc(d.reference)}"></label>
      <label>VAT % (0 if not registered)<input name="vat_rate" type="number" min="0" step="any" value="${d.vat_rate}"></label>
      <label>Discount (KES)<input name="discount" type="number" min="0" step="any" value="${d.discount}"></label>
      <label>Already paid (KES)<input name="paid_before" type="number" min="0" step="any" value="${d.paid_before}"></label></div>
      <h3>Items</h3>${d.items.map((it, i) => `<div class="grid" style="grid-template-columns:3fr 1fr 1fr auto;margin-bottom:6px"><input data-i="${i}" data-f="desc" value="${esc(it.desc)}" placeholder="Description"><input data-i="${i}" data-f="qty" type="number" min="0" step="any" value="${it.qty}"><input data-i="${i}" data-f="price" type="number" min="0" step="any" value="${it.price}"><button type="button" class="btn sm warn" data-rm="${i}">×</button></div>`).join("")}
      <button type="button" class="btn sm ghost" id="addl">+ line</button> <b id="tot" style="margin-left:12px"></b>
      <div class="bar" style="margin-top:14px"><button class="btn" value="save">Save</button><button class="btn ghost" value="cancel" formnovalidate>Cancel</button></div>`;
    sync();
  };
  const collect = () => { for (const k of ["doc_type", "doc_date", "customer", "contact", "address", "reference"]) d[k] = f.elements[k].value || null; for (const k of ["vat_rate", "discount", "paid_before"]) d[k] = Number(f.elements[k].value) || 0;
    f.querySelectorAll("[data-f]").forEach(el => d.items[el.dataset.i][el.dataset.f] = el.dataset.f === "desc" ? el.value : Number(el.value) || 0); };
  const sync = () => { $("#tot").textContent = "Total KES " + kes(docTotals(d).total); };
  f.oninput = () => { collect(); sync(); };
  f.onclick = e => { if (e.target.id === "addl") { collect(); d.items.push({ desc: "", qty: 1, price: 0 }); draw(); } if (e.target.dataset.rm) { collect(); d.items.splice(e.target.dataset.rm, 1); if (!d.items.length) d.items.push({ desc: "", qty: 1, price: 0 }); draw(); } };
  f.onsubmit = async e => { if (e.submitter.value !== "save") return; e.preventDefault(); collect();
    const { id, created_at, ...data } = d; if (!data.doc_date) delete data.doc_date; const r = row ? await db.from("documents").update(data).eq("id", row.id) : await db.from("documents").insert(data);
    if (r.error) return toast(r.error.message); $("#dlg").close(); toast("Saved"); route(); };
  draw(); $("#dlg").showModal();
}

// ---- printable cards ----------------------------------------------------------
const head = (title, no) => `<h1><span>${SHOP.name.toUpperCase()}</span><span>${title}</span></h1><p>Repairs · Sales · Installations | ${SHOP.place} | Tel: ${SHOP.phone} | ${SHOP.email}${no ? ` | <b>${esc(no)}</b>` : ""}</p>`;
const kv = (a) => `<table>${a.map(([k, v]) => `<tr><th style="width:30%">${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>`;
function printCard(kind, r) {
  let h = "";
  if (kind === "jobcard") h = head("JOB CARD", "JC-" + String(r.id).padStart(4, "0")) + kv([["Customer", r.customer_name], ["Contact", r.contact], ["Date received", r.received_on], ["Item", [r.item_type, r.brand_model].filter(Boolean).join(" – ")], ["Serial / IMEI", r.serial_no], ["Fault reported", r.fault],
    ["Diagnosis", r.diagnosis], ["Parts (KES)", kes(r.parts_cost)], ["Labor (KES)", kes(r.labor_cost)], ["Estimated total (KES)", kes(r.total_cost)], ["Refundable deposit (KES)", kes(r.deposit_received)]]) +
    `<div class="box">Left with device: [ ] SIM [ ] Memory card [ ] Battery [ ] Charger [ ] Case<br>Condition: [ ] Cracked screen [ ] Scratches [ ] Water damage [ ] Will not power on</div>
     <div class="box"><b>Terms</b><br>1. Bring this card when collecting your device.<br>2. The estimate may change after full diagnosis; we will contact you first.<br>3. Please back up your data; we are not responsible for data lost during repair.<br>4. Devices not collected within 30 days of being notified may be charged a storage fee.<br>5. 30-day warranty on the replaced part only. Excludes physical or water damage.<br>6. A deposit is deducted from your final bill or refunded.</div>
     <p>Customer signature: ______________________ &nbsp; Received by: ______________________</p>`;
  if (kind === "fieldcard") h = head("FIELD JOB CARD", r.job_no) + kv([["Client", r.client_name], ["Contact", r.contact], ["Site / location", r.site], ["Job type", r.job_type], ["Date started", r.started_on], ["Scope of work", r.scope],
    ["Contract price (KES)", kes(r.contract_price)], ["Paid so far (KES)", kes(r.paid)], ["Balance due (KES)", kes(r.balance)]]) +
    `<div class="box">Site survey: Cameras ___ DVR/NVR [ ] Hard disk ___ TB | Points ___ DB/breaker [ ] Earthing [ ]<br>Materials / equipment: <br><br><br>Technician(s): __________ Vehicle / transport: __________</div>
     <div class="box"><b>Terms</b><br>1. The price covers the scope above; extra work is quoted first.<br>2. A deposit is required before materials are bought; balance due on completion.<br>3. Client provides safe access, power and permissions.<br>4. 30-day workmanship warranty; excludes misuse, power surges, tampering and theft.</div>
     <p>Client signature / date: ______________________ &nbsp; Technician: ______________________</p>`;
  if (kind === "document") { const t = docTotals(r), no = docNo(r);
    h = head(r.doc_type.toUpperCase(), no) + kv([["Customer", r.customer], ["Contact", r.contact], ["Address / site", r.address], ["Reference", r.reference], ["Date", r.doc_date]]) +
      `<table style="margin-top:10px"><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Amount (KES)</th></tr></thead><tbody>${r.items.map(i => `<tr><td>${esc(i.desc)}</td><td>${i.qty}</td><td>${kes(i.price)}</td><td>${kes(i.qty * i.price)}</td></tr>`).join("")}
      <tr><td colspan="3" align="right">Subtotal</td><td>${kes(t.sub)}</td></tr><tr><td colspan="3" align="right">Discount</td><td>${kes(r.discount)}</td></tr><tr><td colspan="3" align="right">VAT (${r.vat_rate}%)</td><td>${kes(t.vat)}</td></tr>
      <tr><th colspan="3" align="right">TOTAL (KES)</th><th>${kes(t.total)}</th></tr>${r.doc_type !== "Quotation" ? `<tr><td colspan="3" align="right">Paid to date</td><td>${kes(r.paid_before)}</td></tr><tr><th colspan="3" align="right">BALANCE (KES)</th><th>${kes(t.balance)}</th></tr>` : ""}</tbody></table>
      <p>${r.doc_type === "Quotation" ? "Prices in KES. Goods remain the property of Franksomi Solution Ltd until paid in full." : "Thank you for your business."}</p>`; }
  const p = $("#print"); p.innerHTML = `<div class="doc"><div class="noprint"><button class="btn" onclick="window.print()">Print</button> <button class="btn ghost" onclick="document.getElementById('print').hidden=true;document.getElementById('app').hidden=false">Close</button></div>${h}</div>`;
  $("#app").hidden = true; p.hidden = false;
}

// ---- shell ------------------------------------------------------------------------
async function refreshLookups() {
  const li = must(await db.from("list_items").select("*").order("value")) || [];
  lists = { item_type: li.filter(x => x.kind === "item_type"), brand: li.filter(x => x.kind === "brand"), stock_type: li.filter(x => x.kind === "stock_type") };
  stockItems = must(await db.from("inventory_stock").select("id,code,description,on_hand").order("code")) || [];
  suppliers = must(await db.from("suppliers").select("id,name").order("name")) || [];
}
async function route() {
  const k = location.hash.slice(1) || "dashboard";
  document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("on", a.dataset.k === k));
  $("#view").onclick = $("#view").onsubmit = null;
  try { if (k === "dashboard") await dashboard(); else if (k === "lists") await listsPage(); else if (k === "docs") await docsPage(); else if (T[k]) await tablePage(k); } catch (e) { console.error(e); }
}
async function start() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) { $("#app").hidden = true; $("#login").hidden = false; return; }
  const p = must(await db.from("profiles").select("*").eq("id", session.user.id).single());
  me = p || { role: "staff", full_name: session.user.email };
  $("#login").hidden = true; $("#app").hidden = false;
  $("#who").textContent = `${me.full_name || session.user.email} · ${me.role}`;
  $("#nav").innerHTML = NAV.map(([k, l]) => `<a href="#${k}" data-k="${k}">${esc(l)}</a>`).join("");
  await refreshLookups(); route();
}
$("#loginForm").onsubmit = async e => { e.preventDefault(); const f = e.target; const r = await db.auth.signInWithPassword({ email: f.email.value, password: f.password.value });
  if (r.error) $("#loginMsg").textContent = "Wrong email or password."; else { $("#loginMsg").textContent = ""; start(); } };
$("#logout").onclick = async () => { await db.auth.signOut(); location.hash = ""; start(); };
window.addEventListener("hashchange", () => me && route());
start();
