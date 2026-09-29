import { after } from "next/server";
import { discoveryStart } from "@/lib/schemas";
import { body, handler, requireUser } from "@/server/http";
import { listDiscoveryRuns, startDiscovery } from "@/server/services/discovery";

export const GET = handler(async () => {
  await requireUser("it");
  return listDiscoveryRuns();
});

/** Starts a sweep and answers at once; the sweep carries on after the response. */
export const POST = handler(async (req) => {
  const user = await requireUser("it");
  const { run, sweep } = await startDiscovery((await body(req, discoveryStart)).cidr, user);
  after(sweep);
  return run;
});
