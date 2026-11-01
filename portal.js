"use strict";
// Customer tracking page: no login. The customer proves who they are with the job card number + the phone number on file.
(function (root) {
  const MAIN = ["Received", "Diagnosing", "Repairing", "Testing", "Ready for collection", "Collected"];
  const EXPLAIN = {
    "Received": "We have your device.", "Diagnosing": "We are finding out what is wrong.", "Waiting for approval": "We need your OK on the price before we continue.",
    "Waiting for parts": "We are waiting for a spare part to arrive.", "Repairing": "The repair is under way.", "Testing": "We are testing that everything works.",
    "Ready for collection": "Your device is ready. Please come and collect it with your receipt.", "Collected": "Collected. Thank you for choosing us!" };
  const MAIN_JOB = ["Booked", "Site visit", "Quote sent", "In progress", "Testing", "Completed"];
  const EXPLAIN_JOB = {
    "Booked": "Your job is booked. We will contact you to arrange the next step.", "Site visit": "We are visiting or planning the site visit.", "Quote sent": "We have sent you our quote. We start once you approve it.",
    "Waiting for materials": "We are waiting for materials or equipment to arrive.", "In progress": "The work is under way.", "Testing": "We are testing and checking everything.",
    "On hold": "The job is paused for now. We will tell you when work continues.", "Completed": "The job is complete. Thank you for choosing us!" };
  function buildSteps(stage, updates, kind) {
    const seen = new Set((updates || []).map(u => u.stage)); seen.add(stage);
    const steps = [];
    if (kind === "job") {
      for (const s of MAIN_JOB) { if (s === "In progress") { if (seen.has("Waiting for materials")) steps.push("Waiting for materials"); if (seen.has("On hold")) steps.push("On hold"); } steps.push(s); }
      const cur = steps.indexOf(stage);
      return steps.map((s, i) => ({ name: s, state: i < cur ? "done" : i === cur ? "cur" : "todo", text: EXPLAIN_JOB[s] }));
    }
    for (const s of MAIN) { steps.push(s); if (s === "Diagnosing") { if (seen.has("Waiting for approval")) steps.push("Waiting for approval"); if (seen.has("Waiting for parts")) steps.push("Waiting for parts"); } }
    const cur = steps.indexOf(stage);
    return steps.map((s, i) => ({ name: s, state: i < cur ? "done" : i === cur ? "cur" : "todo", text: EXPLAIN[s] }));
  }
  const kes = v => Number(v || 0).toLocaleString("en-KE", { maximumFractionDigits: 0 });
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const api = { buildSteps, MAIN, MAIN_JOB };
  if (typeof module !== "undefined") { module.exports = api; return; }
  if (typeof document === "undefined") return;
  const $ = s => document.querySelector(s);
  const db = window.__MOCK_DB__ || supabase.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  let creds = null;

  function show(r) {
    const isJob = r.kind === "job", steps = buildSteps(r.stage, r.updates, isJob ? "job" : "repair");
    const when = iso => new Date(iso).toLocaleString("en-KE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    const lastAt = {}; (r.updates || []).forEach(u => { if (!lastAt[u.stage] || u.at > lastAt[u.stage]) lastAt[u.stage] = u.at; });
    $("#out").innerHTML = `<div id="statusdoc"><div class="pdfhead" style="display:flex;align-items:center;gap:10px;padding:6px 2px"><img src="logo.png" alt="" height="34"><div><b>Franksomi Solution Ltd</b><br><small>${isJob ? "Job status" : "Repair status"} · ${esc(new Date().toLocaleDateString("en-KE"))} · Tel 0711 952 924</small></div></div><div class="card"><small>Hello ${esc(r.first_name)} — ${esc(r.job_no)}</small><div class="big">${esc(r.stage)}</div><div>${esc(r.item)}</div>
      ${BRAND.track(steps)}
      <small>${isJob ? "Started" : "Received"} ${esc(r.received_on)}${r.returned_on ? (isJob ? " · completed " : " · collected ") + esc(r.returned_on) : ""}</small>
      ${r.note ? `<div class="note">${esc(r.note)}</div>` : ""}
      <ul class="steps">${steps.map(s => `<li class="${s.state}"><span>${esc(s.name)}<small>${s.state === "cur" ? esc(s.text) : ""}${lastAt[s.name] && s.state !== "todo" ? " " + esc(when(lastAt[s.name])) : ""}</small></span></li>`).join("")}</ul></div>
      <div class="card" style="margin-top:12px"><b>Your bill</b>
        <div class="row"><span>${isJob ? "Contract price" : "Total (parts + labour)"}</span><b>KES ${kes(r.total)}</b></div>
        ${Number(r.deposit_held) > 0 ? `<div class="row"><span>Refundable deposit we hold</span><b>KES ${kes(r.deposit_held)}</b></div>` : ""}
        <div class="row"><span>Paid so far</span><b>KES ${kes(r.paid)}</b></div>
        <div class="row"><span>Balance to pay</span><b id="bal">KES ${kes(r.balance_due)}</b></div>
        ${Number(r.balance_due) > 0 ? `<div class="noprint" style="margin-top:12px;display:grid;gap:8px"><label>Amount to pay now (KES)<input id="amt" type="number" min="1" max="${Math.floor(r.balance_due)}" step="1" value="${Math.floor(r.balance_due)}"></label>
        <button class="btn" id="pay" style="background:#12b76a">Pay with M-Pesa</button><small style="color:var(--mut)">A payment prompt is sent to the phone number we have for this job. Enter your M-Pesa PIN to confirm.</small><p id="pmsg" class="msg"></p></div>` : `<p class="ok">Nothing left to pay. Thank you!</p>`}
      </div><p class="copy" style="padding:8px">© ${new Date().getFullYear()} Franksomi Solution Ltd. All rights reserved.</p></div><p style="text-align:center"><button class="btn ghost" id="pdfbtn" type="button">Download status as PDF</button> <small id="pdfmsg" style="display:block;color:var(--mut)"></small></p>`;
    $("#out").hidden = false;
    $("#pdfbtn").onclick = async () => { const m = $("#pdfmsg"); m.textContent = "Making the PDF…"; try { await PDF.download($("#statusdoc"), r.job_no + (isJob ? " Franksomi job status.pdf" : " Franksomi repair status.pdf")); m.textContent = "Saved."; } catch (e) { console.error(e); m.textContent = "Your browser could not make the PDF. Use your browser menu → Print → Save as PDF."; } };
    const pay = $("#pay"); if (pay) pay.onclick = () => startPay(Number($("#amt").value));
  }

  async function lookup(job, phone) {
    $("#err").textContent = "";
    const r = await db.rpc("portal_lookup", { p_job: job, p_phone: phone });
    if (r.error) { $("#err").textContent = "Something went wrong. Please try again."; return; }
    const d = r.data;
    if (d.error === "locked") { $("#err").textContent = "Too many wrong tries. Please wait an hour, or call the shop."; return; }
    if (d.error) { $("#err").textContent = "We could not find that job with that phone number. Check the number on your receipt or job card."; return; }
    creds = { job, phone }; show(d);
  }

  async function startPay(amount) {
    const m = $("#pmsg"), btn = $("#pay"); m.className = "msg"; m.textContent = "";
    if (!(amount >= 1)) { m.className = "msg bad"; m.textContent = "Enter an amount."; return; }
    btn.disabled = true; m.textContent = "Sending the prompt to your phone…";
    const res = await db.functions.invoke("stk-push", { body: { job: creds.job, phone: creds.phone, amount } });
    if (res.error || !res.data || !res.data.ok) {
      let msg = "We could not start the payment. Please try again or pay at the shop.";
      try { const j = res.error && res.error.context ? await res.error.context.json() : res.data; if (j && j.message) msg = j.message; } catch (_) {}
      m.className = "msg bad"; m.textContent = msg; btn.disabled = false; return;
    }
    m.textContent = "Check your phone and enter your M-Pesa PIN…";
    const id = res.data.public_id;
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, root.__POLL_MS__ || 3000));
      if (i === 14) await db.functions.invoke("stk-push", { body: { action: "check", public_id: id } });
      const s = await db.rpc("pay_status", { p_public: id }); const st = s.data && s.data.status;
      if (st === "Success") { m.className = "msg ok"; m.textContent = "Payment received" + (s.data.receipt ? " (" + s.data.receipt + ")" : "") + ". Thank you!"; await lookup(creds.job, creds.phone); return; }
      if (st === "Cancelled" || st === "Failed") { m.className = "msg bad"; m.textContent = (s.data.message || "The payment did not go through.") + " You can try again."; btn.disabled = false; return; }
      if (st === "Review") { m.textContent = "We received your payment and will confirm it shortly."; return; }
    }
    m.textContent = "We did not get a reply yet. If money was taken from your M-Pesa, the shop will confirm it. You can also check again in a minute."; btn.disabled = false;
  }

  $("#f").onsubmit = e => { e.preventDefault(); lookup(e.target.job.value.trim(), e.target.phone.value.trim()); };
  const q = new URLSearchParams(location.search); if (q.get("job")) $("#f").job.value = q.get("job");
})(typeof window !== "undefined" ? window : globalThis);
