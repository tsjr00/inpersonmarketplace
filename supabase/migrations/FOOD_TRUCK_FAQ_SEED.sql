-- Food Truck FAQ Seed Data
-- Run this against Staging (and later Production) to populate the help page
-- for the food_trucks vertical.

-- Clear any existing food truck articles first
DELETE FROM knowledge_articles WHERE vertical_id = 'food_trucks';

-- Category: Getting Started
INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published) VALUES
('food_trucks', 'Getting Started', 'What is Food Truck''n?',
'Food Truck''n is a platform that connects hungry locals with food trucks in their area. You can browse menus, pre-order your favorite dishes, and skip the line at pickup. We support food truck parks, regular stops, and private service locations.',
1, true),

('food_trucks', 'Getting Started', 'How do I find food trucks near me?',
'Use the location search on the homepage or browse page. Enter your ZIP code or allow location access, and we''ll show you food trucks within your selected radius (2, 5, 10, or 25 miles). Results are sorted by distance so the closest trucks appear first.',
2, true),

('food_trucks', 'Getting Started', 'Do I need to create an account?',
'You can browse menus and locations without an account. To place an order, you''ll need to sign up with your email. It takes less than a minute and lets you track orders, save favorites, and get notifications when your food is ready.',
3, true);

-- Category: Ordering
INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published) VALUES
('food_trucks', 'Ordering', 'How do I place an order?',
'1. Find a food truck near you
2. Browse their menu and add items to your cart
3. Choose your preferred pickup time
4. Complete checkout with secure payment
5. Head to the truck at your pickup time — your food will be ready!',
1, true),

('food_trucks', 'Ordering', 'Can I order from multiple trucks at once?',
'Yes! You can add items from different food trucks to your cart. Each truck''s items will be grouped as a separate order so you can pick up from each truck independently.',
2, true),

('food_trucks', 'Ordering', 'What payment methods are accepted?',
'We accept all major credit and debit cards through our secure payment system powered by Stripe. All transactions are encrypted and your card details are never stored on our servers.',
3, true),

('food_trucks', 'Ordering', 'Can I cancel or modify my order?',
'You can cancel an order before the food truck confirms it. Once confirmed, the truck has already started preparing your food. If you need to cancel a confirmed order, contact the truck directly through the app and they can process a cancellation if the food hasn''t been prepared yet.',
4, true);

-- Category: Pickup
INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published) VALUES
('food_trucks', 'Pickup', 'How does pickup work?',
'When you place an order, you select a preferred pickup time within the truck''s operating hours. The truck prepares your food so it''s ready when you arrive. Just head to the truck, give your name or order number, and grab your food — no waiting in line!',
1, true),

('food_trucks', 'Pickup', 'What if the food truck isn''t at the expected location?',
'Food trucks update their locations and schedules on our platform. If a truck has moved or isn''t available, you''ll receive a notification. You can always check the truck''s current location and schedule on their profile page.',
2, true),

('food_trucks', 'Pickup', 'What are the different location types?',
'Food trucks can be found at:
• Food Truck Parks — designated areas where multiple trucks gather
• Service Locations — regular stops where a truck parks on a schedule
• Events — special appearances at festivals, markets, or private events

Each location shows the truck''s operating hours and schedule.',
3, true);

-- Category: For Food Truck Operators
INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published) VALUES
('food_trucks', 'For Food Truck Operators', 'How do I list my food truck?',
'Click "List Your Food Truck" and complete the signup process:
1. Create your account
2. Submit your truck details and verification documents
3. Once approved, set up your menu and locations
4. Start accepting pre-orders!

Our team reviews applications promptly to get you up and running.',
1, true),

('food_trucks', 'For Food Truck Operators', 'What are the fees?',
'We charge a small percentage on each transaction to cover payment processing and platform maintenance. There are no listing fees or monthly minimums — you only pay when you make a sale. Check our pricing page for current rates.',
2, true),

('food_trucks', 'For Food Truck Operators', 'How do I manage my menu and schedule?',
'Your Truck Dashboard gives you full control:
• Add, edit, or remove menu items with photos and descriptions
• Set your locations and operating hours
• View and manage incoming orders
• Track your sales and customer activity

Everything is designed to be managed from your phone while you''re on the go.',
3, true),

('food_trucks', 'For Food Truck Operators', 'How do I get paid?',
'Payments are processed through Stripe Connect. After connecting your bank account during setup, earnings are automatically deposited on a regular schedule. You can track all payments and payouts from your dashboard.',
4, true);

-- Category: Account & Settings
INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published) VALUES
('food_trucks', 'Account & Settings', 'How do I enable notifications?',
'Go to Settings and enable push notifications. You''ll get alerts when:
• Your order is confirmed by the truck
• Your food is ready for pickup
• A truck you follow updates their menu or location

We recommend enabling notifications so you never miss when your food is ready.',
1, true),

('food_trucks', 'Account & Settings', 'How do I update my account information?',
'Go to Settings from the menu to update your display name, email, notification preferences, and saved locations. Changes take effect immediately.',
2, true);
