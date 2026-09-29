/**
 * Fictional content for the demo database. No person, address or credential here comes from the
 * workbook; names are invented and every email uses the reserved .test domain.
 */

export const FIRST_NAMES = [
  "Abdullah", "Ahmed", "Mohammed", "Khalid", "Fahad", "Saud", "Turki", "Yousef", "Majed", "Nawaf",
  "Hassan", "Ali", "Ibrahim", "Rayan", "Ziad", "Bandar", "Hani", "Tariq", "Waleed", "Karim",
  "Reem", "Lama", "Hind", "Maha", "Dana", "Ghada", "Rana", "Sahar", "Amal", "Noura",
  "Huda", "Shahad", "Joud", "Layan", "Rawan", "Asma", "Mona", "Arwa", "Hanan", "Areej",
];

export const LAST_NAMES = [
  "Al-Ghamdi", "Al-Zahrani", "Al-Shehri", "Al-Dosari", "Al-Mutairi", "Al-Anazi", "Al-Shammari",
  "Al-Malki", "Al-Juhani", "Al-Subaie", "Al-Rashidi", "Al-Amri", "Bakr", "Haddad", "Saleh",
  "Farouk", "Nasser", "Hamdan", "Kareem", "Mansour",
];

export const TITLES: Record<string, string[]> = {
  operations: ["Placement Specialist", "Claims Officer", "Operations Officer", "Underwriting Assistant", "Operations Supervisor"],
  sales: ["Account Manager", "Business Development Manager", "Sales Coordinator", "Relationship Manager"],
  finance: ["Accountant", "Senior Accountant", "Finance Manager", "Collections Officer"],
  hr: ["HR Specialist", "Government Relations Officer", "HR Manager"],
  compliance: ["Compliance Officer", "Risk and Compliance Analyst"],
  executive: ["General Manager", "Chief Commercial Officer", "Executive Assistant", "Chief Operating Officer"],
};

export const DEPARTMENT_WEIGHTS: [string, number][] = [
  ["operations", 15],
  ["sales", 13],
  ["finance", 8],
  ["hr", 5],
  ["compliance", 4],
  ["executive", 4],
];

/** Password for every demo account. Development and test databases only. */
export const DEMO_PASSWORD = "Demo-Pass-2026";

/** Demo accounts, one per role. */
export const DEMO_ACCOUNTS = [
  { email: "admin@applus.test", name: "Sara Al-Harbi", role: "admin", department: "it", location: "jeddah", jobTitle: "IT Manager" },
  { email: "it@applus.test", name: "Omar Haddad", role: "it_staff", department: "it", location: "jeddah", jobTitle: "Helpdesk Specialist" },
  { email: "it2@applus.test", name: "Faisal Al-Qahtani", role: "it_staff", department: "it", location: "jeddah", jobTitle: "Systems Administrator" },
  { email: "it3@applus.test", name: "Joseph Mathew", role: "it_staff", department: "it", location: "riyadh", jobTitle: "Network Engineer" },
  { email: "employee@applus.test", name: "Nora Al-Otaibi", role: "employee", department: "finance", location: "jeddah", jobTitle: "Accountant" },
] as const;

