"use strict";
const $ = (s, r = document) => r.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const kes = v => v === null || v === undefined || v === "" ? "" : Number(v).toLocaleString("en-KE", { maximumFractionDigits: 2 });
const SHOP = { name: "Franksomi Solution Ltd", phone: "0711 952 924", email: "franksomi@gmail.com", place: "Kenya" };
const db = window.__MOCK_DB__ || supabase.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY);
let catalog = [];
const ROLES = [
  ["owner", "Owner", "Everything, including users and permissions. Always has every permission."],
  ["manager", "Administrator / Manager", "Runs the shop day to day: everything except managing users. Cannot delete money records."],
  ["accountant", "Accountant", "Sees all money, buying costs and reports. Records payments, expenses and documents; reconciles M-Pesa. Cannot change stock."],
  ["technician", "Technician", "Works on repairs and field jobs and sees stock quantities. No prices, costs or money."],
  ["storekeeper", "Storekeeper", "Manages stock and suppliers and sees buying costs. Sees repairs only."],
  ["sales", "Sales / Receptionist", "Takes in repairs, sells, records payments and printing. Sees only their own recent money entries."],
  ["auditor", "Auditor / Viewer", "Can look at everything (read only). Changes nothing."]];
const roleName = r => (ROLES.find(x => x[0] === r) || [0, r])[1];
const can = p => !!me && String(p).split("+").every(x => (me.perms || []).includes(x));
const pm = (def, a) => def.perm === "suppliers" ? (a === "view" || can("suppliers.edit")) : can(def.perm + "." + a);
let me = null, lists = { item_type: [], brand: [], stock_type: [] }, stockItems = [], suppliers = [];

function toast(m) { const t = $("#toast"); t.textContent = m; t.style.display = "block"; setTimeout(() => t.style.display = "none", 3000); }
const must = r => { if (r.error) { toast(r.error.message); throw r.error; } return r.data; };

// ---- field/table definitions ------------------------------------------------
const PAY = ["Cash", "M-Pesa", "Bank"];
const LEFT_WITH = ["SIM", "Memory card", "Battery", "Charger", "Case"], CONDITION = ["Cracked screen", "Scratches", "Water damage", "Will not power on"];
const T = {
  repairs: { title: "Repairs", view: "v_repairs", perm: "repairs", table: "repairs", order: "id", print: "jobcard", mpay: "repair",
    cols: [["id", "No."], ["received_on", "Received"], ["customer_name", "Customer"], ["contact", "Contact"], ["item_type", "Item"], ["brand_model", "Brand / model"], ["fault", "Fault"],
      ["stage", "Stage"], ["total_cost", "Total (KES)", "n"], ["balance_due", "Balance due", "n"], ["deposit_held", "Deposit held", "n"], ["status", "Status", "tag"]],
    fields: [["received_on", "Date received", "date", { today: 1 }], ["customer_name", "Customer name", "text", { req: 1 }], ["contact", "Contact", "text"],
      ["item_type", "Item type", "list:item_type"], ["brand_model", "Brand / model", "list:brand"], ["serial_no", "Serial no. / IMEI", "text"],
      ["stage", "Repair stage (customer sees this)", "select:Received,Diagnosing,Waiting for approval,Waiting for parts,Repairing,Testing,Ready for collection,Collected", { def: "Received" }], ["customer_note", "Message to customer (shown on the tracking page)", "text", { full: 1 }], ["sms_optout", "Do NOT send this customer SMS updates", "check"],
      ["fault", "Fault reported", "text", { full: 1 }], ["left_with", "Left with the device (tick what the customer handed in)", "multi:" + LEFT_WITH.join("|"), { full: 1 }],
      ["condition", "Condition on arrival", "multi:" + CONDITION.join("|"), { full: 1 }], ["diagnosis", "Diagnosis", "text", { full: 1 }],
      ["part1_id", "Part used 1 (from stock)", "stock"], ["part1_qty", "Qty", "number"], ["part2_id", "Part used 2 (from stock)", "stock"], ["part2_qty", "Qty", "number"],
      ["labor_hours", "Labor hours", "number"], ["labor_cost", "Labor cost (KES)", "number"],
      ["deposit_received", "Refundable deposit received", "number"], ["deposit_payment", "Deposit paid by", "select:" + PAY.join()], ["deposit_mpesa_ref", "Deposit M-Pesa code", "text"], ["deposit_applied", "Deposit applied to bill", "number"], ["deposit_refunded", "Deposit refunded", "number"],
      ["returned_on", "Date returned", "date"], ["remarks", "Remarks", "text", { full: 1 }]] },
  sales: { title: "Sales", view: "sales_v", perm: "sales", table: "sales", order: "id",
    cols: [["sold_on", "Date"], ["customer", "Customer / receipt"], ["item_name", "Item"], ["qty", "Qty", "n"], ["unit_cost", "Unit cost", "n", "owner"], ["unit_price", "Unit price", "n"],
      ["total_sales", "Total", "n"], ["profit", "Profit", "n", "owner"], ["payment", "Payment"], ["mpesa_ref", "M-Pesa code"]],
    fields: [["sold_on", "Date", "date", { today: 1 }], ["customer", "Customer / receipt no.", "text"], ["item_id", "Item (pick from stock — name and unit cost fill in)", "stock", { full: 1 }],
      ["category", "Category", "list:stock_type"], ["qty", "Qty", "number", { req: 1 }], ["unit_price", "Unit price (KES)", "number", { req: 1 }],
      ["payment", "Payment method", "select:" + PAY.join()], ["mpesa_ref", "M-Pesa code (if paid by M-Pesa)", "text"], ["cost_new", "Unit cost for an item not in stock (KES)", "number", { owner: 1 }], ["notes", "Notes", "text", { full: 1 }]] },
  inventory: { title: "Inventory", view: "v_stock", perm: "inventory", table: "inventory_items", order: "code",
    cols: [["code", "Code"], ["description", "Description"], ["stock_type", "Type"], ["qty_received", "Received", "n"], ["qty_sold", "Sold", "n"], ["qty_used", "Used", "n"], ["on_hand", "On hand", "n"],
      ["unit_cost", "Unit cost", "n", "owner"], ["selling_price", "Selling price", "n"], ["stock_value", "Stock value", "n", "owner"], ["supplier", "Supplier"], ["status", "Status", "tag"]],
    fields: [["description", "Description (keep unique)", "text", { req: 1, full: 1 }], ["stock_type", "Type", "list:stock_type", { req: 1 }], ["qty_received", "Qty received (total in)", "number"],
      ["unit_cost", "Unit cost (KES)", "number", { owner: 1 }], ["selling_price", "Selling price (KES)", "number"], ["supplier_id", "Supplier", "supplier"], ["reorder_level", "Reorder level", "number"], ["notes", "Notes", "text", { full: 1 }]] },
  jobs: { title: "Field Jobs", view: "v_jobs", perm: "jobs", table: "field_jobs", order: "id", print: "fieldcard", mpay: "job",
    cols: [["job_no", "Job No."], ["started_on", "Started"], ["client_name", "Client"], ["site", "Site"], ["job_type", "Type"], ["contract_price", "Price", "n"], ["paid", "Paid", "n"], ["balance", "Balance", "n"], ["job_profit", "Job profit", "n", "owner"], ["status", "Stage", "tag"]],
    fields: [["started_on", "Date started", "date", { today: 1 }], ["client_name", "Client name", "text", { req: 1 }], ["contact", "Contact", "text"], ["site", "Site / location", "text"],
      ["job_type", "Job type", "select:Electrical installation,CCTV installation,Electrical repair,CCTV repair,Transport / logistics,Other"],
      ["contract_price", "Contract price (KES)", "number"], ["status", "Stage (customer sees this)", "select:Booked,Site visit,Quote sent,Waiting for materials,In progress,Testing,On hold,Completed", { def: "Booked" }], ["completed_on", "Date completed", "date"],
      ["customer_note", "Message to customer (shown on the tracking page)", "text", { full: 1 }], ["sms_optout", "Do NOT send this customer SMS updates", "check"], ["scope", "Scope of work", "text", { full: 1 }], ["remarks", "Remarks (private)", "text", { full: 1 }]] },
  income: { title: "Income", view: "income", perm: "income", table: "income", order: "received_on",
    cols: [["received_on", "Date"], ["ref", "Customer ID / Job No."], ["description", "Description"], ["amount", "Amount", "n"], ["payment", "Payment"], ["mpesa_ref", "M-Pesa code"], ["income_type", "Type"]],
    fields: [["received_on", "Date", "date", { today: 1 }], ["ref", "Customer ID / Job No.", "text"], ["description", "Service description", "text", { full: 1 }], ["amount", "Amount (KES)", "number", { req: 1 }],
      ["payment", "Payment method", "select:" + PAY.join()], ["income_type", "Income type", "select:Repair,Electrical installation,CCTV installation,Other service"], ["mpesa_ref", "M-Pesa code", "text"], ["notes", "Notes", "text", { full: 1 }]] },
  expenses: { title: "Expenses", view: "expenses", perm: "expenses", table: "expenses", order: "spent_on",
    cols: [["spent_on", "Date"], ["description", "Description"], ["category", "Category"], ["amount", "Amount", "n"], ["payment", "Payment"], ["mpesa_ref", "M-Pesa code"], ["job_no", "Job No."]],
    fields: [["spent_on", "Date", "date", { today: 1 }], ["description", "Description", "text", { full: 1 }], ["category", "Category", "select:Job materials,Labor / Technician,Transport / Logistics,Fuel,Rent,Utilities,Stock purchase,Airtime / Internet,Other"],
      ["amount", "Amount (KES)", "number", { req: 1 }], ["payment", "Payment method", "select:" + PAY.join()], ["mpesa_ref", "M-Pesa code", "text"], ["job_no", "Job No. (optional)", "text"], ["notes", "Notes", "text", { full: 1 }]] },
  services: { title: "Printing & Cyber", view: "services", perm: "services", table: "services", order: "id", quick: 1,
    cols: [["done_on", "Date"], ["service", "Service"], ["customer", "Customer"], ["qty", "Qty", "n"], ["unit_price", "Price", "n"], ["total", "Total", "n"], ["payment", "Payment"], ["mpesa_ref", "M-Pesa code"]],
    fields: [["done_on", "Date", "date", { today: 1 }], ["service", "Service", "service"], ["customer", "Customer (optional)", "text"], ["qty", "Qty (pages, minutes ÷ 30, items)", "number", { req: 1 }],
      ["unit_price", "Price each (KES)", "number", { req: 1 }], ["payment", "Payment method", "select:" + PAY.join()], ["mpesa_ref", "M-Pesa code (if paid by M-Pesa)", "text"], ["notes", "Notes", "text", { full: 1 }]] },
  suppliers: { title: "Suppliers", view: "suppliers", perm: "suppliers", table: "suppliers", order: "name",
    cols: [["name", "Supplier"], ["contact_person", "Contact person"], ["phone", "Phone"], ["location", "Location"], ["supplies", "What they supply"]],
    fields: [["name", "Supplier name", "text", { req: 1 }], ["contact_person", "Contact person", "text"], ["phone", "Phone", "text"], ["location", "Location", "text"], ["supplies", "What they supply", "text", { full: 1 }], ["notes", "Notes", "text", { full: 1 }]] },
};
const NAV = [["dashboard", "Dashboard"], ["repairs", "Repairs", "repairs.view"], ["sales", "Sales", "sales.view"], ["services", "Printing & Cyber", "services.view"], ["jobs", "Field Jobs", "jobs.view"],
  ["docs", "Quote / Invoice / Receipt", "docs.view"], ["income", "Income", "income.view"], ["expenses", "Expenses", "expenses.view"], ["inventory", "Inventory", "inventory.view"],
  ["mpay", "M-Pesa checkout", "mpay.use"], ["sms", "SMS messages", "sms.manage"], ["eod", "End of day", "eod.view"], ["monthly", "Monthly report", "reports.view+costs.view"], ["summary", "Year summary", "reports.view+costs.view"],
  ["mpesa", "M-Pesa reconcile", "reconcile.use"], ["suppliers", "Suppliers"], ["lists", "Lists", "lists.manage"], ["audit", "Activity log", "audit.view"], ["users", "Users & roles", "users.manage"]];
const navFor = () => NAV.filter(n => !n[2] || can(n[2]));

