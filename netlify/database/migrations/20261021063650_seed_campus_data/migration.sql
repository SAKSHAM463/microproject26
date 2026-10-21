INSERT INTO "users" ("user_id", "name", "email", "hostel_room", "created_at") VALUES
  (1, 'Karan', 'karan@campus.edu', 'H2 · Room 316', '2026-10-01T10:00:00.000Z'),
  (2, 'Neha', 'neha@campus.edu', 'H7 · Room 505', '2026-10-02T11:00:00.000Z'),
  (3, 'Rahul', 'rahul@campus.edu', 'H4 · Room 210', '2026-10-03T12:00:00.000Z');
--> statement-breakpoint
INSERT INTO "items" ("item_id", "seller_id", "title", "category", "price", "condition", "hostel_room", "details", "status", "image_type", "image_url", "created_at") VALUES
  (1, 1, 'Data Structures in C', 'Books', 180, 'Good', 'H2 · Room 316', '3rd Edition by Reema Thareja. Useful for 2nd year CS. Clean pages with highlighted key topics.', 'Available', 'book', '', '2026-10-05T09:00:00.000Z'),
  (2, 1, 'Wired earphones', 'Electronics', 120, 'Like new', 'H2 · Room 316', 'Boat Bassheads 3.5mm jack with microphone. Crisp sound, only used twice.', 'Available', 'calculator', '', '2026-10-06T10:30:00.000Z'),
  (3, 2, 'Bucket and mug set', 'Hostel Essentials', 60, 'Good', 'H7 · Room 505', 'Heavy-duty 20L blue bucket and matching 1L mug. Clean and ready for hostel use.', 'Available', 'bucket', '', '2026-10-07T14:15:00.000Z'),
  (4, 3, 'Engineering Drafter kit', 'Stationery', 150, 'Good', 'H4 · Room 210', 'Omega mini drafter with clamp, scale, and drawing sheet protective carrying tube.', 'Available', 'drafter', '', '2026-10-08T08:45:00.000Z'),
  (5, 3, 'Electric Kettle (1.2L)', 'Hostel Essentials', 320, 'Like new', 'H4 · Room 210', 'Stainless steel instant heating kettle with auto cut-off. Great for midnight coffee and noodles.', 'Available', 'kettle', '', '2026-10-08T15:20:00.000Z'),
  (6, 2, 'White Lab Coat (M)', 'Stationery', 130, 'Good', 'H7 · Room 505', 'Medium size pure cotton lab coat. Cleaned and pressed, required for chemistry/biology labs.', 'Available', 'labcoat', '/images/labcoat.png', '2026-10-09T08:10:00.000Z');
--> statement-breakpoint
INSERT INTO "orders" ("order_id", "buyer_id", "seller_id", "item_id", "item_title", "quantity", "total", "pickup_location", "hostel_room", "payment_method", "status", "created_at") VALUES
  (1, 2, 1, 1, 'Data Structures in C', 1, 180, 'Hostel Gate 2', 'H7 · Room 505', 'Cash', 'Pending', '2026-10-09T10:00:00.000Z');
--> statement-breakpoint
INSERT INTO "messages" ("message_id", "item_id", "sender_id", "receiver_id", "message_text", "timestamp") VALUES
  (1, 1, 2, 1, 'Hi, is the Data Structures in C still available?', '2026-10-09T09:15:00.000Z'),
  (2, 1, 1, 2, 'Yes, it is still available. Can we meet at the hostel gate?', '2026-10-09T09:16:30.000Z'),
  (3, 1, 2, 1, 'What is the edition of this book', '2026-10-09T09:18:00.000Z'),
  (4, 1, 1, 2, 'It is the 3rd edition by Reema Thareja! No missing pages, very clean.', '2026-10-09T09:19:15.000Z');
--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('"users"', 'user_id'), (SELECT MAX("user_id") FROM "users"));
--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('"items"', 'item_id'), (SELECT MAX("item_id") FROM "items"));
--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('"orders"', 'order_id'), (SELECT MAX("order_id") FROM "orders"));
--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('"messages"', 'message_id'), (SELECT MAX("message_id") FROM "messages"));
