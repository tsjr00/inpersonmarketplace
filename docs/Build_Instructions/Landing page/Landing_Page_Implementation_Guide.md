# Landing Page - Technical Implementation Guide

**For:** Claude Code (CC)
**Purpose:** Component structure, code patterns, and implementation strategy

---

## File Structure

```
apps/web/src/
├── app/
│   └── farmers_market/
│       └── page.tsx                    # Main landing page (Server Component)
│
├── components/
│   └── landing/
│       ├── Hero.tsx                    # Hero section with CTA
│       ├── HowItWorks.tsx              # 3-step buyer flow
│       ├── FeaturedMarkets.tsx         # Market carousel/grid
│       ├── VendorSection.tsx           # Vendor pitch section
│       ├── FeatureGrid.tsx             # 4 key features
│       ├── Testimonials.tsx            # Social proof
│       ├── FinalCTA.tsx                # Bottom conversion section
│       ├── TrustBar.tsx                # Statistics bar
│       └── index.ts                    # Barrel export
│
├── lib/
│   └── landing/
│       ├── content.ts                  # All text content as constants
│       └── types.ts                    # TypeScript interfaces
│
└── public/
    └── images/
        └── landing/
            ├── hero-image.jpg          # [PLACEHOLDER]
            ├── vendor-image.jpg        # [PLACEHOLDER]
            └── markets/                # Market photos
```

---

## Main Page Component

**File:** `apps/web/src/app/farmers_market/page.tsx`

```typescript
import { Hero } from '@/components/landing/Hero'
import { TrustBar } from '@/components/landing/TrustBar'
import { HowItWorks } from '@/components/landing/HowItWorks'
import { FeaturedMarkets } from '@/components/landing/FeaturedMarkets'
import { VendorSection } from '@/components/landing/VendorSection'
import { FeatureGrid } from '@/components/landing/FeatureGrid'
import { Testimonials } from '@/components/landing/Testimonials'
import { FinalCTA } from '@/components/landing/FinalCTA'
import { getMarketStats } from '@/lib/database-queries'
import { createClient } from '@/lib/supabase/server'

export const metadata = {
  title: 'Local Farmers Markets | Fresh Food From Local Vendors',
  description: 'Discover fresh, local food from nearby farmers and artisans. Browse products, pre-order online, and pick up at your favorite farmers market.',
  openGraph: {
    title: 'Local Farmers Markets | Fresh Food From Local Vendors',
    description: 'Shop fresh, local products from farmers markets in your area.',
    images: ['/images/landing/og-image.jpg'],
  },
}

export default async function FarmersMarketLanding() {
  const supabase = createClient()
  
  // Get dynamic statistics
  const stats = await getMarketStats('farmers_market')
  
  // Get user location if logged in
  const { data: { user } } = await supabase.auth.getUser()
  let userLocation = null
  
  if (user) {
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('preferred_latitude, preferred_longitude')
      .eq('id', user.id)
      .single()
    
    userLocation = profile?.preferred_latitude && profile?.preferred_longitude
      ? { lat: profile.preferred_latitude, lng: profile.preferred_longitude }
      : null
  }
  
  return (
    <main className="min-h-screen bg-white">
      <Hero />
      <TrustBar stats={stats} />
      <HowItWorks />
      <FeaturedMarkets userLocation={userLocation} />
      <VendorSection />
      <FeatureGrid />
      <Testimonials />
      <FinalCTA />
    </main>
  )
}
```

---

## Component Implementations

### 1. Hero Component

**File:** `components/landing/Hero.tsx`

