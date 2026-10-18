# Running the app on RHEL (Linux)

How to install the app on Red Hat Enterprise Linux (8 or 9, and similar: Rocky, Alma), and keep it running: it starts at every boot with nobody logged in, starts again if it stops, and makes a backup every day. The [README](../README.md) covers the app itself (settings, backups, restoring, commands); this page covers what is different on Linux.

All commands are typed in a terminal on the server, in the app folder, as the user who runs the app (for example `it-app`), not as root. They use `sudo` where they need to.

## 1. What the server needs

- **A fixed IP address.** People's bookmarks and the links in emails use it.
- **Node.js 22 or 24:**
  ```bash
  sudo dnf module reset -y nodejs && sudo dnf module install -y nodejs:22
  node -v        # v22 or newer
  ```
- **Git:** `sudo dnf install -y git`
- **Docker**, which runs the database:
  ```bash
  sudo dnf config-manager --add-repo https://download.docker.com/linux/rhel/docker-ce.repo
  sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  sudo systemctl enable --now docker
  sudo usermod -aG docker $USER      # then log out and back in, so it takes effect
  docker compose version             # should print a version
  ```
  If the server already has Podman (RHEL's own) or rootless Docker instead, and `npm run db:up` works, that is fine too: the setup script below works with either.

## 2. Install the app

```bash
git clone https://github.com/benhurross/it-systems-app.git ~/it-systems-app
cd ~/it-systems-app
npm ci
cp .env.example .env.local
nano .env.local
```

Fill in `.env.local` as the README's [First install](../README.md#first-install) says. Use this server's address in `BETTER_AUTH_URL`, e.g. `http://192.168.0.119:3200`.

Then either start with an empty database:
```bash
npm run db:up
npm run db:migrate
npm run db:seed
npm run admin:create -- you@applus.com "Your Name"
npm run build
```
or bring the data over from the old computer with a backup, as in [Moving to another computer](../README.md#moving-to-another-computer):
```bash
npm run db:up
npm run restore -- ~/ap-it-2026-10-14_0930
npm run build
```

## 3. Keep it running

```bash
bash scripts/linux/setup-rhel.sh
```

This is done once, and is safe to run again. It:
- **Starts the app at every boot, with nobody logged in.** If the app ever stops, it is started again 10 seconds later. The database starts with it.
- **Makes a backup every day at 12:30.** If the server was off at that time, the backup runs once it is on again. For another time: `BACKUP_TIME="18:00" bash scripts/linux/setup-rhel.sh`.
- **Opens port 3200 in the firewall**, so other computers can reach the app.
- **Stops any copy started by hand in a terminal**, which would otherwise hold the port.

It works out how Docker runs on the server, and sets the app's services up the same way:

| Docker runs as | The app's services are | Commands start with |
| --- | --- | --- |
| A system service (the usual Docker install) | System services, run as your user | `sudo systemctl` |
| Your user (Podman, or rootless Docker; you may see only `docker.socket`) | Your user's services, allowed to run with nobody logged in | `systemctl --user` |

At the end it prints the commands for this server. With the usual Docker install, they are:

| To... | Run |
| --- | --- |
| Stop the app | `sudo systemctl stop ap-it` |
| Start it again | `sudo systemctl start ap-it` |
| See if it is running | `sudo systemctl status ap-it` |
| See what it is doing | `journalctl -u ap-it -f` (Ctrl+C to stop watching) |
| See the backups' runs | `journalctl -u ap-it-backup` |

For Podman or rootless Docker, use `systemctl --user` instead of `sudo systemctl`, and `journalctl --user -u` instead of `journalctl -u`.

**Check it:** restart the server (`sudo reboot`), don't log in, and open the app's address from another computer.

## 4. Updating to a new version

```bash
bash scripts/linux/update.sh
```

It makes a backup, stops the app, gets the new version (`git pull`), installs packages (`npm ci`), updates the database (`npm run db:migrate`), builds, and starts the app again. If any step fails, it stops there and says why.

## 5. Firewall and SELinux

- **Firewall:** the setup script opens port 3200. To check: `sudo firewall-cmd --list-ports` should show `3200/tcp`.
- **SELinux:** keep it on. If the app runs on the server but other computers can't open it, or the service won't start, check what SELinux blocked:
  ```bash
  sudo ausearch -m avc -ts recent
  ```
  `<no matches>` means nothing was blocked. Otherwise, allow just what was blocked, after reading the rule:
  ```bash
  sudo dnf install -y policycoreutils-python-utils
  sudo ausearch -m avc -ts recent | audit2allow -M ap-it-app
  cat ap-it-app.te            # what the rule allows
  sudo semodule -i ap-it-app.pp
  ```
  Never turn SELinux off for good: `sudo setenforce 0` lasts only until the next reboot, and is for testing only.

## 6. If RHEL runs in VirtualBox

The app inside the VM keeps running only while the VM does, and the VM belongs to whoever started it on the Windows PC.

**Start the VM at boot, with nobody signed in to Windows.** On the Windows PC, in Task Scheduler, **Create Task** (not Basic Task):
1. **General:** name it "Start AP IT VM", tick **Run whether user is logged on or not**.
2. **Triggers:** New → **At startup**.
3. **Actions:** New → Start a program.
   - Program: `"C:\Program Files\Oracle\VirtualBox\VBoxManage.exe"`
   - Arguments: `startvm "<the VM's name>" --type headless`
4. **Conditions:** untick **Start the task only if the computer is on AC power**.
5. Save, and give your Windows password when asked.

After that, don't start the VM from the VirtualBox window: a VM started there stops when you sign out of Windows. To see the VMs running in the background: `VBoxManage list runningvms`.

**Keep the Windows PC awake.** A sleeping PC pauses the VM: the app answers pings but not pages. In PowerShell as administrator:
```powershell
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
```

**Network:** in the VM's Settings → Network → Adapter 1, use **Bridged Adapter** on the PC's wired network card, with **Promiscuous Mode: Allow All**. If other computers can connect but pages never finish loading, turn off packet offloading in RHEL (replace `enp0s3` with the card's name from `nmcli -t -f NAME,DEVICE connection show --active`):
```bash
sudo nmcli connection modify "enp0s3" ethtool.feature-tso off ethtool.feature-gso off ethtool.feature-gro off
sudo nmcli connection up "enp0s3"
```

## 7. When something is wrong

| What you see | What to check |
| --- | --- |
| The app stops when you log out | It was started by hand in a terminal. Run `bash scripts/linux/setup-rhel.sh`. |
| After a reboot, nothing answers | `sudo systemctl status ap-it` (or `systemctl --user status ap-it`), then `journalctl -u ap-it -n 50` for why. In VirtualBox, check the VM started (section 6). |
| Works on the server, other computers just load | Firewall (section 5), SELinux (section 5), then the VirtualBox network (section 6). |
| "the database has no tables yet" in the log | `npm run db:migrate`, then restart the app. |
| "can't reach the database" in the log | `docker compose ps` should show `postgres` running; `npm run db:up` starts it. |
