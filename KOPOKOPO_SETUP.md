# Kopo Kopo till alongside Safaricom Daraja

What you get
- **Payment prompts through Kopo Kopo.** On the M-Pesa checkout form (and the M-Pesa button on a repair or job), staff choose "Kopo Kopo till" or "M-Pesa (Safaricom Daraja)". The customer page uses the default (see `PAY_DEFAULT` below). Everything else works exactly as with Daraja: the payment is recorded in Income against the job card only after it has succeeded.
- **Every payment to your till listed automatically.** Whether a customer pays by prompt or by typing your till number themselves, it appears on **M-Pesa reconcile** as it happens, with their name and phone. Matching ones tick off against the income you recorded; the rest have a one-click "Record" button. These payments are listed, never turned into income by themselves, because the app cannot know which job card a walk-in payment is for.
- Daraja keeps working. You can use one, the other, or both.

## 1. In your Kopo Kopo account
1. Open **K2 Connect** (the page you sent me) → **View OAuth Applications** → create an application. Do the **sandbox** first at sandbox.kopokopo.com, then repeat on the real site when you go live.
2. Copy the application's **Client ID** and **Client Secret** (and the **API key**, if the application page shows one).
3. Make sure your till is allowed to receive payment prompts (STK). If prompts are refused with a message about the till, ask Kopo Kopo support to enable it.
4. Note your **till number** (or your Online Payments account number, which starts with a K).

## 2. Add the secrets in Supabase (Edge Functions → Secrets)
| Name | Value |
|---|---|
| `K2_ENV` | `sandbox` while testing, `production` when live |
| `K2_CLIENT_ID` | from the OAuth application |
| `K2_CLIENT_SECRET` | from the OAuth application |
| `K2_API_KEY` | from the application, if shown (optional) |
| `K2_TILL` | your till number or K-account number |
| `CALLBACK_TOKEN` | a long random string. If Daraja is already set up, it is already there: leave it |
| `PAY_DEFAULT` | optional: `kopokopo` or `daraja`. Which one the customer page and the form start with. If you leave it out, Daraja is used when it is set up, otherwise Kopo Kopo |
| `K2_BASE_URL` | optional: only if Kopo Kopo gives you a different production address than `https://api.kopokopo.com` |

(Command line: `supabase secrets set K2_ENV=sandbox K2_CLIENT_ID=... K2_CLIENT_SECRET=... K2_TILL=...`)

## 3. Deploy two functions
- `stk-push`: replace its code with the new `edge_functions/stk-push/index.ts` and deploy (JWT verification **on**, as before).
- `k2-webhook`: new. Create it from `edge_functions/k2-webhook/index.ts` and deploy with JWT verification **OFF** (Kopo Kopo does not send a Supabase login). Command line: `supabase functions deploy k2-webhook --no-verify-jwt`.

## 4. Connect the till (once per environment)
Sign in as the owner → **M-Pesa checkout**. A **Kopo Kopo till** box appears. Press **Connect till payments**. This tells Kopo Kopo to notify your system of every payment to the till. Sandbox and production are separate: press it again after you switch to production.

## 5. Test in the sandbox
1. M-Pesa checkout → New payment request → choose "Kopo Kopo till" → use a Kopo Kopo sandbox phone number and a small amount. Watch it go to Paid ✓ and appear in Income.
2. Make a sandbox till payment (Kopo Kopo's sandbox lets you simulate one) and check it appears on M-Pesa reconcile.
3. Go live: create the production OAuth application, change `K2_ENV`, the Client ID/Secret and the till number, and press **Connect till payments** again.

## How it protects you
- Your Kopo Kopo secrets live only in Supabase, never in the website.
- A prompt payment is recorded **only after the app asks Kopo Kopo itself and Kopo Kopo says it succeeded**. A message that merely claims success cannot create income. The address Kopo Kopo calls also contains your secret `CALLBACK_TOKEN`.
- Till payment messages must carry Kopo Kopo's signature (`X-KopoKopo-Signature`, checked with your client secret or API key) and your token; anything else is refused.
- The same payment arriving twice (or arriving as both a prompt result and a till payment) is recorded once, by its M-Pesa receipt number. If the amount received differs from the request, it is marked "Review" instead of recorded.

## If something does not work
- **"Could not get a Kopo Kopo access token":** wrong Client ID/Secret, or `K2_ENV` does not match where you created the application.
- **"Kopo Kopo did not accept the request":** the message shown is Kopo Kopo's own reason (often the till or the phone number). Fix that and try again.
- **Prompts work but till payments never appear:** press Connect till payments again; then in Supabase → Edge Functions → `k2-webhook` → Logs look for "bad signature" (403). Kopo Kopo's guide names both the API key and the client secret as the signing key; add `K2_API_KEY` if you have not. For testing only you can set `K2_SIGNATURE=off`; remove it afterwards.
- **Production address:** the app uses `https://api.kopokopo.com` for production, which I could not confirm in their public guide (it only shows the sandbox address). Your production OAuth application page will show the correct one; if different, set `K2_BASE_URL`.
- The prompt result takes a few seconds; if the customer paid and nothing shows, press **Check** on the M-Pesa checkout list.
