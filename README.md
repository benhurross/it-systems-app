# AP Plus IT Systems

The IT team's web app: helpdesk tickets, assets and the CMDB, software licences, purchases and contracts, network monitoring, dashboards and KPIs, ID cards, and PDF tools. One Windows computer runs it, and everyone else opens it in a browser on the office network.

The design and the full feature list are in [PLAN.md](PLAN.md).

All the commands below are typed in **Command Prompt** (`cmd`), in the app folder, unless they say otherwise.

## What the computer needs

- **Windows 10 or 11**, on the office network, with a fixed IP address. People's bookmarks and the links in emails use this address.
- **[Node.js](https://nodejs.org) 22 or 24 (LTS)**.
- **[Git](https://git-scm.com/download/win)**.
- **[Docker Desktop](https://www.docker.com/products/docker-desktop/)**, which runs the database (PostgreSQL 18). In Docker Desktop, open Settings → General and turn on **Start Docker Desktop when you sign in to your computer**.

## First install

```bat
git clone https://github.com/benhurross/it-systems-app.git "AP IT System App"
cd "AP IT System App"
npm ci
copy .env.example .env.local
notepad .env.local
```

In `.env.local`, fill in the following settings:

| Setting | What to put |
| --- | --- |
| `BETTER_AUTH_SECRET` | 32 or more random characters. Make some with `node -e "console.log(crypto.randomBytes(32).toString('base64url'))"`. **Keep it safe, and never change it.** It keeps people signed in and unlocks the saved email password. |
| `BETTER_AUTH_URL` | The address people open, e.g. `http://192.168.0.159:3200` |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Any other addresses people use to open the app, comma separated, e.g. `http://localhost:3200` |
| `UPLOADS_DIR` | Optional. Where uploaded files are kept. The default is the `uploads` folder in the app folder. |
| `BACKUP_DIR`, `BACKUP_KEEP` | Optional. Where backups go, and how many to keep (see [Backups](#backups)). |

Then start the database, create the tables, load the standard lists, and make the first admin account:

```bat
npm run db:up
npm run db:migrate
npm run db:seed
npm run admin:create -- you@applus.com "Your Name"
npm run build
npm start
```

Open `http://localhost:3200` and sign in. The app is running for as long as that window stays open. To keep it running all the time, see the next section.

Next, in the app:
- **Settings → Email**: the Exchange connection. Also set **App address for links** if it differs from `BETTER_AUTH_URL`.
- **Settings**: everything else.

To load the staff list or the ticket log from Excel, see [Commands](#commands).

## Keep it running

This setup is done once, in **PowerShell opened as administrator**. You must be signed in to Windows as the person whose account will run the app.

```powershell
cd "C:\path\to\AP IT System App"
powershell -ExecutionPolicy Bypass -File scripts\windows\setup-windows.ps1
```

This does three things:
- **Starts the app whenever you sign in to Windows.** It waits for Docker and the database first. If the app ever stops, it is started again 10 seconds later. Its window says the app is running; closing that window stops it.
- **Runs a backup every day at 12:30.** If the computer was off at that time, the backup runs once it is on again. To choose another time, add `-BackupTime "18:00"` to the command.
- **Opens port 3200 in Windows Firewall**, so other computers can reach the app. This applies on networks marked Private or Domain.

Two Windows settings help too:
- **Never sleep while plugged in.** Run `powercfg /change standby-timeout-ac 0`.
- **Sign in after a restart.** The app starts only once someone signs in, because Docker Desktop needs a signed-in user. After Windows updates restart the computer, sign in again. Alternatively, turn on Settings → Accounts → Sign-in options → **Use my sign-in info to automatically finish setting up after an update**.

| To... | Run |
| --- | --- |
| Stop the app | `scripts\windows\stop-app.cmd` |
| Start it again | `scripts\windows\start-app.cmd`, or sign out and back in |
| See what it is doing | `notepad logs\app.log` (the previous run is in `logs\app.previous.log`) |
| See the backups' messages | `notepad logs\backup.log` |

The tasks are named "AP IT System" and "AP IT System backup". You can see them in **Task Scheduler** under Task Scheduler Library.

## Updating to a new version

```bat
scripts\windows\update.cmd
```

The update script does the following, in order:
1. Makes a backup.
2. Stops the app.
3. Gets the new version (`git pull`).
4. Installs packages (`npm ci`).
5. Updates the database (`npm run db:migrate`).
6. Builds the app.
7. Starts it again.

If any step fails, the update stops there and says why.

To update by hand, run the same steps yourself: `npm run backup`, stop the app, then `git pull`, `npm ci`, `npm run db:migrate`, `npm run build`, and start the app. Always run `db:migrate` after pulling: it does nothing when there is nothing new.

## Backups

```bat
npm run backup
```

Each backup is a folder named for its time, e.g. `backups\ap-it-2026-10-08_1230`. It holds:

| File | What it is |
| --- | --- |
| `ap_it.dump` | The whole database. |
| `uploads\` | Every uploaded file: invoices, contracts, ID photos and the ID card design. |
| `env.local` | A copy of `.env.local`. **It contains the secret, so keep backups private.** |
| `backup.json` | When the backup was made, and from which version. |

- **The app can keep running** while a backup is made.
- **Space:** files that haven't changed since the previous backup are linked to it rather than copied again. So each daily backup takes only the space of what's new, when the backups are on the same drive.
- **Old backups:** only the newest 14 are kept (`BACKUP_KEEP` changes this).
- **Where they go:** the `backups` folder in the app folder. To put them somewhere safer, set `BACKUP_DIR` in `.env.local`, e.g. `BACKUP_DIR=D:\AP-IT-Backups` (another drive) or a network share.

**A backup on the same disk doesn't survive that disk failing.** Use `BACKUP_DIR` on another drive, or copy the newest backup folder elsewhere every so often (a USB drive, or a share).

**Check now and then that backups are being made:** look in `logs\backup.log` and the backups folder.

## Restoring a backup

```bat
scripts\windows\stop-app.cmd
npm run restore -- latest
scripts\windows\start-app.cmd
```

`latest` takes the newest backup in the backups folder. To restore a particular backup, give its folder instead: `npm run restore -- "D:\AP-IT-Backups\ap-it-2026-10-08_1230"`. Before changing anything, the restore asks you to type `yes`.

The restore does four things:
- Replaces the database with the backup's.
- Brings the database up to this version of the app.
- Replaces the uploaded files with the backup's. The files that were there are kept beside them, in `uploads-before-restore-<time>`; delete that folder once all is well.
- If this computer has no `.env.local` yet, it uses the backup's settings.

## Moving to another computer

The data moves with a backup: the database, the uploaded files and the settings. Keep the new computer's IP address the same as the old one if you can (`192.168.0.159`), so that bookmarks and links in old emails keep working.

**On the old computer:**

1. Make a fresh backup, and stop the app so nothing changes after it:
   ```bat
   npm run backup
   scripts\windows\stop-app.cmd
   ```
2. Copy the new backup folder (the newest in `backups`, or in `BACKUP_DIR`) to a USB drive or a network share.
3. Turn off its startup tasks, so the two computers don't both run the app. In Task Scheduler, disable "AP IT System" and "AP IT System backup". Or, in Command Prompt as administrator:
   ```bat
   schtasks /Change /TN "AP IT System" /DISABLE
   schtasks /Change /TN "AP IT System backup" /DISABLE
   ```

**On the new computer:**

1. Install Node.js, Git and Docker Desktop (see [What the computer needs](#what-the-computer-needs)). Start Docker Desktop once and let it finish setting up.
2. Get the app. Git asks you to sign in to GitHub the first time.
   ```bat
   git clone https://github.com/benhurross/it-systems-app.git "AP IT System App"
   cd "AP IT System App"
   npm ci
   ```
3. Copy the backup's `env.local` into the app folder as `.env.local`:
   ```bat
   copy "E:\ap-it-2026-10-08_1230\env.local" .env.local
   ```
   If the new computer has a different IP address, edit `.env.local` (`notepad .env.local`) and change the address in `BETTER_AUTH_URL` and `BETTER_AUTH_TRUSTED_ORIGINS`. If `UPLOADS_DIR` or `BACKUP_DIR` name a drive the new computer doesn't have, change them too. Leave `BETTER_AUTH_SECRET` as it is.
4. Start the database and restore the backup:
   ```bat
   npm run db:up
   npm run restore -- "E:\ap-it-2026-10-08_1230"
   ```
5. Build it, and check that it runs:
   ```bat
   npm run build
   npm start
   ```
   Sign in at `http://localhost:3200`, and check the tickets, assets and an attachment or two. Then press Ctrl+C to stop it.
6. Set it up to keep running, with daily backups and the firewall rule: see [Keep it running](#keep-it-running).
7. From another computer, open the app's address and sign in.

**If the address changed:**
- In **Settings → Email**, update **App address for links** if it is filled in. Emails use it for their links.
- If Exchange accepts mail only from known computers (a relay connector restricted by IP address), ask for the new address to be added.
- Tell people the new address.

Once everything works on the new computer for a few days, you can remove the app from the old one.

## Commands

| Command | What it does |
| --- | --- |
| `npm start` | Runs the app on port 3200 (after `npm run build`). |
| `npm run build` | Builds the app. Needed after every update. |
| `npm run db:up` | Starts the database in Docker. |
| `npm run db:migrate` | Brings the database up to this version. Safe to run any time. |
| `npm run db:seed` | Loads the standard lists (locations, departments, issue types and the other dropdowns). Run once, on a new database. |
| `npm run admin:create -- <email> "<Full Name>"` | Makes an admin account and prints a one-time password. |
| `npm run people:check "<file.xlsx>"` | Reports how the staff list would be loaded. Changes nothing. |
| `npm run people:ids "<file.xlsx>"` | Fills in employee ID numbers from the staff list. |
| `npm run tickets:import "<file.xlsx>"` | Reports what loading the ticket log would do. Add `replace` to load it in place of the current tickets. |
| `npm run backup` | Makes a backup. |
| `npm run restore -- latest` | Restores the newest backup (or give a backup folder). |

The staff list and the ticket log contain real people's details. They stay on this computer, and are never added to Git: `*.xlsx` is ignored.

## Trying it out with demo data

On a database for testing only:

```bat
npm run db:seed:demo
```

**This replaces everything in the database** with invented people, assets and tickets. The demo accounts (`admin@applus.test`, `it@applus.test`, `employee@applus.test` and others) and their password are in `src/server/seed/demo-data.ts`.

## For developers

- `npm run dev` runs the development server on port 3200.
- Checks:
  - `npm run lint`
  - `npm run typecheck`
  - `npm test` (unit tests)
  - `npm run e2e` (Playwright, against a built app and a test database)
- After changing `src/server/db/schema.ts`, run `npm run db:generate -- --name <what-changed>` to write the migration, and commit it with the change.
- More detail: [PLAN.md](PLAN.md) covers how it's built, and [AGENTS.md](AGENTS.md) covers the requirements.
