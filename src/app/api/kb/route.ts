import { kbArticle } from "@/lib/schemas";
import { body, handler, requireUser } from "@/server/http";
import { createArticle, listArticles } from "@/server/services/kb";

/** Everyone reads published articles; IT also sees drafts and writes them. */
export const GET = handler(async () => {
  const user = await requireUser("request");
  return listArticles(user);
});

export const POST = handler(async (req) => {
  const user = await requireUser("it");
  return createArticle(user, await body(req, kbArticle));
});
