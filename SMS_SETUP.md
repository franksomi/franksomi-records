# Automatic SMS notifications — setup

Customers get a text when their repair moves to a new stage (Received, Waiting for approval, Ready for collection, Collected are ON by default; the others are off) and when a payment is recorded. You can switch each message on or off and edit its words in the app: **SMS messages** (Owner only). Tick **“Do NOT send this customer SMS updates”** on a repair to stop texts for that customer.

SMS is plain text: a logo cannot be sent. The logo is on the tracking page the text links to, and on every printout and PDF.

## 1. Africa's Talking account (the SMS provider)
1. Sign up at africastalking.com, create an app, and top up airtime/credit (each SMS costs a few shillings).
2. Note your **username** and create an **API key** (Settings -> API Key).
3. Optional: apply for a **sender ID** (e.g. FRANKSOMI). Approval takes days. Until then, leave it blank and messages go from the shared number.
4. To rehearse for free use username `sandbox` and AT_ENV=sandbox (anything other than `production` uses the simulator) (messages go to the simulator only).

## 2. Deploy the sending function
```
supabase functions deploy sms-send --no-verify-jwt
supabase secrets set AT_USERNAME=yourname AT_API_KEY=xxxx AT_ENV=production AT_SENDER_ID=FRANKSOMI SITE_URL=https://your-site.netlify.app
supabase secrets set SMS_TRIGGER_SECRET=<the secret the app shows you in step 3>
```
(Leave AT_SENDER_ID out if you have none. SITE_URL is used for the tracking link in the text.)

## 3. Switch on automatic sending
In the app: SMS messages -> **Set up automatic sending**. Paste the function address (`https://YOUR-PROJECT.supabase.co/functions/v1/sms-send`). The app shows a secret: run the `supabase secrets set SMS_TRIGGER_SECRET=...` line it gives you, then Save.
Needs the **pg_net** extension (Supabase: Database -> Extensions). **pg_cron** is optional and retries failed messages every 5 minutes. Without them you can still press **Send waiting now**.

## 4. Test
Press **Send a test SMS** and enter your own number. Then change a repair's stage and watch the message appear under Recent messages as Sent.

## Notes
- Numbers must be Kenyan (07xx / 01xx / +254). Anything else is marked Failed with the reason.
- The same message is not queued twice within 2 minutes.
- Failed messages stay listed with the reason; **Retry failed** sends them again.
- This was tested against a simulated Africa's Talking and a real Postgres, not the live service: do step 4 before relying on it.
