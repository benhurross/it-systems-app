import { test as setup } from "@playwright/test";
import { DEMO_PASSWORD } from "../src/server/seed/demo-data";
import { ACCOUNTS, BASE_URL } from "./env";

// Signs each demo role in once and saves its session for the specs that act as that role.
for (const [role, email] of Object.entries(ACCOUNTS)) {
  setup(`sign in as ${role}`, async ({ request }) => {
    const res = await request.post("/api/auth/sign-in/email", {
      data: { email, password: DEMO_PASSWORD },
      headers: { origin: BASE_URL },
    });
    if (!res.ok()) throw new Error(`Could not sign in ${email}: ${res.status()}`);
    await request.storageState({ path: `e2e/.auth/${role}.json` });
  });
}