export const TICKET_TEMPLATES: Record<string, { subjects: string[]; resolution: string; weight: number }> = {
  email: {
    weight: 24,
    subjects: [
      "Mailbox full",
      "Outlook not receiving new mail",
      "Cannot send large attachments",
      "Set up Outlook archive",
      "Access to the claims shared mailbox",
      "Update email signature",
      "Out-of-office reply not working",
    ],
    resolution: "Cleared the mailbox, enabled the online archive and confirmed mail flow with the user.",
  },
  hardware: {
    weight: 20,
    subjects: [
      "Laptop running slowly",
      "Laptop battery not charging",
      "Keyboard keys not responding",
      "Second monitor not detected",
      "Docking station not working",
      "Laptop screen flickering",
      "BIOS update needed",
    ],
    resolution: "Replaced the faulty part and updated drivers; the user confirmed it works.",
  },
  software: {
    weight: 18,
    subjects: [
      "ERP report not loading",
      "Excel keeps crashing",
      "Install Adobe Acrobat",
      "Windows update failed",
      "Antivirus warning on login",
      "Need screen recording software",
    ],
    resolution: "Repaired the installation and applied the latest updates.",
  },
  internet: {
    weight: 10,
    subjects: [
      "No internet on my laptop",
      "Wi-Fi keeps disconnecting",
      "VPN not connecting from home",
      "Slow internet in the meeting room",
      "Cannot reach the shared drive",
    ],
    resolution: "Reset the network profile and reconnected the device to the office network.",
  },
  login: {
    weight: 11,
    subjects: [
      "Password reset",
      "Account locked out",
      "ERP login error",
      "Permission for the finance shared folder",
      "Change of authenticator device",
    ],
    resolution: "Reset the credentials and verified access with the user.",
  },
  security: {
    weight: 4,
    subjects: [
      "Suspicious email received",
      "Clicked a link in a phishing email",
      "USB drive blocked",
      "Laptop left in a taxi",
    ],
    resolution: "Investigated, blocked the sender and scanned the device; no compromise found.",
  },
  maintenance: {
    weight: 7,
    subjects: [
      "Move desk phone to a new office",
      "New starter laptop setup",
      "Meeting room screen setup",
      "Install a new printer on the floor",
    ],
    resolution: "Completed the requested work on site.",
  },
  periodic_maintenance: {
    weight: 3,
    subjects: ["Quarterly laptop maintenance", "Printer preventive maintenance", "Server room inspection"],
    resolution: "Maintenance completed and logged.",
  },
  other: {
    weight: 3,
    subjects: ["Request a new mouse", "Request a headset", "Change phone extension", "Request a second monitor"],
    resolution: "Delivered and set up the requested item.",
  },
};