```typescript
'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { LANDING_CONTENT } from '@/lib/landing/content'

export function Hero() {
  return (
    <section className="relative h-[600px] md:h-[700px] lg:h-[800px] flex items-center">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/landing/hero-image.jpg"
          alt="Fresh produce and goods at local farmers market"
          fill
          className="object-cover"
          priority
          placeholder="blur"
          blurDataURL="data:image/jpeg;base64,/9j/4AAQSkZJRg..." // Generate this
        />
        {/* Dark gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/20 to-black/40" />
      </div>

      {/* Content */}
      <div className="relative z-10 container mx-auto px-4 md:px-6">
        <div className="max-w-2xl text-white">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-4 leading-tight">
            {LANDING_CONTENT.hero.headline}
          </h1>
          <p className="text-lg md:text-xl mb-8 text-white/90">
            {LANDING_CONTENT.hero.subheadline}
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4">
            <Button size="lg" className="bg-green-600 hover:bg-green-700 text-lg px-8" asChild>
              <Link href="/farmers_market/browse">
                {LANDING_CONTENT.hero.primaryCTA}
              </Link>
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="text-white border-white hover:bg-white/10 text-lg px-8"
              asChild
            >
              <Link href="/farmers_market/vendor-signup">
                {LANDING_CONTENT.hero.secondaryCTA}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
```

---

### 2. Trust Bar Component

**File:** `components/landing/TrustBar.tsx`

```typescript
import { MarketStats } from '@/lib/landing/types'

interface TrustBarProps {
  stats: MarketStats
}

export function TrustBar({ stats }: TrustBarProps) {
  return (
    <section className="bg-green-50 py-12 md:py-16">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          <div>
            <div className="text-3xl md:text-4xl font-bold text-green-700">
              {stats.listingCount}+
            </div>
            <div className="text-sm text-gray-600 mt-1">Products</div>
          </div>
          
          <div>
            <div className="text-3xl md:text-4xl font-bold text-green-700">
              {stats.userCount}+
            </div>
            <div className="text-sm text-gray-600 mt-1">Shoppers</div>
          </div>
          
          <div>
            <div className="text-3xl md:text-4xl font-bold text-green-700">
              {stats.marketCount}+
            </div>
            <div className="text-sm text-gray-600 mt-1">Markets</div>
          </div>
        </div>
        
        <p className="text-center text-gray-600 mt-6">
          Supporting local farmers and artisans in your area
        </p>
      </div>
    </section>
  )
}
```

---

### 3. How It Works Component

**File:** `components/landing/HowItWorks.tsx`

```typescript
import { MapPin, ShoppingCart, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

const steps = [
  {
    icon: MapPin,
    number: 1,
    title: 'Find Your Market',
    description: 'Browse farmers markets near you and discover local vendors',
  },
  {
    icon: ShoppingCart,
    number: 2,
    title: 'Browse & Order',
    description: 'Shop from multiple vendors in one cart, all in one convenient order',
  },
  {
    icon: Package,
    number: 3,
    title: 'Pick Up Fresh',
    description: 'Collect your order at the market on your scheduled pickup day',
  },
]

export function HowItWorks() {
  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
          How It Works
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          {steps.map((step) => {
            const Icon = step.icon
            return (
              <div key={step.number} className="text-center">
                <div className="relative inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                  <Icon className="w-8 h-8 text-green-600" />
                  <span className="absolute -top-1 -right-1 w-6 h-6 bg-green-600 text-white text-xs font-bold rounded-full flex items-center justify-center">
                    {step.number}
                  </span>
                </div>
                <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                <p className="text-gray-600">{step.description}</p>
              </div>
            )
          })}
        </div>
        
        <div className="text-center">
          <Button size="lg" className="bg-green-600 hover:bg-green-700" asChild>
            <Link href="/farmers_market/browse">Start Shopping</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
```

---

### 4. Featured Markets Component

**File:** `components/landing/FeaturedMarkets.tsx`

