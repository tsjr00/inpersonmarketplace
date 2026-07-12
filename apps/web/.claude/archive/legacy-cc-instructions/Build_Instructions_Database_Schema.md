# Build Instructions - Database Schema & Migrations

**Session Date:** January 3, 2026  
**Created by:** Chet (Claude Chat)  
**Folder:** .claude\Build_Instructions\  
**Previous Session:** Session_Summary_2026-01-03_Deployment_Complete.md

---

## Objective
Design complete database schema based on the core data model, create Supabase migration files, and apply migrations to both Dev and Staging environments.

## Context & Decisions Made
- **Auth approach:** Supabase Auth (built-in)
- **Storage:** Remove NDJSON, use Supabase database
- **Data folder:** Keep for uploads/exports/backups (not for submissions)
- **Current state:** Deployment complete, both environments ready

---

## Prerequisites

### Review Architecture Documents
Before starting schema design, thoroughly review:
1. `docs/architecture/core-data-model.md` - Entity definitions
2. `config/verticals/fireworks.json` - Example vertical config
3. `config/verticals/farmers_market.json` - Example vertical config
4. Current code to understand data flow

### Required Access
- Supabase Dev dashboard access
- Supabase Staging dashboard access
- Local development environment

---

## Tasks

### 1. Design Database Schema

#### Core Tables to Create

Based on `core-data-model.md`, design tables for:

**Users & Auth:**
- `users` - extends Supabase auth.users
- `user_profiles` - additional user data

**Verticals:**
- `verticals` - marketplace configurations
- `vertical_metadata` - additional vertical data

**Vendors:**
- `vendors` - vendor accounts
- `vendor_verifications` - verification status and documents
- `vendor_locations` - physical locations/stands

**Listings:**
- `listings` - products/services for sale
- `listing_images` - product images
- `listing_availability` - seasonal/time windows

**Buyers:**
- `buyers` - buyer accounts
- `buyer_preferences` - saved filters/preferences

**Transactions:**
- `reservations` - buyer reserves items
- `orders` - confirmed orders
- `payments` - payment records

**System:**
- `audit_log` - track important changes
- `notifications` - user notifications

#### Schema Design Requirements

**For Each Table:**
1. **Primary Key:** UUID (Supabase default)
2. **Timestamps:** `created_at`, `updated_at` (auto-managed)
3. **Soft Deletes:** `deleted_at` where appropriate
4. **Foreign Keys:** Proper relationships with CASCADE/RESTRICT
5. **Indexes:** On frequently queried columns
6. **Constraints:** NOT NULL, CHECK, UNIQUE where needed
7. **RLS Policies:** Row Level Security for multi-tenant data

**Supabase Auth Integration:**
- Link to `auth.users` via `user_id` foreign keys
- Use Supabase's built-in `auth.uid()` for RLS policies
- Store only additional profile data, not auth credentials

**Config-Driven Considerations:**
- `verticals` table stores JSON from config files
- Consider JSON/JSONB columns for flexible field definitions
- Index JSONB fields that need to be queried

### 2. Create Migration Files

#### Migration Strategy
- Use Supabase SQL migrations (not ORM migrations)
- One migration file per logical grouping
- Migrations must be idempotent (safe to run multiple times)
- Include both UP and DOWN migrations if needed

#### Create Migration Files

In `apps/web/supabase/migrations/`:

**Migration 001 - Core Schema:**
```
20260103_001_initial_schema.sql
```
Contents:
- Enable required extensions (uuid-ossp, pgcrypto)
- Create core tables
- Add foreign keys
- Create indexes
- Basic constraints

**Migration 002 - RLS Policies:**
```
20260103_002_rls_policies.sql
```
Contents:
- Enable RLS on all tables
- Create policies for vendors (see own data only)
- Create policies for buyers (see own data only)
- Create policies for public data (listings, verticals)
- Admin override policies

**Migration 003 - Functions & Triggers:**
```
20260103_003_functions_triggers.sql
```
Contents:
- Auto-update `updated_at` timestamp function
- Trigger to update `updated_at` on all tables
- Soft delete helper function
- Any custom validation functions

