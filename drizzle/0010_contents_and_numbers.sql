ALTER TABLE "decks" ADD COLUMN "number_position" text DEFAULT 'bottom-left' NOT NULL;--> statement-breakpoint
ALTER TABLE "presentations" ADD COLUMN "slide_numbers" boolean DEFAULT true NOT NULL;