export const KB_ARTICLES = [
  {
    title: "Outlook says the mailbox is full",
    category: "email",
    issueType: "email",
    symptoms: "Outlook warns that the mailbox is over its size limit and new messages stop arriving.",
    cause: "The mailbox has reached its 50 GB quota, usually because of old attachments.",
    resolution:
      "1. In Outlook, open File > Tools > Mailbox Cleanup.\n2. Empty Deleted Items and Junk Email.\n3. Ask IT to enable the online archive; mail older than two years moves there automatically.",
  },
  {
    title: "Setting up the Outlook online archive",
    category: "email",
    issueType: "email",
    symptoms: "A user asks for older mail to be moved out of the main mailbox.",
    cause: null,
    resolution: "Enable the archive from the Exchange admin centre, then restart Outlook. The archive appears as a separate folder within a few hours.",
  },
  {
    title: "VPN does not connect from home",
    category: "network",
    issueType: "internet",
    symptoms: "FortiClient stops at 40% or reports credential or certificate errors.",
    cause: "Expired password, a clock that is out of sync, or a home router blocking the VPN port.",
    resolution: "Confirm the password works on the web portal, sync the laptop clock, then try the mobile hotspot to rule out the home router.",
  },
  {
    title: "Resetting a forgotten password",
    category: "accounts",
    issueType: "login",
    symptoms: "The user cannot sign in to Windows or email.",
    cause: null,
    resolution: "Verify the caller's identity with their manager, reset the password in Active Directory and set 'change at next logon'.",
  },
  {
    title: "ERP shows 'session expired' on login",
    category: "software",
    issueType: "login",
    symptoms: "The ERP login page returns to the start after entering credentials.",
    cause: "A stale session cookie in the browser.",
    resolution: "Clear cookies for the ERP address or open it in a private window, then sign in again.",
  },
  {
    title: "Printer shows offline",
    category: "printing",
    issueType: "hardware",
    symptoms: "Print jobs sit in the queue and the printer shows as offline.",
    cause: "The printer received a new IP address or the spooler service stopped.",
    resolution: "Check the printer's IP on its panel, restart the Print Spooler service and re-add the printer from the print server if the address changed.",
  },
  {
    title: "Scan to email is not arriving",
    category: "printing",
    issueType: "email",
    symptoms: "Scans are sent from the printer but never reach the mailbox.",
    cause: "The scanned file exceeds the attachment size limit.",
    resolution: "Lower the scan resolution to 200 dpi or scan to the shared folder instead.",
  },
  {
    title: "Wi-Fi drops in meeting rooms",
    category: "network",
    issueType: "internet",
    symptoms: "Laptops disconnect when moving between rooms.",
    cause: "The laptop stays attached to a distant access point.",
    resolution: "Forget the network and reconnect; update the wireless driver if drops continue.",
  },
  {
    title: "Reporting a suspicious email",
    category: "security",
    issueType: "security",
    symptoms: "An unexpected email asks for credentials, payment or to open an attachment.",
    cause: null,
    resolution: "Do not click links. Use the Report Phishing button in Outlook, or forward the email as an attachment to IT, then delete it.",
  },
  {
    title: "Moving a desk phone extension",
    category: "telephony",
    issueType: "maintenance",
    symptoms: "A user moves desks and needs their extension to follow.",
    cause: null,
    resolution: "Log in to the PBX, reassign the extension to the new phone's MAC address and update the directory.",
  },
  {
    title: "Laptop battery not charging",
    category: "hardware",
    issueType: "hardware",
    symptoms: "The battery stays at the same percentage while plugged in.",
    cause: "Worn battery or a faulty charger.",
    resolution: "Try a known-good charger. If the battery health report shows under 50%, request a replacement under warranty.",
  },
  {
    title: "Windows update stuck at 0%",
    category: "software",
    issueType: "software",
    symptoms: "Updates download but never install.",
    cause: "Corrupted update cache.",
    resolution: "Run the Windows Update troubleshooter, clear the SoftwareDistribution folder and retry.",
  },
];

export const VENDORS = [
  { key: "gns", name: "Gulf Network Services", category: "services", contactName: "Yasser Hamdi", phone: "+966 12 600 1100" },
  { key: "redsea", name: "Red Sea Office Systems", category: "maintenance", contactName: "Samer Khalil", phone: "+966 12 600 2200" },
  { key: "najd", name: "Najd Telecom", category: "telecom", contactName: "Account Desk", phone: "+966 11 600 3300" },
  { key: "hijaz", name: "Hijaz Connect", category: "telecom", contactName: "Enterprise Support", phone: "+966 12 600 4400" },
  { key: "asl", name: "Arabian Software Licensing", category: "software", contactName: "Rania Fouad", phone: "+966 11 600 5500" },
  { key: "falcon", name: "Falcon Security Solutions", category: "security", contactName: "Adel Mourad", phone: "+966 12 600 6600" },
  { key: "desert", name: "Desert Hardware Trading", category: "hardware", contactName: "Sales Team", phone: "+966 12 600 7700" },
  { key: "peninsula", name: "Peninsula Cloud", category: "services", contactName: "Hosting Support", phone: "+966 11 600 8800" },
  { key: "erp", name: "Oasis ERP Partners", category: "software", contactName: "Support Desk", phone: "+966 12 600 9900" },
  { key: "powersafe", name: "PowerSafe UPS Services", category: "maintenance", contactName: "Field Service", phone: "+966 12 601 0000", active: false },
];

