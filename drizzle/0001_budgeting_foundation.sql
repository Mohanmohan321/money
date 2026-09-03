CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"type" varchar(24) NOT NULL,
	"current_value" numeric(20, 2) NOT NULL,
	"note" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_current_value_positive" CHECK ("assets"."current_value" > 0)
);
--> statement-breakpoint
CREATE TABLE "income" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"category" varchar(24) NOT NULL,
	"amount" numeric(20, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "income_amount_positive" CHECK ("income"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "liabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"type" varchar(24) NOT NULL,
	"outstanding_balance" numeric(20, 2) NOT NULL,
	"note" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "liabilities_outstanding_balance_positive" CHECK ("liabilities"."outstanding_balance" > 0)
);
--> statement-breakpoint
CREATE TABLE "monthly_budgets" (
	"month" varchar(7) PRIMARY KEY NOT NULL,
	"salary" numeric(20, 2) NOT NULL,
	"spending_limit" numeric(20, 2) NOT NULL,
	"savings_target" numeric(20, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_budgets_month_format" CHECK ("monthly_budgets"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "monthly_budgets_salary_non_negative" CHECK ("monthly_budgets"."salary" >= 0),
	CONSTRAINT "monthly_budgets_spending_limit_non_negative" CHECK ("monthly_budgets"."spending_limit" >= 0),
	CONSTRAINT "monthly_budgets_savings_target_non_negative" CHECK ("monthly_budgets"."savings_target" >= 0)
);
--> statement-breakpoint
CREATE TABLE "vault_contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vault_id" uuid NOT NULL,
	"amount" numeric(20, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vault_contributions_amount_positive" CHECK ("vault_contributions"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "vaults" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"emoji" varchar(16) NOT NULL,
	"target_amount" numeric(20, 2) NOT NULL,
	"target_date" date,
	"status" varchar(16) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vaults_target_amount_positive" CHECK ("vaults"."target_amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "category" varchar(24);--> statement-breakpoint
UPDATE "transactions" SET "category" = 'other' WHERE "category" IS NULL;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "category" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "vault_contributions" ADD CONSTRAINT "vault_contributions_vault_id_vaults_id_fk" FOREIGN KEY ("vault_id") REFERENCES "public"."vaults"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "income_created_at_idx" ON "income" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "vault_contributions_vault_id_idx" ON "vault_contributions" USING btree ("vault_id");--> statement-breakpoint
CREATE INDEX "vault_contributions_created_at_idx" ON "vault_contributions" USING btree ("created_at");
