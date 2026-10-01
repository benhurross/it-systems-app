import type { LookupList } from "@/lib/domain";
import { db } from "../db";
import { lookups } from "../db/schema";

type Entry = [code: string, en: string, ar: string];

/**
 * The workbook's dropdown lists (DataDropDown, IT Asset DropMenu) with English and Arabic labels.
 * The asset taxonomy keeps the workbook's own Arabic; brand names stay in Latin script.
 */
export const REFERENCE: Record<LookupList, Entry[]> = {
  location: [
    ["jeddah", "Jeddah Head Office", "جدة - المكتب الرئيسي"],
    ["riyadh", "Riyadh Branch", "فرع الرياض"],
  ],
  department: [
    ["compliance", "Compliance", "الالتزام"],
    ["executive", "Executive", "الإدارة التنفيذية"],
    ["finance", "Finance", "المالية"],
    ["hr", "Human Resources", "الموارد البشرية"],
    ["it", "IT", "تقنية المعلومات"],
    ["operations", "Operations", "العمليات"],
    ["sales", "Sales", "المبيعات"],
  ],
  issue_type: [
    ["email", "Email", "البريد الإلكتروني"],
    ["hardware", "Hardware", "الأجهزة"],
    ["software", "Software", "البرامج"],
    ["internet", "Internet and network", "الإنترنت والشبكة"],
    ["login", "Login and access", "تسجيل الدخول والصلاحيات"],
    ["security", "Security", "الأمن"],
    ["maintenance", "Maintenance request", "طلب صيانة"],
    ["periodic_maintenance", "Periodic maintenance", "صيانة دورية"],
    ["id_card", "ID card", "بطاقة الهوية"],
    ["other", "Other request", "طلب آخر"],
  ],
  asset_category: [
    ["end_user", "End-User Devices", "أجهزة المستخدمين"],
    ["servers", "Servers and Infrastructure", "الخوادم والبنية التحتية"],
    ["network", "Network Devices", "أجهزة الشبكة"],
    ["security", "Cybersecurity Systems", "أنظمة الأمن السيبراني"],
    ["communication", "Communication Systems", "أنظمة الاتصالات"],
    ["software", "Software and Applications", "البرمجيات والتطبيقات"],
    ["backup", "Backup Systems", "أنظمة النسخ الاحتياطي"],
    ["monitoring", "Monitoring and Control Systems", "أنظمة المراقبة والتحكم"],
    ["printers", "Printers and Peripheral Devices", "الطابعات والأجهزة الطرفية"],
    ["cloud", "Cloud and Hosting Services", "الخدمات السحابية والاستضافة"],
  ],
  asset_type: [
    ["physical_server", "Physical Server", "خادم فعلي"],
    ["virtual_server", "Virtual Server", "خادم افتراضي"],
    ["desktop", "Desktop Computer", "حاسب مكتبي"],
    ["laptop", "Laptop", "حاسب محمول"],
    ["monitor", "Monitor", "شاشة"],
    ["printer", "Printer", "طابعة"],
    ["scanner", "Scanner", "ماسح ضوئي"],
    ["firewall", "Firewall", "جدار ناري"],
    ["router", "Router", "راوتر"],
    ["switch", "Network Switch", "سويتش"],
    ["access_point", "Access Point", "نقطة وصول"],
    ["storage", "Storage Device", "وحدة تخزين"],
    ["backup_appliance", "Backup Appliance", "جهاز نسخ احتياطي"],
    ["desk_phone", "Desk Phone", "هاتف مكتبي"],
    ["pbx", "PBX System", "نظام سنترال"],
    ["cctv", "CCTV Camera", "كاميرا مراقبة"],
    ["nvr", "Network Video Recorder", "جهاز تسجيل كاميرات"],
    ["access_control", "Access Control System", "نظام تحكم في الدخول"],
    ["ups", "UPS", "مزود طاقة غير منقطع"],
    ["application", "Application", "تطبيق"],
    ["database", "Database", "قاعدة بيانات"],
    ["cloud_service", "Cloud Service", "خدمة سحابية"],
  ],
  manufacturer: [
    "Microsoft",
    "Dell",
    "HP",
    "Lenovo",
    "Cisco",
    "Fortinet",
    "Sophos",
    "Trend Micro",
    "VMware",
    "Veeam",
    "DrayTek",
    "Grandstream",
    "Eaton",
    "Synology",
    "QNAP",
    "Oracle",
    "Adobe",
    "Apple",
    "Samsung",
    "Huawei",
    "Xerox",
    "Hikvision",
  ].map((name) => [name.toLowerCase().replace(/\s+/g, "_"), name, name]),
  kb_category: [
    ["email", "Email", "البريد الإلكتروني"],
    ["hardware", "Hardware", "الأجهزة"],
    ["software", "Software", "البرامج"],
    ["network", "Network and internet", "الشبكة والإنترنت"],
    ["accounts", "Accounts and access", "الحسابات والصلاحيات"],
    ["printing", "Printing and scanning", "الطباعة والمسح الضوئي"],
    ["security", "Security", "الأمن"],
    ["telephony", "Telephony", "الهاتف"],
  ],
  vendor_category: [
    ["services", "Services provider", "مزود خدمات"],
    ["hardware", "Hardware supplier", "مورد أجهزة"],
    ["software", "Software and licensing", "البرمجيات والتراخيص"],
    ["telecom", "Telecom", "الاتصالات"],
    ["security", "Security", "الأمن"],
    ["maintenance", "Maintenance", "الصيانة"],
  ],
  budget_category: [
    ["hardware", "Hardware", "الأجهزة"],
    ["software", "Software and licences", "البرمجيات والتراخيص"],
    ["connectivity", "Internet and connectivity", "الإنترنت والاتصال"],
    ["services", "Support and services", "الدعم والخدمات"],
    ["security", "Security", "الأمن"],
    ["cloud", "Cloud and hosting", "السحابة والاستضافة"],
  ],
  risk_category: [
    ["it", "IT operations", "عمليات تقنية المعلومات"],
    ["cyber", "Cybersecurity", "الأمن السيبراني"],
    ["compliance", "Compliance", "الالتزام"],
    ["continuity", "Business continuity", "استمرارية الأعمال"],
    ["vendor", "Third party", "الأطراف الخارجية"],
  ],
  // How a request reached IT. Requests raised in the app are "app"; IT picks the rest.
  channel: [
    ["app", "App", "التطبيق"],
    ["phone", "Phone call", "اتصال هاتفي"],
    ["mobile", "Mobile", "الجوال"],
    ["email", "Email", "البريد الإلكتروني"],
    ["email_alert", "Email alert", "تنبيه بريد إلكتروني"],
    ["whatsapp", "WhatsApp", "واتساب"],
    ["in_person", "In person", "حضورياً"],
  ],
};

/** Adds any missing reference values. Existing rows are left alone, so an admin's edits survive a re-run. */
export async function seedReference() {
  const rows = Object.entries(REFERENCE).flatMap(([list, entries]) =>
    entries.map(([code, labelEn, labelAr], sortOrder) => ({
      list: list as LookupList,
      code,
      labelEn,
      labelAr,
      sortOrder,
    })),
  );
  await db.insert(lookups).values(rows).onConflictDoNothing();
}
