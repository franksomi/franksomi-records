"use strict";
// The page that opens in a new tab when you press Print on a job card, quotation, invoice, receipt or report.
// app.js leaves the finished document in localStorage for a moment; this page picks it up, shows Print / Download PDF, and forgets it.
(function () {
  const root = document.getElementById("pdoc");
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  let job = null;
  try {
    const raw = localStorage.getItem("fk_print");
    if (raw) { sessionStorage.setItem("fk_print_tab", raw); localStorage.removeItem("fk_print"); }   // keep a copy for this tab so a reload still works
    job = JSON.parse(raw || sessionStorage.getItem("fk_print_tab") || "null");
  } catch (_) { job = null; }
  if (!job || !job.html) {
    root.innerHTML = `<p>There is nothing to print here. Go back to Franksomi Records and press Print again.</p><p><button class="btn pbtn" id="shut">Close this tab</button></p>`;
    document.getElementById("shut").onclick = () => window.close();
    return;
  }
  const name = job.filename || "Franksomi document.pdf";
  document.title = name.replace(/\.pdf$/i, "");     // the browser uses this as the file name when you choose "Save as PDF"
  root.innerHTML = `<div class="noprint doctools"><button class="btn pbtn" data-act="print">Print</button> <button class="btn pdfbtn" data-act="pdf">Download PDF</button>
    <button class="btn ghost" data-act="close">Close tab</button><span id="pdfmsg"></span></div>${job.html}`;
  document.getElementById("pdoc").onclick = async e => {
    const b = e.target.closest("button[data-act]"); if (!b) return;
    const m = document.getElementById("pdfmsg");
    if (b.dataset.act === "print") window.print();
    if (b.dataset.act === "close") { window.close(); setTimeout(() => { m.textContent = "You can close this tab now."; }, 300); }
    if (b.dataset.act === "pdf") {
      b.disabled = true; m.textContent = "Making the PDF…";
      try { await PDF.download(document.getElementById("docbody"), name); m.textContent = "PDF saved: " + name; }
      catch (err) { console.error(err); m.textContent = "This browser could not make the PDF directly. In the Print window choose “Save as PDF”."; window.print(); }
      b.disabled = false;
    }
  };
})();
