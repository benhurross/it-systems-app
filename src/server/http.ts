import { z } from "zod";
import { can, type Area } from "@/lib/permissions";
import type { SessionUser } from "./auth";
import { currentUser } from "./current-user";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = () => new HttpError(404, "Not found");
export const badRequest = (message: string) => new HttpError(400, message);
export const forbidden = (message = "Not allowed") => new HttpError(403, message);

/** The signed-in user, provided their role reaches `area`. 401 when signed out, 403 when not allowed. */
export async function requireUser(area: Area): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Sign in required");
  if (!can(user.role, area)) throw forbidden();
  return user;
}

/** Postgres error codes, read through Drizzle's wrapper. */
const pgCode = (error: unknown): string | undefined =>
  (error as { code?: string }).code ?? (error as { cause?: { code?: string } }).cause?.code;

/** Wraps a route handler: returns plain values as JSON and maps known errors to status codes. */
export function handler<C = unknown>(fn: (req: Request, ctx: C) => Promise<unknown>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      const result = await fn(req, ctx);
      return result instanceof Response ? result : Response.json(result ?? null);
    } catch (error) {
      if (error instanceof HttpError) {
        return Response.json({ error: error.message }, { status: error.status });
      }
      if (error instanceof z.ZodError) {
        return Response.json({ error: "Invalid input", issues: error.issues }, { status: 400 });
      }
      if (pgCode(error) === "23505") return Response.json({ error: "That already exists" }, { status: 409 });
      if (pgCode(error) === "23503") return Response.json({ error: "A linked record does not exist" }, { status: 400 });
      throw error;
    }
  };
}

export async function body<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  return schema.parse(await req.json());
}

/** The numeric `[id]` segment of a route; 404 for anything else. */
export async function idParam(ctx: { params: Promise<{ id: string }> }): Promise<number> {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id) || id <= 0) throw notFound();
  return id;
}

/** The first row, or 404. */
export function one<T>(rows: T[]): T {
  if (rows.length === 0) throw notFound();
  return rows[0];
}