// ---- form widgets -----------------------------------------------------------
function widget([k, l, t, o = {}], v) {
  if (o.owner && !can("costs.view")) return "";
  const val = v ?? (o.today ? new Date().toISOString().slice(0, 10) : ""), req = o.req ? "required" : "", cls = o.full ? "full" : "";
  let inner;
  if (t === "text") inner = `<input name="${k}" value="${esc(val)}" ${req} autocomplete="off">`;
  else if (t === "number") inner = `<input name="${k}" type="number" step="any" min="0" value="${esc(val)}" ${req} inputmode="decimal">`;
  else if (t === "check") return `<label class="full" style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="${k}" ${v ? "checked" : ""} style="width:auto"> ${esc(l)}</label>`;
  else if (t.startsWith("multi:")) { const have = Array.isArray(v) ? v : []; return `<fieldset class="full multi"><legend>${esc(l)}</legend>${t.slice(6).split("|").map(x => `<label><input type="checkbox" name="${k}" value="${esc(x)}" ${have.includes(x) ? "checked" : ""}> ${esc(x)}</label>`).join("")}</fieldset>`; }
  else if (t === "date") inner = `<input name="${k}" type="date" value="${esc(val)}" ${req}>`;
  else if (t.startsWith("select:")) { const sv = val || o.def || ""; inner = `<select name="${k}">${o.def ? "" : `<option value=""></option>`}${t.slice(7).split(",").map(x => `<option ${x === sv ? "selected" : ""}>${esc(x)}</option>`).join("")}</select>`; }
  else if (t.startsWith("list:")) { const id = "dl_" + k; inner = `<input name="${k}" list="${id}" value="${esc(val)}" ${req} autocomplete="off"><datalist id="${id}">${lists[t.slice(5)].map(x => `<option value="${esc(x.value)}">`).join("")}</datalist>`; }
  else if (t === "stock") inner = `<select name="${k}"><option value=""></option>${stockItems.map(i => `<option value="${i.id}" ${String(i.id) === String(val) ? "selected" : ""}>${esc(i.code)} – ${esc(i.description)} (${i.on_hand} in stock)</option>`).join("")}</select>`;
  else if (t === "service") inner = `<select name="${k}" required data-svc><option value=""></option>${catalog.map(c => `<option value="${esc(c.name)}" data-price="${c.default_price}" ${c.name === val ? "selected" : ""}>${esc(c.name)} (${esc(c.unit)})</option>`).join("")}</select>`;
  else if (t === "supplier") inner = `<select name="${k}"><option value=""></option>${suppliers.map(s => `<option value="${s.id}" ${String(s.id) === String(val) ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>`;
  return `<label class="${cls}">${esc(l)}${inner}</label>`;
}
function readForm(form, fields) {
  const out = {};
  for (const [k, , t, o = {}] of fields) {
    if (o.owner && !can("costs.view")) continue;
    if (t === "check") { out[k] = form.elements[k].checked; continue; }
    if (t.startsWith("multi:")) { out[k] = [...form.querySelectorAll(`input[name="${k}"]:checked`)].map(x => x.value); continue; }
    const raw = form.elements[k].value.trim();
    out[k] = raw === "" ? null : (t === "number" || t === "stock" || t === "supplier") ? Number(raw) : raw;
  }
  return out;
}
async function openForm(key, row) {
  const def = T[key];
  await refreshLookups();
  if (key === "repairs" && row) row = { ...row, ...(await repairChecks(row.id)) };
  const dlg = $("#dlg"), f = $("#dlgForm");
  f.innerHTML = `<h2>${row ? "Edit" : "New"} – ${esc(def.title)}</h2><div class="grid">${def.fields.map(fd => widget(fd, row && row[fd[0]])).join("")}</div>
    <div class="bar" style="margin-top:14px"><button class="btn" value="save">Save</button><button class="btn ghost" value="cancel" formnovalidate>Cancel</button></div>`;
  f.onsubmit = async e => {
    if (e.submitter.value !== "save") return;
    e.preventDefault();
    const data = readForm(f, def.fields);
    const checks = key === "repairs" ? { left_with: data.left_with || [], condition: data.condition || [] } : null;
    if (checks) { delete data.left_with; delete data.condition; }
    const costVal = key === "inventory" ? data.unit_cost : key === "sales" ? data.cost_new : undefined;
    delete data.unit_cost; delete data.cost_new;
    if (key === "repairs") { data.part1_qty ??= 1; data.part2_qty ??= 1; }
    for (const k of ["qty_received", "selling_price", "reorder_level"]) if (key === "inventory") data[k] ??= 0;
    if (key === "sales" && data.item_id == null && !row) { const nm = prompt("This sale has no stock item. Item name:"); if (!nm) return; data.item_name = nm; }
    if (key === "repairs" && data.deposit_received && !data.deposit_payment) data.deposit_payment = "Cash";
    if (data.mpesa_ref) data.mpesa_ref = data.mpesa_ref.toUpperCase().replace(/\s+/g, "");
    if (data.deposit_mpesa_ref) data.deposit_mpesa_ref = data.deposit_mpesa_ref.toUpperCase().replace(/\s+/g, "");
    const q = row ? db.from(def.table).update(data).eq("id", row.id).select("id") : db.from(def.table).insert(Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null))).select("id");
    const r = await q; if (r.error) return toast(r.error.message);
    if (row && (!r.data || !r.data.length)) return toast("You can't change this record. Staff can fix only their own entries, within a day.");
    if (checks) {
      const rid = row ? row.id : (Array.isArray(r.data) ? r.data[0]?.id : r.data?.id);
      if (rid) { const c = await db.from("repair_checks").upsert({ repair_id: rid, ...checks, updated_at: new Date().toISOString() }); if (c.error) return toast("Saved, but the checklist was not: " + c.error.message); }
    }
    if (costVal != null) {
      let id = row ? row.id : (Array.isArray(r.data) ? r.data[0]?.id : r.data?.id);
      if (id) { const c = await db.from(key === "inventory" ? "item_costs" : "sale_costs").upsert(key === "inventory" ? { item_id: id, unit_cost: costVal } : { sale_id: id, unit_cost: costVal }); if (c.error) toast(c.error.message); }
    }
    dlg.close(); toast("Saved"); route();
  };
  const sv = f.querySelector("[data-svc]"); if (sv) sv.onchange = () => { const o = sv.selectedOptions[0]; if (o && o.dataset.price && !row) f.elements.unit_price.value = o.dataset.price; };
  dlg.showModal();
}

// ---- table pages ------------------------------------------------------------
async function tablePage(key) {
  const def = T[key];
  const rows = must(await db.from(def.view).select("*").order(def.order, { ascending: false }).limit(500)) || [];
  window.__rows = rows;
  const cols = def.cols.filter(c => c[3] !== "owner" || can("costs.view"));
  const head = cols.map(c => `<th>${esc(c[1])}</th>`).join("") + "<th></th>";
  const body = rows.map((r, i) => `<tr class="${r.status === "REORDER" ? "low" : ""}">${cols.map(([k, , t]) => {
    const v = r[k]; if (t === "tag") return `<td><span class="tag ${v === "REORDER" || v === "In shop" ? "bad" : "ok"}">${esc(v)}</span></td>`;
    return `<td class="${t === "n" ? "n" : ""}">${t === "n" ? kes(v) : esc(v)}</td>`; }).join("")}
    <td>${pm(def, "edit") ? `<button class="btn sm" data-edit="${i}">Edit</button>` : ""} ${def.print ? `<button class="btn sm pbtn" data-print="${i}">Print card</button>` : ""}
    ${def.mpay && can("mpay.use") ? `<button class="btn sm" style="background:#12b76a" data-pay="${i}">M-Pesa</button>` : ""}${def.mpay === "repair" ? ` <button class="btn sm wabtn" data-wa="${i}">Send tracking link</button>` : ""}
    ${pm(def, "delete") ? `<button class="btn sm warn" data-del="${i}">Delete</button>` : ""}</td></tr>`).join("");
  if (def.quick) await refreshLookups();
  const quickBar = def.quick ? `<div class="bar" id="quick">${catalog.filter(c => c.active).map(c => `<button class="btn sm ghost" data-svc="${esc(c.name)}" title="KES ${c.default_price} per ${esc(c.unit)}">${esc(c.name.split(" (")[0])}</button>`).join("")}</div>` : "";
  $("#view").innerHTML = `<h2>${esc(def.title)}</h2>${quickBar}<div class="bar">${pm(def, "add") ? `<button class="btn" id="add">+ New</button>` : ""}<input id="q" placeholder="Search…" style="max-width:260px"><span style="color:var(--mut)">${rows.length} rows</span></div>
    <div class="wrap"><table><thead><tr>${head}</tr></thead><tbody id="tb">${body || `<tr><td colspan="99"><div class="empty">${BRAND.emptyArt(130)}Nothing yet. Press “+ New”.</div></td></tr>`}</tbody></table></div>`;
  if ($("#add")) $("#add").onclick = () => openForm(key);
  const qk = $("#quick"); if (qk) qk.onclick = async e => { const b = e.target.closest("[data-svc]"); if (!b) return; await openForm(key); const sel = $("#dlgForm").elements.service; sel.value = b.dataset.svc; sel.onchange(); $("#dlgForm").elements.qty.value = 1; };
  $("#q").oninput = e => { const s = e.target.value.toLowerCase(); document.querySelectorAll("#tb tr").forEach(tr => tr.hidden = !tr.textContent.toLowerCase().includes(s)); };
  $("#tb").onclick = async e => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.edit) openForm(key, rows[b.dataset.edit]);
    if (b.dataset.del && confirm("Delete this record? This cannot be undone.")) { const r = await db.from(def.table).delete().eq("id", rows[b.dataset.del].id); if (r.error) toast(r.error.message); else route(); }
    if (b.dataset.print) { let r = rows[b.dataset.print]; if (def.print === "jobcard") r = { ...r, ...(await repairChecks(r.id)) }; printCard(def.print, r); }
    if (b.dataset.pay) { const r = rows[b.dataset.pay]; mpayDialog(def.mpay === "repair"
      ? { phone: r.contact, amount: Math.max(0, Math.floor(r.balance_due || 0)) || "", ref: "JC-" + String(r.id).padStart(4, "0"), purpose: "Repair payment", auto: true, name: r.customer_name }
      : { phone: r.contact, amount: Math.max(0, Math.floor(r.balance || 0)) || "", ref: r.job_no, purpose: "Job payment " + r.job_no, auto: true, name: r.client_name }); }
    if (b.dataset.wa) { const r = rows[b.dataset.wa], no = "JC-" + String(r.id).padStart(4, "0"), ph = String(r.contact || "").replace(/\D/g, "").replace(/^0/, "254");
      const msg = `Hello ${String(r.customer_name || "").split(" ")[0]}, track your repair (${no}) here: ${portalUrl(no)} — use the phone number you gave us. ${SHOP.name}, ${SHOP.phone}`;
      window.open("https://wa.me/" + ph + "?text=" + encodeURIComponent(msg), "_blank"); }
  };
}

// ---- dashboard --------------------------------------------------------------
async function dashboard() {
  const yr = Number(sessionStorage.getItem("yr")) || new Date().getFullYear();
  const d = must(await db.rpc("dashboard", { yr }));
  let pipe = "", sm = null;
  if (can("repairs.view")) { const rr = (await db.from("v_repairs").select("stage,returned_on").limit(2000)).data || []; const c = {}; rr.filter(x => !x.returned_on && x.stage !== "Collected").forEach(x => c[x.stage || "Received"] = (c[x.stage || "Received"] || 0) + 1); pipe = BRAND.pipeline(c); }
  if (can("reports.view+costs.view")) { const r = await db.rpc("summary_report", { yr }); sm = r.data || null; }
  const k = (l, v, ic, cls, money) => `<div class="card kpi ${cls || ""}"><span class="ico">${BRAND.icon(ic, 20)}</span><small>${l}</small><b>${money ? "KES " + kes(v) : v}</b></div>`;
  const hr = new Date().getHours(), hi = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening", first = String(me.full_name || "").split(" ")[0];
  const pay = sm ? ["cash_in", "mpesa_in", "bank_in"].map((f, i) => ({ n: ["Cash", "M-Pesa", "Bank"][i], c: ["#0d6eae", "#12b76a", "#ff914d"][i], v: (sm.months || []).reduce((s, m) => s + Number(m[f] || 0), 0) })) : null;
  $("#view").innerHTML = `<div class="hero"><div class="row1"><img src="logo.png" alt="" width="64" height="64"><div><h2>${hi}${first ? ", " + esc(first) : ""}</h2><p>${esc(new Date().toLocaleDateString("en-KE", { weekday: "long", day: "numeric", month: "long", year: "numeric" }))} · ${esc(roleName(me.role))}</p><span class="tagline">${BRAND.TAGLINE}</span></div></div></div>
    <div class="bar"><label>Year <input id="yr" type="number" value="${yr}" style="width:100px"></label></div>
    <div class="cards">${k("Repairs still in shop", d.in_shop, "repairs")}${k("Jobs in progress", d.jobs_open, "jobs")}${k("Items to reorder", d.reorder, "inventory", "o")}</div>
    ${d.owner ? `<div class="cards">${k("Total income (year)", d.income, "income", "g", 1)}${k("Total expenses (year)", d.expenses, "expenses", "o", 1)}${k("Cash profit (year)", d.profit, "profit", "g", 1)}${k("Owed by clients", d.owed, "owed", "o", 1)}${k("Customer deposits held", d.deposits_held, "deposit", "", 1)}</div>`
      : `<p style="color:var(--mut)">Money totals are shown only to roles that may see reports.</p>`}
    <div class="charts">${pipe ? `<div class="panel"><h3>Repairs in the shop, by stage</h3>${pipe}</div>` : ""}${sm ? `<div class="panel"><h3>Money received by payment method (${yr})</h3>${BRAND.donut(pay, "Received")}</div>` : ""}</div>
    ${sm ? `<div class="panel"><h3>Income and expenses by month (${yr})</h3><div style="overflow-x:auto"><div style="min-width:560px;max-width:820px;margin:auto">${BRAND.bars(sm.months || [])}</div></div></div>` : ""}
    <h3 style="margin:6px 0 8px">Go to</h3><div class="tiles">${navFor().slice(1).map(([k2, l]) => `<a class="tile" href="#${k2}">${BRAND.icon(k2, 20)}${esc(l)}</a>`).join("")}</div>`;
  $("#yr").onchange = e => { sessionStorage.setItem("yr", e.target.value); route(); };
}

// ---- lists ------------------------------------------------------------------
async function listsPage() {
  await refreshLookups();
  const block = (kind, title) => `<div class="card"><b style="font-size:16px">${title}</b><div style="margin:8px 0">${lists[kind].map(x => `<span class="tag" style="margin:2px;display:inline-block">${esc(x.value)}${kind === "stock_type" ? " · " + esc(x.code) : ""}
    ${can("lists.manage") ? `<a href="#" data-rm="${x.id}">×</a>` : ""}</span>`).join("")}</div>
    <form data-kind="${kind}" class="bar"><input name="value" placeholder="Add new…" required>${kind === "stock_type" ? `<input name="code" placeholder="Code letters" maxlength="3" style="width:110px" required>` : ""}<button class="btn sm">Add</button></form></div>`;
  const svcBlock = `<div class="card" style="grid-column:1/-1"><b style="font-size:16px">Printing & Cyber price list</b><div class="wrap" style="margin:8px 0"><table><thead><tr><th>Service</th><th>Per</th><th>Price (KES)</th><th></th></tr></thead><tbody>
    ${catalog.map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.unit)}</td><td><input type="number" min="0" step="any" value="${c.default_price}" data-price="${c.id}" style="width:110px"></td><td><button class="btn sm" data-sp="${c.id}">Save</button> <button class="btn sm warn" data-sd="${c.id}">Remove</button></td></tr>`).join("")}</tbody></table></div>
    <form data-svcadd class="bar"><input name="name" placeholder="New service" required><input name="unit" placeholder="Per (page, each…)" style="width:150px"><input name="price" type="number" min="0" step="any" placeholder="Price" style="width:110px" required><button class="btn sm">Add service</button></form></div>`;
  $("#view").innerHTML = `<h2>Lists</h2><p style="color:var(--mut)">These feed the dropdowns. Add new entries any time.</p><div class="cards" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
    ${block("item_type", "Item types (Repairs)")}${block("brand", "Brand / model (Repairs)")}${block("stock_type", "Stock types (Inventory) and code letters")}${svcBlock}</div>`;
  $("#view").onsubmit = async e => { e.preventDefault(); const f = e.target;
    if (f.dataset.svcadd !== undefined) { const r = await db.from("service_catalog").insert({ name: f.name.value.trim(), unit: f.unit.value.trim() || "each", default_price: Number(f.price.value) }); return r.error ? toast(r.error.message) : listsPage(); }
    const row = { kind: f.dataset.kind, value: f.value.value.trim() }; if (f.code) row.code = f.code.value.trim().toUpperCase();
    const r = await db.from("list_items").insert(row); if (r.error) toast(r.error.message); else listsPage(); };
  $("#view").onclick = async e => {
    const sp = e.target.closest("[data-sp]"); if (sp) { const r = await db.from("service_catalog").update({ default_price: Number($(`[data-price="${sp.dataset.sp}"]`).value) }).eq("id", Number(sp.dataset.sp)); return r.error ? toast(r.error.message) : toast("Price saved"); }
    const sd = e.target.closest("[data-sd]"); if (sd) { if (!confirm("Remove this service from the price list?")) return; const r = await db.from("service_catalog").update({ active: false }).eq("id", Number(sd.dataset.sd)); return r.error ? toast(r.error.message) : listsPage(); }
    const a = e.target.closest("[data-rm]"); if (!a) return; e.preventDefault(); const r = await db.from("list_items").delete().eq("id", Number(a.dataset.rm)); if (r.error) toast(r.error.message); else listsPage(); };
}

