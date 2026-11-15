"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { authClient } from "@/lib/auth-client";

/** Shared by the app's tabs: the last time the person did something in any of them. */
const KEY = "ap-it.last-activity";
const WARN_MS = 60_000;
/** The server hears of activity at most this often. */
const REPORT_MS = 60_000;

const readShared = () => {
  try {
    return Number(window.localStorage.getItem(KEY)) || 0;
  } catch {
    return 0;
  }
};
const writeShared = (at: number) => {
  try {
    window.localStorage.setItem(KEY, String(at));
  } catch {
    // Private windows and blocked storage: this tab keeps its own count.
  }
};

/**
 * Signs the account out after so many minutes without activity (Settings → Users), warning a
 * minute before with a countdown and "Stay signed in". Typing, clicking, scrolling or touching in
 * any of the app's tabs counts for all of them; a page refreshing itself does not. The server is
 * told of activity at most once a minute, and ends an idle sign-in itself as well.
 */
export function IdleGuard() {
  const t = useTranslations("auth.idle");
  const queries = useQueryClient();
  const [left, setLeft] = useState<number | null>(null);
  // Kept outside React's state: read by timers and listeners, never drawn.
  const limit = useRef(0);
  const last = useRef(0);
  const reported = useRef(0);

  /** Tells the server of activity, and hears the limit back. */
  const report = () => {
    reported.current = Date.now();
    fetch("/api/me/active", { method: "POST" })
      .then(async (res) => {
        if (res.ok) limit.current = ((await res.json()) as { idleMinutes: number }).idleMinutes * 60_000;
      })
      // Offline for a moment: the next activity tries again.
      .catch(() => undefined);
  };

  const active = () => {
    const now = Date.now();
    last.current = now;
    // Written at most every few seconds: a moving mouse is many events.
    if (now - readShared() > 5_000) writeShared(now);
    if (now - reported.current > REPORT_MS) report();
  };

  useEffect(() => {
    const signOut = async () => {
      const back = `${window.location.pathname}${window.location.search}`.replace(/^\/(en|ar)(?=\/|$)/, "") || "/";
      await authClient.signOut().catch(() => undefined);
      queries.clear();
      // A full load: nothing of the signed-out session stays on screen.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/${document.documentElement.lang}/sign-in?reason=idle&next=${encodeURIComponent(back)}`);
    };
    // Opening the app counts as activity, and hears the limit.
    active();
    // What a person does; not "scroll", which pages also do by themselves (a list updating, say).
    const events = ["pointerdown", "keydown", "wheel", "touchstart", "mousemove"] as const;
    for (const e of events) window.addEventListener(e, active, { passive: true, capture: true });
    let leaving = false;
    const timer = window.setInterval(() => {
      if (!limit.current || leaving) return setLeft(null);
      const idle = Date.now() - Math.max(last.current, readShared());
      if (idle >= limit.current) {
        leaving = true;
        void signOut();
      } else setLeft(idle >= limit.current - WARN_MS ? Math.ceil((limit.current - idle) / 1000) : null);
    }, 1000);
    return () => {
      for (const e of events) window.removeEventListener(e, active, { capture: true });
      window.clearInterval(timer);
    };
    // Once, for the whole app; what it calls reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AlertDialog open={left !== null}>
      <AlertDialogContent data-idle-warning>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          <AlertDialogDescription aria-live="assertive">{t("body", { seconds: left ?? 0 })}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            onClick={() => {
              reported.current = 0;
              active();
              setLeft(null);
            }}
          >
            {t("stay")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
