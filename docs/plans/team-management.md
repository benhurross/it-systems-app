# Plan: IT Admin role and Team Management

Status: approved and built (IT Admin role, tasks and emails, plans and dashboard).

## 1. Roles

| Role | Who | What they have |
|---|---|---|
| **Admin** | The IT Manager and the developer | Everything, plus the audit log and **Team Management**. Only an Admin can make someone an Admin. |
| **IT Admin** (new) | The IT team | Everything an Admin has (settings, users, lists, email, API keys, KPIs, all IT modules), except: the audit log, Team Management, and Admin accounts. |
| IT staff | (unchanged) | The IT modules, no settings. |
| Employee | (unchanged) | Their own requests. |

What an IT Admin cannot do or see:

- **Audit log**: not in the menu, and the API refuses them.
- **Team Management**: not in the menu, and the API refuses them. Their own tasks show under **My work** (section 3).
- **Admin accounts**: they can see that an Admin account exists, but cannot add an Admin, make anyone an Admin, change an Admin's role, reset an Admin's password or deactivate one. This is checked on the server, not only hidden in the page, so no one can raise their own role.
- **Team emails in the email outbox**: the emails Team Management sends ("task due", "task done, to review") are left out of Settings → Email → Outbox for everyone but Admins.

How roles are given: after the update, an Admin opens Settings → Users and changes each team member from Admin to IT Admin. Real email addresses are not written into the code.

## 2. Team Management (Admins only)

A new menu entry under Management, seen only by Admins.

### Tasks

Each task has:

- a title and description;
- who it is for (one team member);
- who asked for it: IT Manager, CEO, GM, DGM, another C-suite member (by title), or a name;
- priority (low, medium, high, urgent) and a due date;
- a progress bar (0 to 100%, moved by the member);
- an optional link to an IT project;
- an optional **Confidential** mark: seen only by the Admins and the one member it is for.

Only Admins create, assign and delete tasks.

### Board (Kanban)

| To do | In progress | Done, to review | Confirmed |
|---|---|---|---|

- The member moves a task from To do to In progress to Done.
- The manager then **confirms** it (Confirmed) or **sends it back** with a comment (back to In progress).
- Only confirmed tasks count as completed.
- Each card shows the member, who asked, its priority, its due date (red when overdue) and its progress bar.
- Filters: member, who asked, priority, confidential, overdue.
- A list view is offered beside the board, for many tasks.

Each task keeps a **timeline**: created, started, progress updates and comments, marked done, confirmed or sent back, with dates.

- **Private notes** written by the manager are never shown to the member.
- The member's updates and the manager's comments when sending a task back are shown to the member.

### Planning board

The plans the team writes for themselves (section 3), all in one view:

- **Week view**: a row for each member, a column for each day. Their plan entries and the tasks due that day.
- **Month view**: a calendar.
- Days a member is busy or away (exam, training, leave, out of office) are coloured, so the manager sees who to give lighter work.

### Dashboard

- **Figures**: assignments, in progress, to review, overdue, due this week, confidential.
- **Each member's workload**:
  - tasks given to them;
  - tickets assigned to them in the service desk (open and overdue);
  - IT project tasks assigned to them;
  - with a progress bar of confirmed against all.
- **To review**: the tasks marked done, waiting for confirmation.
- **Upcoming**: due in the next 7 days.
- **Recent activity**: started, updated, done, plan entries added.

## 3. My work (every IT Admin, IT staff and Admin)

- **My tasks**: the tasks given to me, as a small board (To do, In progress, Done, Confirmed). I move them, set their progress and add updates. When a task is sent back, I see the manager's comment.
- **My plan**: my week or month. I add entries:
  - planned work;
  - certification exam;
  - training;
  - leave;
  - out of office.

  Each entry has dates and a note.

Hidden from members: other people's tasks and plans, the team dashboard and workload, the manager's private notes.

## 4. Emails

Sent through the app's existing email settings and outbox (Settings → Email), in English and Arabic.

| When | To |
|---|---|
| A task is marked done by the member | The Admin who gave it: "done, please review", with a link |
| A task is due tomorrow, and each day it is overdue (morning, Riyadh time) | The Admin who gave it; the member too |
| A task is given to a member, or sent back | The member |

The Admins can turn each of these off in Team Management's settings.

## 5. Security

- Every rule above is enforced by the server for each request, and covered by tests:
  - an IT Admin cannot read Team Management or the audit log, or raise any account to Admin;
  - a member cannot read another's tasks, or the manager's notes, through the API.
- Confidential tasks are filtered on the server, not hidden in the page.
- What the app cannot hide: anyone with the server's own login or direct database access can read everything. Keep the RHEL server and database passwords to the Admins.

## 6. Order of work

1. Roles: IT Admin; the audit log, the outbox and Admin accounts kept from IT Admins; tests.
2. Tasks: board, timeline, review, confidential; My tasks; the emails.
3. Plans: My plan and the team planning board; the dashboard with tickets and project tasks.

Each step is tested in full and pushed to main on its own.
