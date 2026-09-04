CREATE TABLE "subscription_reviews" (
	"merchant_key" varchar(200) PRIMARY KEY NOT NULL,
	"status" varchar(16) NOT NULL,
	"cadence" varchar(16) NOT NULL,
	"representative_amount" numeric(20, 2) NOT NULL,
	"supporting_transaction_ids" jsonb NOT NULL,
	"next_expected_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_reviews_amount_positive" CHECK ("subscription_reviews"."representative_amount" > 0),
	CONSTRAINT "subscription_reviews_status_valid" CHECK ("subscription_reviews"."status" in ('confirmed', 'dismissed')),
	CONSTRAINT "subscription_reviews_cadence_valid" CHECK ("subscription_reviews"."cadence" in ('weekly', 'monthly'))
);
