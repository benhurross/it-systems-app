# AP Plus IT Systems - Implementation Plan

## Context

AP Plus runs IT operations from `IT Master Sheets.xlsx`, an 88-sheet workbook covering tickets
(~2,000 rows), assets, licences, network devices, budget, KPIs, risks, changes and
joiner/leaver tracking. The brief (`AGENTS.md`) asks for one modern web app that replaces it:
- helpdesk and incidents
- asset management with discovery, and a CMDB
- software compliance
- purchases, contracts and budget
- network monitoring and projects
- a KPI dashboard
- admin-only system Settings

The app is client-side rendered, with a backend and a database, so data persists.

This is a standalone project at `C:\Users\ginee\Desktop\Claude Cowork\AP IT System App\`, with
its own repository, dependencies, database and configuration. AP Web v2 is a separate project.
The only thing taken from it is a copy of the AP Plus logo files, and nothing in it is modified.

### Decisions (from the user)

| Topic | Decision |
| --- | --- |
| Location | The app sits at the root of `AP IT System App`, beside `AGENTS.md`, in its own git repo. No code, config, database or path is shared with AP Web v2 |
| Assets | Only the AP Plus logos are copied from AP Web v2, into `public/brand/`. Any further asset a screen needs is copied the same way, never referenced across projects |
| Modules | Core brief and admin-only Settings, plus Knowledge Base, Change Management, Risk & Vulnerabilities, Onboarding/Offboarding |
| Language | English and Arabic, `/en` and `/ar`, full RTL |
| Typeface | IBM Plex Sans (Latin) and IBM Plex Sans Arabic, via `next/font/google` |
| Theme | Light, Dark and System. System follows the OS and is the default |
| Text size | An in-app control that scales the whole interface in five steps |

### Decisions (mine, stated for review)

My last four questions were dismissed. Settings being admin-only settles sign-in. The others
use the option I recommended, and any of them can change.

- **Database: PostgreSQL**, in this project's own Docker container (host port 5433, own volume), separate from AP Web v2's database on 5432.
  - Drizzle ORM, with committed SQL migrations.
  - Unit tests run on PGlite (Postgres inside Node), so they need no Docker.
  - Playwright uses a separate `ap_it_test` database in the same container.
- **Sign-in: accounts with roles.** Better Auth: email and password, sessions stored in Postgres, no public sign-up.
  - Three roles: Admin, IT staff and Employee (see Roles).
  - The first admin is created with `npm run admin:create`. Admins create everyone else in Settings.
- **Monitoring and discovery are real.** The server checks each monitored device on an interval (TCP port or ping), stores the history and raises alerts. Discovery sweeps a subnet, up to /24, that an IT user enters.
  - Results only mean something where the server can reach the office network.
  - The demo data therefore ships with checks paused and a day of sample history. An admin switches checks on in Settings.
- **Starting data.** Development and tests use fictional demo data (`npm run db:seed:demo`), with demo accounts for the three roles.
  - Production starts with the reference lists taken from the workbook's dropdown sheets, default settings and the first admin.
  - Importing the workbook's real records is out of MVP scope.
- **Client-rendered over an API.** Pages are client components. They read and write through REST route handlers in the same Next.js app, via TanStack Query.
  - Any successful change refetches what is on screen, so dashboards and counts update at once.
  - Every handler checks the session and role itself. Hiding a link is not access control.
- **Scaffolding.** "AP IT System App" is not a valid npm package name, so create-next-app cannot target the folder. The app is generated in a temp folder as `ap-it-systems` and moved to the root. `AGENTS.md` and the workbook stay untouched.
- **Logo files.** They come from `AP Web v2/web/public/assets/svg/logos/`:
  - colour lockups `applus-logo.svg` and `applus-logo-ar.svg`
  - white lockups `applus-white.svg` and `applus-white-ar.svg`
  - the white AP mark `ap_head.svg`, for the collapsed sidebar on a brand-blue tile
  - `ap-logo.svg`, used as the favicon

  The legacy `logo-short*.svg` files are theme-template placeholders (`#377dff`), not AP Plus marks, so they are not used.
