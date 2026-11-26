# SPEC.md — iCharge Office Hub (Work + HR App)

## 1. Goal
One web app for Quanta Dance Inc. (iCharge Philippines) that:
- Assigns work and projects with **one clear owner and a due date** for every task.
- **Follows up automatically**: reminders, overdue alerts and escalation, so nobody has to chase.
- Logs **problems** (kiosk down, refunds, partner issues) with an owner and response-time targets.
- Keeps **HR records**: employees, attendance with location check, leave and disciplinary records.
- **Links work and HR**: leave blocks task assignment, departing staff must hand over tasks, and performance uses real task data.
- **Shows each person only what their job needs** (access levels, section 3).
- Gives **BD a client tracker**: each person's clients, contract end dates with renewal reminders, the agreed profit-sharing percentages and a log of what was discussed (section 4.8).
- Gives **Customer service** one place to follow every customer case from first message to refund, with each person's KPIs against targets (section 4.9).
- **Keeps the two businesses apart**: iCharge (power bank rentals) and iScreen (kiosk screen advertising), with a company view of both (section 4.1).

Users: iCharge employees only (BD, Marketing, Operations, Customer service, Finance, Tech, Admin/HR). Internal use only, for work management and monitoring: no customer or public pages, and the app never contacts customers (no SMS, email or Viber to customers). Works **on the web** (computer) and **as an app on phones**, so staff can time in from the office, from home or in the field.

## 2. Tech stack
- Next.js 15 (App Router) + TypeScript + Tailwind CSS
- Supabase: Postgres, Auth, Storage (private buckets), Row Level Security, Realtime, cron (pg_cron)
- **Web and phone app (one codebase):**
  - **Phase 1, at launch:** one Progressive Web App (PWA). On a computer it opens in the browser. On a phone, staff install it from the browser ("Add to Home Screen" on iPhone, "Install app" on Android): it gets its own icon, opens full screen and can send push notifications. GPS, camera and push all work on iPhone and Android this way (on iPhone, push needs the Home Screen install).
  - **Phone layout** (screens narrower than 700 px): top bar with the logo, page name, bell and a **☰ menu** button that opens the full menu (every page the person may open), My profile and Sign out; bottom menu with My day, Tasks, a big round **Time in** button in the middle, Leave and Issues. The side menu is hidden. Wide tables show as cards on phones (Team, Audit log) or scroll sideways with a hint; fields use 16 px text so iPhone does not zoom; picking several people uses tick boxes.
  - **Updates over the air (OTA):** every release reaches all phones and computers without reinstalling. See 3.6 for the Update button.
  - **Works with weak signal:** a service worker keeps the app shell offline. A time-in or time-out made with no signal is saved on the phone (time, GPS point, selfie) and sent when back online (see 5.2).
  - **Phase 2, optional:** wrap the same code with Capacitor into Android and iPhone apps for staff only (screens and logic still update over the air; only changes to the native shell need a store update): iPhone as an unlisted App Store app or a Custom App through Apple Business Manager; Android through a closed Play Store track. This adds a fake-GPS (mock location) check on Android and more reliable notifications. Costs: Apple Developer Program US$99 a year, Google Play US$25 once.
- Hosting: Vercel (every push to `main` deploys). Vercel functions and the Supabase project both in **Singapore** (`sin1` / `ap-southeast-1`).
- i18n: `next-intl`, English and 简体中文 (`/messages/{en,zh-Hans}.json`); each user picks a language
- Notifications: in-app, phone and computer push (PWA web push), email (Supabase/Resend free tier). No Telegram.
- **Quick sign-in:** fingerprint / Face ID / Windows Hello through passkeys (WebAuthn, free `@simplewebauthn` library), or a 6-digit PIN. See 3.5.
- **Sign-in email (OTP codes):** Supabase Auth email OTP sent through **Resend** (custom SMTP in Supabase). Supabase's built-in email sends only a few emails an hour, so custom SMTP is required before launch. Resend needs the **icharge.com.ph** domain verified (3–4 DNS records added by whoever manages the domain) so codes arrive in the inbox, not spam. **During the build** (domain not verified yet), create the Resend account with **earvin@icharge.com.ph**: Resend's test sender then delivers codes to that address only, which is enough for testing. Domain verification is needed **before launch**, not before step 1a.
- No paid services required. Keep dependencies minimal.
- **Look and feel (iCharge theme):** iCharge lime `#8FD220`, dark green `#16210F` (menu, headings), iScreen violet `#6A4CF0`; Poppins for headings, Inter for text. Round lightning-bolt logo + "icharge" wordmark. Mascot images in `/public/mascot/` used for the greeting card, empty states, success messages and the "Charge tip" card in the menu. Menu items have line icons. Progress bars are drawn as batteries. Match the clickable preview: https://claude.ai/artifact/HQRaqAa9dAhZewqMJyz6RQ

## 3. Users and access levels

### 3.1 The five access groups
| Group | Who | In one line |
|---|---|---|
| **Leader** | CEO and the Special Assistant to the CEO | Sees and controls everything |
| **Manager** | Department heads | Runs their own team: work, approvals, attendance status |
| **HR** | HR officer(s) | Handles all employee records, attendance, leave and cases |
| **Finance** | Finance / payroll staff | Reads what payroll and money issues need; edits no HR data |
| **Staff** | Everyone else | Own work and own records |

Everyone is also an employee, so every group also gets the Staff basics for their own tasks, attendance, leave and HR file.

"Leader" in this spec means **every account with Leader level** (the CEO and the Special Assistant). Escalations and alerts that go "to the Leader" reach both.

**Department heads named in this spec:** the **BD head**, the **CS lead** and the **Ops head** are the Managers who head the BD, Customer service and Operations departments (`departments.head_id`). They are not separate access groups: they are Managers with the extra rights this spec gives them for their own area.

### 3.2 How access is stored
- Each account has one **level**: `leader`, `manager` or `staff`.
- Plus two optional switches: **HR access** and **Finance access**.
- Examples: HR head = Manager + HR access. Payroll clerk = Staff + Finance access. Finance head = Manager + Finance access.
- A Manager's **team** = everyone in the departments they head (`departments.head_id`) plus anyone whose `supervisor_id` is them.