// ---- documents (quotation / invoice / receipt) --------------------------------
function docTotals(d) {
  const items = d.items || [], sub = items.reduce((s, i) => s + Number(i.qty || 0) * Number(i.price || 0), 0);
  const vat = (sub - Number(d.discount || 0)) * Number(d.vat_rate || 0) / 100, total = sub - Number(d.discount || 0) + vat;
  return { sub, vat, total, balance: total - Number(d.paid_before || 0) };
}
async function docsPage() {
  const rows = must(await db.from("documents").select("*").order("id", { ascending: false }).limit(100)) || [];
  $("#view").innerHTML = `<h2>Quotation · Invoice · Receipt</h2><div class="bar">${can("docs.add") ? `<button class="btn" id="nd">+ New document</button>` : ""}</div>
    <div class="wrap"><table><thead><tr><th>No.</th><th>Type</th><th>Date</th><th>Customer</th><th>Total</th><th></th></tr></thead><tbody id="tb">
    ${rows.map((r, i) => `<tr><td>${docNo(r)}</td><td>${r.doc_type}</td><td>${esc(r.doc_date)}</td><td>${esc(r.customer)}</td><td class="n">${kes(docTotals(r).total)}</td>
    <td>${can("docs.edit") ? `<button class="btn sm" data-e="${i}">Edit</button>` : ""} <button class="btn sm pbtn" data-p="${i}">Print</button>${can("docs.delete") ? ` <button class="btn sm warn" data-d="${i}">Delete</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="6">No documents yet.</td></tr>`}</tbody></table></div>`;
  if ($("#nd")) $("#nd").onclick = () => docForm();
  $("#tb").onclick = async e => { const b = e.target.closest("button"); if (!b) return; if (b.dataset.e) docForm(rows[b.dataset.e]); if (b.dataset.p) printCard("document", rows[b.dataset.p]);
    if (b.dataset.d && confirm("Delete this document? This cannot be undone.")) { const r = await db.from("documents").delete().eq("id", rows[b.dataset.d].id); if (r.error) toast(r.error.message); else docsPage(); } };
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
const head = (title, no) => `<h1><span><img src="logo.png" alt="" height="30" style="vertical-align:middle;margin-right:8px;background:#fff;border-radius:4px;padding:2px">${SHOP.name.toUpperCase()}</span><span>${title}</span></h1><p>Repairs · Sales · Installations | ${SHOP.place} | Tel: ${SHOP.phone} | ${SHOP.email}${no ? ` | <b>${esc(no)}</b>` : ""}</p>`;
const kv = (a) => `<table>${a.map(([k, v]) => `<tr><th style="width:30%">${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>`;
async function repairChecks(id) {
  const r = await db.from("repair_checks").select("*").eq("repair_id", id).limit(1);
  const x = (r.data && (Array.isArray(r.data) ? r.data[0] : r.data)) || {};
  return { left_with: x.left_with || [], condition: x.condition || [] };
}
const tickLine = (all, have) => all.map(x => `${have.includes(x) ? "[✔]" : "[ ]"} ${esc(x)}`).join(" &nbsp;");
function printCard(kind, r) {
  let h = "";
  if (kind === "jobcard") h = head("JOB CARD", "JC-" + String(r.id).padStart(4, "0")) + kv([["Customer", r.customer_name], ["Contact", r.contact], ["Date received", r.received_on], ["Item", [r.item_type, r.brand_model].filter(Boolean).join(" – ")], ["Serial / IMEI", r.serial_no], ["Fault reported", r.fault],
    ["Diagnosis", r.diagnosis], ["Parts (KES)", kes(r.parts_cost)], ["Labor (KES)", kes(r.labor_cost)], ["Estimated total (KES)", kes(r.total_cost)], ["Refundable deposit (KES)", kes(r.deposit_received)]]) +
    `<div class="box">Left with device: ${tickLine(LEFT_WITH, r.left_with || [])}<br>Condition: ${tickLine(CONDITION, r.condition || [])}</div>
     <div class="box"><b>Terms</b><br>1. Bring this card when collecting your device.<br>2. The estimate may change after full diagnosis; we will contact you first.<br>3. Please back up your data; we are not responsible for data lost during repair.<br>4. Devices not collected within 30 days of being notified may be charged a storage fee.<br>5. 30-day warranty on the replaced part only. Excludes physical or water damage.<br>6. A deposit is deducted from your final bill or refunded.</div>
     <p><b>Track your repair online:</b> ${esc(portalUrl("JC-" + String(r.id).padStart(4, "0")))} &nbsp;(Job card <b>JC-${String(r.id).padStart(4, "0")}</b> + the phone number you gave us)</p>
     <p>Customer signature: ______________________ &nbsp; Received by: ______________________</p>
     <p style="text-align:center;color:#555">✂ - - - - - - - - - - - - - tear off here - - - - - - - - - - - - -</p>
     <div class="box"><img src="logo.png" alt="" height="22" style="vertical-align:middle;margin-right:6px"><b>CUSTOMER RECEIPT — ${SHOP.name}</b> &nbsp; Job Card No: <b>JC-${String(r.id).padStart(4, "0")}</b><br>Customer: ${esc(r.customer_name)} &nbsp; Date received: ${esc(r.received_on)}<br>
     Item: ${esc([r.item_type, r.brand_model].filter(Boolean).join(" – "))} &nbsp; Serial / IMEI: ${esc(r.serial_no)}<br>Fault: ${esc(r.fault)}<br>Refundable deposit: <b>KES ${kes(r.deposit_received)}</b> &nbsp; Received by: ____________<br>
     <small>Keep this slip and bring it when collecting your device.</small></div>`;
  if (kind === "fieldcard") h = head("FIELD JOB CARD", r.job_no) + kv([["Client", r.client_name], ["Contact", r.contact], ["Site / location", r.site], ["Job type", r.job_type], ["Date started", r.started_on], ["Scope of work", r.scope],
    ["Contract price (KES)", kes(r.contract_price)], ["Paid so far (KES)", kes(r.paid)], ["Balance due (KES)", kes(r.balance)]]) +
    `<div class="box">Site survey: Cameras ___ DVR/NVR [ ] Hard disk ___ TB | Points ___ DB/breaker [ ] Earthing [ ]<br>Materials / equipment: <br><br><br>Technician(s): __________ Vehicle / transport: __________</div>
     <p><b>Track your job online:</b> ${esc(portalUrl(r.job_no))} &nbsp;(Job No <b>${esc(r.job_no)}</b> + the phone number you gave us)</p>
     <div class="box"><b>Terms</b><br>1. The price covers the scope above; extra work is quoted first.<br>2. A deposit is required before materials are bought; balance due on completion.<br>3. Client provides safe access, power and permissions.<br>4. 30-day workmanship warranty; excludes misuse, power surges, tampering and theft.</div>
     <p>Client signature / date: ______________________ &nbsp; Technician: ______________________</p>
     <p style="text-align:center;color:#555">✂ - - - - - - - - - - - - - tear off here - - - - - - - - - - - - -</p>
     <div class="box"><img src="logo.png" alt="" height="22" style="vertical-align:middle;margin-right:6px"><b>CLIENT RECEIPT — ${SHOP.name}</b> &nbsp; Job No: <b>${esc(r.job_no)}</b><br>Client: ${esc(r.client_name)} &nbsp; Job type: ${esc(r.job_type)}<br>Site: ${esc(r.site)} &nbsp; Contract price: KES ${kes(r.contract_price)}<br>
     Deposit received (KES): ____________ &nbsp; Received by: ____________<br><small>Keep this slip. It confirms your booking and any deposit paid.</small></div>`;
  if (kind === "document") { const t = docTotals(r), no = docNo(r);
    h = head(r.doc_type.toUpperCase(), no) + kv([["Customer", r.customer], ["Contact", r.contact], ["Address / site", r.address], ["Reference", r.reference], ["Date", r.doc_date]]) +
      `<table style="margin-top:10px"><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Amount (KES)</th></tr></thead><tbody>${r.items.map(i => `<tr><td>${esc(i.desc)}</td><td>${i.qty}</td><td>${kes(i.price)}</td><td>${kes(i.qty * i.price)}</td></tr>`).join("")}
      <tr><td colspan="3" align="right">Subtotal</td><td>${kes(t.sub)}</td></tr><tr><td colspan="3" align="right">Discount</td><td>${kes(r.discount)}</td></tr><tr><td colspan="3" align="right">VAT (${r.vat_rate}%)</td><td>${kes(t.vat)}</td></tr>
      <tr><th colspan="3" align="right">TOTAL (KES)</th><th>${kes(t.total)}</th></tr>${r.doc_type !== "Quotation" ? `<tr><td colspan="3" align="right">Paid to date</td><td>${kes(r.paid_before)}</td></tr><tr><th colspan="3" align="right">BALANCE (KES)</th><th>${kes(t.balance)}</th></tr>` : ""}</tbody></table>
      <p>${r.doc_type === "Quotation" ? "Prices in KES. Goods remain the property of Franksomi Solution Ltd until paid in full." : "Thank you for your business."}</p>`; }
  const fname = kind === "jobcard" ? "JC-" + String(r.id).padStart(4, "0") + " Job Card.pdf" : kind === "fieldcard" ? r.job_no + " Field Job Card.pdf" : docNo(r) + " " + r.doc_type + ".pdf";
  printHtml(h, fname);
}


// ---- shared helpers for reports -------------------------------------------------
// Opens the document in a NEW TAB (print.html) with Print and Download PDF buttons. If the browser blocks the new tab, it is shown on this page instead.
function printHtml(html, filename = "Franksomi document.pdf") {
  const body = `<div id="docbody">${html}<div class="docfoot"><img src="logo.png" alt="" height="26"><b>${BRAND.TAGLINE}</b><span>${SHOP.name} · ${SHOP.phone} · ${SHOP.email}</span></div><div class="doccopy">© ${new Date().getFullYear()} ${SHOP.name}. All rights reserved.</div></div>`;
  let tab = null;
  try { localStorage.setItem("fk_print", JSON.stringify({ html: body, filename })); tab = window.open("print.html", "_blank"); } catch (_) { tab = null; }
  if (tab) return;
  try { localStorage.removeItem("fk_print"); } catch (_) {}
  toast("Your browser blocked the new tab, so the document is shown here. Allow pop-ups for this site to open it in a new tab.");
  const p = $("#print"); p.innerHTML = `<div class="doc"><div class="noprint doctools"><button class="btn pbtn" data-act="print">Print</button> <button class="btn pdfbtn" data-act="pdf">Download PDF</button>
    <button class="btn ghost" data-act="close">Close</button><span id="pdfmsg"></span></div>${body}</div>`;
  $("#app").hidden = true; p.hidden = false; window.scrollTo(0, 0);
  p.onclick = async e => {
    const b = e.target.closest("button[data-act]"); if (!b) return;
    if (b.dataset.act === "print") window.print();
    if (b.dataset.act === "close") { p.hidden = true; $("#app").hidden = false; }
    if (b.dataset.act === "pdf") {
      const m = $("#pdfmsg"); b.disabled = true; m.textContent = "Making the PDF…";
      try { await PDF.download($("#docbody"), filename); m.textContent = "PDF saved: " + filename; }
      catch (err) { console.error(err); m.textContent = "This browser could not make the PDF directly. In the Print window choose “Save as PDF”."; window.print(); }
      b.disabled = false;
    }
  };
}
const today = () => new Date().toISOString().slice(0, 10);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const tbl = (head, rows, foot) => `<table><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td class="${i ? "n" : ""}">${typeof c === "number" ? kes(c) : esc(c)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${head.length}">None</td></tr>`}</tbody>${foot ? `<tfoot><tr>${foot.map((c, i) => `<th class="${i ? "n" : ""}" style="background:var(--navy)">${typeof c === "number" ? kes(c) : esc(c)}</th>`).join("")}</tr></tfoot>` : ""}</table>`;
const sumBy = (rows, f = r => r.total) => rows.reduce((s, r) => s + Number(f(r) || 0), 0);
const payCards = (obj) => ["Cash", "M-Pesa", "Bank"].concat(obj["Deposit applied"] ? ["Deposit applied"] : []).map(k => `<div class="card"><small>${k}</small><b>KES ${kes(obj[k] || 0)}</b></div>`).join("");

// ---- end of day -------------------------------------------------------------------
async function eodPage() {
  const day = sessionStorage.getItem("eodDay") || today();
  const r = must(await db.rpc("day_report", { d: day }));
  const sal = r.sales || [], svc = r.services || [], inc = r.income || [], exp = r.expenses || [], dep = r.deposits || [], dap = r.deposits_applied || [];
  const by = (arr, f) => { const o = {}; arr.forEach(x => { const p = x.payment || "Cash"; o[p] = (o[p] || 0) + Number(f(x) || 0); }); return o; };
  const merge = (...os) => { const o = {}; os.forEach(x => Object.entries(x).forEach(([k, v]) => o[k] = (o[k] || 0) + v)); return o; };
  const takings = merge(by(sal, x => x.total), by(svc, x => x.total), by(inc, x => x.amount));
  const totalIn = sumBy(sal) + sumBy(svc) + sumBy(inc, x => x.amount), totalOut = sumBy(exp, x => x.amount);
  const cl = r.closing;
  const body = `<h2 style="margin-top:0">End-of-day report — ${esc(day)}</h2><p><small>${esc(r.scope)}</small></p>
    <div class="cards">${payCards(takings)}<div class="card"><small>Total taken</small><b>KES ${kes(totalIn)}</b></div><div class="card"><small>Expenses paid</small><b>KES ${kes(totalOut)}</b></div>
    <div class="card"><small>Refundable deposits taken</small><b>KES ${kes(sumBy(dep, x => x.amount))}</b></div><div class="card"><small>Deposits applied to bills (income, no new cash)</small><b>KES ${kes(sumBy(dap, x => x.amount))}</b></div></div>
    <p>Repairs received: <b>${r.repairs_in}</b> · returned: <b>${r.repairs_out}</b> · jobs started: <b>${r.jobs_started}</b> · jobs completed: <b>${r.jobs_done}</b></p>
    <h3>Shop sales</h3>${tbl(["Item", "Qty", "Total", "Payment"], sal.map(x => [x.item, x.qty, x.total, x.payment || ""]), ["Total", "", sumBy(sal), ""])}
    <h3>Printing & Cyber</h3>${tbl(["Service", "Qty", "Total", "Payment"], svc.map(x => [x.service, x.qty, x.total, x.payment || ""]), ["Total", "", sumBy(svc), ""])}
    <h3>Repair / installation payments</h3>${tbl(["Customer / Job", "Description", "Amount", "Payment"], inc.map(x => [x.ref || "", x.description || "", x.amount, x.payment || ""]), ["Total", "", sumBy(inc, x => x.amount), ""])}
    <h3>Deposits taken</h3>${tbl(["Customer", "Amount", "Paid by"], dep.map(x => [x.customer, x.amount, x.payment || "Cash"]))}
    <h3>Deposits applied to bills</h3>${tbl(["Customer", "Job card", "Amount"], dap.map(x => [x.customer, x.ref, x.amount]), ["Total", "", sumBy(dap, x => x.amount)])}<p style="color:var(--mut);font-size:13px">A deposit applied to a bill counts as income today. The cash was already counted on the day the deposit was taken, so it does not change expected cash.</p>
    <h3>Expenses</h3>${tbl(["Description", "Category", "Amount", "Payment"], exp.map(x => [x.description || "", x.category || "", x.amount, x.payment || ""]), ["Total", "", totalOut, ""])}
    ${r.owner ? `<h3>Profit on shop sales today</h3><p>KES ${kes(sumBy(sal, x => x.profit))}</p>` : ""}
    <h3>Cash drawer</h3><p>Cash in (sales, services, payments, deposits): <b>${kes(r.cash_in)}</b> − cash expenses: <b>${kes(r.cash_out)}</b> = expected cash <b>KES ${kes(r.expected_cash)}</b></p>
    ${cl ? `<p>Closed: counted <b>${kes(cl.counted_cash)}</b> · difference <b>${kes(cl.variance)}</b> ${cl.note ? "· " + esc(cl.note) : ""}</p>` : ""}`;
  $("#view").innerHTML = `<h2>End of day</h2><div class="bar"><label>Day <input type="date" id="eday" value="${day}"></label><button class="btn pbtn" id="eprint">Print report</button></div><div class="card" style="overflow:auto">${body}</div>
    ${cl ? "" : `<div class="card" style="margin-top:12px"><b style="font-size:16px">Close the day</b><div class="grid" style="margin-top:8px"><label>Cash counted in drawer (KES)<input id="counted" type="number" min="0" step="any" inputmode="decimal"></label>
      <label>Note<input id="cnote" placeholder="Reason for any difference"></label></div><p id="cdiff" style="color:var(--mut)">Expected cash: KES ${kes(r.expected_cash)}</p><button class="btn" id="close">Save closing</button></div>`}`;
  $("#eday").onchange = e => { sessionStorage.setItem("eodDay", e.target.value); route(); };
  $("#eprint").onclick = () => printHtml(head("END OF DAY REPORT", day) + body, "End of day " + day + ".pdf");
  if (!cl) {
    $("#counted").oninput = e => { const v = Number(e.target.value) - Number(r.expected_cash); $("#cdiff").textContent = `Expected cash: KES ${kes(r.expected_cash)} · difference: ${v >= 0 ? "+" : ""}${kes(v)}`; };
    $("#close").onclick = async () => { const c = $("#counted").value; if (c === "") return toast("Type the cash counted first.");
      const x = await db.from("day_closings").insert({ day, expected_cash: r.expected_cash, counted_cash: Number(c), note: $("#cnote").value || null }); if (x.error) return toast(x.error.message); toast("Day closed"); route(); };
  }
}

// ---- monthly report (owner) ----------------------------------------------------------------
async function monthlyPage() {
  const now = new Date(), yr = Number(sessionStorage.getItem("mYr")) || now.getFullYear(), mo = Number(sessionStorage.getItem("mMo")) || now.getMonth() + 1;
  const r = must(await db.rpc("monthly_report", { yr, mon: mo }));
  const days = (r.days || []).filter(d => d.services || d.retail || d.printing_cyber || d.expenses);
  const tot = k => sumBy(r.days || [], d => d[k]);
  const body = `<h2 style="margin-top:0">Monthly report — ${MONTHS[mo - 1]} ${yr}</h2>
    <div class="cards"><div class="card"><small>Total income</small><b>KES ${kes(tot("services") + tot("retail") + tot("printing_cyber"))}</b></div><div class="card"><small>Expenses</small><b>KES ${kes(tot("expenses"))}</b></div>
    <div class="card"><small>Cash profit</small><b>KES ${kes(tot("services") + tot("retail") + tot("printing_cyber") - tot("expenses"))}</b></div><div class="card"><small>Deposits taken (held for customers)</small><b>KES ${kes(r.deposits_taken)}</b></div></div>
    <p>Money by payment method:</p><div class="cards">${payCards(r.payments || {})}</div>
    <p>Repairs received: <b>${r.repairs_in}</b> · returned: <b>${r.repairs_out}</b> · jobs started: <b>${r.jobs_started}</b> · completed: <b>${r.jobs_done}</b></p>
    <h3>Day by day</h3>${tbl(["Day", "Repairs & installs", "Shop sales", "Printing & Cyber", "Expenses"], days.map(d => [d.d, d.services, d.retail, d.printing_cyber, d.expenses]), ["Total", tot("services"), tot("retail"), tot("printing_cyber"), tot("expenses")])}
    <h3>Top selling items</h3>${tbl(["Item", "Qty", "Sales", "Profit"], (r.top_items || []).map(x => [x.item, x.qty, x.sales, x.profit]))}
    <h3>Printing & Cyber by service</h3>${tbl(["Service", "Qty", "Total"], (r.service_breakdown || []).map(x => [x.service, x.qty, x.total]))}
    <h3>Expenses by category</h3>${tbl(["Category", "Amount"], (r.expense_by_category || []).map(x => [x.category, x.amount]))}
    <h3>Daily cash closings</h3>${tbl(["Day", "Expected", "Counted", "Difference"], (r.closings || []).map(x => [x.day, x.expected, x.counted, x.variance]))}`;
  $("#view").innerHTML = `<h2>Monthly report</h2><div class="bar"><label>Month <select id="mm">${MONTHS.map((m, i) => `<option value="${i + 1}" ${i + 1 === mo ? "selected" : ""}>${m}</option>`).join("")}</select></label>
    <label>Year <input id="my" type="number" value="${yr}" style="width:100px"></label><button class="btn pbtn" id="mp">Print report</button></div><div class="card" style="overflow:auto">${body}</div>`;
  $("#mm").onchange = e => { sessionStorage.setItem("mMo", e.target.value); route(); }; $("#my").onchange = e => { sessionStorage.setItem("mYr", e.target.value); route(); };
  $("#mp").onclick = () => printHtml(head("MONTHLY REPORT", MONTHS[mo - 1] + " " + yr) + body, "Monthly report " + yr + "-" + String(mo).padStart(2, "0") + ".pdf");
}

// ---- year summary (owner) ----------------------------------------------------------------
async function summaryPage() {
  const yr = Number(sessionStorage.getItem("yr")) || new Date().getFullYear();
  const r = must(await db.rpc("summary_report", { yr }));
  const M = r.months, tt = k => sumBy(M, m => m[k]), L = r.lines || {}, rt = r.retail, j = r.jobs, rp = r.repairs, iv = r.inventory, tr = r.transport;
  const margin = rt.sales ? (100 * (rt.sales - rt.cogs) / rt.sales).toFixed(1) + "%" : "0.0%";
  const body = `<h2 style="margin-top:0">Summary — ${yr}</h2>
    <h3>Month by month</h3>${tbl(["Month", "Repairs & installs", "Shop sales", "Printing & Cyber", "Total income", "Expenses", "Cash profit", "Cash in", "M-Pesa in", "Bank in"],
      M.map(m => [MONTHS[m.m - 1], m.services_income, m.retail, m.printing_cyber, m.total_income, m.expenses, m.profit, m.cash_in, m.mpesa_in, m.bank_in]),
      ["Year total", tt("services_income"), tt("retail"), tt("printing_cyber"), tt("total_income"), tt("expenses"), tt("profit"), tt("cash_in"), tt("mpesa_in"), tt("bank_in")])}
    <h3>Income by business line</h3>${tbl(["Line", "Amount"], [["Repairs", L["Repair"] || 0], ["Electrical installations", L["Electrical installation"] || 0], ["CCTV installations", L["CCTV installation"] || 0], ["Other services", L["Other service"] || 0],
      ["Retail sales (accessories & electronics)", L["Retail sales"] || 0], ["Printing & Cyber", L["Printing & Cyber"] || 0]], ["Total", tt("total_income")])}
    <h3>Retail margin</h3>${tbl(["", "KES"], [["Sales", rt.sales], ["Cost of goods sold", rt.cogs], ["Gross profit", rt.sales - rt.cogs], ["Margin", margin]])}
    <h3>Field jobs — installations (all time)</h3>${tbl(["", "Value"], [["Jobs recorded", j.count], ["Jobs completed", j.done], ["Contract value", j.contract], ["Collected so far", j.paid], ["Balance owed by clients", j.balance], ["Job costs", j.costs], ["Job profit", j.profit]])}
    <h3>Transport & logistics (year)</h3>${tbl(["", "KES"], [["Transport / Logistics", tr.transport], ["Fuel", tr.fuel], ["Total", tr.transport + tr.fuel]])}
    <h3>Repairs (all time)</h3>${tbl(["", "Value"], [["Items received", rp.received], ["Returned to customers", rp.returned], ["Still in shop", rp.in_shop], ["Parts charged", rp.parts], ["Labor charged", rp.labor], ["Customer deposits held", rp.deposits_held]])}
    <h3>Inventory</h3>${tbl(["", "Value"], [["Stock items", iv.items], ["Stock value at cost", iv.value], ["Items to reorder", iv.reorder]])}`;
  $("#view").innerHTML = `<h2>Year summary</h2><div class="bar"><label>Year <input id="sy" type="number" value="${yr}" style="width:100px"></label><button class="btn pbtn" id="sp">Print summary</button></div><div class="card" style="overflow:auto">${body}</div>`;
  $("#sy").onchange = e => { sessionStorage.setItem("yr", e.target.value); route(); };
  $("#sp").onclick = () => printHtml(head("SUMMARY", String(yr)) + body, "Year summary " + yr + ".pdf");
}

// ---- M-Pesa reconciliation (owner) ----------------------------------------------------------------
async function mpesaRecords() {
  const g = async (t, cols) => must(await db.from(t).select(cols).limit(5000)) || [];
  const out = [];
  (await g("sales_v", "id,sold_on,total_sales,mpesa_ref,payment,item_name")).filter(x => x.payment === "M-Pesa").forEach(x => out.push({ table: "sales", id: x.id, date: x.sold_on, amount: Number(x.total_sales), ref: x.mpesa_ref, dir: "in", label: "Sale: " + (x.item_name || "") }));
  (await g("services", "id,done_on,total,mpesa_ref,payment,service")).filter(x => x.payment === "M-Pesa").forEach(x => out.push({ table: "services", id: x.id, date: x.done_on, amount: Number(x.total), ref: x.mpesa_ref, dir: "in", label: "Service: " + x.service }));
  (await g("income", "id,received_on,amount,mpesa_ref,payment,description,ref")).filter(x => x.payment === "M-Pesa").forEach(x => out.push({ table: "income", id: x.id, date: x.received_on, amount: Number(x.amount), ref: x.mpesa_ref, dir: "in", label: "Payment: " + (x.description || x.ref || "") }));
  (await g("expenses", "id,spent_on,amount,mpesa_ref,payment,description")).filter(x => x.payment === "M-Pesa").forEach(x => out.push({ table: "expenses", id: x.id, date: x.spent_on, amount: Number(x.amount), ref: x.mpesa_ref, dir: "out", label: "Expense: " + (x.description || "") }));
  (await g("repairs", "id,received_on,deposit_received,deposit_payment,deposit_mpesa_ref,customer_name")).filter(x => x.deposit_payment === "M-Pesa" && x.deposit_received > 0).forEach(x => out.push({ table: "repairs", id: x.id, date: x.received_on, amount: Number(x.deposit_received), ref: x.deposit_mpesa_ref, dir: "in", label: "Deposit: " + x.customer_name }));
  return out;
}
const REFCOL = { sales: "mpesa_ref", services: "mpesa_ref", income: "mpesa_ref", expenses: "mpesa_ref", repairs: "deposit_mpesa_ref" };
async function link(txn, rec) {
  if (!txn.matched_table) { const u = await db.from("mpesa_txns").update({ matched_table: rec.table, matched_id: rec.id }).eq("receipt_no", txn.receipt_no); if (u.error) return toast(u.error.message); }
  if (!rec.ref) { const u = await db.from(rec.table).update({ [REFCOL[rec.table]]: txn.receipt_no }).eq("id", rec.id); if (u.error) return toast(u.error.message); }
}
async function mpesaPage() {
  const txns = must(await db.from("mpesa_txns").select("*").order("txn_time", { ascending: false }).limit(5000)) || [];
  const recs = await mpesaRecords();
  const m = Mpesa.matchAll(txns.map(t => ({ ...t })), recs);
  const hold = txns.filter(t => !t.matched_table).length;
  const sec = (title, n, inner) => `<h3>${title} <span class="tag">${n}</span></h3>${inner}`;
  const tt = t => `${esc((t.txn_time || "").slice(0, 16).replace("T", " "))} · ${esc(t.receipt_no)} · ${esc(t.details)} · <b>${t.paid_in > 0 ? "+" + kes(t.paid_in) : "−" + kes(t.withdrawn)}</b>`;
  $("#view").innerHTML = `<h2>M-Pesa reconciliation</h2>
    <p style="color:var(--mut)">Download your M-Pesa statement as CSV (M-Pesa app, Till / Business portal, or Safaricom statement) and import it. Entries are matched by their M-Pesa code first, then by amount and date. Always type the M-Pesa code when you record an M-Pesa payment.</p>
    <div class="bar"><input type="file" id="csv" accept=".csv,text/csv"><span>${txns.length} statement lines stored · ${hold} not yet matched${m.lo ? " · " + m.lo + " to " + m.hi : ""}</span></div>
    <div class="cards"><div class="card"><small>Statement money in</small><b>KES ${kes(m.stmtIn)}</b></div><div class="card"><small>Statement money out</small><b>KES ${kes(m.stmtOut)}</b></div>
    <div class="card"><small>Recorded M-Pesa in (same period)</small><b>KES ${kes(recs.filter(r => r.dir === "in" && m.lo && r.date >= m.lo && r.date <= m.hi).reduce((s, r) => s + r.amount, 0))}</b></div></div>
    ${sec("Exact matches by M-Pesa code", m.exact.length, m.exact.length ? `<div class="wrap"><table><tbody>${m.exact.map((x, i) => `<tr><td>${tt(x.txn)}</td><td>${esc(x.rec.label)}${x.amountDiffers ? ` <span class="tag bad">amount differs: recorded ${kes(x.rec.amount)}</span>` : ""}</td><td><button class="btn sm" data-ex="${i}">Confirm</button></td></tr>`).join("")}</tbody></table></div><button class="btn sm" id="exall">Confirm all</button>` : "<p>None waiting.</p>")}
    ${sec("Suggested matches (same amount, same day, no code yet)", m.suggested.length, m.suggested.length ? `<div class="wrap"><table><tbody>${m.suggested.map((x, i) => `<tr><td>${tt(x.txn)}</td><td>${esc(x.rec.label)} · ${esc(x.rec.date)}</td><td><button class="btn sm" data-sg="${i}">Confirm</button></td></tr>`).join("")}</tbody></table></div>` : "<p>None.</p>")}
    ${sec("Several possible matches — pick one", m.ambiguous.length, m.ambiguous.map((x, i) => `<div class="card" style="margin-bottom:8px">${tt(x.txn)}<br>${x.options.map((o, k) => `<button class="btn sm ghost" data-am="${i}:${k}">${esc(o.label)} · ${esc(o.date)}</button>`).join(" ")}</div>`).join("") || "<p>None.</p>")}
    ${sec("On the statement but not recorded", m.unrecorded.length, m.unrecorded.length ? `<div class="wrap"><table><tbody>${m.unrecorded.map((t, i) => `<tr><td>${tt(t)}</td><td><button class="btn sm" data-rec="${i}">${t.paid_in > 0 ? "Record as income" : "Record as expense"}</button> <button class="btn sm ghost" data-ign="${i}">Ignore</button></td></tr>`).join("")}</tbody></table></div>` : "<p>None. Everything on the statement is accounted for.</p>")}
    ${sec("Recorded as M-Pesa but not on the statement", m.missing.length, m.missing.length ? `<div class="wrap"><table><tbody>${m.missing.map(r => `<tr><td>${esc(r.date)}</td><td>${esc(r.label)}</td><td class="n">${r.dir === "in" ? "+" : "−"}${kes(r.amount)}</td><td>${esc(r.ref || "no code")}</td></tr>`).join("")}</tbody></table></div><p style="color:var(--mut)">Check the M-Pesa code or amount typed, or whether the customer actually paid.</p>` : "<p>None.</p>")}`;
  const done = async () => { toast("Saved"); route(); };
  $("#csv").onchange = async e => { const f = e.target.files[0]; if (!f) return;
    try { const rows = Mpesa.parseMpesa(await f.text()); if (!rows.length) return toast("No completed transactions found in that file.");
      const have = new Set(txns.map(t => t.receipt_no)); const fresh = rows.filter(r => !have.has(r.receipt_no));
      if (fresh.length) { const x = await db.from("mpesa_txns").insert(fresh); if (x.error) return toast(x.error.message); }
      toast(`${fresh.length} new lines imported, ${rows.length - fresh.length} already there.`); route(); } catch (err) { toast(err.message); } };
  const v = $("#view");
  v.onclick = async e => { const b = e.target.closest("button"); if (!b) return;
    if (b.id === "exall") { for (const x of m.exact) await link(x.txn, x.rec); return done(); }
    if (b.dataset.ex) { const x = m.exact[b.dataset.ex]; await link(x.txn, x.rec); return done(); }
    if (b.dataset.sg) { const x = m.suggested[b.dataset.sg]; await link(x.txn, x.rec); return done(); }
    if (b.dataset.am) { const [i, k] = b.dataset.am.split(":"); await link(m.ambiguous[i].txn, m.ambiguous[i].options[k]); return done(); }
    if (b.dataset.ign) { const t = m.unrecorded[b.dataset.ign]; const x = await db.from("mpesa_txns").update({ matched_table: "ignored" }).eq("receipt_no", t.receipt_no); return x.error ? toast(x.error.message) : done(); }
    if (b.dataset.rec) { const t = m.unrecorded[b.dataset.rec], day = (t.txn_time || "").slice(0, 10) || today(); let row, tb;
      if (t.paid_in > 0) { tb = "income"; row = { received_on: day, description: t.details, amount: t.paid_in, payment: "M-Pesa", mpesa_ref: t.receipt_no, income_type: "Other service", notes: "From M-Pesa statement — check the type" }; }
      else { tb = "expenses"; row = { spent_on: day, description: t.details, category: "Other", amount: t.withdrawn, payment: "M-Pesa", mpesa_ref: t.receipt_no, notes: "From M-Pesa statement — check the category" }; }
      const x = await db.from(tb).insert(row).select("id"); if (x.error) return toast(x.error.message);
      const id = Array.isArray(x.data) ? x.data[0].id : x.data.id;
      const y = await db.from("mpesa_txns").update({ matched_table: tb, matched_id: id }).eq("receipt_no", t.receipt_no); return y.error ? toast(y.error.message) : done(); } };
}


// ---- M-Pesa checkout (payment prompt to the customer's phone) ---------------------------------
const portalUrl = no => new URL("portal.html", (window.APP_CONFIG && APP_CONFIG.SITE_URL) || location.href).href.split("?")[0] + (no ? "?job=" + encodeURIComponent(no) : "");
async function invokeErr(res) { let msg = "Could not send the payment prompt."; try { const j = res.error && res.error.context ? await res.error.context.json() : res.data; if (j && j.message) msg = j.message; } catch (_) {} return msg; }
function mpayDialog(pre = {}) {
  const f = $("#dlgForm");
  f.innerHTML = `<h2>Request M-Pesa payment</h2><p style="color:var(--mut);margin-top:0">A prompt appears on the customer's phone. They enter their M-Pesa PIN to pay.</p><div class="grid">
    <label>Customer phone<input name="phone" value="${esc(pre.phone || "")}" required inputmode="tel" placeholder="07XX XXX XXX"></label>
    <label id="viaWrap">Take the payment through<select name="provider"><option value="daraja">M-Pesa (Safaricom Daraja)</option><option value="kopokopo" disabled>Kopo Kopo till (checking…)</option></select></label>
    <label>Amount (KES, whole shillings)<input name="amount" type="number" min="1" max="150000" step="1" value="${esc(pre.amount || "")}" required></label>
    <label>For (job card JC-0001, job J-001, or a short note)<input name="ref" value="${esc(pre.ref || "")}" maxlength="20"></label>
    <label>Description<input name="purpose" value="${esc(pre.purpose || "")}" maxlength="60"></label>
    <label class="full" style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="auto" ${pre.auto ? "checked" : ""} style="width:auto"> Record the payment in Income automatically when it succeeds (leave off for shop sales you record yourself)</label></div>
    <p id="mstat" class="msg" style="min-height:1.5em"></p>
    <div class="bar"><button class="btn" value="send" style="background:#12b76a">Send prompt</button><button class="btn ghost" value="cancel" formnovalidate>Close</button></div>`;
  // both services are always listed; one that is not set up yet is greyed out and says so
  const setVia = (ok, def) => { const sel = f.elements.provider; for (const o of sel.options) { const on = ok.includes(o.value); o.disabled = !on; o.textContent = (o.value === "daraja" ? "M-Pesa (Safaricom Daraja)" : "Kopo Kopo till") + (on ? "" : " — not set up yet"); } if (def && ok.includes(def)) sel.value = def; else if (!ok.includes(sel.value) && ok.length) sel.value = ok[0]; };
  setVia(["daraja"], "daraja"); f.elements.provider.options[1].textContent = "Kopo Kopo till (checking…)";
  db.functions.invoke("stk-push", { body: { action: "providers" } }).then(r => { const p = r.data && r.data.providers; setVia(p ? p.map(x => x.id) : ["daraja"], r.data && r.data.default); }).catch(() => setVia(["daraja"], "daraja"));
  f.onsubmit = async e => {
    if (e.submitter.value !== "send") { route(); return; }
    e.preventDefault(); const st = $("#mstat"), btn = e.submitter; btn.disabled = true; st.style.color = ""; st.textContent = "Sending…";
    const res = await db.functions.invoke("stk-push", { body: { phone: f.elements.phone.value, amount: Number(f.elements.amount.value), ref: f.elements.ref.value, purpose: f.elements.purpose.value, auto_record: f.elements.auto.checked, provider: f.elements.provider.value, customer_name: pre.name || "" } });
    if (res.error || !res.data || !res.data.ok) { st.style.color = "#b42318"; st.textContent = await invokeErr(res); btn.disabled = false; return; }
    st.textContent = "Prompt sent. Ask the customer to check their phone and enter their PIN…";
    const id = res.data.public_id;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, window.__POLL_MS__ || 3000));
      if (i === 14) await db.functions.invoke("stk-push", { body: { action: "check", public_id: id } });
      const q = await db.from("mpesa_requests").select("status,mpesa_receipt,result_desc").eq("public_id", id).single(); const s = q.data;
      if (!s) continue;
      if (s.status === "Success") { st.style.color = "#067647"; st.textContent = "Paid ✓ " + (s.mpesa_receipt ? "Receipt " + s.mpesa_receipt : "(receipt number will show on your statement)"); toast("Payment received"); return; }
      if (s.status === "Cancelled" || s.status === "Failed") { st.style.color = "#b42318"; st.textContent = (s.result_desc || "The payment did not go through.") + " You can send again."; btn.disabled = false; return; }
      if (s.status === "Review") { st.style.color = "#b54708"; st.textContent = "Money received but the amount differs from the request. Check the M-Pesa checkout list and your statement."; return; }
    }
    st.textContent = "No reply yet. Open M-Pesa checkout and press “Check” in a minute, or check your M-Pesa statement."; btn.disabled = false;
  };
  $("#dlg").showModal();
}
async function mpayPage() {
  const rows = must(await db.from("mpesa_requests").select("*").order("id", { ascending: false }).limit(60)) || [];
  $("#view").innerHTML = `<h2>M-Pesa checkout</h2><p style="color:var(--mut)">Send a payment prompt to a customer's phone. Prompts from repair and job rows are linked to that job card or job automatically.</p>
    <div class="bar"><button class="btn" id="np" style="background:#12b76a">+ New payment request</button></div>
    <div id="k2card"></div>
    <div class="wrap"><table><thead><tr><th>Time</th><th>Phone</th><th>Amount</th><th>For</th><th>Source</th><th>Via</th><th>Status</th><th>Receipt</th><th></th></tr></thead><tbody id="tb">
    ${rows.map((r, i) => `<tr><td>${esc(String(r.created_at).slice(0, 16).replace("T", " "))}</td><td>${esc(r.phone)}</td><td class="n">${kes(r.amount)}</td><td>${esc(r.ref || r.purpose || "")}</td><td>${esc(r.source)}</td><td>${r.provider === "kopokopo" ? "Kopo Kopo" : "Daraja"}</td>
    <td><span class="tag ${r.status === "Success" ? "ok" : r.status === "Pending" ? "" : "bad"}">${esc(r.status)}</span></td><td>${esc(r.mpesa_receipt || "")}</td>
    <td>${r.status === "Pending" ? `<button class="btn sm ghost" data-chk="${i}">Check</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="9">No payment requests yet.</td></tr>`}</tbody></table></div>`;
  $("#np").onclick = () => mpayDialog({});
  if (can("users.manage")) k2Card();
  $("#tb").onclick = async e => { const b = e.target.closest("[data-chk]"); if (!b) return; const r = await db.functions.invoke("stk-push", { body: { action: "check", public_id: rows[b.dataset.chk].public_id } });
    toast(r.error ? "Could not check" : "Status: " + (r.data?.status || "Pending")); route(); };
}

// Kopo Kopo: one-time "connect my till" for the owner (so every payment to the till appears on the M-Pesa reconcile page)
async function k2Card() {
  const box = $("#k2card"); if (!box) return;
  const r = await db.functions.invoke("stk-push", { body: { action: "k2_status" } });
  if (r.error || !r.data || !r.data.ok) { box.innerHTML = ""; return; }   // Kopo Kopo not set up: show nothing
  box.innerHTML = `<div class="card" style="margin:10px 0"><b>Kopo Kopo till ${esc(r.data.till)}</b> <span class="tag ${r.data.env === "production" ? "ok" : ""}">${esc(r.data.env)}</span>
    <p style="margin:6px 0;color:var(--mut)">Payment prompts can be sent through Kopo Kopo (choose it in the request form). To also list every payment customers make directly to your till, connect it once. Do this once per Kopo Kopo account, not each time.</p>
    <button class="btn sm" id="k2sub">Connect till payments</button> <span id="k2msg" class="msg"></span></div>`;
  $("#k2sub").onclick = async e => { e.target.disabled = true; $("#k2msg").textContent = "Connecting…";
    const x = await db.functions.invoke("stk-push", { body: { action: "k2_subscribe" } });
    if (x.error) { $("#k2msg").style.color = "#b42318"; $("#k2msg").textContent = await fnMsg(x); e.target.disabled = false; return; }
    $("#k2msg").style.color = "#067647"; $("#k2msg").textContent = (x.data && x.data.message) || "Connected."; };
}

// ---- SMS (owner) --------------------------------------------------------------------------
async function smsPage() {
  const tpl = must(await db.from("sms_templates").select("*").order("sort")) || [];
  const out = must(await db.from("sms_outbox").select("*").order("id", { ascending: false }).limit(60)) || [];
  const st = (await db.rpc("sms_auto_status")).data || {};
  const tagc = s => s === "Sent" ? "ok" : s === "Failed" ? "bad" : "";
  $("#view").innerHTML = `<h2>SMS messages</h2>
    <p style="color:var(--mut)">Customers get a text when their repair changes stage and when a payment is received. Messages that are switched off below are never sent. Texts are plain text (a logo cannot be sent by SMS; it is on the tracking page and on every printout).</p>
    <div class="card" style="margin-bottom:12px"><b>Automatic sending:</b> ${st.configured ? '<span class="tag ok">On</span>' : '<span class="tag bad">Not set up</span>'}
      &nbsp; Waiting: <b>${st.queued ?? "?"}</b> &nbsp; Failed: <b>${st.failed ?? "?"}</b> &nbsp; Auto-retry: ${st.pg_cron ? "every 5 min" : "off (use Retry)"}
      <div class="bar" style="margin-top:8px"><button class="btn" id="send">Send waiting now</button> <button class="btn ghost" id="retry">Retry failed</button> <button class="btn ghost" id="test">Send a test SMS</button> ${can("users.manage") ? `<button class="btn ghost" id="setup">${st.configured ? "Change" : "Set up"} automatic sending</button>` : ""}</div>
      ${st.pg_net === false ? '<small class="bad">Your database has no pg_net extension, so sending starts only when you press “Send waiting now”.</small>' : ""}</div>
    <h3>Messages</h3><div class="wrap"><table><thead><tr><th>Message</th><th>Text (use {name} {ticket} {item} {balance} {amount} {link} {phone} {shop}; for jobs {ticket} is the job number and {item} the job type)</th><th>On</th><th></th></tr></thead><tbody id="ttb">
    ${tpl.map((t, i) => `<tr><td>${esc(t.label)}</td><td><textarea data-b="${i}" rows="2" maxlength="300" style="width:100%">${esc(t.body)}</textarea></td><td><input type="checkbox" data-e="${i}" ${t.enabled ? "checked" : ""}></td><td><button class="btn sm" data-s="${i}">Save</button></td></tr>`).join("")}</tbody></table></div>
    <h3>Recent messages</h3><div class="wrap"><table><thead><tr><th>Time</th><th>To</th><th>For</th><th>Message</th><th>Status</th><th>Delivery</th></tr></thead><tbody>
    ${out.map(o => `<tr><td>${esc(String(o.created_at).slice(0, 16).replace("T", " "))}</td><td>${esc(o.phone || "")}</td><td>${esc(o.job_ref || o.kind || "")}</td><td>${esc(o.message)}</td><td><span class="tag ${tagc(o.status)}">${esc(o.status)}</span>${o.error ? `<br><small>${esc(o.error)}</small>` : ""}</td><td>${o.delivery === "Delivered" ? '<span class="tag ok">Delivered</span>' : o.delivery === "Undelivered" ? `<span class="tag bad">Not delivered</span>${o.delivery_note ? `<br><small>${esc(o.delivery_note)}</small>` : ""}` : o.status === "Sent" ? '<small style="color:var(--mut)">awaiting report</small>' : ""}</td></tr>`).join("") || '<tr><td colspan="6">No messages yet.</td></tr>'}</tbody></table></div>`;
  const inv = async (body, okMsg) => { const r = await db.functions.invoke("sms-send", { body }); if (r.error) { let m = r.error.message; try { m = (await r.error.context.json()).message || m; } catch (_) {} toast(m); } else toast(okMsg(r.data)); route(); };
  $("#send").onclick = () => inv({}, d => `Sent ${d?.sent ?? 0}, failed ${d?.failed ?? 0}`);
  $("#retry").onclick = async () => { const r = await db.rpc("sms_retry_failed"); if (r.error) return toast(r.error.message); toast(`${r.data} message(s) queued again`); inv({}, d => `Sent ${d?.sent ?? 0}, failed ${d?.failed ?? 0}`); };
  $("#test").onclick = () => { const p = prompt("Phone number to send a test SMS to (e.g. 0711 952 924):"); if (p) inv({ action: "test", phone: p }, () => "Test SMS sent"); };
  if ($("#setup")) $("#setup").onclick = () => {
    const sec = [...crypto.getRandomValues(new Uint8Array(20))].map(b => b.toString(16).padStart(2, "0")).join("");
    const dlg = document.createElement("dialog"); dlg.innerHTML = `<form method="dialog" style="display:grid;gap:10px;min-width:min(420px,86vw)"><b>Automatic sending</b>
      <label>sms-send function address<input name="u" required placeholder="https://YOUR-PROJECT.supabase.co/functions/v1/sms-send"></label>
      <label>Secret (also saved on the function as SMS_TRIGGER_SECRET)<input name="k" required value="${sec}" readonly></label>
      <small>Copy the secret, then run: <code>supabase secrets set SMS_TRIGGER_SECRET=${sec}</code>. See SMS_SETUP.md.</small><div class="bar"><button class="btn" value="ok">Save</button> <button class="btn ghost" value="cancel" formnovalidate>Cancel</button></div></form>`;
    document.body.appendChild(dlg); dlg.showModal();
    dlg.onclose = async () => { const f = dlg.querySelector("form"); const ok = dlg.returnValue === "ok"; const u = f.u.value.trim(), k = f.k.value; dlg.remove(); if (!ok) return;
      const r = await db.rpc("sms_auto_setup", { p_function_url: u, p_secret: k }); toast(r.error ? r.error.message : "Saved. Automatic sending is on."); route(); };
  };
  $("#ttb").onclick = async e => { const b = e.target.closest("[data-s]"); if (!b) return; const i = b.dataset.s;
    const r = await db.from("sms_templates").update({ body: $(`[data-b="${i}"]`).value, enabled: $(`[data-e="${i}"]`).checked }).eq("key", tpl[i].key); toast(r.error ? r.error.message : "Saved"); };
}

const genPw = () => { const al = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"; const b = crypto.getRandomValues(new Uint8Array(10)); return [...b].map(x => al[x % al.length]).join("") + "7"; };
const fnMsg = async r => { let m = r.error.message; try { m = (await r.error.context.json()).message || m; } catch (_) {} return m; };
function simpleDialog(html, onClose) {
  const dlg = document.createElement("dialog"); dlg.innerHTML = `<form method="dialog" style="display:grid;gap:10px;min-width:min(420px,86vw)">${html}</form>`;
  document.body.appendChild(dlg); dlg.showModal(); dlg.onclose = async () => { const f = dlg.querySelector("form"), v = dlg.returnValue; const vals = Object.fromEntries([...f.elements].filter(e => e.name).map(e => [e.name, e.value])); dlg.remove(); if (onClose) await onClose(v, vals); }; return dlg;
}
const siteBase = () => (APP_CONFIG.SITE_URL || (location.origin + location.pathname)).replace(/[#?].*$/, "").replace(/index\.html$/, "").replace(/\/?$/, "/");
const DELIVERY = [["link", "Email them a link so they choose their own password (recommended)"], ["email", "Email them a temporary password"], ["sms", "SMS them a temporary password"], ["show", "Send nothing: I will give them the details myself"]];
function showLogin(email, password, name, problem) {
  const text = `Franksomi Records login\nWebsite: ${siteBase()}\nEmail: ${email}\nTemporary password: ${password}\n(They will be asked to choose their own password when they first sign in.)`;
  const d = simpleDialog(`<b>${esc(name)}'s login is ready</b>${problem ? `<div class="notewarn">${esc(problem)}<br>Give them the details below yourself.</div>` : ""}<pre style="white-space:pre-wrap;background:#f4f6f8;padding:10px;border-radius:8px;margin:0">${esc(text)}</pre>
    <small>This password is shown only now. Copy it and give it to ${esc(name)} privately. It stops working for anything except choosing their own password.</small><div class="bar"><button class="btn" type="button" id="cp">Copy details</button> <button class="btn ghost" value="ok">Done</button></div>`);
  d.querySelector("#cp").onclick = async e => { try { await navigator.clipboard.writeText(text); e.target.textContent = "Copied ✓"; } catch (_) { e.target.textContent = "Select the text and copy it"; } };
}
function showLink(link, name, problem) {
  const d = simpleDialog(`<b>${esc(name)}'s sign-in link</b><div class="notewarn">${esc(problem)}<br>The account is created. Send them this link yourself (WhatsApp, for example).</div>
    <textarea readonly rows="4" style="width:100%">${esc(link)}</textarea><small>The link works once and expires soon. If it expires, use “New password” on their row to send a fresh one.</small>
    <div class="bar"><button class="btn" type="button" id="cp">Copy link</button> <button class="btn ghost" value="ok">Done</button></div>`);
  d.querySelector("#cp").onclick = async e => { try { await navigator.clipboard.writeText(link); e.target.textContent = "Copied ✓"; } catch (_) { e.target.textContent = "Select the link and copy it"; } };
}
// tell the owner what actually happened after the function answers
function afterDelivery(res, who) {
  const d = res.delivery, sentWhere = d === "sms" ? "by SMS" : "by email";
  if (d === "show") return showLogin(who.email, who.password, who.name);
  if (res.delivered) { simpleDialog(`<b>${d === "link" ? "Invitation sent" : "Details sent"} ✓</b><p style="margin:0">${esc(who.name)} was sent ${d === "link" ? "a sign-in link" : "a temporary password"} ${sentWhere}${d === "sms" ? "" : " (" + esc(who.email) + ")"}.</p>
      <small>${d === "link" ? "They open the link and choose their own password." : "They will be asked to choose their own password the first time they sign in."}</small><div class="bar"><button class="btn" value="ok">Done</button></div>`); return; }
  const problem = `Could not send ${sentWhere}: ${res.delivery_error || "unknown problem"}.`;
  if (d === "link") return showLink(res.link, who.name, problem);
  showLogin(who.email, who.password, who.name, problem);
}
// shared fields: how to deliver, optional phone, temporary password (hidden for the link way)
function deliveryFields(allowLink) {
  const opts = DELIVERY.filter(o => allowLink || o[0] !== "link");
  return `<label>How should they get their details?<select name="d">${opts.map(o => `<option value="${o[0]}">${esc(o[1])}</option>`).join("")}</select></label>
    <label id="phl">Phone number<input name="ph" type="tel" placeholder="0712 345 678" autocomplete="off"><small id="phh">Optional. Needed only to send an SMS.</small></label>
    <label id="pwl">Temporary password (8+ characters)<input name="p" required minlength="8" maxlength="72" value="${genPw()}" autocomplete="off"></label>`;
}
function wireDelivery(dlg) {
  const f = dlg.querySelector("form"), sync = () => { const v = f.d.value; f.p.disabled = v === "link"; $("#pwl", dlg).hidden = v === "link"; f.ph.required = v === "sms"; $("#phh", dlg).textContent = v === "sms" ? "Required for SMS." : "Optional. Needed only to send an SMS."; };
  f.d.onchange = sync; sync();
}
function addPersonDialog() {
  const dlg = simpleDialog(`<b>Add a person</b><label>Full name<input name="n" required maxlength="80"></label><label>Email (their login)<input name="e" type="email" required autocomplete="off"></label>
    <label>Role<select name="r">${ROLES.slice(1).map(r => `<option value="${r[0]}" ${r[0] === "sales" ? "selected" : ""}>${esc(r[1])}</option>`).join("")}</select></label>
    ${deliveryFields(true)}
    <small>Whichever way you choose, they must pick their own password before they can use anything.</small>
    <div class="bar"><button class="btn" value="ok">Create login</button> <button class="btn ghost" value="cancel" formnovalidate>Cancel</button></div>`, async (v, x) => {
    if (v !== "ok") return;
    const body = { action: "create", email: x.e, full_name: x.n, role: x.r, delivery: x.d, phone: x.ph, redirect_to: siteBase() }; if (x.d !== "link") body.password = x.p;
    toast("Creating the login…");
    const r = await db.functions.invoke("manage-users", { body });
    if (r.error) return toast(await fnMsg(r));
    afterDelivery(r.data || {}, { email: x.e.trim().toLowerCase(), password: x.p, name: x.n.trim() }); usersPage(); });
  wireDelivery(dlg);
}
function resetPwDialog(u) {
  const dlg = simpleDialog(`<b>New sign-in details for ${esc(u.full_name || u.email)}</b>
    ${deliveryFields(true).replace('placeholder="0712 345 678"', `placeholder="0712 345 678" value="${esc(u.phone || "")}"`)}
    <small>Their old password stops working. They must choose a new one of their own the next time they sign in.</small><div class="bar"><button class="btn" value="ok">Continue</button> <button class="btn ghost" value="cancel" formnovalidate>Cancel</button></div>`, async (v, x) => {
    if (v !== "ok") return; const body = { action: "reset_password", id: u.id, delivery: x.d, phone: x.ph, redirect_to: siteBase() }; if (x.d !== "link") body.password = x.p;
    toast("Working…"); const r = await db.functions.invoke("manage-users", { body });
    if (r.error) return toast(await fnMsg(r));
    afterDelivery(r.data || {}, { email: u.email, password: x.p, name: u.full_name || u.email }); usersPage(); });
  wireDelivery(dlg);
}
$("#chpw").onclick = () => simpleDialog(`<b>Change my password</b><label>New password (8+ characters)<input name="p" type="password" required minlength="8" maxlength="72" autocomplete="new-password"></label>
  <label>Type it again<input name="q" type="password" required autocomplete="new-password"></label><div class="bar"><button class="btn" value="ok">Change</button> <button class="btn ghost" value="cancel" formnovalidate>Cancel</button></div>`, async (v, x) => {
  if (v !== "ok") return; if (x.p !== x.q) return toast("The two passwords are not the same."); const r = await db.auth.updateUser({ password: x.p }); toast(r.error ? r.error.message : "Password changed"); });

// ---- users & roles (owner) ------------------------------------------------------------------
async function usersPage() {
  const us = must(await db.rpc("list_users")) || [];
  const defs = must(await db.from("perm_defs").select("*").order("sort")) || [];
  const rp = must(await db.from("role_perms").select("*")) || [];
  const ok = (r, p) => !!(rp.find(x => x.role === r && x.perm === p) || {}).allowed;
  const when = t => t ? String(t).slice(0, 16).replace("T", " ") : "never";
  const grps = [...new Set(defs.map(d => d.grp))], others = ROLES.slice(1);
  $("#view").innerHTML = `<h2>Users &amp; roles</h2>
    <div class="bar"><button class="btn" id="addp">+ Add a person</button></div><p style="color:var(--mut)">Each person has one role. The Owner sets what every role may do in the table below; the changes apply the next time that person opens or refreshes the app. The Owner always has every permission.</p>
    <h3>People</h3><div class="wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th><th>Last sign-in</th><th>Last action</th><th>Actions (7 days)</th><th></th></tr></thead><tbody id="utb">
    ${us.map((u, i) => `<tr><td><input data-n="${i}" value="${esc(u.full_name || "")}" style="width:150px">${u.must_change_password ? `<div><span class="badge">Has not chosen a password yet</span></div>` : ""}</td><td>${esc(u.email)}${u.phone ? `<div style="color:var(--mut);font-size:12px">${esc(u.phone)}</div>` : ""}</td>
      <td><select data-r="${i}">${ROLES.map(r => `<option value="${r[0]}" ${r[0] === u.role ? "selected" : ""}>${esc(r[1])}</option>`).join("")}</select></td>
      <td><input type="checkbox" data-a="${i}" ${u.active ? "checked" : ""}></td><td>${esc(when(u.last_sign_in_at))}</td><td>${esc(when(u.last_action))}</td><td class="n">${u.actions_7d}</td>
      <td><button class="btn sm" data-save="${i}">Save</button> <button class="btn sm ghost" data-pw="${i}">New password</button></td></tr>`).join("")}</tbody></table></div>
    <p style="color:var(--mut);font-size:13px"><b>Add a person</b> with the button above: you set their role and a temporary password, then give them the login details. Untick <i>Active</i> and Save to switch someone off at once (nothing is deleted, their history stays).</p>
    <h3>What each role is for</h3><div class="cards" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">${ROLES.map(r => `<div class="card"><b style="font-size:15px;display:block;margin:0">${esc(r[1])}</b><div style="color:var(--mut);font-size:13px;margin-top:4px">${esc(r[2])}</div></div>`).join("")}</div>
    <h3>Permissions by role</h3><p style="color:var(--mut);font-size:13px">Tick to allow, untick to block. Each tick saves immediately. <b>Reset</b> puts a role back to its starting permissions.</p>
    <div class="wrap"><table id="pm"><thead><tr><th>Permission</th><th>Owner</th>${others.map(r => `<th style="text-align:center">${esc(r[1])}<br><button class="btn sm ghost" data-reset="${r[0]}">Reset</button></th>`).join("")}</tr></thead><tbody>
    ${grps.map(g => `<tr><th colspan="${others.length + 2}" style="background:var(--navy);color:#fff;text-align:left">${esc(g)}</th></tr>` + defs.filter(d => d.grp === g).map(d => `<tr><td>${esc(d.label)}</td><td style="text-align:center">✓</td>
      ${others.map(r => d.perm === "users.manage" ? `<td style="text-align:center;color:var(--mut)">—</td>` : `<td style="text-align:center"><input type="checkbox" data-role="${r[0]}" data-perm="${d.perm}" ${ok(r[0], d.perm) ? "checked" : ""}></td>`).join("")}</tr>`).join("")).join("")}
    </tbody></table></div>`;
  $("#addp").onclick = addPersonDialog;
  $("#utb").onclick = async e => { const pw = e.target.closest("[data-pw]"); if (pw) return resetPwDialog(us[pw.dataset.pw]); const b = e.target.closest("[data-save]"); if (!b) return; const i = b.dataset.save, u = us[i];
    if (!confirm(`Save ${$(`[data-n="${i}"]`).value || u.email} as ${roleName($(`[data-r="${i}"]`).value)}${$(`[data-a="${i}"]`).checked ? "" : " (switched OFF)"}?`)) return;
    const r = await db.rpc("set_user", { p_id: u.id, p_name: $(`[data-n="${i}"]`).value, p_role: $(`[data-r="${i}"]`).value, p_active: $(`[data-a="${i}"]`).checked });
    if (r.error) toast(r.error.message); else { toast("Saved"); usersPage(); } };
  $("#pm").onchange = async e => { const c = e.target.closest("[data-perm]"); if (!c) return;
    const r = await db.rpc("set_role_perm", { p_role: c.dataset.role, p_perm: c.dataset.perm, p_allowed: c.checked });
    if (r.error) { c.checked = !c.checked; toast(r.error.message); } else toast("Saved"); };
  $("#pm").onclick = async e => { const b = e.target.closest("[data-reset]"); if (!b) return; if (!confirm(`Put ${roleName(b.dataset.reset)} back to the starting permissions?`)) return;
    const r = await db.rpc("reset_role_perms", { p_role: b.dataset.reset }); if (r.error) toast(r.error.message); else { toast("Reset"); usersPage(); } };
}

// ---- activity log: who did what (owner and anyone given the right) -----------------------------
async function auditPage() {
  const rows = must(await db.from("audit_log").select("*").order("id", { ascending: false }).limit(1000)) || [];
  const people = must(await db.from("profiles").select("id,full_name,role")) || [];
  const st = can("users.manage") ? (await db.rpc("list_users")).data || [] : [];
  const nm = id => (people.find(p => p.id === id) || {}).full_name || (id ? "user" : "system");
  const when = t => t ? String(t).slice(0, 16).replace("T", " ") : "never";
  const what = r => { const n = r.new_row || {}, o = r.old_row || {};
    if (r.tbl === "role_perms") return `${roleName(n.role || o.role)}: ${n.perm || o.perm} ${n.allowed ? "allowed" : "blocked"}`;
    if (r.tbl === "profiles" && r.op === "INSERT") return `account created as ${roleName(n.role)}`;
    if (r.tbl === "profiles" && r.op === "UPDATE") return [n.password_reset ? "password reset by owner" : "", n.role !== o.role ? `role ${roleName(o.role)} → ${roleName(n.role)}` : "", n.active !== o.active ? (n.active ? "switched on" : "switched off") : "", n.full_name !== o.full_name ? "name changed" : ""].filter(Boolean).join(", ") || "profile saved";
    if (r.op === "INSERT") return "added"; if (r.op === "DELETE") return "deleted";
    const ch = Object.keys(n).filter(k => JSON.stringify(n[k]) !== JSON.stringify(o[k])); return "changed " + ch.join(", "); };
  const tbls = [...new Set(rows.map(r => r.tbl))].sort();
  $("#view").innerHTML = `<h2>Activity log</h2><p style="color:var(--mut)">The last ${rows.length} changes: who added, changed or deleted what, including changes to users and permissions.</p>
    ${st.length ? `<h3>Staff</h3><div class="wrap"><table><thead><tr><th>Person</th><th>Role</th><th>Active</th><th>Last sign-in</th><th>Last action</th><th>Actions (7 days)</th></tr></thead><tbody>${st.map(u => `<tr><td>${esc(u.full_name || u.email)}</td><td>${esc(roleName(u.role))}</td><td>${u.active ? "yes" : "<b>OFF</b>"}</td><td>${esc(when(u.last_sign_in_at))}</td><td>${esc(when(u.last_action))}</td><td class="n">${u.actions_7d}</td></tr>`).join("")}</tbody></table></div>` : ""}
    <h3>Changes</h3><div class="bar"><select id="fu"><option value="">Everyone</option>${people.map(p => `<option value="${p.id}">${esc(p.full_name || "user")} (${esc(roleName(p.role))})</option>`).join("")}</select>
      <select id="ft"><option value="">All records</option>${tbls.map(t => `<option>${esc(t)}</option>`).join("")}</select><input id="fd" type="date" title="From date"><input id="fq" placeholder="Search…" style="max-width:200px"><button class="btn ghost" id="csv">Download CSV</button><span id="fc" style="color:var(--mut)"></span></div>
    <div class="wrap"><table><thead><tr><th>When</th><th>Who</th><th>Record</th><th>What</th></tr></thead><tbody id="atb"></tbody></table></div>`;
  let shown = [];
  const draw = () => { const u = $("#fu").value, t = $("#ft").value, d = $("#fd").value, q = $("#fq").value.toLowerCase();
    shown = rows.filter(r => (!u || r.by_user === u) && (!t || r.tbl === t) && (!d || String(r.at).slice(0, 10) >= d) && (!q || (nm(r.by_user) + r.tbl + r.row_id + what(r)).toLowerCase().includes(q)));
    $("#atb").innerHTML = shown.slice(0, 300).map(r => `<tr><td>${esc(when(r.at))}</td><td>${esc(nm(r.by_user))}</td><td>${esc(r.tbl)} #${esc(r.row_id)}</td><td>${esc(what(r))}</td></tr>`).join("") || `<tr><td colspan="4">Nothing matches.</td></tr>`;
    $("#fc").textContent = `${shown.length} found` + (shown.length > 300 ? " (first 300 shown; the CSV has all)" : ""); };
  ["fu", "ft", "fd"].forEach(i => $("#" + i).onchange = draw); $("#fq").oninput = draw; draw();
  $("#csv").onclick = () => { const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`; const csv = ["When,Who,Record,What"].concat(shown.map(r => [r.at, nm(r.by_user), r.tbl + " #" + r.row_id, what(r)].map(q).join(","))).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "activity-log.csv"; document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 2000); };
}

// ---- shell ------------------------------------------------------------------------
async function refreshLookups() {
  const li = must(await db.from("list_items").select("*").order("value")) || [];
  lists = { item_type: li.filter(x => x.kind === "item_type"), brand: li.filter(x => x.kind === "brand"), stock_type: li.filter(x => x.kind === "stock_type") };
  stockItems = must(await db.from("v_stock").select("id,code,description,on_hand").order("code")) || [];
  suppliers = must(await db.from("suppliers").select("id,name").order("name")) || [];
  catalog = (must(await db.from("service_catalog").select("*").order("name")) || []).filter(c => c.active !== false);
}
async function route() {
  const k = location.hash.slice(1) || "dashboard";
  document.querySelectorAll("#nav a").forEach(a => a.classList.toggle("on", a.dataset.k === k));
  $("#view").onclick = $("#view").onsubmit = null;
  const nv = NAV.find(n => n[0] === k) || (T[k] && [k, 0, T[k].perm + ".view"]);
  if (nv && nv[2] && !can(nv[2]) && !(k === "suppliers")) { $("#view").innerHTML = `<h2>Not allowed</h2><p>Your role (${esc(roleName(me.role))}) does not include this page. Ask the owner if you need it.</p>`; return; }
  const decorate = () => { const h = document.querySelector("#view > h2"); if (h) { const w = document.createElement("div"); w.className = "pagehead"; w.innerHTML = BRAND.icon(k, 22); h.replaceWith(w); w.appendChild(h); } };
  try { if (k === "dashboard") await dashboard(); else if (k === "lists") await listsPage(); else if (k === "docs") await docsPage(); else if (k === "eod") await eodPage(); else if (k === "monthly") await monthlyPage(); else if (k === "summary") await summaryPage();
    else if (k === "mpesa") await mpesaPage(); else if (k === "mpay") await mpayPage(); else if (k === "sms") await smsPage(); else if (k === "audit") await auditPage(); else if (k === "users") await usersPage(); else if (T[k]) await tablePage(k); decorate(); } catch (e) { console.error(e); }
}
async function start() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) { $("#app").hidden = true; $("#login").hidden = false; $("#gateForm").hidden = true; $("#loginForm").hidden = false; return; }
  const acc = await db.rpc("my_access");
  me = acc.data;
  if (me && me.active && me.must_change) return passwordGate(session);
  if (!me || !me.active) { await db.auth.signOut(); $("#app").hidden = true; $("#login").hidden = false; $("#gateForm").hidden = true; $("#loginForm").hidden = false; $("#loginMsg").textContent = "This account is switched off. Ask the owner."; return; }
  me.full_name = me.name;
  $("#login").hidden = true; $("#app").hidden = false; $("#gateForm").hidden = true; $("#loginForm").hidden = false;
  $("#who").textContent = `${me.full_name || session.user.email} · ${roleName(me.role)}`;
  $("#nav").innerHTML = navFor().map(([k, l]) => `<a href="#${k}" data-k="${k}">${BRAND.icon(k, 17)}${esc(l)}</a>`).join("");
  await refreshLookups(); route();
}
let lastLoginPw = "";
// shown instead of the app while the owner's temporary password / sign-in link is still the only thing they have
function passwordGate(session) {
  me = null; $("#app").hidden = true; $("#login").hidden = false; $("#loginForm").hidden = true; $("#gateForm").hidden = false; $("#gateMsg").textContent = "";
  $("#gateWho").textContent = `Signed in as ${session.user.email}. Before you start, set a password only you know.`; $("#gateForm").reset();
}
$("#gateForm").onsubmit = async e => { e.preventDefault(); const f = e.target, msg = $("#gateMsg"), p = f.p.value;
  if (p !== f.q.value) return void (msg.textContent = "The two passwords are not the same.");
  if (p.length < 8) return void (msg.textContent = "Use at least 8 characters.");
  if (lastLoginPw && p === lastLoginPw) return void (msg.textContent = "Choose a different password from the temporary one.");
  if (/^(12345678|password|qwerty12|11111111)/i.test(p)) return void (msg.textContent = "That password is too easy to guess.");
  msg.textContent = "Saving…"; const u = await db.auth.updateUser({ password: p });
  if (u.error) return void (msg.textContent = /same|different/i.test(u.error.message) ? "Choose a different password from the temporary one." : u.error.message);
  const ok = await db.rpc("password_changed");
  if (ok.error || ok.data !== true) return void (msg.textContent = "Your password was not saved. Please try again.");
  lastLoginPw = ""; start(); };
$("#gateOut").onclick = async () => { await db.auth.signOut(); lastLoginPw = ""; start(); };
$("#loginForm").onsubmit = async e => { e.preventDefault(); const f = e.target; const r = await db.auth.signInWithPassword({ email: f.email.value, password: f.password.value });
  if (r.error) $("#loginMsg").textContent = "Wrong email or password."; else { $("#loginMsg").textContent = ""; lastLoginPw = f.password.value; start(); } };
$("#logout").onclick = async () => { await db.auth.signOut(); location.hash = ""; start(); };
// a sign-in link that is expired or already used comes back with an error in the address
if (/error_description|otp_expired|access_denied/.test(location.hash)) { $("#loginMsg").textContent = "That sign-in link has expired or was already used. Ask the owner to send you a new one."; history.replaceState(null, "", location.pathname); }
window.addEventListener("hashchange", () => me && route());
start();
