-- Migration: Seed Data
-- Created: 2026-01-03
-- Purpose: Insert initial vertical configurations

-- ============================================================================
-- VERTICAL CONFIGURATIONS
-- ============================================================================

-- Fireworks Marketplace
INSERT INTO verticals (vertical_id, name_public, config, is_active)
VALUES (
    'fireworks',
    'Fireworks Marketplace',
    '{
        "vertical_id": "fireworks",
        "vertical_name_public": "Fireworks Marketplace",
        "nouns": {
            "vendor_singular": "Seller",
            "vendor_plural": "Sellers",
            "buyer_singular": "Buyer",
            "buyer_plural": "Buyers",
            "listing_singular": "Stand",
            "listing_plural": "Stands",
            "transaction_cta": "Reserve"
        },
        "seasonality": {
            "mode": "date_range",
            "windows": [
                { "label": "New Year", "start_mmdd": "12-15", "end_mmdd": "01-02" },
                { "label": "Independence Day", "start_mmdd": "06-15", "end_mmdd": "07-06" }
            ]
        },
        "verification": {
            "required": true,
            "method": "document_manual_review",
            "badges": {
                "pending": "Verification Pending",
                "approved": "Verified Seller",
                "rejected": "Not Verified"
            }
        },
        "location": {
            "allowed_types": ["stand_site", "pickup_point"],
            "public_map_pin_required": true
        },
        "fulfillment": {
            "modes": ["pickup"]
        },
        "payment": {
            "mode": "off_app",
            "notes": "Payment handled directly between buyer and seller."
        },
        "vendor_fields": [
            { "key": "legal_name", "label": "Legal Name", "type": "text", "required": true },
            { "key": "phone", "label": "Phone Number", "type": "phone", "required": true },
            { "key": "email", "label": "Email Address", "type": "email", "required": true },
            { "key": "business_name", "label": "Business Name", "type": "text", "required": true },
            { "key": "business_type", "label": "Business Type", "type": "select", "options": ["Sole Proprietor", "LLC", "Corporation", "Other"], "required": true },
            { "key": "county", "label": "Primary County (TX)", "type": "text", "required": true },
            { "key": "permit_number", "label": "Fireworks Seller Permit #", "type": "text", "required": false },
            { "key": "permit_years", "label": "Permit Year(s)", "type": "multi_select", "options": ["2023", "2024", "2025"], "required": false },
            { "key": "permit_upload", "label": "Upload Permit or Approval Document", "type": "file", "accept": ["pdf", "jpg", "png"], "required": false }
        ],
        "listing_fields": [
            { "key": "stand_name", "label": "Stand Name", "type": "text", "required": true },
            { "key": "address", "label": "Stand Address", "type": "address", "required": true },
            { "key": "city", "label": "City", "type": "text", "required": true },
            { "key": "state", "label": "State", "type": "text", "default": "TX", "required": true },
            { "key": "zip", "label": "ZIP Code", "type": "text", "required": true },
            { "key": "sales_dates", "label": "Sales Dates", "type": "date_range", "required": true },
            { "key": "sales_hours", "label": "Daily Hours", "type": "text", "required": false },
            { "key": "products_overview", "label": "Products Overview", "type": "textarea", "required": false },
            { "key": "price_level", "label": "Typical Price Level", "type": "select", "options": ["Budget", "Mid", "Premium"], "required": false },
            { "key": "pickup_notes", "label": "Pickup Instructions", "type": "textarea", "required": false }
        ],
        "buyer_fields": [
            { "key": "buyer_name", "label": "Your Name", "type": "text", "required": true },
            { "key": "buyer_phone", "label": "Phone Number", "type": "phone", "required": true }
        ],
        "buyer_filters": [
            { "key": "city", "label": "City", "type": "text" },
            { "key": "date", "label": "Date", "type": "date" },
            { "key": "price_level", "label": "Price Level", "type": "select", "options": ["Budget", "Mid", "Premium"] },
            { "key": "verified_only", "label": "Verified Sellers Only", "type": "boolean" }
        ],
        "agreements": {
            "vendor": ["platform_terms_core", "vendor_terms_core", "regulated_goods_fireworks"],
            "buyer": ["platform_terms_core", "buyer_terms_core"]
        }
    }'::jsonb,
    true
)
ON CONFLICT (vertical_id) DO UPDATE
SET config = EXCLUDED.config,
    name_public = EXCLUDED.name_public,
    updated_at = NOW();

