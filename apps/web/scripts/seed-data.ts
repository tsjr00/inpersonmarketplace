/**
 * Seed Data Script
 * Generates test data for development database
 *
 * Usage: npm run seed
 * Custom: NUM_VENDORS=20 NUM_LISTINGS=50 npm run seed
 */

import { createClient } from '@supabase/supabase-js';

// Configuration
const config = {
  numVendors: parseInt(process.env.NUM_VENDORS || '10'),
  numListings: parseInt(process.env.NUM_LISTINGS || '30'),
  numOrders: parseInt(process.env.NUM_ORDERS || '15'),
  numMarkets: parseInt(process.env.NUM_MARKETS || '5'),
};

// Supabase client with service role (bypasses RLS)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ Missing environment variables:');
  console.error('   - NEXT_PUBLIC_SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  console.error('   Make sure .env.local is configured');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Sample data generators
const firstNames = ['John', 'Jane', 'Mike', 'Sarah', 'David', 'Emily', 'Chris', 'Lisa', 'Tom', 'Amy'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Davis', 'Miller', 'Wilson', 'Moore', 'Taylor'];
const businessTypes = ['Farm', 'Market', 'Stand', 'Ranch', 'Garden', 'Orchard', 'Fireworks', 'Pyro'];
const businessSuffixes = ['Fresh', 'Family', 'Local', 'Organic', 'Premium', 'Hometown'];
const cities = ['Austin', 'Houston', 'Dallas', 'San Antonio', 'Denver', 'Phoenix', 'Seattle', 'Portland'];
const states = ['TX', 'TX', 'TX', 'TX', 'CO', 'AZ', 'WA', 'OR'];

// Product categories by vertical
const fireworksProducts = [
  { name: 'Roman Candle Pack', price: 24.99 },
  { name: 'Aerial Shell Kit', price: 149.99 },
  { name: 'Sparkler Bundle', price: 12.99 },
  { name: 'Fountain Variety Pack', price: 39.99 },
  { name: 'Finale Cake', price: 89.99 },
  { name: 'Ground Bloom Flowers', price: 8.99 },
  { name: 'Bottle Rockets', price: 15.99 },
  { name: 'Firecrackers Brick', price: 19.99 },
];

const farmersMarketProducts = [
  { name: 'Fresh Tomatoes (lb)', price: 4.99 },
  { name: 'Organic Eggs (dozen)', price: 6.50 },
  { name: 'Local Honey (jar)', price: 12.00 },
  { name: 'Fresh Bread Loaf', price: 5.00 },
  { name: 'Mixed Greens Bag', price: 7.99 },
  { name: 'Grass-fed Ground Beef (lb)', price: 15.99 },
  { name: 'Artisan Cheese Wheel', price: 24.99 },
  { name: 'Seasonal Fruit Box', price: 29.99 },
];

// Helper functions
function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateEmail(firstName: string, lastName: string, index: number): string {
  return `${firstName.toLowerCase()}.${lastName.toLowerCase()}${index}@test.com`;
}

function generateBusinessName(vertical: string): string {
  const prefix = randomItem(businessSuffixes);
  const suffix = vertical === 'fireworks'
    ? randomItem(['Fireworks', 'Pyro', 'Sparklers'])
    : randomItem(businessTypes);
  return `${prefix} ${randomItem(lastNames)} ${suffix}`;
}

function generateOrderNumber(vertical: string, index: number): string {
  const prefix = vertical === 'fireworks' ? 'FW' : 'FM';
  return `${prefix}-2026-${String(index).padStart(5, '0')}`;
}

async function clearTestData() {
  console.log('🧹 Clearing existing test data...');

  // Clear in reverse dependency order
  await supabase.from('vendor_payouts').delete().like('id', '%');
  await supabase.from('payments').delete().like('id', '%');
  await supabase.from('order_items').delete().like('id', '%');
  await supabase.from('orders').delete().like('order_number', '%-2026-%');
  await supabase.from('listing_images').delete().like('id', '%');
  await supabase.from('listings').delete().like('id', '%');
  await supabase.from('vendor_verifications').delete().like('id', '%');
  await supabase.from('vendor_profiles').delete().like('id', '%');

  // Delete test user profiles (those with @test.com emails)
  const { data: testProfiles } = await supabase
    .from('user_profiles')
    .select('user_id')
    .like('email', '%@test.com');

  if (testProfiles && testProfiles.length > 0) {
    // Delete auth users (this cascades to user_profiles)
    for (const profile of testProfiles) {
      await supabase.auth.admin.deleteUser(profile.user_id);
    }
  }

  console.log('✅ Test data cleared');
}

async function ensureVerticals() {
  console.log('📦 Ensuring verticals exist...');

  const verticals = [
    {
      vertical_id: 'fireworks',
      name_public: 'Fireworks',
      config: {
        name: 'fireworks',
        display_name: 'Fireworks',
        theme: { primary: '#dc2626' },
      },
      buyer_fee_percent: 6.5,
      vendor_fee_percent: 6.5,
    },
    {
      vertical_id: 'farmers_market',
      name_public: 'Farmers Market',
      config: {
        name: 'farmers_market',
        display_name: 'Farmers Market',
        theme: { primary: '#16a34a' },
      },
      buyer_fee_percent: 6.5,
      vendor_fee_percent: 6.5,
    },
  ];

  for (const vertical of verticals) {
    const { error } = await supabase
      .from('verticals')
      .upsert(vertical, { onConflict: 'vertical_id' });

    if (error) {
      console.error(`❌ Error upserting vertical ${vertical.vertical_id}:`, error.message);
    }
  }

  console.log('✅ Verticals ready');
}

interface CreatedUser {
  authId: string;
  profileId: string;
  email: string;
  role: 'vendor' | 'buyer';
}

async function createTestUsers(): Promise<CreatedUser[]> {
  console.log('👥 Creating test users...');

  const users: CreatedUser[] = [];
  const totalUsers = config.numVendors + Math.ceil(config.numOrders * 1.5); // Extra buyers for orders

  for (let i = 0; i < totalUsers; i++) {
    const firstName = randomItem(firstNames);
    const lastName = randomItem(lastNames);
    const email = generateEmail(firstName, lastName, i);
    const isVendor = i < config.numVendors;

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: 'TestPassword123!',
      email_confirm: true,
      user_metadata: {
        display_name: `${firstName} ${lastName}`,
      },
    });

    if (authError) {
      console.error(`❌ Error creating auth user ${email}:`, authError.message);
      continue;
    }

    // Create user profile
    const { data: profileData, error: profileError } = await supabase
      .from('user_profiles')
      .insert({
        user_id: authData.user.id,
        email,
        display_name: `${firstName} ${lastName}`,
        roles: isVendor ? ['vendor', 'buyer'] : ['buyer'],
      })
      .select('id')
      .single();

    if (profileError) {
      console.error(`❌ Error creating user profile ${email}:`, profileError.message);
      continue;
    }

    users.push({
      authId: authData.user.id,
      profileId: profileData.id,
      email,
      role: isVendor ? 'vendor' : 'buyer',
    });
  }

  console.log(`✅ Created ${users.length} users (${config.numVendors} vendors, ${users.length - config.numVendors} buyers)`);
  return users;
}

