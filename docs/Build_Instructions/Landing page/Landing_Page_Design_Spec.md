# Farmers Market Landing Page - Design Specification

**For:** Claude Code (CC)
**Date:** January 17, 2026
**Vertical:** farmers_market
**Target URL:** `/farmers_market` (vertical home page)
**Priority:** Mobile-first, responsive design

---

## Design Philosophy

**Core Principles:**
1. **Mobile-first** - Optimize for 375px width, scale up gracefully
2. **Trust-building** - Emphasize local, fresh, community
3. **Clear CTAs** - Separate paths for buyers vs vendors
4. **Visual storytelling** - Use imagery to convey farmers market atmosphere
5. **Fast loading** - Minimal animations, optimized images

**Brand Voice:**
- Warm, welcoming, community-focused
- Professional but not corporate
- Emphasize "local" and "fresh"
- Celebrate vendors and their craft

---

## Page Structure (Top to Bottom)

### 1. Navigation Bar
**Desktop:** Logo (left) | Browse Markets | For Vendors | Log In | Sign Up (CTA button)
**Mobile:** Logo (left) | Hamburger menu (right)

**Sticky:** Yes (remains visible on scroll)
**Background:** White with subtle shadow on scroll
**Height:** 64px desktop, 56px mobile

---

### 2. Hero Section
**Purpose:** Immediate value proposition with strong visual

**Layout (Mobile):**
```
┌─────────────────────────────┐
│  [HERO IMAGE - Full width]  │
│  Overlay with gradient       │
│  ┌───────────────────────┐  │
│  │ Your Local Farmers    │  │
│  │ Markets, Reimagined   │  │
│  │                       │  │
│  │ Fresh food from local │  │
│  │ vendors, delivered or │  │
│  │ ready for pickup      │  │
│  │                       │  │
│  │ [Browse Markets CTA]  │  │
│  │ [Become A Vendor CTA] │  │
│  └───────────────────────┘  │
└─────────────────────────────┘
```

**Layout (Desktop):**
```
┌────────────────────┬────────────────────┐
│  [HERO IMAGE]      │  Headline          │
│                    │  Subheadline       │
│  Full-bleed photo  │                    │
│  or video          │  [Browse Markets]  │
│                    │  [Become A Vendor] │
└────────────────────┴────────────────────┘
```

**Content:**
- **Headline:** "Your Local Farmers Markets, Reimagined"
- **Subheadline:** "Discover fresh, local food from nearby vendors. Browse products, pre-order online, and pick up at your favorite market."
- **Primary CTA:** "Browse Markets" (green button, large)
- **Secondary CTA:** "Become A Vendor" (outlined button)

**Hero Image Placeholder:**
- `[HERO_IMAGE]` - Farmers market scene, vibrant produce, people
- Dimensions: 1920x800px desktop, 800x600px mobile
- Alt text: "Fresh produce and goods at local farmers market"
- Overlay: Dark gradient (top: transparent, bottom: rgba(0,0,0,0.4))

**Styling:**
- Headline: 40px mobile / 56px desktop, bold, white text
- Subheadline: 18px mobile / 20px desktop, white text with 80% opacity
- Button spacing: 16px between buttons
- Padding: 32px mobile / 64px desktop

---

### 3. Trust Bar (Statistics)
**Purpose:** Social proof through numbers

**Layout:**
```
┌─────────────────────────────┐
│   500+        1,000+    15+  │
│  Products    Shoppers Markets│
│                              │
│  Supporting local farmers    │
│  and artisans in your area   │
└─────────────────────────────┘
```

**Mobile:** Stack vertically, center-aligned
**Desktop:** Horizontal row, evenly spaced

