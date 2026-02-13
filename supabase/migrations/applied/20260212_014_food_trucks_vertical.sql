-- ============================================================================
-- Migration: 20260212_014_food_trucks_vertical
-- Description: Add food_trucks vertical to verticals table
-- Tables affected: verticals
-- ============================================================================

INSERT INTO verticals (vertical_id, name_public, config, is_active)
VALUES (
    'food_trucks',
    'Food Trucks',
    '{
        "vertical_id": "food_trucks",
        "vertical_name_public": "Food Trucks",
        "nouns": {
            "vendor_singular": "Food Truck",
            "vendor_plural": "Food Trucks",
            "buyer_singular": "Customer",
            "buyer_plural": "Customers",
            "listing_singular": "Menu Item",
            "listing_plural": "Menu Items",
            "transaction_cta": "Order"
        },
        "seasonality": {
            "mode": "recurring_schedule",
            "windows": [
                {
                    "label": "Operating Hours",
                    "days_of_week": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
                    "start_time": "11:00",
                    "end_time": "20:00"
                }
            ]
        },
        "verification": {
            "required": true,
            "method": "document_manual_review",
            "badges": {
                "pending": "Approval Pending",
                "approved": "Approved Truck",
                "rejected": "Not Approved"
            }
        },
        "location": {
            "allowed_types": ["market_location"],
            "public_map_pin_required": true
        },
        "fulfillment": {
            "modes": ["pickup"]
        },
        "payment": {
            "mode": "off_app",
            "notes": "Payment handled directly between customer and food truck."
        },
        "vendor_fields": [
            { "key": "legal_name", "label": "Legal Name", "type": "text", "required": true },
            { "key": "phone", "label": "Phone Number", "type": "phone", "required": true },
            { "key": "email", "label": "Email Address", "type": "email", "required": true },
            { "key": "business_name", "label": "Truck / Business Name", "type": "text", "required": true },
            { "key": "vendor_type", "label": "Cuisine Type", "type": "multi_select", "options": ["Mexican", "BBQ", "Asian", "American", "Mediterranean", "Desserts & Sweets", "Coffee & Beverages", "Seafood", "Fusion", "Other"], "required": true },
            { "key": "food_handler_permit", "label": "Food Handlers Permit", "type": "file", "accept": ["pdf", "jpg", "png"], "required": false },
            { "key": "health_dept_license", "label": "Health Department License (if applicable)", "type": "file", "accept": ["pdf", "jpg", "png"], "required": false }
        ],
        "listing_fields": [
            { "key": "booth_name", "label": "Item Name", "type": "text", "required": true },
            { "key": "product_categories", "label": "Cuisine Category", "type": "multi_select", "options": ["Mexican", "BBQ", "Asian", "American", "Mediterranean", "Desserts & Sweets", "Coffee & Beverages", "Seafood", "Fusion", "Other"], "required": true },
            { "key": "products_overview", "label": "Description", "type": "textarea", "required": true },
            { "key": "price_level", "label": "Typical Price Level", "type": "select", "options": ["Budget", "Mid", "Premium"], "required": false },
            { "key": "pickup_notes", "label": "Preparation Notes", "type": "textarea", "required": false }
        ],
        "buyer_fields": [
            { "key": "customer_name", "label": "Your Name", "type": "text", "required": true }
        ],
        "buyer_filters": [
            { "key": "product_categories", "label": "Cuisine Type", "type": "select", "options": ["Mexican", "BBQ", "Asian", "American", "Mediterranean", "Desserts & Sweets", "Coffee & Beverages", "Seafood", "Fusion", "Other"] },
            { "key": "verified_only", "label": "Approved Trucks Only", "type": "boolean" }
        ],
        "agreements": {
            "vendor": ["platform_terms_core", "vendor_terms_core", "food_service_addendum"],
            "buyer": ["platform_terms_core", "buyer_terms_core"]
        }
    }'::jsonb,
    true
)
ON CONFLICT (vertical_id) DO UPDATE
SET config = EXCLUDED.config,
    name_public = EXCLUDED.name_public,
    updated_at = NOW();

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM verticals WHERE vertical_id = 'food_trucks' AND is_active = true;
    IF v_count != 1 THEN
        RAISE EXCEPTION 'food_trucks vertical not found or not active';
    END IF;
    RAISE NOTICE 'food_trucks vertical inserted successfully';
END $$;
