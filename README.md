# Franksomi Records — web app (prototype v5)

Website files: index.html, portal.html, app.js, portal.js, mpesa.js, style.css, config.js, logo.png.  Database: schema.sql.  Payment functions: supabase/functions/ (see MPESA_SETUP.md, SMS_SETUP.md). Printing: every printable page also has a **Download PDF** button, and the logo is on every customer document and on the tracking page. Files pdf.js and vendor/ make the PDFs.

## Set up (about 30 minutes, free tiers)
1. **Supabase** (database + login): create a project, then SQL Editor -> New query -> paste ALL of `schema.sql` -> Run.
   Use a NEW project. (If you tried version 1, create a fresh project; v2 changes the tables.)
2. Authentication -> Users -> Add user (tick "Auto confirm"): **create your own user first — the first user becomes the Owner.** Add everyone else later from the app: Users & roles → + Add a person (deploy the `manage-users` function first, see below).
   After that: Authentication -> Providers -> Email -> turn OFF "Allow new users to sign up".
3. Project Settings -> API: copy the Project URL and the anon public key into `config.js`.
4. Publish: Netlify -> Add new site -> Deploy manually -> drag this folder in (not the `test` folder). Open the link on your phone and "Add to Home screen".
5. First entries: Lists (Owner) -> check the Printing & Cyber price list (the prices are placeholders: change them). Add suppliers and stock items, then start recording.

## Users and roles (Owner: Users & roles page)
Seven roles. The **Owner** (the first person who signs up) always has every permission. The other six start with the permissions below, and the Owner can tick or untick any permission for any role in the app (**Users & roles → Permissions by role**; each tick saves at once; **Reset** restores a role's starting permissions). The rules are enforced in the database, not just hidden on screen.

| Role | Starts with |
|---|---|
| **Owner** | Everything, including users and permissions. Cannot be restricted. |
| **Administrator / Manager** | Everything except managing users. Cannot delete money records (sales, printing, income, expenses). |
| **Accountant** | Sees all money, buying costs, reports and end-of-day. Records payments, expenses and documents. M-Pesa reconciliation. Cannot change stock or repairs. |
| **Technician** | Repairs and field jobs: see, add, change. Sees stock quantities and documents. No prices, costs or money. |
| **Storekeeper** | Stock and suppliers: see, add, change, with buying costs. Sees repairs. |
| **Sales / Receptionist** | Repairs (add, change), sales, printing & cyber, documents, payments, M-Pesa checkout, end-of-day. Money entries: only their own, last 2 days. |
| **Auditor / Viewer** | Looks at everything (read only), including costs and money. Changes nothing. |

Permissions the Owner can switch per role: see / add / change / delete for repairs, field jobs, sales, printing & cyber, documents, payments, expenses and stock; suppliers; see buying costs and profit; see everyone's money entries (otherwise only your own); send M-Pesa prompts; end-of-day; reports; M-Pesa reconciliation; SMS; lists and price list; activity log. Managing users can never be given away.

**Adding a person (in the app):** Users & roles → **+ Add a person**. Enter their name, email, role and a temporary password (the app suggests one). The app creates their login and shows the details once, with a **Copy details** button, to give them privately. **New password** on a person's row sets a fresh temporary password (for a forgotten one). Everyone has a **Password** button at the top to change their own. Untick **Active** and Save to lock someone out immediately (history is kept). Permission changes reach a person when they next open or refresh the app. The last active Owner cannot be removed. Owners cannot be created this way: add the person, then change their role to Owner if you really want to.
One-time setup for this feature: `supabase functions deploy manage-users` (leave JWT checking on; the function checks the caller is the Owner). Your own first login is still made in Supabase (Authentication → Users → Add user, tick Auto confirm); it becomes the Owner. After that, turn OFF “Allow new users to sign up” so only the Owner can create logins.

**Staff logs (Owner):** Activity log shows every add, change and delete with who did it and when, including changes to users and permissions. It has a table of each person's last sign-in, last action and actions in the last 7 days, filters by person / record type / date / words, and **Download CSV**. The Owner can also give the Activity log to another role (e.g. Auditor) in the permissions table.
Change someone's role: Supabase -> Table Editor -> profiles -> `role`.

## Customer portal and M-Pesa payment prompts
Customers track a repair at `portal.html` (job card number + their phone number) and can pay the balance by M-Pesa. Staff get an M-Pesa button on repair and job rows. This needs a Safaricom Daraja account and two small server functions: follow **MPESA_SETUP.md**. Without that setup, the tracking page still works; only the payment buttons show an error.

## Printing and Cyber
The Printing & Cyber page has one-tap buttons from your price list (printing, copies, scanning, lamination, typing, browsing, online applications, passport photos…). Add, rename or reprice services in Lists. Cyber time: enter it as 30-minute blocks (e.g. 1 hour = qty 2).

## Deposits applied to a bill count as income
A refundable deposit is cash you hold, not income. When you enter an amount in **Deposit applied to bill** on a repair, that amount becomes income on the day you apply it: it appears in the dashboard, the end-of-day report (own section, no new cash), the monthly report (day lines and a "Deposit applied" payment card) and the year summary (Repairs line and totals). The cash itself was counted when the deposit was taken, so cash in and expected cash do not change. Lowering the applied amount takes the income back.

## Look and feel
Circuit artwork from the logo appears on the sign-in page, dashboard and customer page; every menu item has an icon; the dashboard has charts (repairs by stage for everyone with repair access; money by payment method and income against expenses by month for roles that may see reports); empty pages show a branded illustration; printouts and PDFs end with a footer carrying the logo and tagline. The files are `brand.js` and `brand-circuit.svg`.

## M-Pesa reconciliation
Download your M-Pesa statement as CSV and choose it on the M-Pesa page. It is matched against your M-Pesa sales, services, payments, expenses and deposits — first by M-Pesa code, then by amount and day. Confirm matches, record anything missing, and see what you recorded that is not on the statement. Always type the M-Pesa code when you record an M-Pesa payment.

## Limits to know
- Tested: database rules on a real Postgres (owner, staff, signed-out, customer portal, payment recording), report numbers, the M-Pesa statement matcher, the payment functions against a pretend Safaricom, and all screens against a stand-in database. NOT yet tested: your real Supabase project, the real Safaricom Daraja service (sandbox or live), real Safaricom statement files (your file's column names may differ slightly; send me a sample with names/numbers hidden and I will adjust), real phones/printers.
- Deposit refunds have no date, so refunds are not subtracted from the daily cash expected; adjust at closing with a note.
- Every printable page has Print and Download PDF (the PDF is a picture of the page; some older iPhones fall back to the Print window, where Save as PDF works).
- Free Supabase pauses after a week of no use; export tables to CSV regularly (Table Editor -> Export) as a backup.
- Needs internet. These documents are not KRA eTIMS invoices.