-- Farmers Market
INSERT INTO verticals (vertical_id, name_public, config, is_active)
VALUES (
    'farmers_market',
    'Farmers Market',
    '{
        "vertical_id": "farmers_market",
        "vertical_name_public": "Farmers Market",
        "nouns": {
            "vendor_singular": "Vendor",
            "vendor_plural": "Vendors",
            "buyer_singular": "Customer",
            "buyer_plural": "Customers",
            "listing_singular": "Vendor Booth",
            "listing_plural": "Vendor Booths",
            "transaction_cta": "Reserve"
        },
        "seasonality": {
            "mode": "recurring_schedule",
            "windows": [
                {
                    "label": "Market Days",
                    "days_of_week": ["Saturday"],
                    "start_time": "08:00",
                    "end_time": "13:00"
                }
            ]
        },
        "verification": {
            "required": true,
            "method": "document_manual_review",
            "badges": {
                "pending": "Approval Pending",
                "approved": "Approved Vendor",
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
            "notes": "Payment handled directly between customer and vendor."
        },
        "vendor_fields": [
            { "key": "legal_name", "label": "Legal Name", "type": "text", "required": true },
            { "key": "phone", "label": "Phone Number", "type": "phone", "required": true },
            { "key": "email", "label": "Email Address", "type": "email", "required": true },
            { "key": "business_name", "label": "Farm / Business Name", "type": "text", "required": true },
            { "key": "vendor_type", "label": "Vendor Type", "type": "select", "options": ["Produce", "Meat", "Dairy", "Baked Goods", "Prepared Foods", "Other"], "required": true },
            { "key": "cottage_food_cert", "label": "Cottage Food Permit or Exemption", "type": "file", "accept": ["pdf", "jpg", "png"], "required": false },
            { "key": "organic_cert", "label": "Organic Certification (if applicable)", "type": "file", "accept": ["pdf", "jpg", "png"], "required": false }
        ],
        "listing_fields": [
            { "key": "booth_name", "label": "Booth Name", "type": "text", "required": true },
            { "key": "product_categories", "label": "Product Categories", "type": "multi_select", "options": ["Produce", "Meat", "Dairy", "Baked Goods", "Prepared Foods", "Other"], "required": true },
            { "key": "products_overview", "label": "Products Offered", "type": "textarea", "required": true },
            { "key": "price_level", "label": "Typical Price Level", "type": "select", "options": ["Budget", "Mid", "Premium"], "required": false },
            { "key": "pickup_notes", "label": "Pickup Instructions", "type": "textarea", "required": false }
        ],
        "buyer_fields": [
            { "key": "customer_name", "label": "Your Name", "type": "text", "required": true }
        ],
        "buyer_filters": [
            { "key": "product_categories", "label": "Product Category", "type": "select", "options": ["Produce", "Meat", "Dairy", "Baked Goods", "Prepared Foods"] },
            { "key": "verified_only", "label": "Approved Vendors Only", "type": "boolean" }
        ],
        "agreements": {
            "vendor": ["platform_terms_core", "vendor_terms_core", "food_produce_addendum"],
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
-- VERIFICATION: Check seed data inserted correctly
-- ============================================================================

DO $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count FROM verticals WHERE is_active = true;
    IF v_count < 2 THEN
        RAISE EXCEPTION 'Expected at least 2 active verticals, found %', v_count;
    END IF;
    RAISE NOTICE 'Seed data verified: % active verticals', v_count;
END $$;
