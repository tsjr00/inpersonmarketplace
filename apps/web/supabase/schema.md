# Database Schema Documentation

## Overview

This document describes the database schema for the InPersonMarketplace application. The schema is designed to be vertical-agnostic, supporting multiple marketplace types (fireworks, farmers market, etc.) through configuration rather than schema changes.

## Entity Relationship Diagram (Text)

```
auth.users (Supabase managed)
    │
    ▼
user_profiles ────────────────────────────────────────┐
    │                                                  │
    ├──► organizations                                 │
    │        │                                         │
    │        ▼                                         │
    └──► vendor_profiles ◄─────────────────────────────┤
             │                                         │
             ├──► vendor_verifications                 │
             │                                         │
             ├──► listings                             │
             │        │                                │
             │        ├──► listing_images              │
             │        │                                │
             │        └──► transactions ◄──────────────┘
             │                   │
             │                   ▼
             │              fulfillments
             │
             └──► verticals (config reference)

Supporting tables:
- audit_log (tracks changes)
- notifications (user alerts)
```

## Tables

### user_profiles
Extends Supabase `auth.users` with application-specific profile data.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | NO | Primary key |
| user_id | UUID | NO | References auth.users(id) |
| email | TEXT | YES | User's email (cached from auth) |
| phone | TEXT | YES | Phone number |
| display_name | TEXT | YES | Display name |
| roles | user_role[] | NO | Array: buyer, vendor, admin, verifier |
| avatar_url | TEXT | YES | Profile picture URL |
| created_at | TIMESTAMPTZ | NO | Record creation time |
| updated_at | TIMESTAMPTZ | NO | Last update time |
| deleted_at | TIMESTAMPTZ | YES | Soft delete timestamp |

**Indexes:** user_id (unique), email

---

### organizations
Business entities that can own vendor profiles.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | NO | Primary key |
| legal_name | TEXT | NO | Legal business name |
| dba_name | TEXT | YES | Doing Business As name |
| owner_user_id | UUID | NO | References user_profiles(id) |
| tax_id | TEXT | YES | Tax identification number |
| created_at | TIMESTAMPTZ | NO | Record creation time |
| updated_at | TIMESTAMPTZ | NO | Last update time |
| deleted_at | TIMESTAMPTZ | YES | Soft delete timestamp |

**Indexes:** owner_user_id

---

### verticals
Marketplace configuration storage (synced from JSON files).

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | NO | Primary key |
| vertical_id | TEXT | NO | Unique identifier (e.g., "fireworks") |
| name_public | TEXT | NO | Public display name |
| config | JSONB | NO | Full configuration from JSON |
| is_active | BOOLEAN | NO | Whether vertical is active |
| created_at | TIMESTAMPTZ | NO | Record creation time |
| updated_at | TIMESTAMPTZ | NO | Last update time |

**Indexes:** vertical_id (unique), is_active

---

### vendor_profiles
Vendor accounts with vertical-specific data.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | NO | Primary key |
| user_id | UUID | YES | References user_profiles(id) |
| organization_id | UUID | YES | References organizations(id) |
| vertical_id | TEXT | NO | References verticals(vertical_id) |
| status | vendor_status | NO | draft, submitted, approved, rejected, suspended |
| profile_data | JSONB | NO | Data from vendor_fields config |
| created_at | TIMESTAMPTZ | NO | Record creation time |
| updated_at | TIMESTAMPTZ | NO | Last update time |
| deleted_at | TIMESTAMPTZ | YES | Soft delete timestamp |

**Constraint:** Either user_id OR organization_id must be set
**Indexes:** user_id, organization_id, vertical_id, status, profile_data (GIN)

---

### vendor_verifications
Verification status and documents for vendors.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | NO | Primary key |
| vendor_profile_id | UUID | NO | References vendor_profiles(id) |
| status | verification_status | NO | pending, in_review, approved, rejected |
| submitted_at | TIMESTAMPTZ | YES | When verification was submitted |
| reviewed_at | TIMESTAMPTZ | YES | When verification was reviewed |
| reviewed_by | UUID | YES | Reviewer user_profiles(id) |
| notes | TEXT | YES | Review notes |
| documents | JSONB | NO | Array of document metadata |
| created_at | TIMESTAMPTZ | NO | Record creation time |
| updated_at | TIMESTAMPTZ | NO | Last update time |

