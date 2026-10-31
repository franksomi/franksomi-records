// Franksomi Records — receives Safaricom's payment result and records the payment.
// Deploy WITHOUT JWT verification (Safaricom does not send one): supabase functions deploy mpesa-callback --no-verify-jwt
declare const Deno: any;

export type Deps = {
  env: (k: string) => string | undefined;
  fetch: typeof fetch;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>;
  now: () => Date;
};
const OK = () => new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), { headers: { "content-type": "application/json" } });
const base = (env: Deps["env"]) => (env("DARAJA_ENV") === "production" ? "https://api.safaricom.co.ke" : "https://sandbox.safaricom.co.ke");
const timestamp = (d: Date) => new Date(d.getTime() + 3 * 3600e3).toISOString().replace(/[-:T]/g, "").slice(0, 14);

// Ask Safaricom whether this payment really succeeded, so a forged callback cannot create income.
async function confirmed(d: Deps, checkout: string): Promise<boolean> {
  const key = d.env("DARAJA_CONSUMER_KEY"), secret = d.env("DARAJA_CONSUMER_SECRET"), sc = d.env("DARAJA_SHORTCODE"), pk = d.env("DARAJA_PASSKEY");
  if (!key || !secret || !sc || !pk) return false;
  const t = await d.fetch(base(d.env) + "/oauth/v1/generate?grant_type=client_credentials", { headers: { authorization: "Basic " + btoa(key + ":" + secret) } });
  const tj = await t.json().catch(() => ({})); if (!t.ok || !tj.access_token) return false;
  const ts = timestamp(d.now());
  const r = await d.fetch(base(d.env) + "/mpesa/stkpushquery/v1/query", { method: "POST", headers: { authorization: "Bearer " + tj.access_token, "content-type": "application/json" },
    body: JSON.stringify({ BusinessShortCode: sc, Password: btoa(sc + pk + ts), Timestamp: ts, CheckoutRequestID: checkout }) });
  const j = await r.json().catch(() => ({}));
  return r.ok && String(j.ResultCode) === "0";
}

// Ask the sms-send function to send anything waiting in the outbox (best effort; the SMS page can also send it).
async function kickSms(d: Deps) {
  const key = d.env("SUPABASE_SERVICE_ROLE_KEY"), url = d.env("SUPABASE_URL");
  if (!key || !url) return;
  try { await d.fetch(`${url}/functions/v1/sms-send`, { method: "POST", headers: { authorization: "Bearer " + key, "content-type": "application/json" }, body: "{}" }); } catch (_e) { /* ignore */ }
}

export async function handle(req: Request, d: Deps): Promise<Response> {
  const url = new URL(req.url);
  const token = d.env("CALLBACK_TOKEN");
  if (!token || url.searchParams.get("t") !== token) return new Response("forbidden", { status: 403 });
  let body: any; try { body = await req.json(); } catch { return OK(); }
  const cb = body?.Body?.stkCallback; if (!cb || !cb.CheckoutRequestID) return OK();
  const code = Number(cb.ResultCode);
  const items: any[] = cb.CallbackMetadata?.Item || [];
  const pick = (n: string) => items.find((i) => i.Name === n)?.Value;
  try {
    if (code === 0) {
      if (!(await confirmed(d, cb.CheckoutRequestID))) return OK();       // left Pending; staff can press "Check payment"
      await d.rpc("stk_complete", { p_checkout: cb.CheckoutRequestID, p_code: 0, p_desc: cb.ResultDesc || "", p_receipt: pick("MpesaReceiptNumber") ?? null, p_amount: pick("Amount") !== undefined ? Number(pick("Amount")) : null });
      await kickSms(d);                                                       // a "payment received" SMS may now be waiting
    } else {
      await d.rpc("stk_complete", { p_checkout: cb.CheckoutRequestID, p_code: code, p_desc: cb.ResultDesc || "", p_receipt: null, p_amount: null });
    }
  } catch (_e) { /* always acknowledge so Safaricom does not retry forever */ }
  return OK();
}

if (typeof Deno !== "undefined" && Deno.serve) {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.45.4");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  Deno.serve((req: Request) => handle(req, { env: (k) => Deno.env.get(k), fetch, now: () => new Date(), rpc: (fn, args) => admin.rpc(fn, args) as any }));
}
