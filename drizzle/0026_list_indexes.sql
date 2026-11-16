CREATE INDEX "accounts_user_id_index" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_entity_id_index" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "email_links_ticket_id_index" ON "email_links" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "emails_ticket_id_index" ON "emails" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_index" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ticket_comments_ticket_id_index" ON "ticket_comments" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "tickets_assignee_id_index" ON "tickets" USING btree ("assignee_id");