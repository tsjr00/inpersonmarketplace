# Database Migrations

**Naming Convention:** `YYYYMMDD_phase_x_description.sql`

**Examples:**
- `20260113_phase_k1_markets_tables.sql`
- `20260113_phase_k1_add_market_to_listings.sql`

**Process:**
1. CC creates migration file here
2. CC documents in `/docs/MIGRATION_LOG.md`
3. Tracy applies to Dev first
4. After testing, Tracy applies to Staging
5. Tracy confirms migrations run in Dev & Staging 
5. CC updates MIGRATION_LOG with deployment dates

**Storage:** All migrations stored in this folder, documented in MIGRATION_LOG
