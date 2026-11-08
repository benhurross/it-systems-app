# Plan: workstation checks, shown at Windows sign-in

Status: **agreed, not started** (put on hold for other work; pick up from here).

IT's regular desk checks (the "ocular check" against the IT standard) are today printed on paper:
a "good job" note or a warning. This moves them into the app and shows each employee their result
at their next Windows sign-in, once, until they click **I've read it**: paperless, and the app
records who has read theirs.

Decisions so far:

- The office PCs are on the domain (applus.local / applus.com.sa) and reach the app on the local network.
- A result shows once, at each sign-in, until the employee clicks **I've read it**.
- The checklist below is a starting point; IT will edit it later (Settings → Lists).
- Email copy: off by default, can be turned on per check.
- Re-check after a warning: IT creates a new check; a pass then shows "Good job".

## 1. In the app (IT)

- New page **Service desk → Workstation checks**: a list of checks (date, computer, employee,
  result, read or not) with filters (Passed / Needs attention / Not read yet).
- **New check** pop-up, like the other forms: pick the computer from Assets (its assigned employee
  fills in, can be changed); mark each checklist item **OK / Not OK / N/A** with an optional note;
  optional photo; optional personal message. The result follows: all OK → **Passed**, any Not OK →
  **Needs attention**.
- A **Workstation checks** card on the asset's page (that computer's history) and on the
  employee's page (their history and whether each was read).
- **Settings → Lists → Workstation checklist**: admins add, edit, reorder or turn off items, in
  English and Arabic.
- Admins and IT staff create and see checks; an employee sees only their own (also under My requests).

## 2. Starting checklist

Security
1. Screen locks when away (Win+L; auto-lock after 5–10 minutes)
2. No passwords written down (sticky notes, under the keyboard, on the monitor)
3. Antivirus running and up to date
4. Windows updates installed (no restart pending for more than a week)
5. No unapproved software or browser extensions
6. No personal USB drives or unknown devices connected

Data
7. Company files saved on the server / OneDrive, not only the desktop
8. No confidential papers left on the desk (clean desk)

Hardware and care
9. Asset tag present and readable
10. Cables tidy and safe (no trip hazards, no damaged cables)
11. Equipment clean; no food or drink near the computer
12. PC and monitors in good condition (no damage, vents clear)

## 3. What the employee sees at sign-in

- At the next sign-in after a check, a window with the company logo and their name:
  - **Passed** (green): "Good job! Your workstation meets the AP Plus IT standard." and IT's note.
  - **Needs attention** (amber): the items to fix with IT's notes, and how to reach IT.
- English and Arabic.
- One button, **I've read it**: the app records the time and the window does not show again for
  that check. Closed without clicking, it shows again at the next sign-in.
- It follows the person: matched by their domain account (user@applus.com.sa ↔ their email in the
  app), on whichever PC they sign in to. If the account matches no employee, by computer name.

## 4. On Windows (Group Policy)

- One PowerShell script, `WorkstationMessage.ps1`, in the domain's **NETLOGON** share (only domain
  admins can change it), run at **user logon** by a GPO, with the user's normal rights.
- It waits a few seconds after sign-in, asks the app for an unread message (giving up quietly after
  5 seconds if the server does not answer), shows the window as plain text, and reports
  **I've read it** back.
- Nothing is installed or kept on the PC; no admin rights; no port opened.
- Optional: signed with the domain's code-signing certificate so only the untouched copy runs.
- A step-by-step GPO guide (Group Policy Management → User Configuration → Logon Scripts), tried
  first on one test OU / PC before everyone.

## 5. Security

- A new key type in **Settings → API access**, "Workstation messages": kept only as a hash,
  revocable, and able to do exactly two things (get an unread message; mark it read). It reaches
  nothing else in the app.
- Marking read needs the one-time code sent with that message.
- Only the minimum goes out: first name, result, checklist items and notes.
- Every message shown and acknowledged goes into the audit log.
- Tests: a wrong or missing key is refused; the key reaches nothing else; one person cannot fetch
  or acknowledge another's message.
- Known limits: the key is shared by all PCs (per-computer keys are possible, at more setup); the
  app runs on plain http on the LAN, so moving it to HTTPS is recommended as a separate step.

## 6. Build order

1. Database: checklist items, checks, their results, read tracking (a migration run by `update.sh`).
2. App pages: list, new-check pop-up, asset and employee cards, Settings list, English and Arabic.
3. The logon API and the new key type, with tests.
4. The PowerShell script and the GPO guide (logic tested here; the window tried on a real PC).
5. Full test run, push to main; then `update.sh`, create the key, set up the GPO on a test PC.
