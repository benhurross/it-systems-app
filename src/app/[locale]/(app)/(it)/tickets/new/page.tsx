"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { NewTicketDialog } from "@/components/tickets/new-ticket-dialog";
import { useRouter } from "@/i18n/navigation";
import TicketsPage from "../page";

/** An address for a new ticket (from a bookmark or an email): the tickets, with the form open over them. */
export default function NewTicketPage() {
  return (
    <>
      <TicketsPage />
      {/* ?type=incident opens it as an incident report, which needs a Suspense boundary. */}
      <Suspense>
        <Open />
      </Suspense>
    </>
  );
}

function Open() {
  const router = useRouter();
  const incident = useSearchParams().get("type") === "incident";
  return <NewTicketDialog incident={incident} onClose={() => router.replace("/tickets")} />;
}