**Migration 004 - Seed Data:**
```
20260103_004_seed_data.sql
```
Contents:
- Insert verticals from JSON configs (fireworks, farmers_market)
- Create test user accounts (optional for dev)
- Sample data for testing (optional)

#### Migration File Format
Each migration should:
```sql
-- Migration: [Description]
-- Created: [Date]
-- Purpose: [What this migration does]

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create tables
CREATE TABLE IF NOT EXISTS [table_name] (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- other columns
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_[table]_[column] ON [table]([column]);

-- Add foreign keys
ALTER TABLE [child_table]
ADD CONSTRAINT fk_[child]_[parent]
FOREIGN KEY (parent_id) REFERENCES [parent_table](id)
ON DELETE CASCADE;

-- Comments for documentation
COMMENT ON TABLE [table_name] IS '[Description]';
COMMENT ON COLUMN [table].[column] IS '[Description]';
```

### 3. Create Schema Documentation

Create: `apps/web/supabase/schema.md`

Document:
- All tables with column descriptions
- Relationships (ERD in text/markdown)
- RLS policies and their purpose
- Index strategy and rationale
- Key constraints and validations
- Migration history

### 4. Apply Migrations to Dev Environment

#### Using Supabase CLI (Recommended)
```bash
# Install Supabase CLI if not installed
npm install -g supabase

# Login to Supabase
supabase login

# Link to Dev project
supabase link --project-ref vawpviatqalicckkqchs

# Apply migrations
supabase db push

# Verify migrations applied
supabase db diff
```

#### Using Supabase Dashboard (Alternative)
1. Log into Supabase Dev dashboard
2. Go to SQL Editor
3. Copy/paste each migration file content
4. Run in order (001, 002, 003, 004)
5. Verify no errors

### 5. Verify Dev Database

#### Check Tables Created
In Supabase Dev → Database → Tables:
- [ ] All tables exist
- [ ] Columns match schema design
- [ ] Foreign keys established
- [ ] Indexes created

#### Test RLS Policies
Create test queries:
- [ ] Can insert test vendor
- [ ] Vendor can only see their own data
- [ ] Public can read listings
- [ ] Proper access control working

#### Test Triggers
- [ ] `updated_at` auto-updates on row change
- [ ] Other triggers functioning

### 6. Apply Migrations to Staging Environment

#### Link to Staging Project
```bash
# Link to Staging project
supabase link --project-ref vfknvsxfgcwqmlkuzhnq

# Apply same migrations
supabase db push
```

#### Verify Staging
Same verification steps as Dev

### 7. Update Application Code

#### Create Supabase Client Utilities
Create: `apps/web/src/lib/supabase/`

**client.ts** - Client-side Supabase client:
```typescript
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export function createClient() {
  return createClientComponentClient()
}
```

**server.ts** - Server-side Supabase client:
```typescript
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export function createServerClient() {
  const cookieStore = cookies()
  return createServerComponentClient({ cookies: () => cookieStore })
}
```

**types.ts** - TypeScript types for database:
```typescript
// Generate types from Supabase schema
// Run: supabase gen types typescript --project-id [project-ref] > src/lib/supabase/types.ts
```

#### Install Supabase Dependencies
```bash
npm install @supabase/supabase-js @supabase/auth-helpers-nextjs
```

### 8. Create Database Utilities

Create: `apps/web/src/lib/db/`

**vendors.ts** - Vendor CRUD operations:
```typescript
import { createClient } from '@/lib/supabase/client'

export async function createVendor(data: VendorData) {
  const supabase = createClient()
  return await supabase.from('vendors').insert(data).select().single()
}

// Other vendor operations...
```

**listings.ts** - Listing CRUD operations  
**verticals.ts** - Vertical queries  
**etc.**

### 9. Remove NDJSON Storage

**Delete/Update:**
- [ ] Remove `data/submissions.ndjson` file
- [ ] Keep `data/` folder structure for future uploads
- [ ] Update `data/.gitkeep` with comment about folder purpose
- [ ] Remove NDJSON write logic from `src/app/api/submit/route.ts`

