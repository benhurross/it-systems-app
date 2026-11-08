# Workstation checks at Windows sign-in

IT records each desk check in the app (**Service desk → Workstation checks**). The employee sees
the result once: in a window at their next Windows sign-in, and on their home page in the app,
until they click **I've read it**. IT sees who has read theirs, and when, on the check's page.

This guide sets up the Windows side: one PowerShell script, run at sign-in by Group Policy.

## What the script does, and does not do

- It runs as the signed-in user, with that user's normal rights. It installs nothing, keeps nothing
  on the PC, opens no port, and needs no admin rights.
- About 20 seconds after sign-in it asks the app: "is there an unread check result for this
  account (or this computer)?" If the app does not answer within 8 seconds, it gives up quietly.
- It shows the result as plain text in a window (English and Arabic), and when the person clicks
  **I've read it** it tells the app. Closed any other way, the window shows again next sign-in.
- Problems (app off, network down, wrong key) are written to `%TEMP%\WorkstationMessage.log` on
  that PC, for IT, and nothing is shown to the user.

## How the app knows who signed in

The script sends the account's UPN (`name@applus.local` or `name@applus.com.sa`), its short name and
the computer's name. The app matches the employee whose email is that UPN, or, when the domain's
name differs from the email's, the one employee whose email starts with the same name
(`j.smith@applus.local` → `j.smith@applus.com.sa`). Check that each person's email in
**People → Directory** is right.

If the account matches no one (a shared or temporary account), the message goes by computer name:
whoever signs in to that computer sees it.

## 1. Make the key

1. In the app: **Settings → API access**.
2. Name: `Windows sign-in script`. **Used for: Workstation messages**. **Make a key**.
3. Copy the key now: it is shown only once.

This key can only fetch and acknowledge these messages. It cannot read the KPIs, tickets, assets or
staff details, and it can be revoked at any time from the same page.

## 2. Put the script on the domain

1. Copy `scripts\windows\workstation\WorkstationMessage.ps1` from the app folder to
   `\\applus.local\NETLOGON\WorkstationMessage.ps1`. Only domain admins can change files there,
   which is what keeps the script from being tampered with. Never put it on a share staff can write to.
2. Open it in Notepad and fill in the two settings at the top:
   - `$AppUrl`: the app's address, as staff open it (`http://192.168.0.119:3200`).
   - `$ApiKey`: the key from step 1.
3. Save it. Keep the encoding as it is (UTF-8 with BOM), or the Arabic in the window will not read.

Note: every domain user can read NETLOGON, so the key can be read by staff. That is acceptable
because of how little it can do: at worst someone could see whether a given account has an unread
"passed"/"needs attention" result, or mark one read. If you prefer, sign the script (step 5) and
revoke and replace the key whenever you like.

## 3. Try it on your own PC first

1. In the app, make a check of your own computer, with you as the employee.
2. On your PC, in PowerShell:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File \\applus.local\NETLOGON\WorkstationMessage.ps1
   ```
   After about 20 seconds the window appears. Click **I've read it**.
3. In the app, the check now shows **Read**, with your account and computer.

Nothing appeared? Look at `%TEMP%\WorkstationMessage.log`, then see **Troubleshooting** below.

## 4. Run it at sign-in with Group Policy

Start with one test OU (IT's own computers or users), then widen it.

1. Open **Group Policy Management**. Create a GPO, `IT - Workstation check message`, linked to the
   test OU that holds the **users**.
2. Edit it: **User Configuration → Policies → Windows Settings → Scripts (Logon/Logoff) → Logon**.
3. On the **PowerShell Scripts** tab, **Add**:
   - Script name: `\\applus.local\NETLOGON\WorkstationMessage.ps1`
   - Script parameters: leave empty.
4. Windows waits 5 minutes after sign-in before running logon scripts unless told otherwise. To
   show the message sooner: **Computer Configuration → Policies → Administrative Templates → System
   → Group Policy → Configure Logon Script Delay** → Enabled, `0` minutes (in a GPO linked to the
   computers' OU). The script still waits its own 20 seconds.
5. PowerShell must be allowed to run the script. Either sign it (step 5, recommended), or set
   **Computer Configuration → Policies → Administrative Templates → Windows Components → Windows
   PowerShell → Turn on Script Execution** → Enabled, *Allow local scripts and remote signed
   scripts*.
6. On a test PC: `gpupdate /force`, sign out, sign in. Make a check for that user first.

When it works on the test OU, link the GPO to the OUs with everyone's user accounts.

## 5. Sign the script (recommended)

Signing means Windows runs only the copy IT signed: an edited copy is refused.

With a code-signing certificate from your domain's certificate authority, on an admin PC:

```powershell
$cert = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | Select-Object -First 1
Set-AuthenticodeSignature -FilePath \\applus.local\NETLOGON\WorkstationMessage.ps1 -Certificate $cert
```

Then set **Turn on Script Execution** to *Allow only signed scripts*. Sign again after every edit
(changing the key counts).

## Troubleshooting

| What happens | Look at |
|---|---|
| Nothing, ever | `%TEMP%\WorkstationMessage.log` on the PC. "401": the key is wrong or revoked. "Unable to connect" or a timeout: the PC cannot reach the app (address, firewall on port 3200). |
| Nothing for one person | Their email in **People → Directory** must match their Windows account (see above). A check made for someone else is not shown to them. |
| The window shows each sign-in | They closed it without **I've read it**. |
| Arabic shows as symbols | The script was saved without its UTF-8 BOM: copy it again from the app folder. |
| It shows only after 5 minutes | Step 4.4, the logon script delay. |

## Security, in short

- The PCs reach only two addresses in the app (`/api/public/workstation/message` and
  `…/message/{id}/read`), and only with the workstation key. Unit and end-to-end tests check that a
  missing, made-up or KPI key is refused, and that the key reaches nothing else.
- Marking a message read needs the one-time code sent with it, from the same account or computer:
  no one can mark someone else's message read.
- Every message read is recorded in the audit log (**Settings → Audit log**).
- The app runs on plain `http://` on the office network. Moving it to HTTPS would encrypt this
  traffic and staff sign-ins alike; that is a separate step.