### 3.3 Access table
✓ = full, — = no access. "Own" = the person's own records only.

| Area | Leader | Manager | HR | Finance | Staff |
|---|---|---|---|---|---|
| Own tasks, attendance, leave, own HR file | ✓ | ✓ | ✓ | ✓ | ✓ (HR file read only) |
| See tasks and projects | All | Own team + projects they belong to | Own + projects they belong to | Own + projects they belong to | Own + projects they belong to |
| Assign tasks | Anyone | Own team; anyone else as a request the other head must accept | Self + project members | Self + project members | Self + project members |
| Team workload page | All departments | Own team | — | — | — |
| Meetings | All | Meetings they attend or create | Meetings they attend or create | Meetings they attend or create | Meetings they attend |
| Issue log | All | Issue types owned by their department | Issue types assigned to HR | Refund, unpaid power bank and venue payout issues (incl. amounts) | Report any; see ones they reported or own |
| Client tracker (contracts, profit-sharing %, discussion log) | All | BD head: the BD team's clients, without the BD person's commission; other Managers: — | — | All clients, read only (for payouts), without the BD person's commission | BD staff: own clients only, incl. own commission; other staff: — |
| Customer service cases and KPIs | All | CS lead: the CS team's cases and KPIs; other Managers: cases handed to their department | — | Refund requests: view, approve, mark paid | CS staff: own cases and own KPIs; Ops staff: kiosk cases handed to them |
| Employee directory (name, position, department, work email, work phone) | ✓ | ✓ | ✓ | ✓ | ✓ |
| Employment details (status, start date, shift, supervisor) | All | Own team | All (edit) | All (view) | Own |
| Address, emergency contact, documents, private HR notes | ✓ | — | ✓ (edit) | — | Own address and contact only; never private notes |
| Government ID numbers (SSS, PhilHealth, Pag-IBIG, TIN) | ✓ | — | ✓ (edit) | View only, for payroll | Own |
| Attendance times, lates, undertime, absences | All | Own team | All (edit, with reason) | All (view and export) | Own |
| GPS points and selfies | ✓ | Status only: "Location verified" or "3.4 km away" | ✓ | — | Own |
| Leave | All; approves Managers' and HR's leave | Approves own team | All; edits balances | Views balances and approved leave | Files own |
| Disciplinary cases | All; records decision | Files an incident report for own team; sees case status only | Handles cases | — | Own cases: acknowledge and respond |
| Performance snapshot and reviews | All | Own team; writes the review | All; HR sign-off | — | Own |
| Dashboard | Whole company | Own department | HR view: attendance and leave | Finance view: money-related issues | — |
| Excel exports | All | Own team's tasks and attendance | HR data | Attendance and leave for payroll; finance issues | Own data |
| Accounts and access | Approves every access request, invite and access change | — | Proposes access (level, department) for requests and invites; deactivates Staff and Manager accounts | — | — |
| Settings | All, incl. App updates (3.6) | CS lead: CS KPI targets (with the Leader), quick replies, CS working hours. Ops head: field sites list (with HR). Other Managers: — | HR settings: leave types, holidays, shifts, field sites, checklists, location radius, retention | — | Own language and notifications |
| Audit log | View all | — | View HR changes | — | — |
| Trash | Restore or delete permanently | — | — | — | — |

### 3.4 Access rules
- **HR proposes, the Leader approves:** every new account, invite and access change (level, HR access, Finance access) takes effect only after a Leader-level user approves it. HR can propose any level; the Leader can also propose and approve in one step.
- **Removing access is immediate:** HR or the Leader can deactivate a Staff or Manager account without waiting for approval (safety first); only the Leader can deactivate a Leader-level account.
- **Nobody can change their own access** or approve their own access request or proposal.
- **Conflict of interest:** an HR user's own leave, leave balance, attendance corrections and disciplinary cases are handled by the Leader, not by HR. A Finance user cannot approve their own refund or payout issues.
- **Approvals when someone is away:** if a Manager is on approved leave, their approvals go to their `backup_approver_id`, or to the Leader if none is set. Managers' and HR users' leave is approved by the Leader. The Special Assistant's leave is approved by the CEO. The CEO's own leave is recorded without approval.
- **Finance reads, never edits** HR records or attendance.
- **Sensitive views are logged:** every time someone opens government IDs, documents, private HR notes, GPS points or selfies, the audit log records who, whose record and when.
- **Changes take effect immediately:** a removed access stops working on the person's next page load; every access change is in the audit log.
- **Deactivated accounts** can't sign in; their records stay for HR (see 5.5).
- One user account = one employee record.

### 3.5 Sign-in and access requests
**Company email only**
- Only email addresses ending in **@icharge.com.ph** can sign in or request access. Any other address (Gmail, Yahoo, etc.) is refused with "Use your iCharge work email."
- The domain check runs on the server (Supabase Auth hook before a user is created), not only on the screen.
- Allowed domains are a list in Settings (Leader only), so a second company domain can be added later.

**One-time code (OTP) to the email, no passwords**
- Sign-in: type the work email → the app emails a **6-digit code** → type the code → signed in.
- The code works once and expires after **10 minutes**. After **5 wrong codes** the email is locked for **15 minutes**. A new code can be requested after 60 seconds.
- Receiving the code proves the person controls an iCharge mailbox.
- Staying signed in: **30 days** on the same phone or computer (setting), then a new code is needed. Signing out, deactivation or an access change ends the session.
- The code email is in English and 简体中文, from the Office Hub sender address, and contains only the code and its expiry time.

**Access requests (first sign-in)**
1. A new employee signs in with their work email and code.
2. They fill in a short form: full name, department, position, supervisor, mobile number.
3. This creates an **access request**. Until it is approved they see only a "Waiting for approval" page.
4. HR gets a notification, checks the person, and **proposes** the level (Staff, Manager or Leader) and the HR and Finance switches, or declines with a reason.
5. The Leader gets a notification and **approves** the proposal (or changes it, or sends it back to HR with a reason).
6. The employee gets an email "Your access is ready" and the employee record is created from the form.
- The Leader can also handle a request directly (propose and approve in one step).
- Requests not handled within 2 working days remind HR (no proposal yet) or the Leader (proposal waiting).
- HR can also **invite** someone in advance (email, level, department). The invite is sent only after the Leader approves it; the invited person then signs in with a code and gets access without waiting.
- Every request, approval, decline and invite is in the audit log.
- An approved or deactivated account, and any access change, ends that person's current session; they sign in again with a code.

