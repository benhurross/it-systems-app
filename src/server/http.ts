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

/** The signed-in user, provided their role reaches `area`. 401 when signed out, 403 when not allowed. */
export async function requireUser(area: Area): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Sign in required");
  if (!can(user.role, area)) throw new HttpError(403, "Not allowed");
  return user;
}

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
      throw error;
    }
  };
}

export async function body<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  return schema.parse(await req.json());
}