```typescript
import { createClient } from '@/lib/supabase/server'
import { MarketCard } from '@/components/markets/MarketCard'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

interface FeaturedMarketsProps {
  userLocation: { lat: number; lng: number } | null
}

export async function FeaturedMarkets({ userLocation }: FeaturedMarketsProps) {
  const supabase = createClient()
  
  let markets
  
  if (userLocation) {
    // Get markets within 25 miles
    const { data } = await supabase.rpc('get_markets_within_radius', {
      user_lat: userLocation.lat,
      user_lng: userLocation.lng,
      radius_meters: 40234, // 25 miles in meters
      vertical_filter: 'farmers_market',
      market_type_filter: 'traditional'
    })
    markets = data?.slice(0, 3) || []
  } else {
    // Get featured markets
    const { data } = await supabase
      .from('markets')
      .select('*')
      .eq('vertical', 'farmers_market')
      .eq('status', 'active')
      .eq('market_type', 'traditional')
      .order('created_at', { ascending: false })
      .limit(3)
    markets = data || []
  }
  
  return (
    <section className="py-16 md:py-24 bg-gray-50">
      <div className="container mx-auto px-4">
        <h2 className="text-3xl md:text-4xl font-bold text-center mb-12">
          {userLocation ? 'Markets Near You' : 'Featured Markets'}
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {markets.map((market) => (
            <MarketCard key={market.id} market={market} showDistance={!!userLocation} />
          ))}
        </div>
        
        {markets.length === 0 && (
          <p className="text-center text-gray-600">
            No markets found. Check back soon!
          </p>
        )}
        
        <div className="text-center">
          <Button variant="outline" size="lg" asChild>
            <Link href="/farmers_market/markets">Browse All Markets</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
```

---

## Content Constants

**File:** `lib/landing/content.ts`

```typescript
export const LANDING_CONTENT = {
  hero: {
    headline: 'Your Local Farmers Markets, Reimagined',
    subheadline: 'Discover fresh, local food from nearby vendors. Browse products, pre-order online, and pick up at your favorite market.',
    primaryCTA: 'Browse Markets',
    secondaryCTA: 'Become A Vendor',
  },
  
  trustBar: {
    tagline: 'Supporting local farmers and artisans in your area',
  },
  
  howItWorks: {
    title: 'How It Works',
    ctaText: 'Start Shopping',
  },
  
  vendor: {
    headline: 'Sell at Farmers Markets, Made Easy',
    benefits: [
      'Pre-sell products before market day',
      'Manage inventory and orders in one place',
      'Accept payments securely online',
      'Track pickup confirmations and customer reviews',
      'Connect with more customers in your area',
    ],
    ctaText: 'Start Selling',
    supportingText: 'Join hundreds of local vendors already using our platform',
  },
  
  features: [
    {
      title: 'Pre-Order & Save Time',
      description: 'Browse and order ahead. Skip the lines and guarantee you get what you want.',
    },
    {
      title: 'Support Local Vendors',
      description: 'Your purchases directly support local farmers, bakers, and artisans in your community.',
    },
    {
      title: 'Multiple Pickup Locations',
      description: 'Choose from traditional markets or convenient private pickup locations near you.',
    },
    {
      title: 'Safe & Secure',
      description: 'Secure payments, order tracking, and vendor accountability built in.',
    },
  ],
  
  testimonials: [
    {
      quote: "I love being able to pre-order my favorite items. No more getting to the market to find they've sold out!",
      author: 'Sarah M.',
      role: 'Regular Shopper',
    },
    {
      quote: 'This platform has tripled my sales. Customers love ordering ahead and I can better plan my inventory.',
      author: 'Mike T.',
      role: 'Farm Vendor',
    },
    {
      quote: 'Supporting local farmers has never been easier. Fresh eggs and bread every Saturday!',
      author: 'Jennifer L.',
      role: 'Home Chef',
    },
  ],
  
  finalCTA: {
    headline: 'Ready to Get Started?',
    subheadline: 'Join thousands of shoppers and vendors in your area',
    primaryCTA: 'Browse Markets',
    secondaryCTA: 'Become A Vendor',
  },
} as const
```

---

## Database Query Helpers

**File:** `lib/landing/queries.ts`

