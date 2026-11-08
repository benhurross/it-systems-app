/* eslint-disable @next/next/no-img-element -- the sheet prints at once; the logo is a small local SVG */
import type { ReactNode } from "react";
import {
  CARTRIDGES,
  CREDENTIAL_ITEMS,
  EQUIPMENT,
  FOLDER_PERMISSIONS,
  FORM_DOCUMENT,
  formDate,
  gridKey,
  LEVELS,
  MAINTENANCE_TASKS,
  OASIS,
  OASIS_REQUEST_TYPES,
  privilegeKey,
  REQUEST_REASONS,
  TASK_STATES,
  TONERS,
  type ItFormData,
  type ItFormKind,
} from "@/lib/it-forms";
import { cn } from "@/lib/utils";
import { LABELS } from "./labels";

/**
 * The forms as their controlled paper copies lay them out, on an A4 sheet, with what was filled in
 * written in: printed, and signed by hand. Always black on white, whatever the app's theme.
 */

const BLUE = "#0070c0";
const LIGHT = "#ddebf7";

/** A ticked or empty box, as the paper forms draw them. */
function Box({ on }: { on: boolean }) {
  return (
    <span className="box inline-flex size-[3.2mm] shrink-0 items-center justify-center border border-black align-middle text-[7pt] leading-none" aria-label={on ? "ticked" : "not ticked"}>
      {on ? "✕" : ""}
    </span>
  );
}
const Boxed = ({ on, children, className }: { on: boolean; children: ReactNode; className?: string }) => (
  <span className={cn("inline-flex items-center gap-[1.5mm]", className)}>
    <Box on={on} />
    <span>{children}</span>
  </span>
);

/** A label and what was written on its line. */
function Field({ label, value, className, strong }: { label: string; value: string; className?: string; strong?: boolean }) {
  return (
    <div className={cn("flex min-w-0 items-end gap-[2mm]", className)}>
      <span className="shrink-0">{label}</span>
      <span className={cn("min-h-[4.5mm] min-w-0 flex-1 break-words border-b border-black px-[1mm] text-center", strong && "font-bold")}>{value}</span>
    </div>
  );
}

/** The bar a section starts with: its name, and its box ticked when the section is used. */
function Bar({ title, on, end }: { title: string; on?: boolean; end?: ReactNode }) {
  return (
    <div className="flex items-center gap-[4mm] px-[2mm] py-[0.6mm] font-bold text-white" style={{ background: BLUE }}>
      <span className="w-[32mm]">{title}</span>
      {on !== undefined && <span className="inline-flex size-[3.2mm] items-center justify-center border border-white text-[7pt]">{on ? "✕" : ""}</span>}
      {end && <span className="ms-auto flex items-center gap-[6mm]">{end}</span>}
    </div>
  );
}
const Band = ({ children }: { children: ReactNode }) => (
  <div className="px-[3mm] py-[0.5mm] font-bold" style={{ background: LIGHT }}>
    {children}
  </div>
);