interface CreatedVendor {
  id: string;
  userId: string;
  vertical: string;
  businessName: string;
}

async function createVendorProfiles(users: CreatedUser[]): Promise<CreatedVendor[]> {
  console.log('🏪 Creating vendor profiles...');

  const vendors: CreatedVendor[] = [];
  const vendorUsers = users.filter(u => u.role === 'vendor');
  const tiers = ['free', 'basic', 'premium'];
  const statuses: Array<'draft' | 'submitted' | 'approved'> = ['draft', 'submitted', 'approved'];

  for (let i = 0; i < vendorUsers.length; i++) {
    const user = vendorUsers[i];
    const vertical = i % 2 === 0 ? 'fireworks' : 'farmers_market';
    const businessName = generateBusinessName(vertical);
    const cityIndex = i % cities.length;

    const { data, error } = await supabase
      .from('vendor_profiles')
      .insert({
        user_id: user.profileId,
        vertical_id: vertical,
        status: randomItem(statuses),
        profile_data: {
          business_name: businessName,
          farm_name: vertical === 'farmers_market' ? businessName : undefined,
          city: cities[cityIndex],
          state: states[cityIndex],
          phone: `555-${randomInt(100, 999)}-${randomInt(1000, 9999)}`,
          description: `Quality ${vertical === 'fireworks' ? 'fireworks' : 'farm products'} since 2020`,
        },
        stripe_account_id: `acct_test_${randomInt(100000, 999999)}`,
        stripe_onboarding_complete: Math.random() > 0.3,
        stripe_charges_enabled: Math.random() > 0.3,
        stripe_payouts_enabled: Math.random() > 0.4,
      })
      .select('id')
      .single();

    if (error) {
      console.error(`❌ Error creating vendor profile:`, error.message);
      continue;
    }

    vendors.push({
      id: data.id,
      userId: user.authId,
      vertical,
      businessName,
    });
  }

  console.log(`✅ Created ${vendors.length} vendor profiles`);
  return vendors;
}

interface CreatedListing {
  id: string;
  vendorProfileId: string;
  vertical: string;
  price: number;
}