export const CHANGES = [
  { title: "Apply Exchange cumulative security update", asset: "exch01", risk: "high", days: -40, status: "implemented", result: "successful" },
  { title: "Upgrade FortiGate firmware in Jeddah", asset: "fw-jed", risk: "high", days: -25, status: "implemented", result: "successful" },
  { title: "Patch ESX-02 to the latest ESXi build", asset: "esx-02", risk: "medium", days: -18, status: "implemented", result: "rolled_back" },
  { title: "Upgrade Veeam Backup & Replication", asset: "backup01", risk: "medium", days: -12, status: "implemented", result: "successful" },
  { title: "Renew the website TLS certificate", asset: "website", risk: "low", days: -6, status: "implemented", result: "successful" },
  { title: "Replace access point AP-RYD-03", asset: "ap-ryd-3", risk: "low", days: 2, status: "approved", result: null },
  { title: "Create a guest Wi-Fi VLAN in Jeddah", asset: "sw-core-jed", risk: "medium", days: 5, status: "approved", result: null },
  { title: "Monthly Windows updates on domain controller", asset: "dc01", risk: "medium", days: 7, status: "requested", result: null },
  { title: "ERP database index maintenance", asset: "erp01", risk: "medium", days: 10, status: "requested", result: null },
  { title: "Increase NAS01 storage volume", asset: "nas01", risk: "low", days: 14, status: "requested", result: null },
  { title: "Disable legacy SMBv1 on NAS01", asset: "nas01", risk: "high", days: -3, status: "rejected", result: null },
  { title: "Printer firmware update on the finance floor", asset: "prn-jed-fin", risk: "low", days: -9, status: "implemented", result: "failed" },
] as const;

export const RISKS = [
  { title: "Exchange 2016 is out of vendor support", category: "it", asset: "exch01", likelihood: 4, impact: 4, status: "mitigating", treatment: "Migrate mailboxes to a supported Exchange release this year." },
  { title: "Single internet link at the Riyadh branch", category: "continuity", asset: "fw-ryd", likelihood: 3, impact: 4, status: "open", treatment: "Add a second provider with automatic failover." },
  { title: "Staff targeted by phishing emails", category: "cyber", asset: null, likelihood: 5, impact: 4, status: "mitigating", treatment: "Quarterly awareness training and simulated phishing." },
  { title: "Servers missing security patches", category: "cyber", asset: null, likelihood: 3, impact: 5, status: "mitigating", treatment: "Monthly patch window with change approval." },
  { title: "Backups not restored in a test this year", category: "continuity", asset: "backup01", likelihood: 3, impact: 5, status: "open", treatment: "Run a documented restore test each quarter." },
  { title: "ERP support depends on one partner", category: "vendor", asset: "erp-app", likelihood: 2, impact: 4, status: "accepted", treatment: "Accepted; reviewed at contract renewal." },
  { title: "Shared administrator accounts", category: "cyber", asset: "dc01", likelihood: 3, impact: 4, status: "open", treatment: "Named admin accounts and a privileged access register." },
  { title: "Laptops past their replacement age", category: "it", asset: null, likelihood: 4, impact: 2, status: "mitigating", treatment: "Lifecycle replacement project for 2026." },
  { title: "Server room cooling failure", category: "continuity", asset: null, likelihood: 2, impact: 5, status: "open", treatment: "Temperature alerting and a second AC unit." },
  { title: "Remote access without multi-factor authentication", category: "cyber", asset: "fw-jed", likelihood: 4, impact: 5, status: "open", treatment: "Enable MFA on the VPN for all users." },
  { title: "Software licence over-deployment", category: "compliance", asset: null, likelihood: 3, impact: 3, status: "open", treatment: "Reconcile installs against purchases every quarter." },
  { title: "Old printers without firmware updates", category: "it", asset: null, likelihood: 2, impact: 2, status: "closed", treatment: "Printers replaced." },
] as const;