/** The document control block every form carries: format, revision and date of issue. */
function Control({ kind }: { kind: ItFormKind }) {
  const d = FORM_DOCUMENT[kind];
  return (
    <table className="border-collapse text-[8pt]">
      <tbody>
        {[
          ["Format No.:", d.formatNo],
          ["Revision No.:", d.revision],
          [kind === "maintenance" ? "Date of Issue:" : "Date Issue:", d.issued],
        ].map(([k, v]) => (
          <tr key={k}>
            <td className="border border-black px-[1.5mm] py-[0.3mm]">{k}</td>
            <td className="w-[22mm] border border-black px-[1.5mm] py-[0.3mm]">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The header of the Quality Management System forms: the logo, the form's title, its control block. */
function QmsHeader({ kind, lines, formats }: { kind: ItFormKind; lines: string[]; formats?: boolean }) {
  return (
    <div className="grid grid-cols-[38mm_1fr_auto] items-stretch border border-black">
      <div className="flex items-center justify-center border-e border-black p-[1.5mm]">
        <img src="/brand/applus-logo.svg" alt="AP Plus" className="h-[11mm] w-auto" />
      </div>
      <div className="flex flex-col items-center justify-center px-[2mm] text-center leading-tight">
        <div className={cn("font-bold", formats ? "text-[10pt]" : "text-[13pt]")}>{formats ? "Quality Management System Formats" : "Quality Management System"}</div>
        {lines.map((l) => (
          <div key={l} className={formats ? "text-[7.5pt]" : "text-[10pt]"}>
            {l}
          </div>
        ))}
      </div>
      <div className="border-s border-black">
        <Control kind={kind} />
      </div>
    </div>
  );
}

function Printed({ at }: { at: Date }) {
  const time = at.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  return <div className="mt-auto pt-[4mm] text-[7.5pt]">Date: {formDate(at.toISOString())} {time}</div>;
}

function Sign({ label, name, low }: { label: string; name?: string; low?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <div className={cn("w-[55mm] border-b border-black", low ? "h-[7mm]" : "h-[12mm]")} />
      {name && <div className="mt-[0.5mm]">{name}</div>}
      <div className="mt-[0.5mm] text-[8pt]">{label}</div>
    </div>
  );
}

const Sheet = ({ children, className }: { children: ReactNode; className?: string }) => (
  <article className={cn("it-form-sheet mx-auto flex h-[297mm] w-[210mm] flex-col overflow-hidden bg-white px-[11mm] py-[9mm] font-[Arial,Helvetica,sans-serif] text-[8.5pt] leading-snug text-black shadow-lg print:shadow-none", className)}>
    {children}
  </article>
);

type Person = ItFormData<"incident_repair">["person"];
function UserInformation({ person, extra }: { person: Person; extra: [string, string] }) {
  return (
    <section className="mt-[3mm] border border-black">
      <Bar title="User Information" />
      <div className="space-y-[2mm] px-[4mm] py-[2.5mm]">
        <div className="grid grid-cols-[2.2fr_1fr_1.8fr_1.4fr] gap-[3mm]">
          <Field label="Employee Name:" value={person.name} />
          <Field label="Emp. ID:" value={person.empId} />
          <Field label="Department:" value={person.department} />
          <Field label="Branch:" value={person.branch} />
        </div>
        <div className="grid grid-cols-[2.2fr_2fr_2.2fr] gap-[3mm]">
          <Field label="Job Title:" value={person.jobTitle} />
          <Field label="Email:" value={person.email} />
          <Field label={extra[0]} value={extra[1]} />
        </div>
      </div>
    </section>
  );
}

const Levels = ({ value }: { value: string }) => (
  <>
    {LEVELS.map((l) => (
      <Boxed key={l} on={value === l} className="w-[22mm]">
        {LABELS.level[l]}
      </Boxed>
    ))}
  </>
);

function IncidentRepairSheet({ data, at }: { data: ItFormData<"incident_repair">; at: Date }) {
  const r = data.repair;
  return (
    <Sheet>
      <QmsHeader kind="incident_repair" lines={["IT Department"]} />
      <UserInformation person={data.person} extra={["Date Reported:", formDate(data.dateReported)]} />
      <section className="mt-[4mm] border border-black">
        <Bar title="Incident Report" on={data.incident.on} />
        <div className="flex items-center px-[3mm] py-[0.5mm] font-bold" style={{ background: LIGHT }}>
          <span className="flex-1">Severity Level:</span>
          <span className="flex">
            <Levels value={data.incident.severity} />
          </span>
        </div>
        <div className="space-y-[2mm] px-[4mm] py-[3mm]">
          <Field label="Incident Description:" value={data.incident.description} strong className="[&>span:first-child]:w-[34mm]" />
          <Field label="Diagnosis:" value={data.incident.diagnosis} className="[&>span:first-child]:w-[34mm]" />
          <Field label="Resolution:" value={data.incident.resolution} className="[&>span:first-child]:w-[34mm]" />
        </div>
      </section>
      <section className="mt-[4mm] border border-black">
        <Bar title="Repair Report" on={r.on} />
        <div className="flex items-center px-[3mm] py-[0.5mm] font-bold" style={{ background: LIGHT }}>
          <span className="flex-1">Damage Severity Level:</span>
          <span className="flex">
            <Levels value={r.severity} />
          </span>
        </div>
        <div className="space-y-[2mm] px-[4mm] py-[2.5mm]">
          <div className="font-bold">Asset Details:</div>
          <div className="grid grid-cols-[1.6fr_1.2fr_1.2fr_1.2fr] gap-[3mm]">
            <Field label="Category:" value={r.category} />
            <Field label="Brand Name:" value={r.brand} />
            <Field label="Model:" value={r.model} />
            <Field label="S/N:" value={r.serial} />
          </div>
          <div className="grid grid-cols-[auto_1fr_0.8fr_0.7fr_1fr_0.8fr] gap-[3mm]">
            <span>For Desktop Laptop:</span>
            <Field label="Disk Type:" value={r.diskType} />
            <Field label="Size:" value={r.diskSize} />
            <Field label="RAM:" value={r.ram} />
            <Field label="Processor:" value={r.processor} />
            <Field label="Screen:" value={r.screen} />
          </div>
          <Field label="Others:" value={r.others} className="[&>span:first-child]:w-[34mm]" />
          <Field label="Diagnosis:" value={r.diagnosis} className="[&>span:first-child]:w-[34mm]" />
          <Field label="Resolution:" value={r.resolution} className="[&>span:first-child]:w-[34mm]" />
        </div>
      </section>
      <div className="mx-[5mm] mt-[3mm] min-h-[16mm] whitespace-pre-wrap border border-black p-[2mm]">{data.remarks}</div>
      <div className="mt-[10mm] grid grid-cols-2 gap-[10mm]">
        <Sign label="Employee Signature" />
        <Sign label="IT Signature" />
      </div>
      <Printed at={at} />
    </Sheet>
  );
}

function ItRequestSheet({ data, at }: { data: ItFormData<"it_request">; at: Date }) {
  const it = data.it;
  const has = (e: (typeof EQUIPMENT)[number]) => it.equipment.includes(e);
  const chosen = new Set(data.oasis.privileges);
  const folders = [0, 1].map((i) => it.folders[i] ?? { names: "", permission: "" });
  const cell = "whitespace-nowrap border border-black px-[1mm] py-[0.2mm]";
  return (
    <Sheet className="py-[6mm] text-[6.6pt] leading-[1.18] [&_.box]:size-[2.6mm] [&_.box]:text-[5.5pt]">
      <QmsHeader kind="it_request" lines={["IT Department", "IT Services & ERP request Form"]} />
      <section className="mt-[2mm] border border-black">
        <Bar title="User Information" />
        <div className="space-y-[1mm] px-[3mm] py-[1mm]">
          <div className="grid grid-cols-[2.2fr_0.9fr_1.8fr_1.2fr] gap-[2mm]">
            <Field label="Employee Name:" value={data.person.name} />
            <Field label="Emp. ID:" value={data.person.empId} />
            <Field label="Department:" value={data.person.department} />
            <Field label="Branch:" value={data.person.branch} />
          </div>
          <div className="grid grid-cols-[2.2fr_1.8fr_1.6fr] gap-[2mm]">
            <Field label="Job Title:" value={data.person.jobTitle} />
            <Field label="Email:" value={data.person.email} />
            <Field label="Mobile:" value={data.person.mobile} />
          </div>
        </div>
      </section>
      <section className="mt-[2mm] border border-black">
        <Bar title="IT Request" on={it.on} />
        <Band>Equipment Request and Custody</Band>
        <div className="px-[3mm] py-[1mm]">
          <table className="w-full border-collapse">
            <tbody>
              <tr>
                <td className={cell}><Boxed on={has("desktop")}>Desktop</Boxed></td>
                <td className={cell}><Boxed on={has("laptop")}>Laptop</Boxed></td>
                <td className={cell}>Notes:</td>
                <td className={cn(cell, "w-[32%]")}>{it.notesComputer}</td>
                <td className={cell}><Boxed on={has("lcdMonitor")}>LCD Monitor</Boxed></td>
                <td className={cell}>Notes:</td>
                <td className={cn(cell, "w-[20%]")}>{it.notesMonitor}</td>
                <td className={cell}><Boxed on={has("doorAccess")}>Door Access</Boxed></td>
              </tr>
              <tr>
                <td className={cell}><Boxed on={has("ipPhone")}>IP Phone</Boxed></td>
                <td className={cell}><Boxed on={has("printer")}>Printer</Boxed></td>
                <td className={cell}>Notes:</td>
                <td className={cell}>{it.notesPhone}</td>
                <td className={cell}><Boxed on={has("simCard")}>Sim Card</Boxed></td>
                <td className={cell}>Notes:</td>
                <td className={cell}>{it.notesSim}</td>
                <td className={cell}><Boxed on={has("scanner")}>Scanner</Boxed></td>
              </tr>
              <tr>
                <td className={cell}>Others:</td>
                <td className={cell} colSpan={7}>{it.others}</td>
              </tr>
            </tbody>
          </table>
          <div className="mt-[1mm] flex justify-around">
            <Sign label="Employee Signature" low />
            <Sign label="IT Issuer Signature" low />
          </div>
        </div>
        <Band>Consumables</Band>
        <div className="flex flex-wrap gap-x-[4mm] px-[3mm] py-[1mm]">
          <span className="italic underline">Printer Cartridges</span>
          {CARTRIDGES.map((c) => <Boxed key={c} on={it.cartridges.includes(c)}>{LABELS.colour[c]}</Boxed>)}
          <span className="ms-[8mm] italic underline">Printer Toner</span>
          {TONERS.map((c) => <Boxed key={c} on={it.toners.includes(c)}>{LABELS.colour[c]}</Boxed>)}
        </div>
        <Band>Reason for Request</Band>
        <div className="flex flex-wrap gap-x-[5mm] px-[3mm] py-[1mm]">
          {REQUEST_REASONS.map((r) => <Boxed key={r} on={it.reasons.includes(r)}>{LABELS.reason[r]}</Boxed>)}
        </div>
        <Band>Shared Folder Access</Band>
        <div className="space-y-[0.8mm] px-[3mm] py-[1mm]">
          {folders.map((f, i) => (
            <div key={i} className="flex items-center gap-[3mm]">
              <Field label="Folder Name/s:" value={f.names} className="flex-1" />
              <span>Permissions:</span>
              {FOLDER_PERMISSIONS.map((p) => <Boxed key={p} on={f.permission === p}>{LABELS.permission[p]}</Boxed>)}
            </div>
          ))}
        </div>
      </section>
      <section className="mt-[2mm] border border-black">
        <Bar
          title="OASIS Access Request"
          on={data.oasis.on}
          end={
            <>
              <Boxed on={data.oasis.user === "new"}>New</Boxed>
              <Boxed on={data.oasis.user === "existing"}>Existing User</Boxed>
            </>
          }
        />
        <div className="space-y-[1mm] px-[3mm] py-[1mm]">
          <div className="flex items-center gap-[3mm]">
            <Field label="Oasis ID:" value={data.oasis.oasisId} className="w-[38mm]" />
            <span className="italic underline">Request Type:</span>
            {OASIS_REQUEST_TYPES.map((r) => <Boxed key={r} on={data.oasis.requestType.includes(r)}>{LABELS.requestType[r]}</Boxed>)}
          </div>
          <Field label="Reason for request:" value={data.oasis.reason} />
        </div>
        {OASIS.map((s) => (
          <div key={s.key}>
            <div className="px-[3mm] text-[6.5pt] font-bold uppercase" style={{ background: LIGHT }}>
              {s.label}
            </div>
            {/* Modules taken whole, with nothing named under them, share a line, as on the paper form. */}
            {s.modules.some((m) => !m.items.length && !m.grids) && (
              <div className="flex flex-wrap gap-x-[5mm] gap-y-[0.3mm] px-[3mm] py-[0.3mm]">
                {s.modules
                  .filter((m) => !m.items.length && !m.grids)
                  .map((m) => (
                    <span key={m.key} className="inline-flex items-center gap-[1mm] font-bold">
                      ▪ {m.label} <Box on={chosen.has(privilegeKey(s.key, m.key))} />
                    </span>
                  ))}
              </div>
            )}
            {s.modules
              .filter((m) => m.items.length || m.grids)
              .map((m) => (
                <div key={m.key} className="grid grid-cols-[38mm_1fr] gap-[2mm] px-[3mm] py-[0.3mm]">
                  <span className="inline-flex items-start gap-[1mm] font-bold">
                    <span>▪ {m.label}</span> <Box on={chosen.has(privilegeKey(s.key, m.key))} />
                  </span>
                  <div className="space-y-[0.2mm]">
                    {m.items.length > 0 && (
                      <div className="grid grid-cols-4 gap-x-[2mm] gap-y-[0.2mm]">
                        {m.items.map((i) => <Boxed key={i.key} on={chosen.has(privilegeKey(s.key, m.key, i.key))}>{i.label}</Boxed>)}
                      </div>
                    )}
                    {m.grids?.map((g) => (
                      <div key={g.key} className="grid grid-cols-[22mm_repeat(3,22mm)] gap-x-[2mm]">
                        {g.rows.map((r) => (
                          <div key={r} className="contents">
                            <span>{r}</span>
                            {g.cols.map((c) => <Boxed key={c} on={chosen.has(gridKey(s.key, m.key, g.key, r, c))}>{c}</Boxed>)}
                          </div>
                        ))}
                      </div>
                    ))}
                    {m.after && (
                      <div className="grid grid-cols-4 gap-x-[2mm]">
                        {m.after.map((i) => <Boxed key={i.key} on={chosen.has(privilegeKey(s.key, m.key, i.key))}>{i.label}</Boxed>)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
          </div>
        ))}
      </section>
      <div className="mt-[1mm] grid grid-cols-3 gap-[4mm]">
        <Sign label="Requestor Signature" low />
        <Sign label="Department Manager" low />
        <Sign label="IT Manager" low />
      </div>
      <Printed at={at} />
    </Sheet>
  );
}

const INTRO_EN =
  "Welcome to AP Plus! The summary below are your personal information, usernames and provided to login to AP Plus Systems are highly confidential and for your PERSONAL USE ONLY. Sharing your credentials and other sensitive information, may subject to disciplinary action.";
const INTRO_AR =
  "مرحبًا بك في الوثيقة المعتمدة لوساطة التأمين. الملخص أدناه هو معلوماتك الشخصية، وأسماء المستخدمين المقدمة لتسجيل الدخول إلى أنظمتنا وسري للغاية ولاستخدامك الشخصي فقط. قد يؤدي مشاركة بيانات اعتمادك والمعلومات الحساسة الأخرى إلى اتخاذ إجراءات تأديبية.";

function CredentialTable({ title, titleAr, rows }: { title: string; titleAr: string; rows: [string, string, string][] }) {
  return (
    <table className="w-full border-collapse border border-black">
      <tbody>
        <tr>
          <td colSpan={2} className="border-b border-black px-[1.5mm] py-[0.6mm] text-[9.5pt] font-bold underline">
            {title}
          </td>
          <td className="border-b border-black px-[1.5mm] text-end text-[7.5pt] font-bold underline" dir="rtl">
            {titleAr}
          </td>
        </tr>
        {rows.map(([label, value, ar]) => (
          <tr key={label}>
            <td className="w-[38mm] border border-black px-[1.5mm] py-[0.6mm]">{label}</td>
            <td className="border border-black px-[1.5mm] text-center">{value}</td>
            <td className="w-[38mm] border border-black px-[1.5mm] text-end text-[7pt]" dir="rtl">
              {ar}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CredentialsSheet({ data }: { data: ItFormData<"credentials"> }) {
  const p = data.person;
  return (
    <Sheet className="text-[9.5pt]">
      <QmsHeader kind="credentials" lines={["IT Department – Employee Credential Information"]} formats />
      <h1 className="mt-[8mm] text-center text-[10pt] font-bold">EMPLOYEE CREDENTIAL INFORMATION</h1>
      <div className="mt-[8mm] grid grid-cols-2 gap-[6mm] leading-relaxed">
        <p className="text-justify">{INTRO_EN}</p>
        <p className="text-justify text-[10pt]" dir="rtl" lang="ar">
          {INTRO_AR}
        </p>
      </div>
      <div className="mt-[8mm] space-y-[2mm]">
        <CredentialTable
          title="Employee Information"
          titleAr="معلومات الموظف"
          rows={[
            ["Name", p.name, "الاسم"],
            ["Job Title", p.jobTitle, "المسمى الوظيفي"],
            ["Department", p.department, "القسم"],
            ["ID No.", p.empId, "الرقم الوظيفي"],
            ["Branch", p.branch, "الفرع"],
            ["Email", p.email, "البريد الإلكتروني"],
          ]}
        />
        <CredentialTable
          title="User Credentials"
          titleAr="بيانات المستخدم"
          rows={[
            ["Email ID", data.emailId, "معرف البريد الإلكتروني"],
            ["Oasis ID", data.oasisId, "معرف النظام"],
          ]}
        />
        <CredentialTable
          title="Important Links"
          titleAr="روابط تهمك"
          rows={[
            ["Outlook Webapp", data.outlookUrl, ""],
            ["Ticketing System", data.ticketingUrl, ""],
          ]}
        />
        <div className="border border-black">
          <div className="border-b border-black px-[1.5mm] py-[0.6mm] font-bold underline">Item Checklist</div>
          <div className="flex justify-around px-[3mm] py-[4mm]">
            {CREDENTIAL_ITEMS.map((i) => <Boxed key={i} on={data.items.includes(i)}>{LABELS.credentialItem[i]}</Boxed>)}
          </div>
          <div className="px-[1.5mm] pb-[2mm]">Others {data.others && <span className="ms-[3mm] underline">{data.others}</span>}</div>
        </div>
      </div>
      <div className="mt-[14mm] flex justify-center">
        <div className="flex flex-col items-center">
          <div className="h-[14mm] w-[55mm] border-b border-black" />
          <div className="mt-[1mm]">{data.signedBy}</div>
          <div className="font-bold">IT Manager</div>
        </div>
      </div>
    </Sheet>
  );
}

function MaintenanceSheet({ data }: { data: ItFormData<"maintenance"> }) {
  const p = data.person;
  return (
    <Sheet className="text-[9pt]">
      <div className="flex items-start justify-between">
        <img src="/brand/applus-logo.svg" alt="AP Plus" className="h-[16mm] w-auto" />
        <div className="text-end">
          <div className="text-[13pt] font-bold">SCHEDULED MAINTENANCE REPORT</div>
          <div className="text-[10pt]">IT Department</div>
        </div>
      </div>
      <h2 className="mt-[4mm] text-[10.5pt] font-bold">Employee Information</h2>
      <div className="mt-[1mm] grid grid-cols-2 gap-x-[8mm] gap-y-[1.5mm] px-[5mm]">
        <Field label="Name" value={p.name} className="[&>span:first-child]:w-[24mm]" />
        <Field label="Position" value={p.jobTitle} className="[&>span:first-child]:w-[26mm]" />
        <Field label="Department:" value={p.department} className="[&>span:first-child]:w-[24mm]" />
        <Field label="Maintenance Date:" value={formDate(data.date)} className="[&>span:first-child]:w-[26mm]" />
      </div>
      <h2 className="mt-[4mm] text-[10.5pt] font-bold">Asset Type</h2>
      <div className="mt-[1mm] flex items-center justify-center gap-[12mm]">
        <Boxed on={data.assetType === "laptop"}>Laptop</Boxed>
        <Boxed on={data.assetType === "pc"}>PC</Boxed>
        <Field label="Manufacturer:" value={data.manufacturer} className="w-[70mm]" />
      </div>
      <table className="mt-[4mm] w-full border-collapse text-[8.5pt]">
        <thead>
          <tr className="text-white" style={{ background: BLUE }}>
            <th className="w-[10mm] border border-black py-[1mm]">No.</th>
            <th className="border border-black">Tasks / Status</th>
            {TASK_STATES.map((s) => (
              <th key={s} className="w-[19mm] border border-black text-[6.5pt]">
                {LABELS.taskState[s]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MAINTENANCE_TASKS.map((task, i) => (
            <tr key={task}>
              <td className="border border-black text-center">{i + 1}</td>
              <td className="border border-black px-[1.5mm] py-[0.5mm]">{task}</td>
              {TASK_STATES.map((s) => (
                <td key={s} className="border border-black text-center">
                  <Box on={data.tasks[i] === s} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-[4mm] border border-black">
        <div className="px-[2mm] py-[0.5mm] font-bold text-white" style={{ background: BLUE }}>
          List of Issues found:
        </div>
        <div className="min-h-[22mm] whitespace-pre-wrap p-[2mm]">{data.issues}</div>
      </div>
      <div className="mt-[8mm] ms-[45mm] w-[80mm] space-y-[2mm]">
        <Field label="Checked By:" value={data.checkedBy} className="[&>span:first-child]:w-[20mm] [&>span:first-child]:text-end" />
        <Field label="Date:" value={formDate(data.checkedDate)} className="[&>span:first-child]:w-[20mm] [&>span:first-child]:text-end" />
      </div>
      <div className="mt-auto grid grid-cols-[1fr_auto] border border-black">
        <div className="px-[2mm] py-[1mm]">
          <div className="text-[10pt]">Quality Management System Format</div>
          <div className="text-[8pt]">Scheduled Maintenance Report</div>
        </div>
        <Control kind="maintenance" />
      </div>
    </Sheet>
  );
}

/** A saved form on its sheet, ready to print. `at` is when it is printed, written at its foot. */
export function ItFormSheet({ kind, data, at }: { kind: ItFormKind; data: unknown; at: Date }) {
  switch (kind) {
    case "incident_repair":
      return <IncidentRepairSheet data={data as ItFormData<"incident_repair">} at={at} />;
    case "it_request":
      return <ItRequestSheet data={data as ItFormData<"it_request">} at={at} />;
    case "credentials":
      return <CredentialsSheet data={data as ItFormData<"credentials">} />;
    case "maintenance":
      return <MaintenanceSheet data={data as ItFormData<"maintenance">} />;
  }
}
