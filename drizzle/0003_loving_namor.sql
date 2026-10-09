CREATE TABLE "budget_calendar_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seed_key" varchar(40),
	"name" varchar(80) NOT NULL,
	"group_name" varchar(24) NOT NULL,
	"monthly_amount" numeric(20, 2) NOT NULL,
	"included_in_overall_budget" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_calendar_categories_seed_key_unique" UNIQUE("seed_key"),
	CONSTRAINT "budget_calendar_categories_amount_non_negative" CHECK ("budget_calendar_categories"."monthly_amount" >= 0),
	CONSTRAINT "budget_calendar_categories_sort_order_non_negative" CHECK ("budget_calendar_categories"."sort_order" >= 0),
	CONSTRAINT "budget_calendar_categories_group_valid" CHECK ("budget_calendar_categories"."group_name" in ('grocery', 'meal', 'petrol', 'snacks', 'miscellaneous', 'other'))
);
--> statement-breakpoint
CREATE TABLE "budget_calendar_day_records" (
	"date" date PRIMARY KEY NOT NULL,
	"recorded_zero" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "budget_calendar_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_date" date NOT NULL,
	"category_id" uuid NOT NULL,
	"amount" numeric(20, 2) NOT NULL,
	"description" varchar(200),
	"notes" varchar(500),
	"idempotency_key" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_calendar_expenses_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "budget_calendar_expenses_amount_positive" CHECK ("budget_calendar_expenses"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "budget_calendar_months" (
	"month" varchar(7) PRIMARY KEY NOT NULL,
	"overall_limit" numeric(20, 2) NOT NULL,
	"configuration_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_calendar_months_month_format" CHECK ("budget_calendar_months"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "budget_calendar_months_limit_non_negative" CHECK ("budget_calendar_months"."overall_limit" >= 0)
);
--> statement-breakpoint
CREATE TABLE "budget_calendar_overrides" (
	"date" date PRIMARY KEY NOT NULL,
	"planned_amount" numeric(20, 2) NOT NULL,
	"note" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_calendar_overrides_amount_non_negative" CHECK ("budget_calendar_overrides"."planned_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "budget_calendar_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"frequency" varchar(24) NOT NULL,
	"amount" numeric(20, 2) NOT NULL,
	"weekdays" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"day_of_month" integer,
	"active_from" date,
	"active_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_calendar_rules_amount_non_negative" CHECK ("budget_calendar_rules"."amount" >= 0),
	CONSTRAINT "budget_calendar_rules_frequency_valid" CHECK ("budget_calendar_rules"."frequency" in ('daily', 'weekly', 'monthly', 'specific_days')),
	CONSTRAINT "budget_calendar_rules_day_of_month_valid" CHECK ("budget_calendar_rules"."day_of_month" is null or "budget_calendar_rules"."day_of_month" between 1 and 31),
	CONSTRAINT "budget_calendar_rules_active_range_valid" CHECK ("budget_calendar_rules"."active_from" is null or "budget_calendar_rules"."active_to" is null or "budget_calendar_rules"."active_from" <= "budget_calendar_rules"."active_to")
);
--> statement-breakpoint
CREATE TABLE "budget_calendar_settings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"week_start" integer DEFAULT 1 NOT NULL,
	"weekly_food_target" numeric(20, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_calendar_settings_week_start_valid" CHECK ("budget_calendar_settings"."week_start" between 1 and 7),
	CONSTRAINT "budget_calendar_settings_food_target_non_negative" CHECK ("budget_calendar_settings"."weekly_food_target" >= 0)
);
--> statement-breakpoint
ALTER TABLE "budget_calendar_expenses" ADD CONSTRAINT "budget_calendar_expenses_category_id_budget_calendar_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."budget_calendar_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_calendar_rules" ADD CONSTRAINT "budget_calendar_rules_category_id_budget_calendar_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."budget_calendar_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "budget_calendar_categories_active_order_idx" ON "budget_calendar_categories" USING btree ("active","sort_order");--> statement-breakpoint
CREATE INDEX "budget_calendar_expenses_date_idx" ON "budget_calendar_expenses" USING btree ("expense_date");--> statement-breakpoint
CREATE INDEX "budget_calendar_expenses_category_idx" ON "budget_calendar_expenses" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "budget_calendar_rules_category_idx" ON "budget_calendar_rules" USING btree ("category_id");
--> statement-breakpoint
INSERT INTO "budget_calendar_settings" ("id", "week_start", "weekly_food_target")
VALUES ('00000000-0000-4000-8000-000000000003', 1, 1900.00)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "budget_calendar_categories"
  ("seed_key", "name", "group_name", "monthly_amount", "included_in_overall_budget", "sort_order")
VALUES
  ('bananas', 'Bananas', 'grocery', 300.00, true, 10),
  ('dates', 'Dates', 'grocery', 300.00, true, 20),
  ('milk', 'Milk', 'grocery', 300.00, true, 30),
  ('eggs', 'Eggs', 'grocery', 420.00, true, 40),
  ('oats', 'Oats', 'grocery', 350.00, true, 50),
  ('peanut-butter', 'Peanut butter', 'grocery', 350.00, true, 60),
  ('breakfast', 'Breakfast', 'meal', 480.00, true, 70),
  ('lunch', 'Lunch', 'meal', 2400.00, true, 80),
  ('dinner', 'Dinner', 'meal', 2400.00, true, 90),
  ('petrol', 'Petrol', 'petrol', 500.00, true, 100),
  ('snacks', 'Snacks', 'snacks', 1200.00, true, 110),
  ('miscellaneous', 'Miscellaneous', 'miscellaneous', 1000.00, true, 120)
ON CONFLICT ("seed_key") DO NOTHING;
