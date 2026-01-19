/**
 * Production Seed Data Script
 * Generates realistic test data for farmers_market vertical
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<key> npx tsx scripts/seed-production.ts
 *
 * Or with .env.local configured for production:
 *   npx tsx scripts/seed-production.ts
 */

import { createClient } from '@supabase/supabase-js';

// Configuration
const VERTICAL_ID = 'farmers_market';

// Categories from lib/constants.ts
const CATEGORIES = [
  'Produce',
  'Meat & Poultry',
  'Dairy & Eggs',
  'Baked Goods',
  'Pantry',
  'Prepared Foods',
  'Plants & Flowers',
  'Health & Wellness',
  'Art & Decor',
  'Home & Functional'
] as const;

// Supabase client with service role (bypasses RLS)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing environment variables:');
  console.error('   - NEXT_PUBLIC_SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// =============================================================================
// Sample Data
// =============================================================================

// Amarillo, TX farmers markets
const MARKETS = [
  {
    name: 'Amarillo Community Market',
    type: 'traditional' as const,
    description: 'Amarillo\'s premier farmers market featuring local Panhandle produce, ranch meats, and artisan goods every Saturday.',
    address: '1000 S Polk St',
    city: 'Amarillo',
    state: 'TX',
    zip: '79101',
    latitude: 35.2010,
    longitude: -101.8313,
    contact_email: 'info@amarillomarket.org',
    contact_phone: '806-555-0101',
    schedule: { day: 6, start: '08:00', end: '12:00' } // Saturday 8am-12pm
  },
  {
    name: 'Westgate Mall Farmers Market',
    type: 'traditional' as const,
    description: 'Convenient weekday market at Westgate Mall with fresh produce and prepared foods from local vendors.',
    address: '7701 W Interstate 40',
    city: 'Amarillo',
    state: 'TX',
    zip: '79106',
    latitude: 35.1869,
    longitude: -101.9019,
    contact_email: 'westgate@farmersmarket.org',
    contact_phone: '806-555-0102',
    schedule: { day: 3, start: '16:00', end: '19:00' } // Wednesday 4pm-7pm
  }
];

// Vendor business profiles
const VENDORS = [
  {
    business_name: 'Sunrise Organic Farm',
    vendor_type: ['Produce'],
    description: 'Third-generation family farm specializing in heirloom tomatoes, peppers, and leafy greens. All certified organic.',
    tier: 'premium' as const,
    products: [
      { title: 'Heirloom Tomato Mix (2 lb)', category: 'Produce', price: 899, description: 'Assortment of Cherokee Purple, Brandywine, and Green Zebra varieties', quantity: 50 },
      { title: 'Fresh Spinach Bunch', category: 'Produce', price: 499, description: 'Tender baby spinach, freshly harvested', quantity: 40 },
      { title: 'Rainbow Chard Bundle', category: 'Produce', price: 599, description: 'Beautiful mix of red, yellow, and white chard', quantity: 30 },
      { title: 'Sweet Bell Peppers (3 pack)', category: 'Produce', price: 649, description: 'Mixed colors: red, yellow, and orange', quantity: 25 },
      { title: 'Jalapeño Peppers (lb)', category: 'Produce', price: 449, description: 'Fresh jalapeños, perfect for salsa', quantity: 35 },
    ]
  },
  {
    business_name: 'Hill Country Heritage Meats',
    vendor_type: ['Meat & Poultry'],
    description: 'Pasture-raised beef, pork, and poultry from our ranch in the Texas Hill Country. No hormones, no antibiotics.',
    tier: 'premium' as const,
    products: [
      { title: 'Grass-Fed Ground Beef (1 lb)', category: 'Meat & Poultry', price: 1299, description: '85/15 lean, perfect for burgers', quantity: 30 },
      { title: 'Ribeye Steak (12 oz)', category: 'Meat & Poultry', price: 2499, description: 'Prime cut, dry-aged 21 days', quantity: 15 },
      { title: 'Whole Chicken (4-5 lb)', category: 'Meat & Poultry', price: 1899, description: 'Free-range, air-chilled', quantity: 20 },
      { title: 'Pork Chops (2 pack)', category: 'Meat & Poultry', price: 1599, description: 'Heritage breed, bone-in', quantity: 18 },
      { title: 'Breakfast Sausage Links (1 lb)', category: 'Meat & Poultry', price: 999, description: 'Maple sage seasoning, no preservatives', quantity: 25 },
    ]
  },
  {
    business_name: 'Happy Hens Farm',
    vendor_type: ['Dairy & Eggs'],
    description: 'Free-range eggs and fresh dairy from humanely raised animals. Our hens roam freely on 20 acres.',
    tier: 'standard' as const,
    products: [
      { title: 'Farm Fresh Eggs (dozen)', category: 'Dairy & Eggs', price: 699, description: 'Free-range, multicolored shells', quantity: 60 },
      { title: 'Raw Milk (half gallon)', category: 'Dairy & Eggs', price: 849, description: 'From grass-fed Jersey cows', quantity: 25 },
      { title: 'Fresh Butter (8 oz)', category: 'Dairy & Eggs', price: 799, description: 'Small-batch, cultured', quantity: 20 },
      { title: 'Goat Cheese Log (4 oz)', category: 'Dairy & Eggs', price: 899, description: 'Herb-crusted chevre', quantity: 15 },
    ]
  },
  {
    business_name: 'Bluebonnet Bakery',
    vendor_type: ['Baked Goods'],
    description: 'Artisan breads and pastries baked fresh daily using local flour and organic ingredients. Cottage Food certified.',
    tier: 'standard' as const,
    products: [
      { title: 'Sourdough Loaf', category: 'Baked Goods', price: 799, description: '24-hour fermented, crusty exterior', quantity: 25, allergens: true, ingredients: 'Wheat flour, water, salt, starter' },
      { title: 'Cinnamon Rolls (4 pack)', category: 'Baked Goods', price: 1299, description: 'Cream cheese frosting', quantity: 15, allergens: true, ingredients: 'Wheat flour, butter, eggs, milk, cinnamon, cream cheese' },
      { title: 'Blueberry Muffins (6 pack)', category: 'Baked Goods', price: 999, description: 'Texas blueberries, streusel top', quantity: 20, allergens: true, ingredients: 'Wheat flour, butter, eggs, milk, blueberries' },
      { title: 'Jalapeño Cornbread', category: 'Baked Goods', price: 699, description: 'Cast iron baked, slightly sweet', quantity: 18, allergens: true, ingredients: 'Cornmeal, wheat flour, buttermilk, jalapeños' },
    ]
  },
  {
    business_name: 'Texas Honey Co.',
    vendor_type: ['Pantry'],
    description: 'Raw, unfiltered Texas honey from our apiaries across Central Texas. Supporting local bee populations since 2015.',
    tier: 'standard' as const,
    products: [
      { title: 'Wildflower Honey (16 oz)', category: 'Pantry', price: 1499, description: 'Light amber, floral notes', quantity: 30 },
      { title: 'Mesquite Honey (12 oz)', category: 'Pantry', price: 1299, description: 'Rich, dark, slightly smoky', quantity: 25 },
      { title: 'Honeycomb Section', category: 'Pantry', price: 1899, description: 'Pure comb honey in wooden frame', quantity: 10 },
      { title: 'Creamed Honey (8 oz)', category: 'Pantry', price: 1099, description: 'Smooth, spreadable texture', quantity: 20 },
    ]
  },
  {
    business_name: 'Abuela\'s Kitchen',
    vendor_type: ['Prepared Foods'],
    description: 'Authentic Tex-Mex prepared foods made from family recipes passed down for generations. Everything made fresh.',
    tier: 'premium' as const,
    products: [
      { title: 'Green Chile Tamales (dozen)', category: 'Prepared Foods', price: 2499, description: 'Pork with roasted green chiles', quantity: 20, allergens: true, ingredients: 'Masa, pork, green chiles, lard' },
      { title: 'Fresh Salsa Verde (pint)', category: 'Prepared Foods', price: 799, description: 'Tomatillo, serrano, cilantro', quantity: 30 },
      { title: 'Homemade Guacamole (8 oz)', category: 'Prepared Foods', price: 899, description: 'Made fresh daily', quantity: 25 },
      { title: 'Breakfast Tacos (3 pack)', category: 'Prepared Foods', price: 999, description: 'Egg, potato, bacon, cheese', quantity: 40, allergens: true, ingredients: 'Wheat tortillas, eggs, potatoes, bacon, cheese' },
      { title: 'Pozole Rojo (quart)', category: 'Prepared Foods', price: 1699, description: 'Traditional red chile pork stew', quantity: 15 },
    ]
  },
  {
    business_name: 'Lone Star Succulents',
    vendor_type: ['Plants & Flowers'],
    description: 'Native Texas plants and drought-tolerant succulents perfect for Central Texas gardens.',
    tier: 'standard' as const,
    products: [
      { title: 'Succulent Trio (3" pots)', category: 'Plants & Flowers', price: 1599, description: 'Assorted varieties', quantity: 20 },
      { title: 'Texas Sage (1 gallon)', category: 'Plants & Flowers', price: 1299, description: 'Purple blooming, drought tolerant', quantity: 15 },
      { title: 'Prickly Pear Cactus Pad', category: 'Plants & Flowers', price: 599, description: 'Ready to plant cutting', quantity: 25 },
      { title: 'Wildflower Seed Mix (4 oz)', category: 'Plants & Flowers', price: 899, description: 'Native Texas wildflowers', quantity: 30 },
    ]
  },
  {
    business_name: 'Healing Roots Apothecary',
    vendor_type: ['Health & Wellness'],
    description: 'Handcrafted herbal remedies, tinctures, and natural skincare using locally foraged and grown herbs.',
    tier: 'standard' as const,
    products: [
      { title: 'Elderberry Syrup (8 oz)', category: 'Health & Wellness', price: 1899, description: 'Immune support, locally made', quantity: 20 },
      { title: 'Lavender Body Lotion (4 oz)', category: 'Health & Wellness', price: 1499, description: 'All natural ingredients', quantity: 25 },
      { title: 'Herbal Tea Blend (2 oz)', category: 'Health & Wellness', price: 999, description: 'Relaxation blend with chamomile', quantity: 30 },
      { title: 'Natural Lip Balm Set (3 pack)', category: 'Health & Wellness', price: 1299, description: 'Beeswax base, various flavors', quantity: 35 },
    ]
  }
];

// Market box offerings
const MARKET_BOXES = [
  {
    vendorIndex: 0, // Sunrise Organic Farm
    name: 'Weekly Veggie Box',
    description: 'Seasonal assortment of fresh organic vegetables. Perfect for a family of 4 for the week.',
    price_cents: 12000, // $120 for 4 weeks ($30/week)
    max_subscribers: 15
  },
  {
    vendorIndex: 1, // Hill Country Heritage Meats
    name: 'Family Meat Share',
    description: '4-week subscription: 2 lbs ground beef, 1 whole chicken, and 1 lb sausage each week.',
    price_cents: 28000, // $280 for 4 weeks ($70/week)
    max_subscribers: 10
  },
  {
    vendorIndex: 5, // Abuela\'s Kitchen
    name: 'Tamale Tuesday Box',
    description: 'A dozen fresh tamales every week for 4 weeks. Rotating flavors: pork, chicken, bean, cheese.',
    price_cents: 8800, // $88 for 4 weeks ($22/week)
    max_subscribers: 20
  }
];

// =============================================================================
// Helper Functions
// =============================================================================

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// Seed Functions
// =============================================================================

interface CreatedMarket {
  id: string;
  name: string;
  scheduleDay: number;
  startTime: string;
  endTime: string;
}

async function createMarkets(): Promise<CreatedMarket[]> {
  console.log('Creating markets...');
  const createdMarkets: CreatedMarket[] = [];

  for (const market of MARKETS) {
    // Create market (only columns that exist in staging)
    const { data: marketData, error: marketError } = await supabase
      .from('markets')
      .insert({
        vertical_id: VERTICAL_ID,
        name: market.name,
        market_type: market.type,
        address: market.address,
        city: market.city,
        state: market.state,
        zip: market.zip,
        latitude: market.latitude,
        longitude: market.longitude,
        contact_email: market.contact_email,
        contact_phone: market.contact_phone,
        status: 'active'
      })
      .select('id')
      .single();

    if (marketError) {
      console.error(`Error creating market ${market.name}:`, marketError.message);
      continue;
    }

    // Create schedule for traditional markets
    if (market.type === 'traditional' && market.schedule) {
      const { error: scheduleError } = await supabase
        .from('market_schedules')
        .insert({
          market_id: marketData.id,
          day_of_week: market.schedule.day,
          start_time: market.schedule.start,
          end_time: market.schedule.end,
          active: true
        });

      if (scheduleError) {
        console.error(`Error creating schedule for ${market.name}:`, scheduleError.message);
      }
    }

    createdMarkets.push({
      id: marketData.id,
      name: market.name,
      scheduleDay: market.schedule?.day || 6,
      startTime: market.schedule?.start || '09:00',
      endTime: market.schedule?.end || '13:00'
    });

    console.log(`  Created: ${market.name}`);
  }

  return createdMarkets;
}

interface CreatedVendor {
  id: string;
  userId: string;
  businessName: string;
  tier: 'standard' | 'premium';
  products: typeof VENDORS[0]['products'];
  marketId: string;
}

async function createVendorsAndListings(markets: CreatedMarket[]): Promise<CreatedVendor[]> {
  console.log('\nCreating vendors and listings...');
  const createdVendors: CreatedVendor[] = [];

  for (let i = 0; i < VENDORS.length; i++) {
    const vendor = VENDORS[i];
    const assignedMarket = markets[i % markets.length];

    // Create auth user
    const email = `${vendor.business_name.toLowerCase().replace(/[^a-z0-9]/g, '')}.demo@farmersmarketing.app`;
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: 'DemoVendor2026!',
      email_confirm: true,
      user_metadata: {
        display_name: vendor.business_name,
      },
    });

    if (authError) {
      console.error(`Error creating user for ${vendor.business_name}:`, authError.message);
      continue;
    }

    // Wait for trigger to create user_profile
    await delay(300);

    // Update user_profile with roles
    const { error: profileUpdateError } = await supabase
      .from('user_profiles')
      .update({
        email,
        display_name: vendor.business_name,
        roles: ['vendor', 'buyer'],
        verticals: [VERTICAL_ID]
      })
      .eq('user_id', authData.user.id);

    if (profileUpdateError) {
      console.error(`Error updating profile for ${vendor.business_name}:`, profileUpdateError.message);
    }

    // Create vendor profile
    const { data: vendorData, error: vendorError } = await supabase
      .from('vendor_profiles')
      .insert({
        user_id: authData.user.id,
        vertical_id: VERTICAL_ID,
        status: 'approved',
        tier: vendor.tier,
        description: vendor.description,
        home_market_id: vendor.tier === 'standard' ? assignedMarket.id : null,
        profile_data: {
          business_name: vendor.business_name,
          farm_name: vendor.business_name,
          vendor_type: vendor.vendor_type,
          email: email,
          phone: `512-555-${String(1000 + i).slice(-4)}`,
        },
        social_links: vendor.tier === 'premium' ? {
          website: `https://${vendor.business_name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
          instagram: `@${vendor.business_name.toLowerCase().replace(/[^a-z0-9]/g, '')}`
        } : {}
      })
      .select('id')
      .single();

    if (vendorError) {
      console.error(`Error creating vendor profile for ${vendor.business_name}:`, vendorError.message);
      continue;
    }

    // Link vendor to market
    const { error: marketVendorError } = await supabase
      .from('market_vendors')
      .insert({
        market_id: assignedMarket.id,
        vendor_profile_id: vendorData.id,
        approved: true
      });

    if (marketVendorError && !marketVendorError.message.includes('duplicate')) {
      console.error(`Error linking ${vendor.business_name} to market:`, marketVendorError.message);
    }

    // Create listings
    for (const product of vendor.products) {
      const { data: listingData, error: listingError } = await supabase
        .from('listings')
        .insert({
          vendor_profile_id: vendorData.id,
          vertical_id: VERTICAL_ID,
          status: 'published',
          title: product.title,
          description: product.description,
          price_cents: product.price,
          quantity: product.quantity,
          category: product.category,
          listing_data: product.allergens ? {
            contains_allergens: true,
            ingredients: product.ingredients
          } : {}
        })
        .select('id')
        .single();

      if (listingError) {
        console.error(`Error creating listing ${product.title}:`, listingError.message);
        continue;
      }

      // Also insert into listing_markets junction table for browse page queries
      const { error: listingMarketError } = await supabase
        .from('listing_markets')
        .insert({
          listing_id: listingData.id,
          market_id: assignedMarket.id
        });

      if (listingMarketError && !listingMarketError.message.includes('does not exist')) {
        console.error(`Error linking listing to market:`, listingMarketError.message);
      }
    }

    createdVendors.push({
      id: vendorData.id,
      userId: authData.user.id,
      businessName: vendor.business_name,
      tier: vendor.tier,
      products: vendor.products,
      marketId: assignedMarket.id
    });

    console.log(`  Created: ${vendor.business_name} (${vendor.tier}) - ${vendor.products.length} listings`);
  }

  return createdVendors;
}

async function createMarketBoxes(vendors: CreatedVendor[], markets: CreatedMarket[]): Promise<void> {
  console.log('\nCreating market box offerings...');

  for (const boxDef of MARKET_BOXES) {
    const vendor = vendors[boxDef.vendorIndex];
    if (!vendor) {
      console.error(`Vendor at index ${boxDef.vendorIndex} not found`);
      continue;
    }

    const market = markets.find(m => m.id === vendor.marketId);
    if (!market) {
      console.error(`Market not found for vendor ${vendor.businessName}`);
      continue;
    }

    const { error } = await supabase
      .from('market_box_offerings')
      .insert({
        vendor_profile_id: vendor.id,
        vertical_id: VERTICAL_ID,
        name: boxDef.name,
        description: boxDef.description,
        price_cents: boxDef.price_cents,
        pickup_market_id: market.id,
        pickup_day_of_week: market.scheduleDay,
        pickup_start_time: market.startTime,
        pickup_end_time: market.endTime,
        max_subscribers: boxDef.max_subscribers,
        active: true
      });

    if (error) {
      console.error(`Error creating market box ${boxDef.name}:`, error.message);
      continue;
    }

    console.log(`  Created: ${boxDef.name} by ${vendor.businessName}`);
  }
}

async function createBuyerAccounts(): Promise<void> {
  console.log('\nCreating sample buyer accounts...');

  const buyers = [
    { name: 'Demo Buyer', email: 'buyer.demo@farmersmarketing.app', tier: 'free' },
    { name: 'Premium Tester', email: 'premium.tester@farmersmarketing.app', tier: 'premium' }
  ];

  for (const buyer of buyers) {
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: buyer.email,
      password: 'DemoBuyer2026!',
      email_confirm: true,
      user_metadata: {
        display_name: buyer.name,
      },
    });

    if (authError) {
      console.error(`Error creating buyer ${buyer.name}:`, authError.message);
      continue;
    }

    await delay(300);

    // Update user profile
    const { error: profileError } = await supabase
      .from('user_profiles')
      .update({
        email: buyer.email,
        display_name: buyer.name,
        roles: ['buyer'],
        verticals: [VERTICAL_ID],
        buyer_tier: buyer.tier,
        buyer_tier_expires_at: buyer.tier === 'premium'
          ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
          : null
      })
      .eq('user_id', authData.user.id);

    if (profileError) {
      console.error(`Error updating buyer profile:`, profileError.message);
    }

    console.log(`  Created: ${buyer.name} (${buyer.tier})`);
  }
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  console.log('\n========================================');
  console.log('Production Seed Script - Farmers Market');
  console.log('========================================\n');

  console.log(`Target: ${supabaseUrl}`);
  console.log(`Vertical: ${VERTICAL_ID}\n`);

  try {
    // Create markets first
    const markets = await createMarkets();
    if (markets.length === 0) {
      console.error('No markets created, aborting');
      process.exit(1);
    }

    // Create vendors with listings
    const vendors = await createVendorsAndListings(markets);
    if (vendors.length === 0) {
      console.error('No vendors created, aborting');
      process.exit(1);
    }

    // Create market boxes
    await createMarketBoxes(vendors, markets);

    // Create sample buyer accounts
    await createBuyerAccounts();

    // Summary
    console.log('\n========================================');
    console.log('Seed Complete!');
    console.log('========================================');
    console.log(`\nCreated:`);
    console.log(`  - ${markets.length} markets`);
    console.log(`  - ${vendors.length} vendors`);
    console.log(`  - ${vendors.reduce((sum, v) => sum + v.products.length, 0)} listings`);
    console.log(`  - ${MARKET_BOXES.length} market boxes`);
    console.log(`  - 2 buyer accounts`);
    console.log(`\nTest Credentials:`);
    console.log(`  Vendors: [businessname].demo@farmersmarketing.app / DemoVendor2026!`);
    console.log(`  Buyers: buyer.demo@farmersmarketing.app / DemoBuyer2026!`);
    console.log(`          premium.tester@farmersmarketing.app / DemoBuyer2026!`);
    console.log('');

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