- **Brand colours** are declared in this project's own `globals.css`, with values from the AP Plus theme:
  - primary `#0047BA`, navy `#21325B`, accent `#00c9a7`, info `#09a5be`, warn `#f5ca99`, danger `#ed4c78`
  - surface `#f7faff`
  - greys darkened to pass WCAG AA

  The dark theme is built from the navy, and it lightens the primary so it keeps 4.5:1 contrast.
- **Workbook data.** The workbook holds real employee names and emails, and its "Tasks" sheet holds a plaintext admin credential. None of that is copied, and `*.xlsx` is git-ignored. That credential should be rotated.
- **Arabic.**
  - Fixed values such as statuses and priorities are translated in the message files.
  - Reference lists carry English and Arabic labels, editable in Settings. The asset taxonomy is seeded with the workbook's own Arabic labels.
  - Other Arabic copy is my translation and should get a native-speaker review.
  - Free-text records are shown as entered.
  - Dates use the Gregorian calendar with Latin digits in the Asia/Riyadh time zone, and amounts are in SAR.
- **Display preferences** (theme and text size) are stored per device in `localStorage`, so they apply before first paint. Everything else is in Postgres.

## Roles

| Area | Admin | IT staff | Employee |
| --- | --- | --- | --- |
| Dashboard, KPIs and every IT module | Yes | Yes | No |
| Tickets | All | All | Own only: raise, view, comment, rate |
| Knowledge Base | Manage | Manage | Read published |
| Settings | Yes | No | No |

Employees get a reduced shell with three items: My requests, New request and Knowledge Base. The "New request" form asks whether something is broken (an incident) or needed (a request).

## Settings (admin only)

- **Users**: create an account with name, email, role, linked employee record and a temporary password. Change role, reset password, deactivate and reactivate. Admins cannot change their own role or deactivate themselves, so the system cannot be locked out.
- **Lists**: bilingual reference lists for:
  - locations and departments
  - issue types
  - asset categories, asset types and manufacturers
  - KB, vendor and budget categories

  Lists can be added to, renamed, reordered and deactivated. A deactivated value stays on existing records but is no longer offered in forms.
- **Service desk**: SLA target hours per priority. The due time is stored on each ticket when it opens or changes priority, so changing a target never rewrites past SLA results.
- **Monitoring**: checks on or off, interval, timeout, degraded-latency threshold and history retention. The scheduler picks up changes without a restart.
- **KPIs**: baseline and target per KPI per year, for the workbook's five KPIs.
- **Organisation**: the name shown in the app and on exports, and the fiscal year start month.
- **Audit log**: every create, update and delete, with who, when and what. It is read only; no endpoint changes or deletes entries.

## Display settings

- **Theme.** `next-themes`, with the class strategy shadcn documents. The options are Light, Dark and System; System is the default. The theme is applied before first paint.
  - Every colour is a token with a light and a dark value: surfaces, text, borders, status badges, chart series and the CMDB canvas (React Flow `colorMode`).
  - The sidebar stays navy in both themes, a shade deeper in dark.
- **Text size.** Five steps: 87.5%, 100% (the default), 112.5%, 125% and 137.5%. The step is set as the root font size through `data-text-size` on `<html>`.
  - Tailwind sizing is rem-based, so the whole interface scales like zoom and reflows instead of clipping. Chart labels are set in rem too.
  - Each step is a percentage, so the browser's own base size is respected.
  - Rem units in media queries resolve against the browser default, so breakpoints do not move. That is why the largest step is tested at every width.
- **Controls.** A Display menu ("Aa") in the top bar holds a Light / Dark / System segmented control and text size A- / A+ / Reset. The same actions are in the Ctrl+K command menu.

## Stack

Latest stable versions at install, recorded in `PLAN.md`:

- Next.js 16 (App Router, TypeScript, Turbopack) and React 19
- Tailwind CSS v4, shadcn/ui (Radix) and `next-themes`
- next-intl, with `src/proxy.ts` (Next 16's renamed middleware; confirm against the docs at install)
- TanStack Query (server state) and TanStack Table (data grids)
- Recharts via the shadcn chart component, and `@xyflow/react` for the CMDB graph
- react-hook-form, zod and `@hookform/resolvers`. The zod schemas are shared by forms and API handlers
- Better Auth, with the admin plugin and the Drizzle adapter
- Drizzle ORM, drizzle-kit and node-postgres, against the latest stable PostgreSQL image via Docker Compose
- date-fns and lucide-react
- Tests: Vitest, Testing Library, jsdom, PGlite, Playwright and `@axe-core/playwright`
- If typescript-eslint or the React ESLint plugin still lag the newest TypeScript or ESLint major at install, pin those to the newest supported versions

### Installed versions (Phase 1)

| Package | Version | Note |
| --- | --- | --- |
| next / react | 16.3.7 / 19.3.0 | Turbopack |
| tailwindcss / shadcn | 4.3.3 / 4.21.0 | `radix-nova` style, RTL enabled |
| next-intl / next-themes | 4.14.7 / 0.4.6 | |
| @tanstack/react-query / react-table | 5.104.0 / 9.2.4 | Table v9: explicit `tableFeatures` and `useTable` |
| recharts / @xyflow/react | 3.10.1 / 12.12.0 | |
| react-hook-form / zod | 7.89.0 / 4.6.5 | |
| better-auth | 1.7.6 | |
| drizzle-orm / drizzle-kit / pg | 0.45.3 / 0.31.11 / 8.23.0 | |
| PostgreSQL / PGlite | 18 (alpine) / 0.5.8 | |
| vitest / @playwright/test | 5.0.2 / 1.63.0 | |
| typescript | 6.0.3 | pinned: typescript-eslint supports <6.1 |
| eslint | 9.39.5 | pinned: eslint-plugin-react supports up to 9 |

`next dev` writes its agent-rules block into AGENTS.md when it detects an AI agent, unless CLAUDE.md already holds the block. CLAUDE.md carries it, so AGENTS.md stays as written.

`@swc/core` is pinned to 1.16.2 through `overrides`. next-intl's plugin loads it, and 1.16.12 (released 2026-09-29) refuses to load on this machine: it validates its native-binary cache under `%LOCALAPPDATA%\swc` and rejects a user profile that grants an AppContainer SID full control. 1.16.2 is inside next-intl's `~1.16.0` range and is what AP Web v2 runs. Drop the override once a later 1.16.x loads here.

## Structure

```
AP IT System App/
  AGENTS.md  IT Master Sheets.xlsx (git-ignored)  PLAN.md  README.md
  package.json  next.config.ts  tsconfig.json  drizzle.config.ts  vitest.config.ts  playwright.config.ts
  docker-compose.yml         Postgres for this project only (port 5433)
  .env.example               DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL
  drizzle/                   generated SQL migrations
  scripts/                   migrate, seed (reference lists + settings), seed-demo, create-admin
  public/brand/              logo files copied from AP Web v2
  messages/en.json, ar.json
  src/proxy.ts               locale routing + redirect to sign-in
  src/instrumentation.ts     starts the monitoring scheduler on the Node server
  src/i18n/
  src/app/[locale]/sign-in/
  src/app/[locale]/(app)/    AppShell layout and one folder per module ('use client' pages)
  src/app/[locale]/(app)/settings/   admin-only section
  src/app/api/auth/[...all]/ Better Auth
  src/app/api/<resource>/    REST handlers: session and role check, zod, Drizzle, audit entry
  src/server/db/             Drizzle schema and client
  src/server/auth.ts         Better Auth config, requireUser / requireRole
  src/server/audit.ts
  src/server/monitor/        probes (TCP, ping), scheduler, discovery sweep
  src/lib/                   pure rules, zod schemas, format, csv, text-size (shared client/server)
  src/components/ui/         shadcn generated
  src/components/            AppShell, AppSidebar, Topbar, DisplayMenu, CommandMenu, LocaleSwitcher,
                             PageHeader, SectionTabs, DataTable, StatCard, StatusBadge, EmptyState
  tests/                     Vitest (components in jsdom; rules, API and seeds in node on PGlite)
  e2e/                       Playwright
```

The sidebar sits on the start edge, so it moves to the right in Arabic. It has these groups:

- **Overview**: Dashboard, KPIs
- **Service Desk**: Tickets, Knowledge Base, Changes
- **Infrastructure**: Assets, CMDB, Software, Network
- **Management**: Projects, Finance, Risk & Security, People
- **Settings**: shown to admins only

Sections with sub-pages use route tabs:

- `assets/{inventory,discovery}`
- `finance/{budget,purchases,contracts,vendors}`
- `risk/{register,vulnerabilities}`
- `people/{directory,onboarding,offboarding}`
- `settings/{users,lists,service-desk,monitoring,kpis,organisation,audit}`

The dev server runs on port 3200 and the e2e server on 3300, so this project never collides with AP Web v2 (3000 and 3100).

## Domain rules (pure functions, unit-tested)

- **SLA**: target hours per priority come from Settings; the defaults are critical 4, high 8, medium 24 and low 72. `dueAt` is fixed when a ticket opens or changes priority, and a ticket is breached when `closedAt ?? now` passes it. The workbook's KPI sheet defines three measures:
  - TAT: the share of tickets resolved within SLA. Baseline 68%, target 90%.
  - Complaints: breaches per quarter. Baseline 16, target 8.
  - Satisfaction: mean CSAT captured on close. Baseline 3.5, target 4.5.
- **Licences**: a licence is over-deployed when installs exceed seats. It is expired, or expiring within 60 days, based on its expiry date. Compliance % counts licences that are neither over-deployed nor expired.
- **Finance**: contracts are active, expiring within 90 days, or expired. Committed spend per budget category is contract cost in the fiscal year plus purchases that are approved, ordered or received. Also computed: utilisation and an over-budget flag.
- **CMDB**: `impactOf(ci)` walks reverse dependency edges breadth-first and is cycle-safe.
- **Asset lifecycle**: flags warranty expiring within 90 days, end-of-support or end-of-life status, and end-user devices older than 4 years that are due for replacement.
- **Monitoring**: a probe returns up or down with a latency.
  - Ping counts as success only on a reply carrying a TTL. Windows `ping` exits 0 on "destination host unreachable", so the exit code alone is not enough.
  - A device is down after two failed checks in a row, and degraded when latency exceeds the threshold.
  - Alerts open on down or degraded, and resolve on recovery.
  - Availability % is reported over 24 hours and 7 days.
- **Discovery**: CIDR expansion is capped at /24. Results are reconciled against inventory by MAC, then IP: registered, unregistered, or registered with a changed IP.
- **Risk**: score is likelihood x impact on a 5x5 grid. Levels are low (1-4), medium (5-9), high (10-16) and critical (17-25). A vulnerability is overdue when it is still open after its remediation deadline.
- **People**: onboarding progress is tracked across the workbook's three phases (Preparation, During, After). Offboarding tracks the 90-day mail-forwarding window from the resignation date.
- **Access**: `can(role, action)` backs every handler and the navigation.
- **Text size**: stepping clamps to the five steps, and reset returns to 100%.
- **CSV**: RFC 4180 quoting. Formula cells starting with `= + - @` are prefixed with `'` to defuse them.
- **References**: each record has a database identity and a display reference in the workbook's style: `IT000351`, `AST-0142`, `LIC-001`, `CHG-001`, `RSK-001`, `VULN-001`, `KB-001`, `PRJ-001`, `PR-001`, `CON-001`.

## Phases

The plan is copied to `PLAN.md` at the project root in Phase 1 and checked off as work lands.
Each phase ends with a local git commit. There is no remote.

### Phase 1 - Scaffolding, database and design system
- [x] `git init` at the `AP IT System App` root. `.gitignore` covers `node_modules`, `.next`, `coverage`, `playwright-report`, `test-results`, `.env*` (except `.env.example`), `*.tsbuildinfo`, `next-env.d.ts` and `*.xlsx`
- [x] Next.js app generated as `ap-it-systems` and moved to the root, with `AGENTS.md` untouched. Dependencies are installed at latest and their versions recorded
- [x] `docker-compose.yml` runs this project's Postgres on 5433 with its own volume. `npm run db:up` starts it
- [x] Drizzle configured. `npm run db:migrate` applies migrations to Docker Postgres, and the tests apply the same migrations to PGlite
- [x] Logo files copied into `public/brand/`. No path in code or config points outside this folder
- [x] shadcn initialised, with light and dark token sets driving every variable
- [x] IBM Plex Sans and IBM Plex Sans Arabic load through `next/font` with no layout shift
- [x] Vitest (jsdom and node) and Playwright configured, with one smoke test each passing
- [x] Scripts: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `e2e`, `db:up`, `db:generate`, `db:migrate`, `db:seed`, `db:seed:demo`, `admin:create`. Lint, typecheck and build are clean

### Phase 2 - Sign-in, i18n, app shell and display settings
- [x] Better Auth: email and password, database sessions, admin plugin, no public sign-up. `admin:create` prints a one-time password
- [x] Sign-in page in both locales, and sign-out. Unauthenticated pages redirect to sign-in, and unauthenticated API calls get 401
- [x] `requireUser` and `requireRole` return 401 or 403 before any handler work
- [x] next-intl for `en` and `ar`. `/` redirects to `/en`. `<html lang dir>` is set per locale, and Radix `DirectionProvider` is wired
- [x] AppShell: collapsible sidebar, off-canvas on mobile, with role-aware navigation. The top bar holds the command menu (Ctrl+K), New ticket, Display menu, locale switcher and the user menu
- [x] Display menu: theme (Light / Dark / System) and five-step text size. Both are remembered, applied before first paint, and available in the command menu
- [x] TanStack Query provider. A successful mutation refetches active queries
- [x] Shared `DataTable`: sorting, text search, faceted filters, pagination, CSV export
- [x] `PageHeader`, `SectionTabs`, `StatCard`, `StatusBadge` and `EmptyState` built
- [ ] Charts and the CMDB canvas render LTR inside RTL pages, follow the theme, and scale with text size
- [x] Unit tests: `can()`, en/ar message key parity, format helpers, CSV, text-size stepping, the Display menu, role-aware navigation

### Phase 3 - Data model, API and seeds
- [x] Drizzle schema covers:
  - every module, plus reference lists, settings and the audit log
  - monitor checks, alerts and discovery runs
- [x] REST handlers for every resource. Each one checks role and scope, validates with zod, writes through Drizzle, and records an audit entry
- [x] Every domain rule above implemented as a pure function
- [x] `db:seed` loads the reference lists from the workbook's dropdown sheets, with both labels, plus default settings. It can be re-run safely
- [x] `db:seed:demo` is deterministic and fictional. It produces:
  - ~60 employees and demo accounts for the three roles
  - ~140 assets, ~40 CMDB relationships and ~350 tickets over 12 months
  - licences, vendors, contracts, purchases, budget, projects, KB articles, changes, risks, vulnerabilities, joiners and leavers
  - a day of monitoring history, with checks paused
- [x] Unit tests cover:
  - every rule, including edge cases
  - every handler, run against PGlite, including 401, 403 and employee scoping (an employee cannot read another person's ticket)
  - seed referential integrity and idempotence
- [x] Coverage of `src/lib` and `src/server` is at least 90% (98.7% of lines; the database connection, session lookup and auth client config are wiring left to Playwright)

### Phase 4 - Settings (admin only)
- [x] Settings appears only for admins, in the sidebar and the command menu. A non-admin opening a Settings URL sees a 403 page, and every Settings endpoint returns 403 to them
- [x] Users: create, change role, reset password, deactivate and reactivate, and link to an employee. Admins cannot demote or deactivate themselves. A deactivated user cannot sign in, and their sessions end
- [x] Lists: add, rename (English and Arabic), reorder and deactivate. Forms offer only active values
- [x] Service desk: SLA hours per priority, applied to new and re-prioritised tickets only
- [x] Monitoring: on/off, interval, timeout, threshold and retention. The scheduler follows changes without a restart
- [x] KPIs: baseline and target per KPI per year
- [x] Organisation: name and fiscal year start month
- [x] Audit log: filterable by user, entity and date, read only

### Phase 5 - Service Desk and employee requests
- [x] Tickets list: tabs All / Incidents / Requests. Filters: status, priority, issue type, location, assignee. Shows an SLA countdown or a breach badge
- [x] New ticket and Report incident dialogs for IT staff, and a New request form for employees. All validate with zod
- [x] Ticket detail:
  - status workflow, assignment, priority and comment timeline
  - resolve and close with a CSAT rating, and reopen
  - linked asset, suggested KB articles, and the ticket's audit history
- [x] Employees see and act on their own tickets only, and read published KB articles only
- [x] Knowledge Base: search, categories, article view, create/edit, draft/published/retired states, review-due flag
- [x] Changes: register, create/edit, approval workflow, risk, rollback plan, linked CI and ticket, result

### Phase 6 - Assets, Discovery, CMDB, Software
- [x] Inventory: filters for category, status and location; lifecycle flags; CSV export
- [x] Asset detail:
  - specs, assignment and lifecycle
  - monitoring target (none, ping, or TCP host and port)
  - installed software, relationships, movement history and related tickets
- [x] Asset actions: add, edit, move/reassign (writes a movement record), retire
- [x] Discovery: a real sweep of the entered subnet runs in the background with live progress. It probes ping plus ports 22, 80, 443, 445, 3389 and 9100, looks up reverse DNS, and reads MACs from the ARP table where available
- [x] Discovery results are reconciled against inventory. An unregistered device can be added through a prefilled form
- [x] CMDB: CI list and a graph of the selected CI's neighbourhood, with an impact analysis panel and add/remove relationship
- [x] Software: licence register with seats vs installs, compliance status and expiry. Compliance summary cards and an audit report CSV export

### Phase 7 - Network monitoring and Projects
- [x] The scheduler starts from `instrumentation.ts`, once per server, and probes monitored devices at the configured interval with bounded concurrency
- [x] Check results are stored, and history older than the retention window is pruned daily
- [x] Network page: device status, latency, availability and sparklines. It refreshes every 10s. When checks are paused, admins see a notice linking to Settings
- [x] Alerts panel: open and resolved alerts, acknowledge, and Create ticket
- [x] Daily checks checklist, using the workbook's Daily Monitoring items and recorded per day and per person
- [x] Projects: list with owner, status, due date and progress. Create a project; the detail page has a task board (To do / In progress / Done) where moving a task updates progress

### Phase 8 - Finance, Risk & Security, People
- [x] Budget: allocation vs committed per category for the fiscal year, utilisation bars, and renewals in the next 90 days
- [x] Purchases: requested, then approved or rejected, then ordered, then received. A received hardware purchase offers "Add to inventory"
- [ ] Contracts register with renewal status, and a Vendors directory
- [ ] Risk register with a 5x5 heatmap, treatment, owner and review date
- [ ] Vulnerability log with severity, deadline and overdue flag
- [ ] Directory: employees, used as requesters and asset holders
- [ ] Onboarding: joiner record with a three-phase checklist; completing it creates the employee
- [ ] Offboarding: leaver record with a checklist and a 90-day forwarding countdown

### Staff list for local testing
The demo seed can use the real staff list in place of invented people, for testing on the owner's machine. The list holds real names and emails, so it stays on that machine and is never committed (`*.xlsx` is ignored). Tickets, assets and the other records stay fictional, and tests keep using the invented people.
- [x] `npm run people:check "<file.xlsx>"` reads the list and reports how it will load. Departments are matched to the list; missing emails get `@no-email.invalid` placeholders, missing titles "Employee", and everyone is in Jeddah unless a Location column says otherwise. Accounts go only to active people with a real email and a Role of admin or IT staff
- [x] `npm run db:seed:demo "<file.xlsx>"` (or `-- --people <file.xlsx>`) loads those people and accounts (one-time password each) in place of the invented ones. The IT work goes to the account holders outside Executive: an IT admin approves, IT staff take the helpdesk, the rest share the queue. Only people already inactive get offboarding records; the newest hires get finished onboarding records. Without `--people` the demo data is unchanged

### Phase 9 - Dashboard and KPIs
- [ ] Tiles:
  - open tickets, SLA compliance, average resolution and network availability
  - assets in use, licence compliance, budget utilisation and open high risks
- [ ] Charts (load the `dataviz` skill first), with light and dark series colours: tickets opened vs closed over 12 months, tickets by issue type, assets by category, budget vs committed
- [ ] "Needs attention" list: SLA breaches, down devices, expiring licences, contracts and warranties, overdue vulnerabilities, offboarding due
- [ ] KPIs page shows the five KPIs with baseline and target from Settings, Q1-Q4 actuals and RAG status:
  - TAT, complaints and satisfaction are computed from tickets
  - training hours and ISO 9001 non-conformities are entered by IT staff
- [ ] Closing a ticket or approving a purchase updates the dashboard without a reload

### Phase 10 - Integration testing (Playwright)
- [ ] Runs on Chromium, Firefox and WebKit against the production build and a fresh `ap_it_test` database (migrated and seeded in global setup). Signed-in sessions are prepared once per role, and specs that change settings run serially
- [ ] Every route renders its heading in both locales, for each role allowed to see it, with no console errors
- [ ] Journeys:
  - IT staff ticket lifecycle, an employee's request from raising it to rating it, incident report, KB suggestion and change approval
  - asset move, CMDB impact and licence audit export
  - discovery of `127.0.0.1/32` added to inventory
  - monitoring of a TCP port the test opens then closes: up, then down with an alert, then a ticket
  - project task progress, purchase to budget, received to inventory, risk heatmap, joiner completion and offboarding countdown
  - command menu
- [ ] Settings journeys:
  - an admin creates a user, who signs in without seeing Settings
  - a deactivated user cannot sign in
  - a list change reaches the forms, and an SLA change reaches new tickets
  - each of these shows up in the audit log
- [ ] Access: employees are blocked from IT modules and Settings in the UI and the API. Signed-out visitors land on sign-in
- [ ] Persistence: changes survive a reload
- [ ] Locale switch keeps the page and sets `dir="rtl"`
- [ ] Theme: toggling sets `html.dark`, and System follows `prefers-color-scheme`. The choice survives reload
- [ ] Text size: each step changes the root font size, and the choice survives reload
- [ ] At the largest text step there is no horizontal scroll and no clipped control at 375, 768 and 1280px
- [ ] axe finds no serious or critical violations in either locale or either theme
- [ ] Every defect found is fixed, with a regression test

### Phase 11 - Handover
- [ ] Minimal README: prerequisites (Node, Docker), setup, scripts, and where the demo accounts are defined
- [ ] Lint, typecheck, unit, build and e2e all green, with no skipped tests
- [ ] Postgres up, migrated and loaded with demo data
- [ ] `.claude/launch.json` added and the dev server started with `preview_start`
- [ ] Visual check at desktop and mobile widths, in both locales and both themes, at default and largest text size, as each role
- [ ] Outcome section written in `PLAN.md`

## Out of scope for the MVP

Email notifications, file attachments, Microsoft 365 / Active Directory sign-in, importing the workbook's records, and multi-server deployment of the monitoring scheduler.

## MVP success criteria

1. Every brief module, Settings and the four extras work end to end, in English and Arabic.
2. Data persists in Postgres across reloads and server restarts.
3. The API enforces access for every call:
   - Settings is admin-only.
   - Employees reach only their own tickets and published articles.
   - Signed-out calls get 401.
4. A change shows immediately wherever it is counted: dashboard, KPIs, budget and CMDB. Every change is in the audit log.
5. Monitoring and discovery perform real checks. Alerts open and resolve on their own, and an alert becomes a ticket in one step.
6. Light, Dark and System themes and all five text sizes work on every page, with AA contrast and no horizontal scroll.
7. The project is self-contained in `AP IT System App`. AP Web v2 is unchanged, and nothing in it is referenced at build or run time.
8. Unit and Playwright suites are green with no skipped tests. Axe is clean. Build, lint and typecheck are clean.
9. Postgres and the server are running, with demo data loaded, ready for the user.

## Verification

From `AP IT System App`:

```bash
npm run db:up
npm run db:migrate && npm run db:seed && npm run db:seed:demo
npm run lint && npm run typecheck
npm test
npm run build
npm run e2e
```

Then start the dev server with `preview_start`. In the browser pane, sign in as each demo role
and walk these journeys in `/en` and `/ar`:

- As an employee, raise a request. As IT staff, work it and close it, then watch the dashboard move. As the employee, rate it.
- As an admin, create a user, edit a list, change an SLA target and switch monitoring on. Then read all four changes in the audit log.
- Run discovery on the local machine, and add the device it finds.
- Open a server in the CMDB and read its impact.
- Approve a purchase and watch the budget change.
- Switch themes, and step the text size to its largest and back.

Take screenshots at desktop and mobile widths.
