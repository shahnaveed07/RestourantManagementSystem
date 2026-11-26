-- PassLine Restaurant idempotent D1 seed script
-- Demo staff passwords (PBKDF2-SHA256, 100,000 iterations):
--   admin@demo.com   / Admin@123
--   manager@demo.com / Manager@123
--   waiter@demo.com  / Waiter@123
--   kitchen@demo.com / Kitchen@123
-- Demo customer OTP accounts (DEMO_OTP = 123456 when DEMO_MODE=true):
--   customer@demo.com / +919999999991
--   guest@demo.com    / +919999999992

INSERT OR IGNORE INTO users (id, name, email, mobile, role, password_hash, is_active, is_demo, assigned_tables_json, last_login_at, created_at, updated_at) VALUES
('usr-admin-01', 'Elena Vance', 'admin@demo.com', NULL, 'admin', 'pbkdf2_sha256$100000$1a3e23263be42a40c5c7b3c676d22674$73dd6cea990712a284f2f90142684e7c2c0e227fec6014987823a1824969adbe', 1, 1, '[]', NULL, datetime('now'), datetime('now')),
('usr-manager-01', 'Marcus Chen', 'manager@demo.com', NULL, 'manager', 'pbkdf2_sha256$100000$bf4fa4fa04851729d0d6de2e04e0069b$8decd4b08cc9dc0f44fd6c98b2905c10a83b658562949d4408e2ee588d18ea57', 1, 1, '[]', NULL, datetime('now'), datetime('now')),
('usr-waiter-01', 'Sofia Morales', 'waiter@demo.com', NULL, 'waiter', 'pbkdf2_sha256$100000$6de8805d710bce7f22b07df077473634$c2a2eeb69fd92a4bacc9c2d190a7e3ccc9352ea42f0b30c575bb48d6f5dd532a', 1, 1, '[]', NULL, datetime('now'), datetime('now')),
('usr-kitchen-01', 'Devon Brooks', 'kitchen@demo.com', NULL, 'kitchen', 'pbkdf2_sha256$100000$1c9a2963a268db10c1987dd5068b4c61$843846ca788f1edc7dd4e659fd884ec47058fbf19612348ac4f90fc5f8217b70', 1, 1, '[]', NULL, datetime('now'), datetime('now')),
('usr-customer-01', 'Alex Rivera', 'customer@demo.com', '+919999999991', 'customer', NULL, 1, 1, '[]', NULL, datetime('now'), datetime('now')),
('usr-customer-02', 'Maya Patel', 'guest@demo.com', '+919999999992', 'customer', NULL, 1, 1, '[]', NULL, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO tables (id, number, name, capacity, section, status, qr_token, qr_version, assigned_waiter_id, current_session_id, is_active, last_activity_at, created_at, updated_at) VALUES
('tbl-01', 1, 'Table 1 — Window Two-Top', 2, 'Main Dining', 'occupied', 't01-linden01', 1, 'usr-waiter-01', 'sess-demo-t1', 1, datetime('now'), datetime('now'), datetime('now')),
('tbl-02', 2, 'Table 2 — Window Four-Top', 4, 'Main Dining', 'occupied', 't02-linden02', 1, 'usr-waiter-01', 'sess-demo-t2', 1, datetime('now'), datetime('now'), datetime('now')),
('tbl-03', 3, 'Table 3 — Oak Banquette', 4, 'Main Dining', 'free', 't03-linden03', 1, NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
('tbl-04', 4, 'Table 4 — Center Round', 6, 'Main Dining', 'occupied', 't04-linden04', 1, 'usr-waiter-01', 'sess-demo-t4', 1, datetime('now'), datetime('now'), datetime('now')),
('tbl-05', 5, 'Table 5 — Chef Pass Counter', 2, 'Main Dining', 'reserved', 't05-linden05', 1, NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
('tbl-06', 6, 'Table 6 — Corner Booth', 6, 'Main Dining', 'free', 't06-linden06', 1, NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
('tbl-07', 7, 'Table 7 — Olive Tree Patio', 4, 'Patio Terrace', 'free', 't07-patio07', 1, NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
('tbl-08', 8, 'Table 8 — Pergola Lounge', 4, 'Patio Terrace', 'cleaning', 't08-patio08', 1, NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
('tbl-09', 9, 'Table 9 — Garden Six-Top', 6, 'Patio Terrace', 'reserved', 't09-patio09', 1, NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
('tbl-10', 10, 'Table 10 — Slate Bar High', 2, 'Bar Lounge', 'free', 't10-lounge10', 1, NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
('tbl-11', 11, 'Table 11 — Cellar Nook', 4, 'Bar Lounge', 'free', 't11-lounge11', 1, NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now')),
('tbl-12', 12, 'Table 12 — Private Alcove', 8, 'Bar Lounge', 'free', 't12-lounge12', 1, NULL, NULL, 1, datetime('now'), datetime('now'), datetime('now'));

INSERT OR IGNORE INTO categories (id, name, description, sort_order, is_active, created_at, updated_at) VALUES
('cat-01', 'Small Plates & Starters', '', 1, 1, datetime('now'), datetime('now')),
('cat-02', 'Wood-Fired Mains & Pasta', '', 2, 1, datetime('now'), datetime('now')),
('cat-03', 'Sourdough Flatbreads & Sides', '', 3, 1, datetime('now'), datetime('now')),
('cat-04', 'Desserts & Craft Drinks', '', 4, 1, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO menu_items (id, category_id, name, description, price, image_url, is_veg, spice_level, allergens_json, prep_time_minutes, is_available, is_active, created_at, updated_at) VALUES
('dish-01', 'cat-01', 'Heirloom Tomato & Burrata', 'Creamy Pugliese burrata, charred sourdough crostini, cold-pressed basil oil, Maldon sea salt.', 16.5, '/src/assets/images/dish_burrata_starter_1795178821594.jpg', 1, 'none', '["Dairy","Gluten"]', 7, 1, 1, datetime('now'), datetime('now')),
('dish-02', 'cat-01', 'Charred Shishito Peppers', 'Blistered over white oak embers with smoked yuzu kosho aioli and toasted sesame.', 12.0, '/src/assets/images/dish_woodfired_pizza_1795178824146.jpg', 1, 'mild', '["Sesame","Egg"]', 8, 1, 1, datetime('now'), datetime('now')),
('dish-03', 'cat-01', 'Crispy Calamari Fritti', 'Semolina-dusted Pacific squid, Calabrian chili marinara, charred Meyer lemon.', 17.5, '/src/assets/images/dish_seared_salmon_1795178823192.jpg', 0, 'medium', '["Shellfish","Gluten"]', 10, 1, 1, datetime('now'), datetime('now')),
('dish-04', 'cat-01', 'Roasted Beet & Goat Cheese Carpaccio', 'Salt-baked ruby beets, whipped chèvre, candied pistachios, aged sherry reduction.', 15.0, '/src/assets/images/dish_burrata_starter_1795178821594.jpg', 1, 'none', '["Dairy","Tree Nuts"]', 8, 1, 1, datetime('now'), datetime('now')),
('dish-05', 'cat-01', 'Yellowfin Tuna Crudo', 'Line-caught ahi, blood orange segments, pickled shallots, crispy capers, Fresno chili.', 21.0, '/src/assets/images/dish_seared_salmon_1795178823192.jpg', 0, 'mild', '["Fish"]', 9, 1, 1, datetime('now'), datetime('now')),
('dish-06', 'cat-01', 'Whipped Ricotta & Wild Honey', 'House-pulled sheep milk ricotta, thyme blossom honey, cracked Tellicherry pepper, country levain.', 14.0, '/src/assets/images/dish_burrata_starter_1795178821594.jpg', 1, 'none', '["Dairy","Gluten"]', 6, 1, 1, datetime('now'), datetime('now')),
('dish-07', 'cat-01', 'Spicy Nduja Mussels', 'Prince Edward Island mussels steamed in dry vermouth, spicy Calabrian nduja, grilled focaccia.', 19.5, '/src/assets/images/dish_seared_salmon_1795178823192.jpg', 0, 'hot', '["Shellfish","Gluten"]', 12, 1, 1, datetime('now'), datetime('now')),
('dish-08', 'cat-01', 'Truffle Arancini Trio', 'Crisp Carnaroli risotto spheres stuffed with fontina fonduta and black summer truffle.', 15.5, '/src/assets/images/dish_truffle_pasta_1795178825033.jpg', 1, 'none', '["Dairy","Gluten","Egg"]', 11, 0, 1, datetime('now'), datetime('now')),
('dish-09', 'cat-02', 'Pan-Seared Atlantic Salmon', 'Crispy-skin wild fillet over charred broccolini, saffron fennel purée, caper herb butter.', 32.0, '/src/assets/images/dish_seared_salmon_1795178823192.jpg', 0, 'none', '["Fish","Dairy"]', 16, 1, 1, datetime('now'), datetime('now')),
('dish-10', 'cat-02', 'Wild Chanterelle Truffle Tagliatelle', 'Hand-rolled egg ribbons, roasted golden chanterelles, 24-month Parmigiano, shaved black truffle.', 28.5, '/src/assets/images/dish_truffle_pasta_1795178825033.jpg', 1, 'none', '["Gluten","Egg","Dairy"]', 14, 1, 1, datetime('now'), datetime('now')),
('dish-11', 'cat-02', 'Hearth-Roasted Half Chicken', 'Brined heritage poultry, rosemary jus, crispy fingerling potatoes, blistered heirloom carrots.', 29.0, '/src/assets/images/dish_seared_salmon_1795178823192.jpg', 0, 'none', '[]', 20, 1, 1, datetime('now'), datetime('now')),
('dish-12', 'cat-02', 'Spicy Vodka Rigatoni', 'Bronze-die rigatoni in slow-simmered San Marzano tomato cream, Calabrian chili oil, basil.', 24.0, '/src/assets/images/dish_truffle_pasta_1795178825033.jpg', 1, 'medium', '["Gluten","Dairy"]', 13, 1, 1, datetime('now'), datetime('now')),
('dish-13', 'cat-02', 'Prime Hanger Steak Frites', 'Oak-grilled 9oz prime hanger, black garlic compound butter, rosemary tallow fries.', 38.0, '/src/assets/images/dish_seared_salmon_1795178823192.jpg', 0, 'none', '["Dairy"]', 18, 1, 1, datetime('now'), datetime('now')),
('dish-14', 'cat-02', 'Braised Short Rib Pappardelle', '12-hour Barolo braised beef ragu, wide ribbon pasta, gremolata, pecorino snow.', 31.0, '/src/assets/images/dish_truffle_pasta_1795178825033.jpg', 0, 'none', '["Gluten","Egg","Dairy"]', 15, 1, 1, datetime('now'), datetime('now')),
('dish-15', 'cat-02', 'Miso-Glazed Black Cod', 'Sustainably caught sablefish, dashi-braised bok choy, crispy ginger rice cake.', 36.0, '/src/assets/images/dish_seared_salmon_1795178823192.jpg', 0, 'mild', '["Fish","Soy"]', 17, 0, 1, datetime('now'), datetime('now')),
('dish-16', 'cat-02', 'Charred Maitake & Polenta Bowl', 'Wood-roasted hen-of-the-woods mushroom, creamy heirloom polenta, crispy sage, pine nuts.', 25.0, '/src/assets/images/dish_truffle_pasta_1795178825033.jpg', 1, 'none', '["Dairy","Tree Nuts"]', 14, 1, 1, datetime('now'), datetime('now')),
('dish-17', 'cat-03', 'Wood-Fired Margherita Flatbread', '72-hour fermented sourdough crust, crushed San Marzano tomatoes, fior di latte, garden basil.', 19.0, '/src/assets/images/dish_woodfired_pizza_1795178824146.jpg', 1, 'none', '["Gluten","Dairy"]', 11, 1, 1, datetime('now'), datetime('now')),
('dish-18', 'cat-03', 'Hot Honey & Soppressata Flatbread', 'Crisp artisan salami, smoked provolone, pickled jalapeños, wildflower chili honey.', 22.0, '/src/assets/images/dish_woodfired_pizza_1795178824146.jpg', 0, 'hot', '["Gluten","Dairy"]', 12, 1, 1, datetime('now'), datetime('now')),
('dish-19', 'cat-03', 'Roasted Mushroom & Taleggio Flatbread', 'Garlic confit base, thyme-roasted cremini, melted Taleggio, baby arugula.', 21.0, '/src/assets/images/dish_woodfired_pizza_1795178824146.jpg', 1, 'none', '["Gluten","Dairy"]', 12, 1, 1, datetime('now'), datetime('now')),
('dish-20', 'cat-03', 'Rosemary Sea Salt Focaccia', 'Warm house-baked olive oil focaccia served with roasted garlic oil and aged balsamic.', 9.5, '/src/assets/images/dish_woodfired_pizza_1795178824146.jpg', 1, 'none', '["Gluten"]', 5, 1, 1, datetime('now'), datetime('now')),
('dish-21', 'cat-03', 'Crispy Brussels & Pancetta', 'Flash-fried sprouts, smoky cured pancetta, cider glaze, toasted hazelnuts.', 13.0, '/src/assets/images/dish_burrata_starter_1795178821594.jpg', 0, 'none', '["Tree Nuts"]', 9, 1, 1, datetime('now'), datetime('now')),
('dish-22', 'cat-03', 'Parmesan Truffle Pommes Frites', 'Twice-cooked Kennebec potatoes, white truffle oil, aged parmesan, garlic aioli.', 11.5, '/src/assets/images/dish_truffle_pasta_1795178825033.jpg', 1, 'none', '["Dairy","Egg"]', 8, 1, 1, datetime('now'), datetime('now')),
('dish-23', 'cat-03', 'Little Gem Caesar Salad', 'Crisp baby gem leaves, sourdough pangrattato, white anchovy dressing, shaved grana.', 14.5, '/src/assets/images/dish_burrata_starter_1795178821594.jpg', 0, 'none', '["Fish","Dairy","Gluten","Egg"]', 7, 1, 1, datetime('now'), datetime('now')),
('dish-24', 'cat-04', 'Espresso Mascarpone Tiramisu', 'Savoiardi soaked in single-origin espresso, whipped mascarpone zabaglione, Valrhona cocoa.', 13.5, '/src/assets/images/dish_tiramisu_dessert_1795178823665.jpg', 1, 'none', '["Dairy","Egg","Gluten"]', 5, 1, 1, datetime('now'), datetime('now')),
('dish-25', 'cat-04', 'Burnt Basque Cheesecake', 'Caramelized crust with custardy vanilla bean center and macerated blackberry compote.', 14.0, '/src/assets/images/dish_tiramisu_dessert_1795178823665.jpg', 1, 'none', '["Dairy","Egg"]', 5, 1, 1, datetime('now'), datetime('now')),
('dish-26', 'cat-04', 'Dark Chocolate Olive Oil Torte', 'Flourless 70% dark chocolate cake, flaky sea salt, crème fraîche.', 13.0, '/src/assets/images/dish_tiramisu_dessert_1795178823665.jpg', 1, 'none', '["Dairy","Egg"]', 5, 1, 1, datetime('now'), datetime('now')),
('dish-27', 'cat-04', 'Blood Orange & Rosemary Spritz', 'Fresh-pressed blood orange, botanical bitter aperitif (zero-proof), rosemary sprig, tonic.', 11.0, '/src/assets/images/dish_craft_beverage_1795178823569.jpg', 1, 'none', '[]', 4, 1, 1, datetime('now'), datetime('now')),
('dish-28', 'cat-04', 'Yuzu Ginger Highball', 'Japanese yuzu juice, house-brewed spicy ginger beer, lime leaf, clear ice spear.', 10.5, '/src/assets/images/dish_craft_beverage_1795178823569.jpg', 1, 'mild', '[]', 4, 1, 1, datetime('now'), datetime('now')),
('dish-29', 'cat-04', 'Smoked Orchard Old Fashioned', 'Small-batch rye, spiced apple reduction, aromatic bitters, expressed orange peel.', 16.0, '/src/assets/images/dish_craft_beverage_1795178823569.jpg', 1, 'none', '[]', 5, 1, 1, datetime('now'), datetime('now')),
('dish-30', 'cat-04', 'Single-Origin Cold Brew Tonic', '18-hour Ethiopian cold brew layered over artisanal Indian tonic and grapefruit twist.', 8.5, '/src/assets/images/dish_craft_beverage_1795178823569.jpg', 1, 'none', '[]', 3, 1, 1, datetime('now'), datetime('now'));

INSERT OR IGNORE INTO sequences (name, value) VALUES
('order_number', 1003),
('receipt_number', 5001);

INSERT OR IGNORE INTO orders (id, order_number, table_id, table_number, table_number_snapshot, table_name, source, order_type, session_id, customer_id, customer_name, waiter_id, waiter_name, status, notes, subtotal, tax, discount, total, status_timestamps_json, created_at, updated_at) VALUES
('ord-seed-01', 'ORD-1001', 'tbl-01', 1, 1, 'Table 1 — Window Two-Top', 'qr', 'dine_in', 'sess-demo-t1', NULL, NULL, 'usr-waiter-01', 'Sofia Morales', 'pending', '', 67.0, 5.36, 0, 72.36, '{"pending":"2026-11-26T00:00:00.000Z"}', datetime('now', '-3 minutes'), datetime('now', '-3 minutes')),
('ord-seed-02', 'ORD-1002', 'tbl-02', 2, 2, 'Table 2 — Window Four-Top', 'home', 'dine_in', 'sess-demo-t2', NULL, NULL, 'usr-waiter-01', 'Sofia Morales', 'preparing', '', 83.0, 6.64, 0, 89.64, '{"pending":"2026-11-26T00:00:00.000Z","accepted":"2026-11-26T00:01:00.000Z","preparing":"2026-11-26T00:02:00.000Z"}', datetime('now', '-11 minutes'), datetime('now', '-8 minutes')),
('ord-seed-03', 'ORD-1003', 'tbl-04', 4, 4, 'Table 4 — Center Round', 'staff', 'dine_in', 'sess-demo-t4', NULL, NULL, 'usr-waiter-01', 'Sofia Morales', 'ready', '', 65.0, 5.2, 0, 70.2, '{"pending":"2026-11-26T00:00:00.000Z","accepted":"2026-11-26T00:01:00.000Z","preparing":"2026-11-26T00:02:00.000Z","ready":"2026-11-26T00:15:00.000Z"}', datetime('now', '-16 minutes'), datetime('now', '-1 minutes'));

INSERT OR IGNORE INTO order_items (id, order_id, item_index, menu_item_id, name_snapshot, unit_price_snapshot, qty, notes, status, prep_time_minutes) VALUES
('oi-seed-01', 'ord-seed-01', 0, 'dish-01', 'Heirloom Tomato & Burrata', 16.5, 1, 'Dressing on the side', 'pending', 7),
('oi-seed-02', 'ord-seed-01', 1, 'dish-10', 'Wild Chanterelle Truffle Tagliatelle', 28.5, 1, 'Extra parmesan', 'pending', 14),
('oi-seed-03', 'ord-seed-01', 2, 'dish-27', 'Blood Orange & Rosemary Spritz', 11.0, 2, '', 'pending', 4),
('oi-seed-04', 'ord-seed-02', 0, 'dish-09', 'Pan-Seared Atlantic Salmon', 32.0, 2, 'Medium-rare', 'preparing', 16),
('oi-seed-05', 'ord-seed-02', 1, 'dish-17', 'Wood-Fired Margherita Flatbread', 19.0, 1, 'Well done crust', 'ready', 11),
('oi-seed-06', 'ord-seed-03', 0, 'dish-13', 'Prime Hanger Steak Frites', 38.0, 1, 'Medium', 'ready', 18),
('oi-seed-07', 'ord-seed-03', 1, 'dish-24', 'Espresso Mascarpone Tiramisu', 13.5, 2, 'Serve after mains', 'ready', 5);

INSERT OR IGNORE INTO service_calls (id, table_id, table_number, table_name, session_id, type, message, status, acknowledged_by, acknowledged_by_name, created_at, resolved_at, updated_at) VALUES
('call-seed-01', 'tbl-02', 2, 'Table 2 — Window Four-Top', 'sess-demo-t2', 'water', 'Sparkling water refill for the table please.', 'open', NULL, NULL, datetime('now', '-5 minutes'), NULL, datetime('now', '-5 minutes')),
('call-seed-02', 'tbl-04', 4, 'Table 4 — Center Round', 'sess-demo-t4', 'bill', 'Ready for the check when convenient.', 'open', NULL, NULL, datetime('now', '-1 minutes'), NULL, datetime('now', '-1 minutes'));
