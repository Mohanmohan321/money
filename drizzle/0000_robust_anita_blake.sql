CREATE TABLE "money_borrowed" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_name" text NOT NULL,
	"amount" numeric(20, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "money_borrowed_amount_positive" CHECK ("money_borrowed"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "money_lent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_name" text NOT NULL,
	"amount" numeric(20, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "money_lent_amount_positive" CHECK ("money_lent"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(20, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_amount_positive" CHECK ("transactions"."amount" > 0)
);
--> statement-breakpoint
CREATE INDEX "money_borrowed_created_at_idx" ON "money_borrowed" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "money_lent_created_at_idx" ON "money_lent" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sessions_expires_at_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "transactions_created_at_idx" ON "transactions" USING btree ("created_at");