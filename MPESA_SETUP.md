# M-Pesa payment prompts (STK push) and the customer tracking page

> Using a **Kopo Kopo** till instead of (or as well as) Safaricom Daraja? See `KOPOKOPO_SETUP.md`. Everything below about the customer page and staff screens applies to both.

What you get
- **Staff:** an "M-Pesa" button on every repair and job row, and an "M-Pesa checkout" page. A prompt appears on the customer's phone; they enter their PIN; the payment is recorded in Income automatically (linked to the job card or job) with its M-Pesa code.
- **Customers:** `portal.html` — no login. They type the job card number (JC-0001) and the phone number you recorded. They see the repair stage, your message, the bill and the balance, and can pay the balance with M-Pesa. The job card prints the address, and the "Send tracking link" button on a repair opens WhatsApp with the link ready to send.
- After 5 wrong tries on a job card it locks for an hour. The page never shows the surname, phone number, serial number or any of your costs.

## 1. Safaricom Daraja (the M-Pesa side)
1. Create an account at developer.safaricom.co.ke and add an app with the "Lipa na M-Pesa Sandbox" product. Copy its **Consumer Key** and **Consumer Secret**.
2. Sandbox testing uses shortcode **174379** and the passkey shown on the portal's STK Push simulator page. Test in sandbox first.
3. To take real money you must "Go Live" with Safaricom using your own **Paybill or Till (Buy Goods)** number. They give you production keys and a passkey. This approval is Safaricom's process: it can take days and I cannot do it for you.

## 2. Deploy the two functions (Supabase)
Install the Supabase CLI, then in this folder:
```
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase secrets set DARAJA_ENV=sandbox DARAJA_CONSUMER_KEY=... DARAJA_CONSUMER_SECRET=... DARAJA_SHORTCODE=174379 DARAJA_PASSKEY=... CALLBACK_TOKEN=make-up-a-long-random-string
supabase functions deploy stk-push
supabase functions deploy mpesa-callback --no-verify-jwt
```
- For a **Till** (Buy Goods): also set `DARAJA_TRANSACTION_TYPE=CustomerBuyGoodsOnline` and `DARAJA_TILL=your till number` (DARAJA_SHORTCODE is then the store/head-office number Safaricom gives you).
- To go live later: change `DARAJA_ENV=production` and the keys, shortcode and passkey. Nothing else changes.
- The callback address Safaricom calls is set for you: `https://YOUR-PROJECT-REF.supabase.co/functions/v1/mpesa-callback?t=YOUR-TOKEN`. Keep the token secret.

## 3. Website settings
In `config.js` set `SITE_URL` to your published address (e.g. https://franksomi.netlify.app/) so the printed job card and WhatsApp link show the right tracking page address.

## How it protects you
- Secrets (Safaricom keys, passkey) live only in Supabase, never in the website.
- A payment is recorded only after Safaricom confirms it: the callback is checked against Safaricom's own status query, so a forged callback cannot create income.
- A customer can only start a payment for their own balance, sent to the phone number you recorded for that job. Staff can send a prompt to any number (limit 5 per number per hour).
- Each prompt is recorded once, even if Safaricom calls back twice. If the amount received differs from the request it is marked "Review" instead of recorded.
- If no reply arrives, press "Check" on the M-Pesa checkout page. If the customer paid but nothing shows, the payment will appear on your statement under "M-Pesa reconcile" as not recorded.

## Staff: moving a repair along
Edit the repair, set "Repair stage" and optionally "Message to customer". Each change is added to the customer's timeline. Setting the stage to Collected (or entering a Date returned) closes the repair.

## What is not included
- Automatic SMS is covered in SMS_SETUP.md.
- Receipts for card/bank payments. Refunds through M-Pesa (reversals) must be done in your M-Pesa portal.
