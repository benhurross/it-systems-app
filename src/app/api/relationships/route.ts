import { relationshipInput } from "@/lib/schemas";
import { body, handler, requireUser } from "@/server/http";
import { createRelationship, listRelationships } from "@/server/services/assets";

export const GET = handler(async () => {
  await requireUser("it");
  return listRelationships();
});

export const POST = handler(async (req) => {
  const user = await requireUser("it");
  return createRelationship(await body(req, relationshipInput), user);
});