**Update .gitignore:**
```
# Data directory - for uploads/exports only
data/*
!data/.gitkeep
!data/README.md
```

**Create data/README.md:**
```markdown
# Data Directory

This directory is for:
- Uploaded documents (vendor verification files)
- Exported reports
- Database backups
- Temporary file processing

NOT for application data storage (use Supabase database).
```

---

## Session Summary Requirements

When all tasks are complete, create your Session Summary:

1. **Copy template from:** `.claude\Build_Instructions\Session_Summary_Template.md`
2. **Fill in all relevant sections**
3. **Save as:** `.claude\Session_Summaries\Session_Summary_2026-01-03_Database_Schema.md`

### Key Sections to Complete

**Tasks Completed:**
- [ ] Architecture docs reviewed
- [ ] Database schema designed
- [ ] Migration files created (list each)
- [ ] Migrations applied to Dev
- [ ] Migrations applied to Staging
- [ ] Schema documentation created
- [ ] Supabase client utilities created
- [ ] Database utility functions created
- [ ] Dependencies installed
- [ ] NDJSON storage removed

**Changes Made:**
- List all migration files created
- List all new source files
- Note NDJSON removal

**Important Information:**
- Number of tables created
- Key relationships established
- RLS policies implemented
- Any design decisions made

**Testing & Verification:**
- Dev database verification results
- Staging database verification results
- Sample queries tested

**Decisions & Assumptions:**
- Any schema design choices made
- Any deviations from core-data-model.md (with rationale)
- JSONB vs relational tradeoffs

**Questions for Chet:**
- Any schema design questions
- Any uncertainty about relationships
- Recommendations for indexes or optimizations

**Next Steps:**
- Authentication implementation
- Update API routes to use Supabase
- Form validation
- Connect vendor signup to database

---

## Important Notes

### Schema Design Best Practices
- Normalize where appropriate (avoid duplication)
- Use JSONB for truly flexible/dynamic data
- Index foreign keys and frequently queried columns
- Use CHECK constraints for data validation
- Comment tables and columns for clarity

### RLS Security
- Enable RLS on ALL tables
- Default deny, explicit allow
- Use `auth.uid()` for user-based policies
- Test policies thoroughly
- Document each policy's purpose

### Migration Safety
- Test migrations on Dev first
- Backup before applying to Staging
- Keep migrations small and focused
- Never edit applied migrations (create new ones)
- Include rollback strategy for critical changes

### Supabase Specific
- UUID primary keys by default
- `created_at`/`updated_at` are standard
- Use triggers for auto-updates
- RLS is PostgreSQL row-level security
- Can use Supabase SQL Editor for manual queries

---

## Troubleshooting

### If Migration Fails
1. Check SQL syntax in migration file
2. Verify foreign key references exist
3. Check for naming conflicts
4. Review error message in Supabase logs
5. Rollback if needed and fix migration

### If RLS Blocks Valid Access
1. Check policy conditions
2. Verify `auth.uid()` is available
3. Test with actual authenticated user
4. Review policy with `SELECT` vs `INSERT` permissions
5. Check policy applies to correct role

### If Types Don't Generate
1. Ensure migrations applied successfully
2. Use correct project-ref in command
3. Check Supabase CLI is authenticated
4. Try regenerating manually

---

## Reference

### Supabase CLI Commands
```bash
# Link project
supabase link --project-ref [project-id]

# Push migrations
supabase db push

# Check migration status
supabase migration list

# Generate types
supabase gen types typescript --project-id [id] > types.ts

# Reset database (DEV ONLY - DESTRUCTIVE)
supabase db reset
```

### Key Supabase Concepts
- **RLS:** Row Level Security - PostgreSQL feature for multi-tenant security
- **Policies:** Rules that determine who can access what data
- **auth.users:** Supabase managed auth table (don't modify directly)
- **JSONB:** PostgreSQL JSON with indexing support
- **Extensions:** PostgreSQL extensions (uuid-ossp, pgcrypto, etc.)

---

**Estimated Time:** 2-3 hours  
**Complexity:** High (database design is critical)  
**Dependencies:** Supabase Dev & Staging projects must be accessible
