# AROHA ’26 — MGCSIILS Cheruvarakonam

A mobile-friendly Arts Day website with a separate Stage Control portal. The public website displays the programme, winners with photographs, gallery and a department scoreboard. Stage Control uses Supabase authentication to submit or correct results and upload photographs. The scoreboard is calculated in PostgreSQL from the result records — no one needs to type department totals manually.

## Included

- `index.html` — public AROHA ’26 website.
- `admin.html` — separate sign-in-only Stage Control portal.
- `app.js` / `admin.js` — public result display and private control logic.
- `styles.css` — responsive burgundy, antique-gold and ivory design.
- `assets/images/aroha-dancer.webp` — classical dancer artwork used in the page design.
- `supabase/schema.sql` — database tables, scoring view, permissions, photo bucket and result submission function.
- `config.example.js` — configuration template. Copy it to `config.js` and add your project's public URL and anon key.

## Official departments and points

The database seeds the five departments:

1. BBA
2. B.Com
3. BA
4. Unitary
5. LLM

| Position | Individual competition | Group competition |
|---|---:|---:|
| First | 5 points | 10 points |
| Second | 3 points | 7 points |
| Third | 1 point | 2 points |

A group result stores **one department code for the entire team**, so the award is credited once to that department. It is not multiplied by the number of team members. The database does not have a mixed-department group result field.

The current result model accepts one official first-, second- and third-place record for each competition. If a competition has joint winners or multiple separate entries at the same position, the result model should be extended before entering those results.

## Important: connect Supabase before using Stage Control

The project files are a front-end. The login, result entry and photo upload become operational only after connecting a Supabase project and applying its schema. Do these steps once:

### 1. Create the free Supabase project

1. Create a project at <https://supabase.com/>.
2. Open **SQL Editor → New query**.
3. Copy all the contents of `supabase/schema.sql` into the editor and run it.
4. The script creates the departments, events, results, audit log, public scoreboard view, access policies and public photo bucket.

As of November 2026, Supabase's published Free quotas include 500 MB database size per project, 1 GB file storage, 50,000 monthly active users and 5 GB egress. Free projects with too little database activity over a 7-day period may pause; keep the project active before and during the event, and check the current limits before launch. Official references: <https://supabase.com/pricing> and <https://supabase.com/docs/guides/platform/free-project-pausing>.

### 2. Configure the browser connection

1. In Supabase, open **Project Settings → API** (or **Data API / API Keys**, depending on the dashboard layout).
2. Copy the **Project URL** and the **anon / publishable public key**.
3. Open the included `config.js` file in a text editor. (`config.example.js` is kept as a clean reference template.)
4. Replace the placeholders in `config.js`:

```js
window.AROHA_CONFIG = {
  supabaseUrl: 'https://YOUR-PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR_SUPABASE_ANON_PUBLIC_KEY'
};
```

Do **not** put the Supabase `service_role` or secret key in this website. The anon/publishable key is designed for browser use; the database permissions in `schema.sql` restrict what visitors and signed-in staff can do.

### 3. Create the administrator account

Do not enable public sign-up.

1. In Supabase open **Authentication → Users → Add user**.
2. Create the lead organiser's email/password account and confirm the email as appropriate for your project.
3. Copy that user's UUID from the Users table.
4. Run this in the SQL Editor, replacing the UUID:

```sql
insert into public.user_roles (user_id, role)
values ('PASTE-AUTH-USER-UUID-HERE', 'admin');
```

The administrator can create competitions in the **Manage Events** tab. The administrator should create all event rows before stage-control staff start submitting winners.

### 4. Create stage-control accounts

For each authorised stage-control person:

1. Create a user in **Authentication → Users → Add user**.
2. Copy the user's UUID.
3. Assign the stage-control role:

```sql
insert into public.user_roles (user_id, role)
values ('PASTE-AUTH-USER-UUID-HERE', 'stage_control');
```