**Quick sign-in: fingerprint or PIN**
- After the first sign-in with an email code, the app offers **"Set up quick sign-in"** on that phone or computer: fingerprint / Face ID / Windows Hello (passkey), or a **6-digit PIN**. Skippable; set up later in My profile.
- With quick sign-in set up, the app asks for the fingerprint or PIN when it is opened after being closed for more than **12 hours** (setting), instead of an email code.
- An email code is still needed: on a new phone or computer, every **90 days** per device (setting), after **5 wrong PINs**, after an access change, and after a PIN reset.
- The fingerprint never leaves the phone: the app only receives the device's yes/no (passkey). The PIN is stored only as a hash, per device.
- Each person sees and removes their own devices in My profile; HR and the Leader can remove all devices of a person (e.g., lost phone).
- PIN rules: 6 digits, not all the same digit, not 123456 or 654321.

### 3.6 App updates (OTA)
- **Everyone gets updates over the air:** a new version goes live when the builder pushes it to `main` (Vercel). No reinstall, no app store.
- **Update button for staff:** when a new version is ready, a banner shows **"New version ready · Update now"**. One tap saves any unsent time-in or form, reloads the app and shows **"What's new"** (2–5 lines, English and 简体中文).
- **Never interrupts:** the banner waits while someone is in the middle of a time-in, selfie or form; nothing is lost.
- **Settings › App updates (Leader only):**
  - Current version, release date and "What's new" text (written by the builder with each release).
  - **"Ask everyone to update now"** button: sets the minimum version; older apps must update before they continue.
  - List of people still on an older version (name, device, last seen), with a **Remind** button.
- **Safe releases:** every change is first tested on a private Vercel test link; it goes live only when merged to `main`. If a release has a problem, the previous version is restored with Vercel's one-click Instant Rollback.
- Phase 2 store apps: screens and logic update the same way; only native shell changes need a store update.

## 4. Work module

### 4.1 Business lines: iCharge and iScreen
- Two business lines, plus Company for shared work:
  | Business | What | Color | Icon |
  |---|---|---|---|
  | **iCharge** | Power bank rentals | Lime `#8FD220` | Lightning bolt |
  | **iScreen** | Advertising on kiosk screens | Violet `#6A4CF0` | Screen |
  | **Company** | Shared work: HR, office, company-wide projects | Grey | none |