export const VULNERABILITIES = [
  { title: "Exchange server missing latest security update", severity: "critical", asset: "exch01", daysAgo: 20, deadline: -6, status: "in_progress" },
  { title: "SMBv1 enabled on NAS01", severity: "high", asset: "nas01", daysAgo: 45, deadline: -15, status: "open" },
  { title: "Outdated TLS 1.0 on the ERP web portal", severity: "high", asset: "erp01", daysAgo: 30, deadline: 5, status: "open" },
  { title: "Default SNMP community on access switches", severity: "medium", asset: "sw-jed-1", daysAgo: 60, deadline: -20, status: "open" },
  { title: "Printer web admin uses default password", severity: "high", asset: "prn-jed-ops", daysAgo: 15, deadline: 10, status: "open" },
  { title: "ESXi host missing security patch", severity: "high", asset: "esx-02", daysAgo: 25, deadline: 3, status: "in_progress" },
  { title: "Self-signed certificate on the PBX web portal", severity: "low", asset: "pbx01", daysAgo: 90, deadline: 60, status: "accepted" },
  { title: "Unsupported Windows build on a desktop", severity: "medium", asset: null, daysAgo: 70, deadline: -40, status: "resolved" },
  { title: "Weak cipher suites on the firewall admin page", severity: "medium", asset: "fw-ryd", daysAgo: 35, deadline: 20, status: "open" },
  { title: "Domain controller allows NTLMv1", severity: "high", asset: "dc01", daysAgo: 50, deadline: -10, status: "resolved" },
  { title: "Open RDP port on backup server", severity: "critical", asset: "backup01", daysAgo: 10, deadline: 4, status: "in_progress" },
  { title: "Outdated firmware on UPS network card", severity: "low", asset: "ups-jed", daysAgo: 120, deadline: 30, status: "open" },
  { title: "Directory listing enabled on the website", severity: "medium", asset: "website", daysAgo: 40, deadline: -25, status: "resolved" },
  { title: "SIEM agent missing on the ERP server", severity: "medium", asset: "erp01", daysAgo: 8, deadline: 22, status: "open" },
  { title: "Guest Wi-Fi reaches internal printers", severity: "high", asset: "ap-jed-2", daysAgo: 5, deadline: 25, status: "open" },
] as const;

export const PROJECTS = [
  {
    name: "Riyadh branch network refresh",
    status: "active",
    start: -60,
    due: 30,
    tasks: [
      ["Survey the current cabling", "done"],
      ["Order replacement access points", "done"],
      ["Install the new core switch", "in_progress"],
      ["Replace AP-RYD-03", "todo"],
      ["Add a second internet provider", "todo"],
    ],
  },
  {
    name: "Exchange migration to a supported release",
    status: "active",
    start: -30,
    due: 90,
    tasks: [
      ["Build the new Exchange server", "done"],
      ["Migrate the IT team's mailboxes", "in_progress"],
      ["Migrate finance and operations", "todo"],
      ["Migrate sales and executive", "todo"],
      ["Decommission EXCH01", "todo"],
    ],
  },
  {
    name: "Laptop lifecycle replacement 2026",
    status: "active",
    start: -90,
    due: 60,
    tasks: [
      ["List laptops older than four years", "done"],
      ["Approve the purchase", "done"],
      ["Image the new laptops", "in_progress"],
      ["Hand over and collect old devices", "todo"],
    ],
  },
  {
    name: "Disaster recovery readiness",
    status: "planned",
    start: 20,
    due: 150,
    tasks: [
      ["Document recovery steps for ERP", "todo"],
      ["Document recovery steps for email", "todo"],
      ["Run a restore test", "todo"],
    ],
  },
  {
    name: "New ERP evaluation",
    status: "on_hold",
    start: -120,
    due: 120,
    tasks: [
      ["Gather requirements", "done"],
      ["Shortlist vendors", "in_progress"],
    ],
  },
  {
    name: "Helpdesk process rollout",
    status: "completed",
    start: -200,
    due: -100,
    tasks: [
      ["Define ticket categories", "done"],
      ["Train IT staff", "done"],
      ["Announce to employees", "done"],
    ],
  },
] as const;
