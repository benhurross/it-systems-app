"use client";

import { use } from "react";
import { TicketView } from "@/components/tickets/ticket-view";

export default function TicketPage({ params }: PageProps<"/[locale]/tickets/[id]">) {
  const { id } = use(params);
  return <TicketView id={Number(id)} mode="it" />;
}
