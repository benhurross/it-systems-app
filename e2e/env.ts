export const PORT = 3300;
export const BASE_URL = `http://localhost:${PORT}`;
export const TEST_DATABASE_URL = "postgres://apit:apit@localhost:5433/ap_it_test";

/** The demo accounts the specs act as. */
export const ACCOUNTS = {
  admin: "admin@applus.test",
  it: "it@applus.test",
  employee: "employee@applus.test",
} as const;

export type Role = keyof typeof ACCOUNTS;
export const session = (role: Role) => `e2e/.auth/${role}.json`;
