"use client";

import { createContext, useContext } from "react";
import type { authClient } from "@/lib/auth-client";

export type CurrentUser = typeof authClient.$Infer.Session.user;

const CurrentUserContext = createContext<CurrentUser | null>(null);

export const CurrentUserProvider = CurrentUserContext.Provider;

/** The signed-in user. Only valid inside the app shell, which renders nothing until a session exists. */
export function useCurrentUser(): CurrentUser {
  return useContext(CurrentUserContext)!;
}