- **Business is on the work, not the person.** Departments (BD, Marketing, Ops, Finance, Tech) work for both businesses.
- Every project, task, issue type and issue has a `business` field. A task takes its project's business (or is set directly if it has no project); an issue takes its issue type's business. Meeting action items carry their own business.
- **Business switch** (All business / iCharge / iScreen) on My day, Projects, Issues and the Dashboard. The choice is remembered for each user (`profiles.default_business`) and carries over between pages.
- Every task, project, issue and action item shows a business pill with the **icon and the name**, never color alone.
- Counts (tiles, tab counts, department table) follow the switch. Attendance and HR pages stay company-wide.
- Reports and Excel exports have a business filter.
- **Dashboard business panels** (Leader; Managers see their own department's figures):
  - **iCharge:** kiosk locations, rentals a day, rental sales a day, open kiosk and rental issues, repeat-customer rate (battery meter).
  - **iScreen:** ad slots sold per 200-second loop (20 slots), proposals waiting, ad sales this month, open ad issues, a 20-box slot meter.
  - In version 1 these figures come from a monthly entry or Excel upload by Finance or Ops (`business_metrics` table). There is no live connection to the Besitter back office.

### 4.2 Tasks
Fields: title, description, owner (exactly one), assigned by, watchers, project (optional), due date and time, priority (Low / Normal / High / Urgent), status, checklist items, attachments, comments with @mentions.
Statuses: To do → In progress → Waiting → Done (or Cancelled).
Rules:
- A task cannot be saved without an owner and a due date.
- Who can assign to whom follows the access table (section 3.3).
- **Waiting** requires "waiting on whom/what".
- **Done** requires a short completion note (photo/file optional).
- If "needs approval" is ticked, the assigner must **Accept** or **Reopen (with reason)**.
- Recurring tasks: daily, weekly or monthly (e.g., "Monday back-office export").
- Every change is kept in the task history (who, what, when).

### 4.3 Delegation and follow-up
- New task → owner must tap **Acknowledge** within 4 working hours (setting).
- Reminders: 1 day before due, 9:00 am on the due date, then daily while overdue.
- Not acknowledged after 1 working day, or overdue 2 working days → notify the owner's Manager.
- Overdue 5 working days → notify the Leader.
- Assigner can set a **follow-up date** → reminder to the assigner.
- Reassigning keeps the full history and notifies both people.

### 4.4 Projects
Fields: name, department(s), owner, members, start and due dates, status (Planning / Active / On hold / Done), priority, description, milestones, attachments.
Views: Kanban board by status, list, calendar. Progress = done tasks ÷ all tasks.

### 4.5 My day and team views
- **My day**: Today, This week, Overdue, Waiting on others, Assigned by me.
- **Team workload** (Managers for their team, Leader for all): open and overdue tasks per person, who is on leave or absent today.
- **Calendar**: tasks, project milestones, approved leave, holidays (each person sees what their access allows).

### 4.6 Meetings and action items
- Create a meeting: date, attendees, agenda, notes.
- Add action items in the meeting → each becomes a task with owner and due date.
- One click sends the meeting notes and action list to attendees (in-app, push and email).

### 4.7 Issue log (problem handling)
Issue types (editable in Settings by the Leader), each with an owning department, a default owner, a backup, a response target and a fix target:
| Type | Default team | Respond within | Fix within |
|---|---|---|---|
| Kiosk offline, empty or screen down | Ops | 1 hour | 24 hours |
| Customer charged / deposit not refunded | Ops + Finance | 1 hour | 3 days |
| Unpaid or unreturned power bank | Finance + Ops | 1 day | 7 days |
| Venue partner issue | BD + Finance | 4 hours | 3 days |
| App or payment error | Tech + Ops | 1 hour | 2 days |
| iScreen ad issue (iScreen) | Marketing + Ops | 4 hours | 1 day |
| Advertiser request: proof of play, schedule change (iScreen) | Marketing | 4 hours | 2 days |
All other types above are iCharge.
Fields: type, title, source (hotline, email, Viber, social media, partner, staff), location/kiosk ID (text), severity, owner, amount (₱, optional; visible to Leader, Finance and the owning department), notes, attachments, linked tasks.
Statuses: New → Acknowledged → In progress → Resolved → Closed.
- Anyone can report an issue. Who can see it afterwards follows the access table.
- Timers turn amber at 75% of the target and red when missed; red notifies backup, Manager, then the Leader.
- Weekly report: issues by type and location, repeat problems (same location 3+ times in 30 days).

### 4.8 Client tracker (BD)
For BD to keep track of their own clients: iCharge venue partners (malls, hospitals, resorts, SMEs) and iScreen advertisers.

**Who owns a client**
- Each client has one owner: the BD person who first registered it (same rule as the BD commission plan).
- Only the BD head can change the owner. The change is logged.

**Client record**
- Name, type (Mall / Hospital / Resort / SME / Transport / Advertiser / Other), business (iCharge or iScreen), owner, contact person and number, kiosks (count and kiosk IDs), linked issues and tasks.
- Status: Prospect → Proposal sent → Negotiating → Waiting for signature → Active → Renewal talks → Renewed or Ended.
- Contract: start date, end date, auto-renew (yes/no), notice period, signed contract file (private bucket), special terms (e.g., "pull-out after 3 months with zero usage", "voucher is a ceiling, not a commitment").

**Profit sharing (the agreed terms)**
- **iCharge venues:** the venue's share in % and its basis (gross rental sales or gross operating profit) and payout timing.
- **iScreen advertisers:** what the client pays (₱ per kiosk per month or package) and the term.
- **BD person's profit share:** filled in from the BD commission plan: 2% for small accounts (1–9 kiosks), 5% for 10+ kiosks, 10% for key or multi-branch accounts, of gross operating profit, paid while the kiosks stay online. iScreen ad commission: [X]% of the first 3 months of the ad contract (Finance to confirm). A different rate needs a Leader's approval. **Who sees it:** the BD person's commission is visible only to that BD person (own clients) and Leaders — not the BD head, Finance or other staff.
- **History is never lost:** every change to a percentage keeps the old value, the new value, the date, who changed it and why.

**What was discussed**
- A dated log per client: who, what was said, and an optional tag for the percentage talk ("They asked", "We offered", "Agreed", "Changed").
- Notes can be added at any time but not deleted, and they can be edited only within 24 hours.

**Reminders and alerts**
- 90 days before the end date: a renewal task is created for the owner ("Start the renewal talk with [client]").
- Reminders again at 60 and 30 days. At 30 days the BD head is also alerted.
- End date passed with no renewal: flagged red to the owner, the BD head and the Leader.
- **Zero usage:** from the monthly kiosk usage upload (back-office export), a client whose kiosks had zero rentals for 3 months gets an alert pointing to the pull-out clause.
- Countdown colors: green over 90 days, amber 31–90 days, red 30 days or less.

**Screens**
- Clients page: My clients / My team (BD head) switch, business switch, tiles (clients, renewals in 90 days, not signed yet, zero-usage alerts), renewal reminder banner, client list, client detail with the two percentages side by side, contract, special terms and the discussion log.
- Finance gets a monthly payout export: per client, the venue share due. The BD share due per BD person is in the Leader's export only.


### 4.9 Customer service: cases and KPIs
For each Customer service (CS) person to follow every customer transaction they handle, and to see their own KPIs.

**Case record**
- Case ID, channel (Hotline / Viber / Facebook / App / Email / Walk-in), customer name and mobile, order number, kiosk or location, amount (₱), business (iCharge by default; iScreen for screen or ad complaints), owner, linked issue.
- Case types: Charged but no power bank released · Deposit refund not received · Power bank not returned · App or payment error · Kiosk problem · Question · Complaint · Other. Each type has a reply target and a fix target (same as the matching issue types in 4.7, e.g., refund cases: fix within 3 days; unreturned power bank: 7 days).
- Status: Open → Waiting on customer / Waiting on Finance / Sent to Ops → Solved (→ Reopened within 7 days if the customer comes back).

**Transaction trail**
- Every customer message, CS reply, action, handoff and system notice is saved on the case with the time. Entries can't be deleted.
- **Quick replies** (set by the CS lead) in English and Filipino; using one logs it on the trail.
- **Ask Finance to refund:** creates a refund request (amount, order number, payment method). Finance approves and marks it paid with the reference number; the case updates. Office Hub never contacts the customer (that is a separate process).
- **Send kiosk problem to Ops:** creates or links an issue in the issue log (4.7). Three or more cases at the same kiosk within 30 days create a repeat-problem alert.
- **Mark solved:** closes the case. The customer's 1–5 rating, collected in the separate customer process, is entered by CS.

**KPIs (per person and for the team, per month)**
| KPI | How it is counted | Default target |
|---|---|---|
| Reply within 15 min | % of cases with a first reply within 15 working minutes (email: 4 working hours) | 90% or more |
| Solved within target | % of cases solved within their type's fix target | 90% or more |
| Average time to solve | Working hours from case created to solved | 8 h or less |
| Customer rating | Average of the 1–5 ratings after solving | 4.5 or more |
| Reopened cases | % of solved cases reopened within 7 days | 5% or less |
| Cases handled | Count of cases solved | No target |
- Fair counting: the clock stops while a case is "Waiting on customer", and messages that arrive outside CS working hours (setting) count from the next working start.
- Each KPI shows its value, its target and a battery bar: green on target, amber close (within 10%), red below.
- Targets are set in Settings by the Leader and the CS lead.
- CS KPIs flow into the person's performance snapshot (5.6). The CS lead also reviews 5 random cases per person per month (1–5 quality score).

**Screens**
- Customer service page: My cases / CS team switch (CS lead), KPI panel with a 7-day case chart, case list with tabs (Needs my reply / Waiting / Solved / All) and reply or fix timers, case detail with the customer and transaction box, transaction trail, quick replies and actions.

**Version 1 limits**
- Cases are created by CS (hotline, walk-in, Viber, Facebook copied in). Emails sent to the CS address can create cases automatically if the email service allows it.
- Order details are typed in from the Besitter back office. An automatic order lookup needs a Besitter connection (phase 2; ask Besitter or Juugo whether an API is available).

**Privacy**
- Customer names and mobile numbers are shown in full only to the case owner, the CS lead and the Leader; others see them masked.
- Customer details are anonymized after 2 years (setting).

## 5. HR module

### 5.1 Employee records (201 file)
Fields: employee ID, name, position, department, supervisor, employment status (Probationary / Regular / Contractual / Project-based / Resigned), start date, regularization date, end date, work setup (Office / WFH / Hybrid), shift, contact details, emergency contact.
- **Restricted fields** (address, government IDs, documents, private HR notes) follow the access table: Leader and HR full; Finance views government ID numbers only; Managers none.
- Reminder to HR and the Manager 30 days before a probationary period ends (default 6 months, setting).
- Documents stored in a private bucket; opened only through short-lived signed links.

### 5.2 Attendance and location check
- Time in / time out from the app, marked **Office**, **WFH** or **Field**.
- **Field work** (kiosk visits, venue meetings, client sites):
  - The employee picks where they are working: a site from the **field sites list** (kiosks and venues), the site of a task due today, or **Other** with a reason.
  - The GPS point is compared with that site's pin (default 200 m). Within range → "Location verified". Out of range → saved and flagged for HR, as for WFH.
  - **Other** is always flagged for HR review with the reason.
- **Order at time-in:** step 1 location check, step 2 live selfie. Time-in is saved only after both.
- **Location check at time-in and time-out:** the app reads the phone's GPS once and compares it with the employee's registered location.
  - Office → the office pin. WFH → the employee's registered home pin (set by HR in the employee record).
  - Within the allowed radius (default 200 m, setting) → "Location verified".
  - Outside the radius → time-in is still saved but **flagged for HR review**, with the distance shown. The employee can add a reason (e.g., "working from client site").
  - Location permission off → WFH and Field time-in are blocked, with on-screen steps to turn location on.
  - Saved per time-in: latitude, longitude, GPS accuracy, distance from the registered pin.
- **Selfie at time-in (protects against fake-GPS apps):**
  - Time-in requires a photo taken live with the front camera inside the app. Uploading from the gallery is not allowed.
  - The photo is saved with the time, GPS point and distance, and shown next to the time-in record.
  - HR spot-checks photos and reviews them whenever a time-in is flagged. No automatic face recognition in version 1.
  - Camera permission off → time-in is blocked, with on-screen steps to turn the camera on.
  - Photos are visible to the employee, HR and the Leader only, and deleted after 90 days (setting).
- **Managers see status only** ("Location verified" or the distance), never GPS points or selfies.
- **Location is read only at the moment of time-in and time-out.** No tracking during the day.
- A change of WFH address needs HR approval before the new pin is used.
- Shift schedules per employee; late and undertime minutes calculated automatically.
- Missing time-out is flagged for the employee and HR.
- **No signal:** the time-in is stored on the phone with the phone's time, GPS point and selfie, and uploaded when the connection returns. The record keeps both the phone time and the time the server received it; a gap over 30 minutes (setting) is flagged for HR.
- HR can correct an attendance record only with a reason; the correction is in the audit log.
- Flags are for HR review only: the app never marks AWOL by itself.
- Monthly attendance export for payroll (Excel), available to HR, Finance and the Leader.

### 5.3 Leave
- Leave types and yearly balances are set in Settings by HR (e.g., Vacation, Sick, Emergency, Service Incentive Leave, Maternity, Paternity, Solo Parent).
- Employee files leave → their Manager approves or declines (with reason) → HR sees it and the balance updates. Managers' and HR users' leave goes to the Leader.
- Finance sees balances and approved leave for payroll, read only.
- Holidays (regular and special non-working) are maintained in Settings and skipped in leave and reminder counts.
- **Assigning a task due during someone's approved leave shows a warning.** When leave is approved, the app lists that person's tasks due during the leave and suggests reassigning them.

### 5.4 Disciplinary records
- Case types: incident report, notice to explain (NTE), verbal warning (record), written warning, decision.
- Each case: employee, date, description, attachments, response due date (default 5 calendar days), employee acknowledgment of receipt (in-app button with timestamp), employee's written response, decision.
- A Manager can **file an incident report** for their own team; HR then handles the case. The Manager sees only the case status afterwards, not the employee's response or attachments.
- Visible in full to the employee (own cases), HR and the Leader. Finance has no access. Cases about an HR user are handled by the Leader.
- The app records the process; it does not decide outcomes.

### 5.5 Onboarding and offboarding
- Checklists (editable by HR) that create tasks automatically, e.g., create accounts, issue equipment, orientation.
- **Offboarding: an employee cannot be deactivated while they still own open tasks, projects or issues**: they must be reassigned first. Then: deactivate login, collect equipment, clearance. Records stay for HR.

### 5.6 Performance snapshot
Per employee per month, built from real data:
- Tasks completed, % on time, overdue count, reopened count
- For CS staff: the CS KPIs in 4.9 and the monthly quality score
- Issues handled within target (%)
- Attendance: lates, undertime, absences, time-ins outside the registered location
Quarterly review form: simple 1–5 ratings plus comments, written by the Manager, signed off by HR. Visible to the employee, their Manager, HR and the Leader.

## 6. How Work and HR connect
- Department and supervisor fields in the employee record decide each Manager's team, who approves leave, and the escalation path.
- Leave and absences show in workload views and assignment warnings.
- Offboarding blocks deactivation until work is handed over.
- Performance snapshot combines tasks, issues and attendance.
- Managers get one Team page: workload + attendance status today + pending leave.

## 7. Notifications
- In-app bell for everything; phone and computer push (PWA web push; on iPhone after the Home Screen install) and email (per user setting) for assignments, reminders, escalations and approvals.
- Notifications never include restricted data (no government IDs, GPS points, case details or profit-sharing percentages in push or email); they link into the app.
- **Client renewal reminders** at 90, 60 and 30 days before a contract ends (section 4.8).
- **Daily digest at 8:30 am**: my tasks today, overdue, approvals waiting.
- **Monday summary** to Managers (their team) and the Leader (all): overdue by person, issues past target, repeat problems, leave next week.
- Quiet hours: no notifications from 9:00 pm to 7:00 am except Urgent.

## 8. Dashboards
- **Leader:** iCharge and iScreen business panels (section 4.1) with the business switch, then open and overdue tasks by department, on-time %, project status, issues past target by type, attendance today (in office / WFH / on leave / absent / not in yet), pending approvals.
- **Manager:** the same, for their own department only.
- **HR:** attendance today, flags waiting for review, pending leave, probation reviews due.
- **Finance:** open refund, unpaid power bank and venue payout issues with amounts; attendance export status for payroll.

## 9. Reports and export
Excel export: tasks, projects, issues, attendance, leave balances, performance snapshot. Filters by department, person and date range. Each person can export only what the access table lets them see.

## 10. Security and privacy
- **Row Level Security on every table**, written from the access table in section 3.3. The app UI hides what a person can't see, but the database is the real guard: changing an ID in the URL or calling the API directly must return nothing.
- Helper SQL functions used by all policies: `is_leader()`, `has_hr()`, `has_finance()`, `is_manager_of(profile_id)`, `in_my_team(profile_id)`.
- Restricted columns (address, government IDs, private notes, GPS points, selfie paths) live in separate tables (`hr_records`, `hr_private`, `attendance_location`) so policies can protect them as a whole.
- Audit log of every HR change, every access change, every task/issue status change, and every view of sensitive data (who, what, when, old → new).
- Soft delete: items go to Trash for 30 days; only the Leader restores or deletes permanently.
- Sign-in uses one-time codes to @icharge.com.ph email only, plus optional fingerprint (passkey) or PIN (section 3.5); no passwords are stored, PINs only as hashes, and fingerprints never leave the phone.
- Data Privacy Act (RA 10173): privacy notice and consent on first sign-in; each group sees only what its job needs.
- The privacy notice states that location is read only at time-in and time-out, and a selfie is taken at time-in, for attendance only. Location data is deleted after 1 year and selfies after 90 days (settings). Both are visible to the employee, HR and the Leader only.
- Selfies are stored in a private bucket and opened only through short-lived signed links.
- Weekly backup: the Leader can download all tables as Excel/CSV.

## 11. Settings
- **Leader:** departments, positions, issue types and targets, reminder and escalation timings, office location pin, access levels, allowed email domains, sign-in session length, quick sign-in rules (lock after 12 h, email code every 90 days), App updates (3.6), everything below.
- **CS lead:** CS KPI targets (with the Leader), quick replies, CS working hours.
- **Ops head:** field sites list (kiosk and venue pins), shared with HR.
- **HR:** shifts, working days and hours, field sites list (kiosk and venue pins, shared with the Ops head), holidays, leave types and balances, onboarding/offboarding checklists, location check radius, selfie required (on/off), location and selfie retention periods.
- **Everyone:** own language and notification channels; quick sign-in (fingerprint or PIN) and own devices in My profile.

## 12. Pages
`/login` (email → code), `/welcome` (access request form), `/pending` (waiting for approval), `/unlock` (fingerprint or PIN), `/profile` (quick sign-in, my devices), `/today`, `/tasks`, `/tasks/[id]`, `/projects`, `/projects/[id]`, `/calendar`, `/meetings`, `/meetings/[id]`, `/issues`, `/issues/[id]`, `/clients`, `/clients/[id]`, `/cs`, `/cs/[id]`, `/team`, `/hr/employees`, `/hr/employees/[id]`, `/hr/attendance`, `/hr/leave`, `/hr/discipline`, `/reports`, `/dashboard`, `/settings`, `/settings/access` (HR proposals, Leader approvals, invites, levels), `/settings/updates` (App updates), `/audit`, `/trash`
Menu items a person can't use are hidden.

## 13. Data model (main tables)
- `profiles` (id, employee_id, name, email, phone, department_id, position, supervisor_id, **access_level** (leader / manager / staff), **hr_access** (bool), **finance_access** (bool), **backup_approver_id**, **default_business** (all / icharge / iscreen), language, notify_email, active)
- `access_requests` (id, user_id, email, full_name, department_id, position, supervisor_id, mobile, requested_level, requested_hr, requested_finance, proposed_level, proposed_hr, proposed_finance, proposed_by, proposed_at, approved_by, approved_at, status (pending / proposed / approved / declined / sent_back), decline_reason, created_at)
- `invites` (id, email, access_level, hr_access, finance_access, department_id, invited_by, approved_by, approved_at, created_at, used_at)
- `access_changes` (id, profile_id, old/new level and switches, proposed_by, approved_by, status, reason, created_at) — every change after day one
- `user_devices` (id, profile_id, device_name, passkey_credential_id, passkey_public_key, pin_hash, failed_pins, last_email_code_at, last_seen_at, app_version, created_at, removed_at)
- `app_releases` (version, released_at, whats_new_en, whats_new_zh, min_required (bool), created_by)
- `allowed_email_domains` (domain, added_by, created_at) — starts with `icharge.com.ph`
- `business` is an enum used below: `icharge`, `iscreen`, `company`
- `business_metrics` (id, month, business, metric, value, note, entered_by) — dashboard figures entered or uploaded by Finance/Ops
- `departments` (id, name, head_id)
- `projects` (… **business**), `project_members`, `milestones`
- `tasks` (id, project_id, parent_task_id, title, description, owner_id, assigned_by, due_at, priority, status, waiting_on, needs_approval, acknowledged_at, completed_at, completion_note, follow_up_at, recurrence_rule, meeting_id, issue_id, **business**, created_at)
- `task_watchers`, `task_comments`, `task_history`, `attachments`
- `meetings`, `meeting_attendees`
- `issue_types` (id, name, department_id, default_owner_id, backup_id, respond_minutes, fix_minutes, is_finance, **business**)
- `issues` (id, type_id, **business**, title, source, location, severity, owner_id, reported_by, amount, status, reported_at, acknowledged_at, resolved_at, closed_at, notes)
- `hr_records` (profile_id, employment_status, start_date, regularization_date, end_date, work_setup, shift_id, emergency_contact) — Leader, HR; Manager for own team; Finance view
- `hr_private` (profile_id, address, wfh_lat, wfh_lng, gov_ids, private_notes) — Leader and HR; Finance may read gov_ids only (through a view)
- `documents` — Leader and HR
- `field_sites` (id, name, business, lat, lng, radius_m, active)
- `shifts`, `attendance` (profile_id, date, time_in, time_out, mode (office / wfh / field), field_site_id, field_other_reason, device_time_in, received_at, sent_late, late_minutes, undertime_minutes, in_distance_m, out_distance_m, location_ok, employee_reason, flags)
- `attendance_location` (attendance_id, in_lat, in_lng, in_accuracy_m, out_lat, out_lng, selfie_path) — employee (own), HR and Leader only
- `leave_types`, `leave_balances`, `leave_requests` (status, approver_id, reason)
- `holidays`
- `clients` (id, name, type, business, owner_id, contact_name, contact_phone, status, created_by, created_at)
- `client_kiosks` (client_id, kiosk_id)
- `contracts` (id, client_id, start_date, end_date, auto_renew, notice_days, file_path, special_terms)
- `client_terms` (id, client_id, kind (venue_share / client_price / bd_share), value, basis, valid_from, valid_to, set_by, approved_by, reason) — full history, never overwritten
- `client_notes` (id, client_id, author_id, noted_on, text, tag (asked / offered / agreed / changed), created_at, edited_at)
- `kiosk_usage_monthly` (kiosk_id, month, rentals, sales) — from the monthly back-office upload
- `cs_cases` (id, channel, customer_name, customer_mobile, order_no, kiosk_id, location, amount, business, type, status, owner_id, issue_id, created_at, first_reply_at, solved_at, reopened_at, rating)
- `cs_case_events` (id, case_id, at, actor_id, kind (customer / reply / action / handoff / system), text) — never deleted
- `cs_refund_requests` (id, case_id, amount, payment_method, requested_by, approved_by, paid_at, reference_no, status)
- `cs_quick_replies` (id, language, text, active)
- `cs_targets` (kpi, target, set_by, valid_from), `cs_quality_reviews` (profile_id, month, case_id, score, note)
- `disciplinary_cases` (profile_id, type, date, description, filed_by, response_due, acknowledged_at, response, decision, status)
- `checklists`, `reviews`, `notifications`, `push_subscriptions` (profile_id, device_id, endpoint, keys, created_at), `audit_log` (actor_id, action, table, record_id, subject_profile_id, old, new, at)

## 14. Build order (one step per Claude Code session)
1. Setup, split into three sessions:
   - **1a. Foundation:** Next.js, Supabase (Singapore), **iCharge theme** (colors, fonts, logo, mascot, menu icons), languages (English / 简体中文), departments, profiles, **business lines**, **access levels and the RLS helper functions**, **sign-in with @icharge.com.ph email + one-time code** (Resend SMTP, server-side domain check), the test accounts in 14.1 and the `test-login` script, first deploy to Vercel.
   - **1b. Access requests:** `/welcome` form, `/pending` page, HR proposal and Leader approval, invites, access changes, deactivation, audit log entries for all of these (section 3.5).
   - **1c. Phone app and updates:** PWA (install, offline shell, push), phone layout with the bottom menu, quick sign-in with fingerprint or PIN and My devices (3.5), **App updates: Update button, What's new, minimum version** (3.6).
2. Tasks: create, assign, acknowledge, statuses, comments, attachments, My day.
3. Reminders and escalation (pg_cron), notifications (in-app, push, email), daily digest. Includes the access emails from 1b: "Your access is ready", the invite email, and the 2-working-day reminders for unhandled access requests (3.5).
4. Projects: Kanban, calendar, milestones, recurring tasks.
5. Meetings and action items.
6. Issue log with targets, timers and escalation. **BD client tracker**: clients, contracts, profit-sharing terms with history, discussion log, renewal reminders and zero-usage alerts. **Customer service**: cases, transaction trail, quick replies, refund requests to Finance, handoffs to Ops, ratings and KPIs.
7. HR employee records, documents, onboarding/offboarding.
8. Attendance: Office, WFH and Field modes, GPS check, live selfie, offline save-and-send.
9. Leave and holidays, linked to task assignment.
10. Disciplinary records with acknowledgment.
11. Performance snapshot, team page, dashboards per group (with iCharge and iScreen panels and `business_metrics` entry/upload), reports, Excel export.
12. Audit log, Trash, backups, **access test run with all five test accounts (14.1)**, **deactivate the four plus-address test accounts**, **install test on one iPhone and one Android phone**, deploy to Vercel.
13. (Optional, phase 2) Capacitor phone apps for Android and iPhone with the mock-location check; staff-only distribution. **Done first (26 Nov 2026): Android app as a direct download** (`/download`): a Trusted Web Activity that opens the live web app full screen through Chrome, with Office Hub notifications under its own name and icon; no Play Store needed. iPhone stays Add to Home Screen.

### 14.1 Test accounts
- **Main tester:** earvin@icharge.com.ph (the Special Assistant's real account, Leader level).
- **One test account per group**, using plus addresses of the same mailbox (they pass the @icharge.com.ph check):

  | Group | Test email |
  |---|---|
  | Leader | earvin@icharge.com.ph |
  | Manager | earvin+manager@icharge.com.ph |
  | HR | earvin+hr@icharge.com.ph |
  | Finance | earvin+finance@icharge.com.ph |
  | Staff | earvin+staff@icharge.com.ph |

- Created by a seed script in step 1a (department, supervisor and level already set), so testing does not depend on the approval flow.
- **Getting a code for a test account:** if the company mail delivers plus addresses to earvin@, the code arrives there. If not (or while Resend only sends to earvin@), the builder runs a **local test script** (`npm run test-login <group>`) that prints a one-time sign-in link for that test account using the Supabase admin key. The script runs only on the builder's computer, is never deployed, and works only for the plus addresses above.
- Before launch: the four plus-address accounts are deactivated (kept in the audit log); earvin@ stays as the real Leader-level account.

## 15. Acceptance checks

### Work and HR
- A task without an owner or due date cannot be saved.
- An unacknowledged task reminds the owner after 4 working hours and notifies their Manager after 1 working day.
- An overdue task appears in the owner's and Manager's digest the next morning.
- Assigning a task due during approved leave shows a warning.
- Deactivating an employee who owns open tasks, projects or issues is blocked until they are reassigned.
- An issue past its response target turns red and notifies the backup and the Manager.
- A WFH time-in more than 200 m from the registered home pin is saved, flagged for HR review, and never marked AWOL automatically.
- WFH time-in is blocked when location permission is off.
- No location is recorded between time-in and time-out.
- Time-in cannot be saved without a live selfie, and a gallery photo cannot be used.
- Selfies older than 90 days and location data older than 1 year are deleted automatically.
- All pages work on a 320px-wide phone screen: the side menu is hidden, the ☰ menu reaches every page, and the bottom menu with the Time in button shows.
- The app installs to the Home Screen on an iPhone and on an Android phone, opens full screen, and receives a push notification on both.
- A Field time-in within 200 m of the chosen site is verified; one further away is saved and flagged; "Other" is always flagged with its reason.
- Field time-in is blocked when location permission is off.
- With the phone offline, a time-in is saved on the phone and uploaded when back online; HR sees the phone time and the received time, and a gap over 30 minutes is flagged.

### Customer service
- A CS staff member sees only their own cases and KPIs; the CS lead sees the whole CS team; the Leader sees all.
- Every reply, action and handoff appears on the case's transaction trail with the time, and can't be deleted.
- "Ask Finance to refund" creates a refund request for Finance; when Finance marks it paid with a reference number, the case updates (no message is sent to the customer).
- "Send kiosk problem to Ops" creates or links an issue; 3 cases at the same kiosk within 30 days raise a repeat-problem alert.
- The reply timer stops while a case is waiting on the customer, and out-of-hours messages count from the next working start.
- KPI values match a manual count on a test month of 20 sample cases.
- Customer mobile numbers are masked for anyone who isn't the case owner, the CS lead or the Leader.

### Client tracker
- A BD staff member sees only their own clients; the BD head sees the whole BD team; Finance sees all clients read only; other staff see no clients.
- 90 days before a contract ends, a renewal task is created for the owner; reminders follow at 60 and 30 days, and the BD head is alerted at 30 days.
- Changing a percentage keeps the old value with the date, who changed it and why.
- A BD profit share outside the commission plan can't be saved without a Leader's approval.
- The BD person's commission (rate, plan rate, history, payout) is visible only to that BD person and Leaders: not to the BD head, Finance or anyone else.
- A discussion note can't be deleted, and can be edited only within 24 hours.
- A client whose kiosks had zero rentals for 3 months shows a zero-usage alert.
- Renewal emails and push messages name the client and the end date but never the percentages.

### Business lines
- A project, task or issue cannot be saved without a business (a task with a project takes the project's).
- Switching to iScreen on My day, Projects, Issues or the Dashboard shows only iScreen items, and the tile and tab counts match.
- The switch choice carries over to the next page and is still there after logging in again.
- Every task, project, issue and action item shows its business pill with icon and name.
- The Dashboard shows the iCharge panel, the iScreen panel, or both, following the switch.
- Excel exports can be filtered by business.

### Sign-in and access requests
- An email not ending in @icharge.com.ph is refused, on the screen and when calling Supabase Auth directly.
- A code works once, expires after 10 minutes, and 5 wrong codes lock the email for 15 minutes.
- No password field exists anywhere in the app.
- A new person with a pending request sees only the "Waiting for approval" page and gets nothing from the API.
- An access request, invite or access change proposed by HR has no effect until a Leader-level user approves it; HR alone can never give access.
- HR or the Leader can deactivate a Staff or Manager account at once, and it stops working on the next page load.
- Nobody can approve their own request.
- An invited email gets access right after its first code, with the level set in the invite.
- A deactivated employee cannot get a code or sign in.
- The Special Assistant's account (earvin@icharge.com.ph) passes every Leader check below.
- The test-login script is not in the deployed app and refuses any email outside the 4 plus addresses.
- After quick sign-in is set up, reopening the app after 12 hours asks for fingerprint or PIN, not an email code; a new device or day 91 asks for an email code.
- 5 wrong PINs remove the PIN on that device and ask for an email code.
- No fingerprint data or plain PIN is stored on the server.

### App updates
- After a new version is pushed to `main`, an open app shows "New version ready · Update now" within 5 minutes; tapping it loads the new version and shows What's new.
- The banner does not appear during a time-in, selfie or unsaved form; an unsent time-in is still sent after the update.
- After the Leader taps "Ask everyone to update now", an app on an older version can't continue until it updates.
- Settings › App updates lists who is still on an older version.

### Access (test each with the five test accounts, in the app and by calling the API directly)
- Staff cannot open another employee's HR file, attendance or leave, even by changing the ID in the URL.
- A Manager can see their own team's tasks, attendance status and leave, but nothing from another department.
- A Manager sees "Location verified" or the distance, never GPS points or selfies.
- A Manager cannot see government IDs, documents, private HR notes, or the content of a disciplinary case.
- Finance can view government ID numbers, attendance and leave balances, but cannot edit any HR record or attendance.
- Finance cannot see selfies, GPS points, documents, private HR notes or disciplinary cases.
- HR can only propose access; nothing changes until the Leader approves. Nobody can change their own access.
- An HR user's own leave, balance, attendance corrections and disciplinary cases go to the Leader.
- When a Manager is on leave, their team's approvals go to their backup approver (or the Leader).
- Opening government IDs, documents, private notes, GPS points or selfies creates an audit log entry.
- Removing someone's access takes effect on their next page load and is recorded in the audit log.
- Email and push notifications never contain government IDs, GPS points or case details.
- Every HR change is in the audit log with who and when.

## 16. Not in version 1
Payroll calculation, BIR/SSS/PhilHealth/Pag-IBIG filing, biometric devices, Telegram notifications, in-app chat (use Viber), customer-facing pages, store versions of the phone app (phase 2, section 2), connection to the Besitter kiosk back office.
