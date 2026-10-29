"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { NewRequestDialog } from "@/components/requests/new-request-dialog";
import { useApi } from "@/hooks/use-api";
import { useRouter } from "@/i18n/navigation";
import type { MySummary } from "@/lib/api-types";
import MyRequestsPage from "../page";

/** An address for a new request: your requests, with the form open over them. */
export default function NewRequestPage() {
  return (
    <>
      <MyRequestsPage />
      {/* ?asset= says which of your devices it is about, which needs a Suspense boundary. */}
      <Suspense>
        <Open />
      </Suspense>
    </>
  );
}

function Open() {
  const router = useRouter();
  const assetParam = Number(useSearchParams().get("asset")) || null;
  const { data: me } = useApi<MySummary>(assetParam ? "/me" : null);
  // Asked about a device: the form waits for it, so it starts with it.
  if (assetParam && !me) return null;
  const device = me?.linked ? me.assets.find((a) => a.id === assetParam) : undefined;
  return <NewRequestDialog device={device} onClose={() => router.replace("/requests")} />;
}
