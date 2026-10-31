# Sending new users their login by email or SMS (one-time setup, about 15 minutes)

The "Add a person" and "New password" screens can send the details by **email** (from your Gmail) or **SMS** (Africa's Talking), or just show them on screen. Nothing needs to be set up if you only use "Send nothing". The Supabase built-in email settings are **not used**.

## 1. Gmail (for the two email ways)
1. Sign in to the Gmail account that will send the emails (for example franksomi@gmail.com).
2. Turn on **2-Step Verification**: myaccount.google.com → Security → 2-Step Verification.
3. Create an **App password**: myaccount.google.com/apppasswords → name it "Franksomi Records" → copy the 16 letters (Google shows them in groups of four; spaces don't matter).
4. Supabase → **Edge Functions → Secrets** (or Project Settings → Edge Functions) → add two secrets:
   - `GMAIL_USER` = the Gmail address
   - `GMAIL_APP_PASSWORD` = the 16-letter app password
   (Command line instead: `supabase secrets set GMAIL_USER=you@gmail.com GMAIL_APP_PASSWORD=abcdefghijklmnop`)

Emails come from that Gmail address with the name "Franksomi Solution Ltd". A normal Gmail account can send about 500 emails a day, far more than you need. The first email to a new person may land in their Spam folder; ask them to mark it "Not spam".

## 2. SMS (for the SMS way)
Uses the same Africa's Talking secrets as the customer SMS (`AT_USERNAME`, `AT_API_KEY`, `AT_ENV`, optional `AT_SENDER_ID`); see `SMS_SETUP.md`. If customer SMS already works, this works.

## 3. Deploy the updated function
Supabase → Edge Functions → `manage-users` → open it, replace the code with `edge_functions/manage-users/index.ts` from the update, **Deploy**. Leave "Verify JWT" on. (Command line: `supabase functions deploy manage-users`.)

## 4. Tell Supabase your website address (for the email link way)
Authentication → **URL Configuration**: set **Site URL** to your website address (for example https://franksomi.netlify.app) and add the same address under **Redirect URLs**.
Optional but useful: Authentication → Sign In / Providers → Email → **Email OTP expiration**: raise it from 1 hour to 24 hours (86400 seconds) so people can open their link the next day. A used or expired link just shows "expired"; use **New password** → email a link to send a fresh one.

## 5. Test it
Users & roles → **+ Add a person** with a second email address you own, choose "Email them a link", and check it arrives and that the link asks you to choose a password. Then try the SMS way with your own phone number.

## Good to know
- Sending is attempted from inside Supabase. If Gmail refuses (wrong app password, 2-Step Verification off) or the connection is blocked, you are told why, the account is still created, and you are shown the link or password to pass on yourself.
- Passwords and links are never written to the activity log.
- The person's temporary password only lets them reach the "Choose your own password" screen; every other page and every record stays closed until they have really changed it.
