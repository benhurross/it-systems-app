import { licenseInput } from "@/lib/schemas";
import { body, handler, requireUser } from "@/server/http";
import { createLicense, listLicenses } from "@/server/services/licenses";

export const GET = handler(async () => {
  await requireUser("it");
  return listLicenses();
});

export const POST = handler(async (req) => {
  const user = await requireUser("it");
  return createLicense(await body(req, licenseInput), user);
});