Only accounts with an `admin` or `stage_control` role can submit results and upload images. The admin role can also create events. Staff accounts cannot create additional accounts or change access roles from the public website.

### 5. Publish the website free using GitHub Pages

1. Create a **public** repository on <https://github.com/new> (for example, `aroha-26`).
2. Upload the contents of this project folder to the repository root. `index.html` and `admin.html` must be in the root folder.
3. In GitHub, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**, select `main` and `/(root)`, then save.
5. Your public address will look like `https://YOUR-USERNAME.github.io/aroha-26/`.
6. Your private Stage Control address will be `https://YOUR-USERNAME.github.io/aroha-26/admin.html`.

The page is not password-protected by hiding the address. Security comes from Supabase sign-in, database row-level security, and the role checks. Keep the staff URL within the organising team, but do not treat the URL itself as a security measure.

## How stage control enters results

1. Sign in to `admin.html` with the staff account.
2. Select an event, place and department.
3. For individual competitions, enter the individual winner's name. For group competitions, enter the group/team name and optionally list team members.
4. Select one department for the entire group. All team members must represent that department.
5. Upload an optional winner/team photograph and publish.
6. The public winners directory, medal counts and department points refresh from the same database records.

To correct a recent result, use **CORRECT** beside the submission. Re-submitting an already-used event/position replaces that podium record and records the change in the audit log. Replacing a result does not add its old points a second time — the scoreboard is derived from the current published records.

## Photo handling

- The upload control accepts JPG, PNG and WebP, up to 5 MB per image.
- Winner images are stored in the `aroha-winner-photos` bucket under `winners/`.
- Gallery images use `gallery/` and are added to the `gallery_items` table.
- Get consent/permission before publishing student names and photos. Avoid uploading sensitive documents or personal information.

## Test locally

After configuring Supabase, serve the folder with a local web server (for example VS Code Live Server or `python -m http.server 8000`) and open `http://localhost:8000`. The admin portal uses Supabase Auth and will not work correctly when opened as a `file://` URL.

## Operational notes

- The public site can be viewed without signing in. Only published results, published events and published gallery items are public.
- Score rules are enforced in the database function and scoreboard view, not only in browser JavaScript.
- Keep a copy/export of the event results during the festival. A free hosted project is convenient, but it is not a substitute for event-day backups.
- Before the festival, test sign-in, result submission, correction, team scoring, photo upload, public display and logout with test accounts and test records.


## Additional AROHA '26 features

The current website also includes:
- A countdown to the first scheduled event (5 November 2026, 9:00 AM IST).
- A live championship race with animated department point bars and a 25-second public refresh.
- A downloadable PDF achievement certificate on each published winner card.
- An administrator-only Excel workbook export (department scores, winners, event schedule).
- An administrator-only PDF festival results report.
- An official championship finale that remains locked until an administrator reveals the verified winner.

### One-time database migration for the championship finale

After the main `schema.sql` has been run, open `supabase/add-festival-features.sql` and run the complete file in the Supabase SQL Editor. This creates the public-read / admin-update `festival_settings` row and stores the official champion snapshot. Without this migration, the rest of the site continues to work, but the official finale reveal control remains disabled.

To reveal the final champion:
1. Sign in to `admin.html` with an administrator account.
2. Confirm that all results have been entered and verified.
3. Use **Reveal Final Champion** in the Championship Finale card.
4. The public finale will show the frozen champion name(s), points and medal tally. The reveal can be locked again by the administrator.

### Reports and certificates
- **Winner certificate:** Open the public Winners section and select **Download Certificate**. A PDF is generated in the browser.
- **Excel report:** In Stage Control, administrator accounts can download an .xlsx workbook containing Department Scores, Winners and Event Schedule sheets.
- **PDF report:** In Stage Control, administrator accounts can download a consolidated PDF results report.

The PDF and Excel exports load jsPDF and SheetJS from their public CDNs; an internet connection is required when exporting.
