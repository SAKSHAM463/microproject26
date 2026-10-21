CREATE TABLE "items" (
	"item_id" serial PRIMARY KEY,
	"seller_id" integer NOT NULL,
	"title" text NOT NULL,
	"category" text DEFAULT 'Other' NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"condition" text DEFAULT 'Good' NOT NULL,
	"hostel_room" text DEFAULT '' NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'Available' NOT NULL,
	"image_type" text DEFAULT 'default' NOT NULL,
	"image_url" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"message_id" serial PRIMARY KEY,
	"item_id" integer NOT NULL,
	"sender_id" integer NOT NULL,
	"receiver_id" integer NOT NULL,
	"message_text" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"order_id" serial PRIMARY KEY,
	"buyer_id" integer NOT NULL,
	"seller_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"item_title" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"pickup_location" text DEFAULT 'Hostel Gate' NOT NULL,
	"hostel_room" text DEFAULT '' NOT NULL,
	"payment_method" text DEFAULT 'Cash' NOT NULL,
	"status" text DEFAULT 'Pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"user_id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"hostel_room" text DEFAULT 'Campus Hostel' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
