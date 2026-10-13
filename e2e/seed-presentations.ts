import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import type { SessionUser } from "@/server/auth";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { addDeck, createPresentation } from "@/server/services/presentations";

// A deck in the presentations library and a presentation of the admin's, so every page of
// Presentations has something to open. The deck is invented (tests/fixtures/decks); its slide
// pictures are a blank PDF, a page a slide, so LibreOffice is not needed for this.
const [admin] = await db.select().from(users).where(eq(users.email, "admin@applus.test"));
const pdf = await PDFDocument.create();
for (let i = 0; i < 3; i++) pdf.addPage([960, 540]);
const deck = await addDeck(
  { name: "Company overview", category: "generic", file: { name: "Company overview.pptx", bytes: new Uint8Array(readFileSync("tests/fixtures/decks/generic.pptx")) }, preview: await pdf.save() },
  admin,
);
await createPresentation(admin as SessionUser, { deckId: deck.id, title: "Insurance proposal", client: "Example Trading Co.", contact: null, date: null, presenter: admin.name });
await db.$client.end();
console.log("Presentations library seeded.");
