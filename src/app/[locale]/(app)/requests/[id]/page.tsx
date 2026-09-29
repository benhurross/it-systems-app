"use client";

import { use } from "react";
import { TicketView } from "@/components/tickets/ticket-view";

export default function RequestPage({ params }: PageProps<"/[locale]/requests/[id]">) {
  const { id } = use(params);
  return <TicketView id={Number(id)} mode="requester" />;
}
