# SQL Fixes - Phase N Config Issues

**Date:** January 15, 2026
**Purpose:** Fix database configuration issues causing "bugs"

---

## Fix 1: Add vendor_fields to farmers_market Config

**Problem:** vendor_fields is NULL, causing "no form fields configured" error

**Solution:**
```sql
-- Add vendor_fields configuration to farmers_market vertical
UPDATE verticals
SET config = jsonb_set(
  COALESCE(config, '{}'::jsonb),
  '{vendor_fields}',
  '[
    {
      "name": "business_name",
      "label": "Business/Farm Name",
      "type": "text",
      "required": true,
      "placeholder": "Enter your business or farm name"
    },
    {
      "name": "business_description",
      "label": "About Your Business",
      "type": "textarea",
      "required": true,
      "placeholder": "Tell us about your farm or business"
    },
    {
      "name": "contact_name",
      "label": "Contact Name",
      "type": "text",
      "required": true,
      "placeholder": "Primary contact person"
    },
    {
      "name": "phone",
      "label": "Phone Number",
      "type": "tel",
      "required": true,
      "placeholder": "(555) 123-4567"
    },
    {
      "name": "business_address",
      "label": "Business Address",
      "type": "text",
      "required": true,
      "placeholder": "Street address"
    },
    {
      "name": "city",
      "label": "City",
      "type": "text",
      "required": true
    },
    {
      "name": "state",
      "label": "State",
      "type": "text",
      "required": true,
      "placeholder": "TX"
    },
    {
      "name": "zip",
      "label": "Zip Code",
      "type": "text",
      "required": true,
      "placeholder": "12345"
    },
    {
      "name": "tier",
      "label": "Vendor Tier",
      "type": "select",
      "required": true,
      "options": [
        {"value": "standard", "label": "Standard ($0/month - 5 listings max)"},
        {"value": "premium", "label": "Premium ($29/month - 10 listings max)"}
      ]
    },
    {
      "name": "terms_accepted",
      "label": "I agree to the Terms of Service",
      "type": "checkbox",
      "required": true
    }
  ]'::jsonb
)
WHERE vertical_id = 'farmers_market';
```

**Verify:**
```sql
-- Check that it worked
SELECT config->'vendor_fields' FROM verticals WHERE vertical_id = 'farmers_market';
```

---

## Fix 2: Add listing_fields to farmers_market Config (If Missing)

**Check first:**
```sql
SELECT config->'listing_fields' FROM verticals WHERE vertical_id = 'farmers_market';
```

**If NULL, add:**
```sql
UPDATE verticals
SET config = jsonb_set(
  COALESCE(config, '{}'::jsonb),
  '{listing_fields}',
  '[
    {
      "name": "title",
      "label": "Product Name",
      "type": "text",
      "required": true
    },
    {
      "name": "description",
      "label": "Description",
      "type": "textarea",
      "required": true
    },
    {
      "name": "price_cents",
      "label": "Price",
      "type": "number",
      "required": true
    },
    {
      "name": "quantity",
      "label": "Quantity Available",
      "type": "number",
      "required": true
    },
    {
      "name": "category",
      "label": "Category",
      "type": "select",
      "required": true,
      "options": [
        {"value": "Produce", "label": "Produce"},
        {"value": "Meat & Poultry", "label": "Meat & Poultry"},
        {"value": "Dairy & Eggs", "label": "Dairy & Eggs"},
        {"value": "Baked Goods", "label": "Baked Goods"},
        {"value": "Pantry", "label": "Pantry"},
        {"value": "Prepared Foods", "label": "Prepared Foods"},
        {"value": "Health & Wellness", "label": "Health & Wellness"},
        {"value": "Art & Decor", "label": "Art & Decor"},
        {"value": "Home & Functional", "label": "Home & Functional"}
      ]
    }
  ]'::jsonb
)
WHERE vertical_id = 'farmers_market';
```

---

## Orders Data Issue - NOT A BUG

**Findings:**
- 22 orders exist in database
- They belong to different buyer_user_ids
- Tracy tested with user who has NO orders
- This is test data mismatch, not a bug

**No fix needed - orders page works correctly**

---

## Verification Checklist

After running SQL:
- [ ] Vendor signup form displays fields
- [ ] Can complete vendor signup
- [ ] Listing form has 9 categories

---

*These are the only SQL fixes needed*
