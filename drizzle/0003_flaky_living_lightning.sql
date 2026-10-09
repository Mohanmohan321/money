CREATE TABLE "budget_date_overrides" (
	"date" date PRIMARY KEY NOT NULL,
	"planned_amount" numeric(20, 2) NOT NULL,
	"note" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_date_overrides_amount_non_negative" CHECK ("budget_date_overrides"."planned_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "budget_day_records" (
	"date" date PRIMARY KEY NOT NULL,
	"recorded_zero" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_settings" (
	"id" varchar(32) PRIMARY KEY NOT NULL,
	"overall_monthly_limit" numeric(20, 2) NOT NULL,
	"weekly_food_target" numeric(20, 2) NOT NULL,
	"week_start" integer DEFAULT 1 NOT NULL,
	"categories" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_settings_limit_non_negative" CHECK ("budget_settings"."overall_monthly_limit" >= 0),
	CONSTRAINT "budget_settings_weekly_food_non_negative" CHECK ("budget_settings"."weekly_food_target" >= 0),
	CONSTRAINT "budget_settings_week_start_monday" CHECK ("budget_settings"."week_start" = 1)
);
--> statement-breakpoint
INSERT INTO "budget_settings" ("id", "overall_monthly_limit", "weekly_food_target", "week_start", "categories") VALUES
('default', 10000.00, 1900.00, 1, '[{"id":"bananas","name":"Bananas","group":"grocery","monthlyAmount":"300.00","includedInOverallBudget":true,"schedule":"unassigned","weekdays":[],"active":true},{"id":"dates","name":"Dates","group":"grocery","monthlyAmount":"300.00","includedInOverallBudget":true,"schedule":"unassigned","weekdays":[],"active":true},{"id":"milk","name":"Milk","group":"grocery","monthlyAmount":"300.00","includedInOverallBudget":true,"schedule":"unassigned","weekdays":[],"active":true},{"id":"eggs","name":"Eggs","group":"grocery","monthlyAmount":"420.00","includedInOverallBudget":true,"schedule":"unassigned","weekdays":[],"active":true},{"id":"oats","name":"Oats","group":"grocery","monthlyAmount":"350.00","includedInOverallBudget":true,"schedule":"unassigned","weekdays":[],"active":true},{"id":"peanut-butter","name":"Peanut butter","group":"grocery","monthlyAmount":"350.00","includedInOverallBudget":true,"schedule":"unassigned","weekdays":[],"active":true},{"id":"breakfast","name":"Breakfast","group":"meal","monthlyAmount":"480.00","includedInOverallBudget":true,"schedule":"daily","weekdays":[],"active":true},{"id":"lunch","name":"Lunch","group":"meal","monthlyAmount":"2400.00","includedInOverallBudget":true,"schedule":"daily","weekdays":[],"active":true},{"id":"dinner","name":"Dinner","group":"meal","monthlyAmount":"2400.00","includedInOverallBudget":true,"schedule":"daily","weekdays":[],"active":true},{"id":"petrol","name":"Petrol","group":"petrol","monthlyAmount":"500.00","includedInOverallBudget":true,"schedule":"unassigned","weekdays":[],"active":true},{"id":"snacks","name":"Snacks","group":"snacks","monthlyAmount":"1200.00","includedInOverallBudget":true,"schedule":"unassigned","weekdays":[],"active":true},{"id":"miscellaneous","name":"Miscellaneous","group":"miscellaneous","monthlyAmount":"1000.00","includedInOverallBudget":true,"schedule":"unassigned","weekdays":[],"active":true}]'::jsonb)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "expense_date" date;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "budget_category" varchar(80);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "notes" varchar(500);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "idempotency_key" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "transactions_expense_date_idx" ON "transactions" USING btree ("expense_date");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_idempotency_key_unique" UNIQUE("idempotency_key");
