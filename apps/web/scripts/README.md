# Scripts

Development scripts for the InPersonMarketplace web app.

## Seed Data Script

Generates test data for development database.

### Prerequisites

1. Ensure `.env.local` has these variables configured:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

2. Service role key is required (not anon key) to bypass RLS and create auth users.

### Usage

**Default (10 vendors, 30 listings, 15 orders):**
```bash
npm run seed
```

**Custom amounts:**
```bash
NUM_VENDORS=20 NUM_LISTINGS=50 NUM_ORDERS=25 npm run seed
```

**Windows PowerShell:**
```powershell
$env:NUM_VENDORS="20"; $env:NUM_LISTINGS="50"; npm run seed
```

### What it creates

- **Users**: Auth users with @test.com emails + user profiles
- **Vendors**: Vendor profiles split between fireworks/farmers_market verticals
- **Listings**: Products with various statuses (draft, published, paused)
- **Orders**: Recent orders with order items linked to listings
- **Verticals**: Ensures fireworks and farmers_market verticals exist

### Data characteristics

- **Verticals**: 50% fireworks, 50% farmers_market
- **Vendor statuses**: Mix of draft, submitted, approved
- **Listing statuses**: Mostly published, some draft/paused
- **Order dates**: Last 30 days
- **Stripe accounts**: Fake test IDs assigned to vendors

### Clearing data

The script automatically clears all test data before creating new data:
- Deletes auth users with @test.com emails
- Cascades to user_profiles, vendor_profiles, listings, orders, etc.

### Safety

- Only affects records with @test.com emails or generated test data
- Does NOT delete real user data
- Only run in Dev environment (not Staging/Production)
- Uses service role key - handle with care

### Test credentials

After running the seed script, you can log in with:
- **Email**: Any generated @test.com email (shown in console output)
- **Password**: `TestPassword123!`

### Troubleshooting

**"Missing environment variables"**
- Make sure `.env.local` exists with SUPABASE_SERVICE_ROLE_KEY

**"Permission denied" or RLS errors**
- Script requires service role key, not anon key
- Service role key bypasses RLS policies

**Foreign key violations**
- Run seed again (it clears old data first)
- Or manually clear data in Supabase dashboard

### Future enhancements

- [ ] Add markets table seeding when Phase-K-1 is merged
- [ ] Add market schedules and vendor-market associations
- [ ] Add listing images with placeholder URLs
- [ ] Add payment records with fake Stripe IDs
