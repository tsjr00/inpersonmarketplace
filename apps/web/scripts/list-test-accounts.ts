/**
 * List Test Accounts Script
 * Queries database for all @test.com accounts and outputs them
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local' });

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  // Get all test user profiles
  const { data: profiles, error: profilesError } = await supabase
    .from('user_profiles')
    .select('id, user_id, email, display_name, roles')
    .like('email', '%@test.com')
    .order('email');

  if (profilesError) {
    console.error('Error fetching profiles:', profilesError.message);
    process.exit(1);
  }

  // Get all vendor profiles
  const { data: vendors, error: vendorsError } = await supabase
    .from('vendor_profiles')
    .select('id, user_id, vertical_id, status, profile_data');

  if (vendorsError) {
    console.error('Error fetching vendors:', vendorsError.message);
    process.exit(1);
  }

  // Create vendor lookup by user_id
  const vendorByUserId = new Map();
  for (const v of vendors || []) {
    vendorByUserId.set(v.user_id, v);
  }

  // Build output
  let output = `# Test Accounts
# Generated: ${new Date().toISOString()}
# Password for all accounts: TestPassword123!

================================================================================
VENDOR ACCOUNTS (can create listings, receive orders)
================================================================================

`;

  const vendorAccounts = profiles?.filter(p => p.roles?.includes('vendor')) || [];
  const buyerOnlyAccounts = profiles?.filter(p => !p.roles?.includes('vendor')) || [];

  for (const profile of vendorAccounts) {
    const vendor = vendorByUserId.get(profile.user_id);
    const vertical = vendor?.vertical_id || 'unknown';
    const businessName = vendor?.profile_data?.business_name || 'N/A';
    const status = vendor?.status || 'unknown';

    output += `Email:    ${profile.email}
Password: TestPassword123!
Name:     ${profile.display_name}
Type:     VENDOR
Vertical: ${vertical}
Business: ${businessName}
Status:   ${status}
----------------------------------------
`;
  }

  output += `
================================================================================
BUYER ACCOUNTS (can browse, add to cart, place orders)
================================================================================

`;

  for (const profile of buyerOnlyAccounts) {
    output += `Email:    ${profile.email}
Password: TestPassword123!
Name:     ${profile.display_name}
Type:     BUYER
----------------------------------------
`;
  }

  output += `
================================================================================
SUMMARY
================================================================================
Total Accounts: ${profiles?.length || 0}
Vendor Accounts: ${vendorAccounts.length}
Buyer-Only Accounts: ${buyerOnlyAccounts.length}

Fireworks Vendors: ${vendorAccounts.filter(p => vendorByUserId.get(p.user_id)?.vertical_id === 'fireworks').length}
Farmers Market Vendors: ${vendorAccounts.filter(p => vendorByUserId.get(p.user_id)?.vertical_id === 'farmers_market').length}
`;

  // Write to file
  fs.writeFileSync('test-accounts.txt', output);
  console.log('✅ Created test-accounts.txt');
  console.log(`   ${profiles?.length || 0} accounts listed`);
}

main();