**Styling:**
- Background: Light green (#F0F9F4)
- Numbers: 32px, bold, dark green
- Labels: 14px, gray
- Tagline: 16px, center-aligned
- Padding: 48px vertical

**Data Source:** Pull from database (count active listings, users, markets)

---

### 4. How It Works - For Shoppers
**Purpose:** Explain the buyer experience in 3-4 steps

**Layout (Mobile):**
```
┌─────────────────────────────┐
│  How It Works               │
│                             │
│  ┌─────────────────────┐   │
│  │ [ICON: Map Pin]     │   │
│  │ 1. Find Your Market │   │
│  │ Browse farmers      │   │
│  │ markets near you    │   │
│  └─────────────────────┘   │
│                             │
│  ┌─────────────────────┐   │
│  │ [ICON: Cart]        │   │
│  │ 2. Browse & Order   │   │
│  │ Shop from multiple  │   │
│  │ vendors in one cart │   │
│  └─────────────────────┘   │
│                             │
│  ┌─────────────────────┐   │
│  │ [ICON: Basket]      │   │
│  │ 3. Pick Up Fresh    │   │
│  │ Collect your order  │   │
│  │ at the market       │   │
│  └─────────────────────┘   │
│                             │
│  [Start Shopping CTA]       │
└─────────────────────────────┘
```

**Desktop:** 3 columns side-by-side

**Icons:** Use lucide-react icons or placeholder `[ICON_MAP]`, `[ICON_CART]`, `[ICON_BASKET]`

**Styling:**
- Section title: 32px, bold, center-aligned
- Cards: White background, subtle shadow, 24px padding
- Icon: 48px, primary green color
- Step number: Small badge, green background
- Title: 20px, bold
- Description: 16px, gray
- Spacing: 32px between cards (mobile), 24px (desktop)

**Background:** White

---

### 5. Featured Markets Preview
**Purpose:** Show real markets to build interest

**Layout (Mobile):**
```
┌─────────────────────────────┐
│  Markets Near You           │
│  (or "Featured Markets")    │
│                             │
│  [Market Card 1]            │
│  ┌─────────────────────┐   │
│  │ [Market Photo]      │   │
│  │ Downtown Farmers    │   │
│  │ Saturdays 8am-1pm   │   │
│  │ [View Vendors]      │   │
│  └─────────────────────┘   │
│                             │
│  [Market Card 2]            │
│  [Market Card 3]            │
│                             │
│  [Browse All Markets CTA]   │
└─────────────────────────────┘
```

**Desktop:** Horizontal scroll carousel, 3 visible at once

**Market Cards:**
- Photo: 400x300px (placeholder: `[MARKET_PHOTO_{id}]`)
- Market name: 20px, bold
- Schedule: 14px, gray
- Location badge: Small, with map pin icon
- "View Vendors" link button

**Data Source:** 
- If user has location: `get_markets_within_radius(user_lat, user_lng, 25)`
- If no location: Featured markets (status='active', ORDER BY created_at DESC LIMIT 3)

**Styling:**
- Background: Light gray (#F9FAFB)
- Card: White, rounded corners, shadow on hover
- Spacing: 16px between cards

---

### 6. For Vendors Section
**Purpose:** Pitch the platform to potential vendors

**Layout (Mobile):**
```
┌─────────────────────────────┐
│  [VENDOR IMAGE - Full width]│
│  Overlay                    │
│  ┌───────────────────────┐ │
│  │ Sell at Farmers       │ │
│  │ Markets, Made Easy    │ │
│  │                       │ │
│  │ âœ" Pre-sell products   │ │
│  │ âœ" Manage inventory    │ │
│  │ âœ" Accept payments     │ │
│  │ âœ" Track orders        │ │
│  │                       │ │
│  │ [Start Selling CTA]   │ │
│  └───────────────────────┘ │
└─────────────────────────────┘
```

**Desktop:** Split layout (image left 50%, content right 50%)

**Vendor Image Placeholder:**
- `[VENDOR_IMAGE]` - Vendor at market stall, arranging produce
- Dimensions: 800x600px
- Alt text: "Vendor selling fresh produce at farmers market"

**Benefits List:**
- Icons: Checkmark (green)
- Text: 18px, white (mobile overlay) or dark (desktop)

**CTA:** "Start Selling" → Links to `/farmers_market/vendor-signup`

**Background:** Dark green (#047857) for desktop content area

---

### 7. Key Features Grid
**Purpose:** Highlight platform capabilities

**Layout (Mobile - Stack):**
```
┌─────────────────────────────┐
│  Why Choose Us              │
│                             │
│  [ICON: Clock]              │
│  Pre-Order & Save Time      │
│  Browse and order ahead...  │
│                             │
│  [ICON: Users]              │
│  Support Local Vendors      │
│  Your purchases directly... │
│                             │
│  [ICON: MapPin]             │
│  Multiple Pickup Locations  │
│  Choose from markets...     │
│                             │
│  [ICON: Shield]             │
│  Safe & Secure              │
│  Secure payments...         │
└─────────────────────────────┘
```

**Desktop:** 2x2 grid

**Features:**
1. **Pre-Order & Save Time**
   - Icon: Clock
   - Copy: "Browse and order ahead. Skip the lines and guarantee you get what you want."

2. **Support Local Vendors**
   - Icon: Users/Heart
   - Copy: "Your purchases directly support local farmers, bakers, and artisans in your community."

3. **Multiple Pickup Locations**
   - Icon: Map Pin
   - Copy: "Choose from traditional markets or convenient private pickup locations."

4. **Safe & Secure**
   - Icon: Shield
   - Copy: "Secure payments, order tracking, and vendor accountability built in."

**Styling:**
- Section background: White
- Feature cards: Light background, minimal border
- Icons: 40px, primary color
- Title: 20px, bold
- Description: 16px, gray
- Padding: 32px each card

---

### 8. Testimonials / Social Proof
**Purpose:** Build trust through user stories

**Layout (Mobile):**
```
┌─────────────────────────────┐
│  What People Are Saying     │
│                             │
│  ┌───────────────────────┐ │
│  │ "Amazing fresh produce│ │
│  │  every week!"         │ │
│  │  - Sarah M., Buyer    │ │
│  │  [AVATAR_PLACEHOLDER] │ │
│  └───────────────────────┘ │
│                             │
│  [Testimonial Card 2]       │
│  [Testimonial Card 3]       │
└─────────────────────────────┘
```

**Desktop:** 3 cards horizontal

**Testimonial Cards:**
- Quote: 18px, italic
- Attribution: 14px, bold (name), regular (role)
- Avatar: 48px circle (placeholder: `[AVATAR_{id}]` or initials)
- Background: Light green
- Border: Left border (4px, green accent)

**Placeholder Testimonials (Tracy can replace):**
1. "I love being able to pre-order my favorite items. No more getting to the market to find they've sold out!" - Sarah M., Regular Shopper
2. "This platform has tripled my sales. Customers love ordering ahead and I can better plan my inventory." - Mike T., Farm Vendor
3. "Supporting local farmers has never been easier. Fresh eggs and bread every Saturday!" - Jennifer L., Home Chef

---

### 9. Final CTA Section
**Purpose:** Convert visitors before footer

**Layout:**
```
┌─────────────────────────────┐
│  Ready to Get Started?      │
│                             │
│  Join thousands of shoppers │
│  and vendors in your area   │
│                             │
│  [Browse Markets]           │
│  [Become A Vendor]          │
└─────────────────────────────┘
```

**Styling:**
- Background: Gradient (light green to white)
- Centered content
- Buttons: Same as hero (large, prominent)
- Padding: 80px vertical

---

### 10. Footer
**Purpose:** Navigation, trust, legal

**Layout (Mobile - Stacked):**
```
┌─────────────────────────────┐
│  [LOGO]                     │
│                             │
│  For Shoppers               │
│  - Browse Markets           │
│  - How It Works             │
│  - Sign Up                  │
│                             │
│  For Vendors                │
│  - Become a Vendor          │
│  - Vendor Dashboard         │
│  - Pricing                  │
│                             │
│  Company                    │
│  - About Us                 │
│  - Contact                  │
│  - Privacy Policy           │
│  - Terms of Service         │
│                             │
│  Connect                    │
│  [Social Icons]             │
│                             │
│  © 2026 FastWrks Marketplace│
└─────────────────────────────┘
```

**Desktop:** 4 columns

**Styling:**
- Background: Dark gray (#1F2937)
- Text: White/gray
- Links: Hover state (green)
- Logo: White version
- Social icons: 24px (placeholder: `[SOCIAL_FACEBOOK]`, `[SOCIAL_INSTAGRAM]`, `[SOCIAL_TWITTER]`)

---

## Responsive Breakpoints

```css
/* Mobile */
@media (max-width: 767px) {
  - Single column layout
  - Stack all sections vertically
  - Full-width CTAs
  - Hamburger menu
}

/* Tablet */
@media (min-width: 768px) and (max-width: 1023px) {
  - 2-column grids where applicable
  - Larger text sizes
  - Side-by-side CTAs
}

/* Desktop */
@media (min-width: 1024px) {
  - Multi-column layouts
  - Hero split-screen
  - Horizontal carousels
  - Max content width: 1280px (centered)
}
```

---

## Color Palette

```
Primary Green:   #10B981 (buttons, accents)
Dark Green:      #047857 (vendor section background)
Light Green:     #F0F9F4 (section backgrounds)
Success Green:   #059669 (hover states)

Text Dark:       #111827 (headings)
Text Gray:       #6B7280 (body copy)
Text Light:      #9CA3AF (subtle text)

Background:      #FFFFFF (main)
Background Alt:  #F9FAFB (alternating sections)

Borders:         #E5E7EB (light gray)
Shadows:         rgba(0, 0, 0, 0.1) (subtle)
```

---

## Typography

```
Font Family: Inter or system fonts
Font Weights: 400 (regular), 600 (semibold), 700 (bold)

Headings:
  H1: 56px desktop / 40px mobile, bold
  H2: 40px desktop / 32px mobile, bold
  H3: 24px desktop / 20px mobile, semibold

Body:
  Large: 18px
  Regular: 16px
  Small: 14px

Line Heights:
  Headings: 1.2
  Body: 1.6

Letter Spacing:
  Headings: -0.02em
  Body: normal
```

---

## Button Styles

```css
/* Primary CTA */
.btn-primary {
  background: #10B981;
  color: white;
  padding: 16px 32px;
  border-radius: 8px;
  font-size: 18px;
  font-weight: 600;
  hover: #059669;
  shadow: 0 4px 6px rgba(16, 185, 129, 0.2);
}

/* Secondary CTA */
.btn-secondary {
  background: transparent;
  color: #10B981;
  border: 2px solid #10B981;
  padding: 14px 30px;
  border-radius: 8px;
  font-size: 18px;
  font-weight: 600;
  hover: background #F0F9F4;
}

/* Text Link */
.btn-link {
  color: #10B981;
  text-decoration: underline;
  font-weight: 600;
  hover: color #047857;
}
```

---

## Image Requirements & Placeholders

All images should be optimized (WebP format preferred, with JPG fallback).

| Placeholder ID | Description | Dimensions | Notes |
|----------------|-------------|------------|-------|
| `[HERO_IMAGE]` | Farmers market scene | 1920x800 (desk), 800x600 (mobile) | Vibrant, people browsing |
| `[VENDOR_IMAGE]` | Vendor at stall | 800x600 | Arranging fresh produce |
| `[MARKET_PHOTO_{id}]` | Individual market photos | 400x300 | Pull from markets table |
| `[AVATAR_{id}]` | Testimonial avatars | 96x96 | Circle crop, or use initials |
| `[SOCIAL_FACEBOOK]` | Facebook icon | 24x24 | SVG preferred |
| `[SOCIAL_INSTAGRAM]` | Instagram icon | 24x24 | SVG preferred |
| `[SOCIAL_TWITTER]` | Twitter/X icon | 24x24 | SVG preferred |
| `[LOGO_WHITE]` | Logo (white version) | Variable | For footer |

---

## Interactions & Animations

**Keep subtle and performance-conscious:**

1. **Buttons:**
   - Hover: Scale 1.02, increase shadow
   - Click: Scale 0.98
   - Transition: 200ms ease

2. **Cards:**
   - Hover: Lift (translateY -4px), increase shadow
   - Transition: 300ms ease

3. **Scroll Animations:**
   - Fade in sections on scroll (optional)
   - Use Intersection Observer
   - Disable on mobile for performance

4. **Hero:**
   - Optional: Parallax effect on hero image (desktop only)
   - Keep smooth, don't overdo

5. **Navigation:**
   - Sticky header appears on scroll down
   - Shadow appears after scrolling 20px

---

## Accessibility Requirements

1. **Semantic HTML:** Use proper heading hierarchy (h1 → h2 → h3)
2. **Alt Text:** All images must have descriptive alt text
3. **Focus States:** Visible focus indicators on all interactive elements
4. **Color Contrast:** WCAG AA compliant (4.5:1 for body text)
5. **Keyboard Navigation:** All features accessible via keyboard
6. **Screen Readers:** ARIA labels where needed
7. **Skip Links:** "Skip to main content" link at top

---

## Performance Targets

- **First Contentful Paint:** < 1.5s
- **Time to Interactive:** < 3.5s
- **Largest Contentful Paint:** < 2.5s
- **Cumulative Layout Shift:** < 0.1

**Optimization strategies:**
- Lazy load images below the fold
- Use next/image for automatic optimization
- Minimize JavaScript bundle size
- Use CSS instead of JS for animations where possible
- Preload critical assets (fonts, hero image)

---

## SEO Requirements

```html
<head>
  <title>Local Farmers Markets | Fresh Food From Local Vendors</title>
  <meta name="description" content="Discover fresh, local food from nearby farmers and artisans. Browse products, pre-order online, and pick up at your favorite farmers market." />
  <meta property="og:title" content="Local Farmers Markets | Fresh Food From Local Vendors" />
  <meta property="og:description" content="Shop fresh, local products from farmers markets in your area." />
  <meta property="og:image" content="[OG_IMAGE_URL]" />
  <meta property="og:type" content="website" />
  <link rel="canonical" href="https://yourdomain.com/farmers_market" />
</head>
```

**Schema.org markup:** Add LocalBusiness schema for markets

---

## Mobile-Specific Considerations

1. **Touch Targets:** Minimum 44x44px for all tappable elements
2. **Form Inputs:** Large enough for thumbs (48px height minimum)
3. **Font Sizes:** No body text smaller than 16px (prevents zoom on iOS)
4. **Spacing:** Generous padding/margin (minimum 16px between elements)
5. **Navigation:** Easy access to key actions (browse, sign up)
6. **Images:** Serve appropriately sized images for mobile bandwidth

---

## Testing Checklist

Before launch:
- [ ] Test on iPhone (Safari) at 375px width
- [ ] Test on Android (Chrome) at 360px width
- [ ] Test on iPad at 768px width
- [ ] Test on desktop at 1024px, 1440px, 1920px
- [ ] Test with slow 3G connection
- [ ] Test with screen reader (VoiceOver or NVDA)
- [ ] Test keyboard navigation (Tab through all elements)
- [ ] Validate HTML (no errors)
- [ ] Check Lighthouse score (aim for 90+ on all metrics)
- [ ] Cross-browser test (Chrome, Firefox, Safari, Edge)

---

## Implementation Notes for CC

1. **File Location:** Create new page at `apps/web/src/app/farmers_market/page.tsx`
2. **Component Structure:** Break into logical components (Hero, Features, Testimonials, etc.)
3. **Data Fetching:** Use Server Components where possible for SEO
4. **Images:** Store in `public/images/landing/` directory
5. **Reusable Components:** Create in `src/components/landing/`
6. **Existing Components:** Reuse Button, Card, etc. from component library
7. **Dynamic Content:** Pull stats from database (market count, user count, etc.)
8. **Featured Markets:** Query markets table with location filtering if available
9. **Environment Check:** Show different CTAs based on auth state

---

## Future Enhancements (Post-Launch)

- A/B test different hero headlines
- Add video background option for hero
- Integrate customer testimonials from database
- Add blog/news section
- Seasonal promotions banner
- Market spotlight carousel
- Vendor success stories
- Mobile app download links
- Email newsletter signup
- Live market schedule updates
- Weather integration (show if market is open today)

---

**END OF DESIGN SPECIFICATION**
