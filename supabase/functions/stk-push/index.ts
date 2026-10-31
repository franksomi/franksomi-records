// Franksomi Records — sends an M-Pesa payment prompt (STK push) to a customer's phone, and checks on it.
// Runs on Supabase Edge Functions (Deno). Secrets are set in Supabase, never in the website. See MPESA_SETUP.md.
declare const Deno: any;

export type Deps = {
  env: (k: string) => string | undefined;
  fetch: typeof fetch;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
  getUser: (jwt: string) => Promise<string | null>;
  now: () => Date;
};

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type", "access-control-allow-methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

export const baseUrl = (env: Deps["env"]) => (env("DARAJA_ENV") === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke");
export const timestamp = (d: Date) => new Date(d.getTime() + 3 * 3600e3).toISOString().replace(/[-:T]/g, "").slice(0, 14); // Nairobi time YYYYMMDDHHmmss
export const password = (shortcode: string, passkey: string, ts: string) => btoa(shortcode + passkey + ts);

async function accessToken(d: Deps): Promise<string> {
  const key = d.env("DARAJA_CONSUMER_KEY"), secret = d.env("DARAJA_CONSUMER_SECRET");
  if (!key || !secret) throw new Error("Daraja keys are not set");
  const r = await d.fetch(baseUrl(d.env) + "/oauth/v1/generate?grant_type=client_credentials", { headers: { authorization: "Basic " + btoa(key + ":" + secret) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("Could not get a Safaricom access token");
  return j.access_token;
}

const MESSAGES: Record<string, string> = {
  not_found: "We could not find that job card with that phone number.", locked: "Too many wrong tries. Please wait an hour or ask the shop.",
  bad_phone: "That phone number is not a valid Safaricom number.", bad_amount: "The amount must be a whole number of shillings.",
  too_many: "Too many payment prompts to this number. Please wait before trying again.", more_than_due: "That is more than the balance due.",
  pending: "A payment prompt was just sent. Please check your phone.", no_phone_on_file: "The shop has no phone number on file for this job.", not_allowed: "Not allowed.",
};

export async function handle(req: Request, d: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let body: any; try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const userId = jwt ? await d.getUser(jwt) : null;
  const shortcode = d.env("DARAJA_SHORTCODE"), passkey = d.env("DARAJA_PASSKEY");
  if (!shortcode || !passkey) return json({ error: "not_configured", message: "M-Pesa payments are not set up yet." }, 503);

  if (body.action === "check") {
    const f = await d.rpc("stk_find", { p_public: String(body.public_id || "") });
    const q = f.data;
    if (f.error || !q || q.status === "Unknown") return json({ status: "Unknown" });
    if (q.status !== "Pending") return json({ status: q.status });
    try {
      const ts = timestamp(d.now()), tok = await accessToken(d);
      const r = await d.fetch(baseUrl(d.env) + "/mpesa/stkpushquery/v1/query", { method: "POST", headers: { authorization: "Bearer " + tok, "content-type": "application/json" },
        body: JSON.stringify({ BusinessShortCode: shortcode, Password: password(shortcode, passkey, ts), Timestamp: ts, CheckoutRequestID: q.checkout }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ResultCode !== undefined) {
        const code = Number(j.ResultCode);
        const c = await d.rpc("stk_complete", { p_checkout: q.checkout, p_code: code, p_desc: j.ResultDesc || "", p_receipt: null, p_amount: code === 0 ? q.amount : null });
        return json({ status: c.data?.status === "already" ? c.data.current : c.data?.status || "Pending" });
      }
    } catch (_e) { /* fall through: still pending */ }
    return json({ status: "Pending" });
  }

  // ---- send a prompt ----
  const source = userId ? "staff" : "portal";
  const amount = Number(body.amount);
  const auth = userId
    ? await d.rpc("stk_authorize_staff", { p_user: userId, p_phone: String(body.phone || ""), p_amount: amount })
    : await d.rpc("stk_authorize_portal", { p_job: String(body.job || ""), p_phone: String(body.phone || ""), p_amount: amount });
  const a = auth.data;
  if (auth.error || !a || !a.ok) { const code = a?.error || "not_allowed"; return json({ error: code, message: MESSAGES[code] || "Not allowed." }, code === "too_many" || code === "locked" ? 429 : 400); }

  const ref = String(userId ? (body.ref || "Payment") : a.ref).replace(/[^\w\- ]/g, "").slice(0, 20) || "Payment";
  const purpose = String(userId ? (body.purpose || "M-Pesa payment") : a.purpose).slice(0, 60);
  const auto = userId ? !!body.auto_record : true;
  const till = d.env("DARAJA_TRANSACTION_TYPE") === "CustomerBuyGoodsOnline";
  const cbToken = d.env("CALLBACK_TOKEN");
  const supaUrl = d.env("SUPABASE_URL");
  if (!cbToken || !supaUrl) return json({ error: "not_configured", message: "M-Pesa payments are not set up yet." }, 503);
  try {
    const ts = timestamp(d.now()), tok = await accessToken(d);
    const r = await d.fetch(baseUrl(d.env) + "/mpesa/stkpush/v1/processrequest", { method: "POST", headers: { authorization: "Bearer " + tok, "content-type": "application/json" },
      body: JSON.stringify({ BusinessShortCode: shortcode, Password: password(shortcode, passkey, ts), Timestamp: ts, TransactionType: till ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline",
        Amount: amount, PartyA: a.phone, PartyB: till ? (d.env("DARAJA_TILL") || shortcode) : shortcode, PhoneNumber: a.phone,
        CallBackURL: `${supaUrl}/functions/v1/mpesa-callback?t=${encodeURIComponent(cbToken)}`, AccountReference: ref.slice(0, 12), TransactionDesc: purpose.slice(0, 13) || "Payment" }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || String(j.ResponseCode) !== "0" || !j.CheckoutRequestID) return json({ error: "daraja", message: j.errorMessage || j.ResponseDescription || "Safaricom did not accept the request." }, 502);
    const reg = await d.rpc("stk_register", { p_source: source, p_user: userId, p_phone: a.phone, p_amount: amount, p_ref: ref, p_purpose: purpose, p_auto: auto, p_merchant: j.MerchantRequestID || null, p_checkout: j.CheckoutRequestID });
    if (reg.error) return json({ error: "save_failed", message: "The prompt was sent but could not be saved. Check your M-Pesa statement." }, 500);
    return json({ ok: true, public_id: reg.data.public_id, message: j.CustomerMessage || "Prompt sent. Ask the customer to enter their M-Pesa PIN." });
  } catch (e) {
    return json({ error: "daraja", message: "Could not reach Safaricom: " + (e instanceof Error ? e.message : "error") }, 502);
  }
}

if (typeof Deno !== "undefined" && Deno.serve) {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.4");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  Deno.serve((req: Request) => handle(req, {
    env: (k) => Deno.env.get(k), fetch, now: () => new Date(),
    rpc: (fn, args) => admin.rpc(fn, args) as any,
    getUser: async (jwt) => { const { data, error } = await admin.auth.getUser(jwt); return error ? null : (data.user?.id ?? null); },
  }));
}