async function createListings(vendors: CreatedVendor[]): Promise<CreatedListing[]> {
  console.log('📋 Creating listings...');

  const listings: CreatedListing[] = [];
  const listingsPerVendor = Math.ceil(config.numListings / vendors.length);
  const statuses: Array<'draft' | 'published' | 'paused'> = ['draft', 'published', 'published', 'paused']; // More published

  for (const vendor of vendors) {
    const products = vendor.vertical === 'fireworks' ? fireworksProducts : farmersMarketProducts;
    const numListings = randomInt(1, listingsPerVendor);
    const cityIndex = randomInt(0, cities.length - 1);

    for (let i = 0; i < numListings && listings.length < config.numListings; i++) {
      const product = products[i % products.length];
      const priceVariance = randomInt(-200, 500) / 100; // +/- $2-5

      const { data, error } = await supabase
        .from('listings')
        .insert({
          vendor_profile_id: vendor.id,
          vertical_id: vendor.vertical,
          status: randomItem(statuses),
          listing_type: 'presale',
          listing_data: {
            title: product.name,
            description: `High quality ${product.name.toLowerCase()} from ${vendor.businessName}`,
            price: Math.max(1, product.price + priceVariance),
            quantity_available: randomInt(10, 100),
            unit: vendor.vertical === 'farmers_market' ? 'each' : 'pack',
          },
          city: cities[cityIndex],
          state: states[cityIndex],
          available_from: new Date().toISOString().split('T')[0],
          available_to: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        })
        .select('id')
        .single();

      if (error) {
        console.error(`❌ Error creating listing:`, error.message);
        continue;
      }

      listings.push({
        id: data.id,
        vendorProfileId: vendor.id,
        vertical: vendor.vertical,
        price: product.price + priceVariance,
      });
    }
  }

  console.log(`✅ Created ${listings.length} listings`);
  return listings;
}

async function createOrders(
  users: CreatedUser[],
  vendors: CreatedVendor[],
  listings: CreatedListing[]
): Promise<void> {
  console.log('🛒 Creating orders...');

  const buyers = users.filter(u => u.role === 'buyer' || Math.random() > 0.5);
  const orderStatuses: Array<'pending' | 'paid' | 'completed' | 'cancelled'> = ['pending', 'paid', 'paid', 'completed', 'cancelled'];
  let ordersCreated = 0;

  for (let i = 0; i < config.numOrders && buyers.length > 0; i++) {
    const buyer = buyers[i % buyers.length];
    const vertical = i % 2 === 0 ? 'fireworks' : 'farmers_market';
    const verticalListings = listings.filter(l => l.vertical === vertical);

    if (verticalListings.length === 0) continue;

    // Create order
    const numItems = randomInt(1, 3);
    const orderItems = verticalListings.slice(0, numItems);
    const subtotalCents = orderItems.reduce((sum, item) => sum + Math.round(item.price * 100), 0);
    const platformFeeCents = Math.round(subtotalCents * 0.13); // 6.5% buyer + 6.5% vendor
    const totalCents = subtotalCents + Math.round(subtotalCents * 0.065); // Buyer sees subtotal + buyer fee

    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .insert({
        buyer_user_id: buyer.authId,
        vertical_id: vertical,
        order_number: generateOrderNumber(vertical, i + 1),
        status: randomItem(orderStatuses),
        subtotal_cents: subtotalCents,
        platform_fee_cents: platformFeeCents,
        total_cents: totalCents,
        created_at: new Date(Date.now() - randomInt(0, 30) * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single();

    if (orderError) {
      console.error(`❌ Error creating order:`, orderError.message);
      continue;
    }

    // Create order items
    for (const listing of orderItems) {
      const quantity = randomInt(1, 3);
      const unitPriceCents = Math.round(listing.price * 100);
      const itemSubtotal = unitPriceCents * quantity;
      const itemPlatformFee = Math.round(itemSubtotal * 0.13);
      const vendorPayout = itemSubtotal - Math.round(itemSubtotal * 0.065);

      await supabase.from('order_items').insert({
        order_id: orderData.id,
        listing_id: listing.id,
        vendor_profile_id: listing.vendorProfileId,
        quantity,
        unit_price_cents: unitPriceCents,
        subtotal_cents: itemSubtotal,
        platform_fee_cents: itemPlatformFee,
        vendor_payout_cents: vendorPayout,
        status: 'pending',
      });
    }

    ordersCreated++;
  }

  console.log(`✅ Created ${ordersCreated} orders`);
}

async function main() {
  console.log('\n🌱 Seed Data Script');
  console.log('==================');
  console.log(`Configuration:`);
  console.log(`  - Vendors: ${config.numVendors}`);
  console.log(`  - Listings: ${config.numListings}`);
  console.log(`  - Orders: ${config.numOrders}`);
  console.log(`  - Markets: ${config.numMarkets} (not implemented yet)`);
  console.log('');

  try {
    // Clear existing test data
    await clearTestData();

    // Ensure verticals exist
    await ensureVerticals();

    // Create users
    const users = await createTestUsers();
    if (users.length === 0) {
      console.error('❌ No users created, aborting');
      process.exit(1);
    }

    // Create vendor profiles
    const vendors = await createVendorProfiles(users);
    if (vendors.length === 0) {
      console.error('❌ No vendors created, aborting');
      process.exit(1);
    }

    // Create listings
    const listings = await createListings(vendors);

    // Create orders
    await createOrders(users, vendors, listings);

    // Summary
    console.log('\n==================');
    console.log('✅ Seed data complete!');
    console.log(`\nSummary:`);
    console.log(`  - Users: ${users.length}`);
    console.log(`  - Vendors: ${vendors.length}`);
    console.log(`  - Listings: ${listings.length}`);
    console.log(`  - Orders: ${config.numOrders}`);
    console.log(`\nTest credentials: any @test.com email with password "TestPassword123!"`);
    console.log('');

  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