**Indexes:** vendor_profile_id, status

---

### listings
Products, services, stands, or booths for sale.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | NO | Primary key |
| vendor_profile_id | UUID | NO | References vendor_profiles(id) |
| vertical_id | TEXT | NO | References verticals(vertical_id) |
| status | listing_status | NO | draft, published, paused, archived |
| listing_data | JSONB | NO | Data from listing_fields config |
| address | TEXT | YES | Physical address |
| city | TEXT | YES | City (extracted for filtering) |
| state | TEXT | YES | State |
| zip | TEXT | YES | ZIP code |
| latitude | DECIMAL(10,8) | YES | GPS latitude |
| longitude | DECIMAL(11,8) | YES | GPS longitude |
| available_from | DATE | YES | Start of availability |
| available_to | DATE | YES | End of availability |
| created_at | TIMESTAMPTZ | NO | Record creation time |
| updated_at | TIMESTAMPTZ | NO | Last update time |
| deleted_at | TIMESTAMPTZ | YES | Soft delete timestamp |

**Indexes:** vendor_profile_id, vertical_id, status, city, (lat/long), availability range, listing_data (GIN)

---

### listing_images
Images associated with listings.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | NO | Primary key |
| listing_id | UUID | NO | References listings(id) |
| storage_path | TEXT | NO | Path in storage bucket |
| url | TEXT | YES | Public URL |
| alt_text | TEXT | YES | Alt text for accessibility |
| display_order | INTEGER | NO | Order for display |
| is_primary | BOOLEAN | NO | Primary image flag |
| created_at | TIMESTAMPTZ | NO | Record creation time |

**Indexes:** listing_id

---

### transactions
Buyer-vendor interactions (reservations, orders).

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | NO | Primary key |
| listing_id | UUID | NO | References listings(id) |
| vendor_profile_id | UUID | NO | References vendor_profiles(id) |
| buyer_user_id | UUID | NO | References user_profiles(id) |
| vertical_id | TEXT | NO | References verticals(vertical_id) |
| status | transaction_status | NO | initiated, accepted, declined, canceled, fulfilled, expired |
| buyer_data | JSONB | NO | Data from buyer_fields config |
| notes | TEXT | YES | Transaction notes |
| created_at | TIMESTAMPTZ | NO | Record creation time |
| updated_at | TIMESTAMPTZ | NO | Last update time |

**Indexes:** listing_id, vendor_profile_id, buyer_user_id, status

---

### fulfillments
Delivery/pickup details for transactions.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | NO | Primary key |
| transaction_id | UUID | NO | References transactions(id) (unique) |
| mode | fulfillment_mode | NO | pickup, delivery, meetup |
| status | fulfillment_status | NO | pending, confirmed, completed, failed |
| scheduled_at | TIMESTAMPTZ | YES | Scheduled time |
| confirmed_at | TIMESTAMPTZ | YES | Confirmation time |
| completed_at | TIMESTAMPTZ | YES | Completion time |
| location_notes | TEXT | YES | Location/pickup notes |
| created_at | TIMESTAMPTZ | NO | Record creation time |
| updated_at | TIMESTAMPTZ | NO | Last update time |

**Indexes:** transaction_id (unique), status

---

### audit_log
Track important changes for compliance and debugging.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | NO | Primary key |
| user_id | UUID | YES | User who made change |
| action | TEXT | NO | Action type |
| table_name | TEXT | NO | Affected table |
| record_id | UUID | YES | Affected record ID |
| old_data | JSONB | YES | Previous values |
| new_data | JSONB | YES | New values |
| ip_address | INET | YES | Client IP |
| user_agent | TEXT | YES | Client user agent |
| created_at | TIMESTAMPTZ | NO | When change occurred |

**Indexes:** user_id, table_name, created_at

---