```typescript
import { createClient } from '@/lib/supabase/server'

export async function getMarketStats(vertical: string) {
  const supabase = createClient()
  
  // Get listing count
  const { count: listingCount } = await supabase
    .from('listings')
    .select('*', { count: 'exact', head: true })
    .eq('vertical', vertical)
    .eq('status', 'published')
  
  // Get user count (buyers + vendors)
  const { count: userCount } = await supabase
    .from('user_profiles')
    .select('*', { count: 'exact', head: true })
    .contains('verticals', [vertical])
  
  // Get market count
  const { count: marketCount } = await supabase
    .from('markets')
    .select('*', { count: 'exact', head: true })
    .eq('vertical', vertical)
    .eq('status', 'active')
  
  return {
    listingCount: listingCount || 0,
    userCount: userCount || 0,
    marketCount: marketCount || 0,
  }
}
```

---

## Image Placeholders Guide

Create placeholder images or use these free resources:

**Hero Image:**
- Source: Unsplash, search "farmers market"
- Size: 1920x800px (desktop), 800x600px (mobile)
- Optimize: Convert to WebP, quality 80%
- Example: https://unsplash.com/s/photos/farmers-market

**Vendor Section Image:**
- Source: Unsplash, search "farm vendor"
- Size: 800x600px
- Focus: Vendor arranging produce at stall

**Market Photos:**
- Either pull from markets table (if they have photos)
- Or use placeholder: `/images/landing/market-placeholder.jpg`
- Size: 400x300px

**Icons:**
- Use lucide-react icons (already installed)
- No custom icon assets needed

---

## Styling Utilities

**File:** `lib/landing/styles.ts`

```typescript
export const landingStyles = {
  section: 'py-16 md:py-24',
  container: 'container mx-auto px-4 md:px-6 max-w-7xl',
  heading: 'text-3xl md:text-4xl lg:text-5xl font-bold',
  subheading: 'text-lg md:text-xl text-gray-600',
  card: 'bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow p-6',
  button: {
    primary: 'bg-green-600 hover:bg-green-700 text-white',
    secondary: 'border-green-600 text-green-600 hover:bg-green-50',
  },
}
```

---

## Performance Optimizations

1. **Image Optimization:**
```typescript
import Image from 'next/image'

<Image
  src="/images/landing/hero.jpg"
  alt="..."
  width={1920}
  height={800}
  priority  // For hero image only
  quality={80}
  placeholder="blur"
  blurDataURL="..."  // Generate with plaiceholder library
/>
```

2. **Dynamic Imports:**
```typescript
import dynamic from 'next/dynamic'

const Testimonials = dynamic(() => import('@/components/landing/Testimonials'), {
  loading: () => <div>Loading...</div>
})
```

3. **Server Components:**
- Use Server Components by default
- Only add 'use client' when needed (Hero for animations, etc.)

4. **Preload Critical Assets:**
```typescript
// In page.tsx head
export async function generateMetadata() {
  return {
    // ... other metadata
    other: {
      'preload-image': '/images/landing/hero.jpg',
    },
  }
}
```

---

## Testing Checklist

After implementation:

- [ ] Run `npm run build` - no errors
- [ ] Test on mobile (375px width)
- [ ] Test on tablet (768px width)
- [ ] Test on desktop (1440px width)
- [ ] Check Lighthouse score (aim for 90+)
- [ ] Verify all links work
- [ ] Test with ad blockers enabled
- [ ] Test with slow 3G connection
- [ ] Verify images load with proper aspect ratios
- [ ] Check all CTAs navigate correctly
- [ ] Verify dynamic stats display correctly
- [ ] Test featured markets with and without user location

---

## Deployment Notes

1. Add placeholder images to `/public/images/landing/`
2. Ensure all routes exist (`/browse`, `/vendor-signup`, etc.)
3. Test in staging before production
4. Monitor Core Web Vitals after launch
5. Set up A/B testing for headlines if desired

---

**END OF IMPLEMENTATION GUIDE**
