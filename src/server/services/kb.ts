import { and, desc, eq, getTableColumns } from "drizzle-orm";
import type { z } from "zod";
import { ref } from "@/lib/domain";
import { can } from "@/lib/permissions";
import type { kbArticle } from "@/lib/schemas";
import { audit } from "../audit";
import type { SessionUser } from "../auth";
import { db } from "../db";
import { kbArticles, users } from "../db/schema";
import { one } from "../http";

/** IT sees drafts and retired articles too; everyone else reads what is published. */
const scope = (user: SessionUser) => (can(user.role, "it") ? undefined : eq(kbArticles.status, "published"));

const withAuthor = () =>
  db
    .select({ ...getTableColumns(kbArticles), authorName: users.name })
    .from(kbArticles)
    .leftJoin(users, eq(users.id, kbArticles.authorId));

export async function listArticles(user: SessionUser) {
  return withAuthor().where(scope(user)).orderBy(desc(kbArticles.updatedAt));
}

export async function getArticle(user: SessionUser, id: number) {
  return one(await withAuthor().where(and(eq(kbArticles.id, id), scope(user))));
}

export async function createArticle(user: SessionUser, input: z.infer<typeof kbArticle>) {
  const row = one(await db.insert(kbArticles).values({ ...input, authorId: user.id }).returning());
  await audit(user, "create", "article", row.id, `Wrote ${ref("article", row.id)}: ${row.title}`);
  return row;
}

export async function updateArticle(user: SessionUser, id: number, input: z.infer<typeof kbArticle>) {
  const row = one(await db.update(kbArticles).set(input).where(eq(kbArticles.id, id)).returning());
  await audit(user, "update", "article", id, `Updated ${ref("article", id)} (${row.status})`);
  return row;
}