### notifications
User notification system.

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| id | UUID | NO | Primary key |
| user_id | UUID | NO | References user_profiles(id) |
| type | TEXT | NO | Notification type |
| title | TEXT | NO | Notification title |
| message | TEXT | YES | Notification body |
| data | JSONB | NO | Additional structured data |
| read_at | TIMESTAMPTZ | YES | When notification was read |
| created_at | TIMESTAMPTZ | NO | When notification was created |

**Indexes:** user_id, unread (partial index)

---

## Enum Types

### user_role
```sql
'buyer' | 'vendor' | 'admin' | 'verifier'
```

### vendor_status
```sql
'draft' | 'submitted' | 'approved' | 'rejected' | 'suspended'
```

### verification_status
```sql
'pending' | 'in_review' | 'approved' | 'rejected'
```

### listing_status
```sql
'draft' | 'published' | 'paused' | 'archived'
```

### transaction_status
```sql
'initiated' | 'accepted' | 'declined' | 'canceled' | 'fulfilled' | 'expired'
```

### fulfillment_mode
```sql
'pickup' | 'delivery' | 'meetup'
```

### fulfillment_status
```sql
'pending' | 'confirmed' | 'completed' | 'failed'
```

---

## Row Level Security (RLS) Policies

### Overview
All tables have RLS enabled. Default policy is deny-all; explicit policies grant access.

### Key Policies

| Table | Policy | Access |
|-------|--------|--------|
| user_profiles | Own profile | Users can view/update their own profile |
| user_profiles | Admin view | Admins can view all profiles |
| verticals | Public read | Everyone can read active verticals |
| vendor_profiles | Own profiles | Vendors see their own profiles |
| vendor_profiles | Public approved | Public can see approved vendors |
| listings | Own listings | Vendors manage their own listings |
| listings | Public published | Public can see published listings |
| transactions | Buyer/vendor access | Participants can see their transactions |
| notifications | Own only | Users see only their notifications |

### Helper Functions
- `has_role(role)` - Check if user has specific role
- `is_admin()` - Check if user is admin
- `is_verifier()` - Check if user is verifier or admin
- `get_user_vendor_ids()` - Get vendor profile IDs owned by user
- `user_owns_vendor(vendor_id)` - Check if user owns vendor profile

---

## Triggers

### Auto-Updated Timestamps
All tables with `updated_at` column have trigger to auto-update on row change.

### User Profile Creation
Trigger on `auth.users` INSERT automatically creates `user_profiles` record.

### Vendor Status Tracking
Changes to `vendor_profiles.status` are logged to `audit_log`.

### Transaction Notifications
Status changes on `transactions` create `notifications` for buyer and vendor.

### Verification Status Sync
When `vendor_verifications.status` changes to approved/rejected, updates corresponding `vendor_profiles.status`.

---

## Migration History

| Migration | File | Description |
|-----------|------|-------------|
| 001 | 20260103_001_initial_schema.sql | Core tables, indexes, constraints |
| 002 | 20260103_002_rls_policies.sql | RLS policies and helper functions |
| 003 | 20260103_003_functions_triggers.sql | Triggers and utility functions |
| 004 | 20260103_004_seed_data.sql | Initial vertical configurations |

---

## JSONB Column Usage

### profile_data (vendor_profiles)
Stores vendor form submissions from `vendor_fields` in vertical config.
```json
{
  "legal_name": "John Doe",
  "phone": "555-1234",
  "email": "john@example.com",
  "business_name": "Doe's Fireworks",
  "business_type": "LLC",
  "county": "Travis",
  "permit_number": "TX-12345"
}
```

### listing_data (listings)
Stores listing form submissions from `listing_fields` in vertical config.
```json
{
  "stand_name": "Main Street Fireworks",
  "address": "123 Main St",
  "city": "Austin",
  "state": "TX",
  "zip": "78701",
  "sales_dates": { "start": "2026-06-15", "end": "2026-07-06" },
  "products_overview": "Full range of consumer fireworks",
  "price_level": "Mid"
}
```

### buyer_data (transactions)
Stores buyer form submissions from `buyer_fields` in vertical config.
```json
{
  "buyer_name": "Jane Smith",
  "buyer_phone": "555-5678"
}
```

### config (verticals)
Full vertical configuration from `config/verticals/*.json` files.

---

*Last Updated: 2026-01-03*
