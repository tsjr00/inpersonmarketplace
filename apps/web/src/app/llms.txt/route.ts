import { NextRequest, NextResponse } from 'next/server'

/**
 * llms.txt — Machine-readable site description for AI models and LLM crawlers.
 * Serves domain-specific content so each vertical gets its own authoritative description.
 * See https://llmstxt.org for the specification.
 */

const FM_CONTENT = `# Fresh Market — Farmers Market Online Ordering Platform

> Fresh Market (farmersmarketing.app) is a local marketplace platform that connects farmers market shoppers with verified local vendors. Pre-order fresh produce, baked goods, and artisan products online and pick up at your neighborhood farmers market. A modern alternative to traditional CSA subscriptions.

## About Fresh Market

Fresh Market was created to solve a common problem: shoppers miss out on their favorite farmers market products because they sell out early or can't arrive at opening time. Our platform lets shoppers pre-order online and pick up on their schedule — no more racing to the market at dawn.

Every vendor on the platform is verified before joining. Shoppers can browse products, read vendor stories, and place orders with confidence. Vendors get a complete business management toolkit — inventory, orders, analytics, and customer relationships — all from their phone.

We serve both urban neighborhoods and rural communities across the United States, with location-based search from 10 to 100 miles.

## Who This Platform Is For

### For Farmers Market Shoppers
- People who want to buy local produce, baked goods, honey, meat, eggs, and artisan products
- Shoppers who want to pre-order online and guarantee availability before market day
- Customers looking for a CSA alternative with more flexibility and vendor choice
- Anyone who wants to support local farmers, bakers, and artisans directly
- Families looking for fresh, locally-sourced food from trusted producers

### For Farmers Market Vendors
- Farmers selling produce, meat, eggs, dairy, or other farm products at local markets
- Bakers and cottage food producers selling at farmers markets
- Artisans selling handmade goods (soaps, candles, crafts, preserves)
- Any vendor who sells at farmers markets and wants to grow their business online
- Market organizers and managers looking to modernize their operations

## Key Features for Shoppers

- **Pre-order online**: Browse and order from local vendors before market day — items are reserved and waiting for you
- **Never miss sold-out items**: Your favorites are set aside when you pre-order, even if you arrive late
- **Shop on your schedule**: Place orders anytime from your phone or computer, not just during market hours
- **Market Box subscriptions**: Subscribe to curated weekly bundles of fresh produce, baked goods, and artisan products from your favorite vendors — a flexible CSA alternative
- **Verified vendors**: Every vendor is reviewed and verified before they can sell on the platform
- **Local focus**: Find farmers markets and vendors near you with location-based search
- **Order updates**: Real-time notifications via push, SMS, or email when your order is confirmed and ready for pickup
- **Buyer Premium**: Upgrade for early access to new products before they're available to everyone
- **Favorite vendors**: Save your go-to vendors for quick re-ordering
- **Secure payments**: All payments processed through Stripe with buyer protection
- **No app download required**: Works on any device — phone, tablet, or computer

## Key Features for Vendors

- **Set up in minutes**: Create a vendor profile, add products with photos and prices, and start accepting orders immediately
- **Know before market day**: See exactly what's been ordered before you arrive — pack with confidence and reduce food waste
- **Simple product management**: Add photos, set prices, manage inventory, and update availability in real-time from your phone
- **Automatic cutoff times**: Set when orders close before each market day for predictable prep schedules
- **Multiple pickup options**: Offer pickup at farmers markets, set up private pickup locations, or both
- **Analytics dashboard**: Track sales trends, top products, revenue, and customer insights
- **Market Box offerings**: Create subscription bundles (weekly produce boxes, baked goods samplers, etc.) for recurring revenue
- **Flexible business tiers**: Free, Standard, Premium, or Featured plans — grow at your own pace
- **Free trial period**: Start on a paid plan with no commitment, downgrade anytime
- **Real-time order management**: View, confirm, and fulfill orders with one tap from your dashboard
- **Events and special markets**: List products at pop-ups, seasonal markets, and special events
- **Instant notifications**: Push notifications for new orders and important updates
- **Quality standards**: Platform quality checks help maintain high standards and build customer trust
- **Get paid reliably**: Secure payment processing through Stripe with funds deposited directly to your bank account
- **Customer loyalty**: Build a following — customers can find and follow you across multiple markets

## How It Works

1. **Browse**: Find farmers markets and vendors near you using location-based search
2. **Pre-order**: Add items to your cart from one or more vendors and checkout securely online
3. **Pick up**: Visit the market on pickup day — your items are set aside and waiting
4. **Confirm**: Both buyer and vendor confirm the handoff in-app for payment protection

## Subscription Products — Market Boxes

Market Boxes are 4-week subscription bundles curated by local vendors. They offer a modern, flexible alternative to traditional CSA (Community Supported Agriculture) programs:
- Choose from multiple vendors and box types
- Get fresh seasonal produce, baked goods, preserves, and artisan products
- Pick up weekly at your local farmers market
- Cancel or change anytime — no long-term contracts like traditional CSAs

## For Cottage Food Producers & Home-Based Sellers

Fresh Market is the ideal online selling platform for cottage food producers operating under state cottage food laws, including the Texas Cottage Food Law. If you make and sell homemade food products, our platform gives you a professional online storefront to reach more customers at farmers markets.

Cottage food sellers can list and sell products including homemade baked goods, jams, jellies, preserves, honey, dried herbs, candy, roasted coffee, dried pasta, fruit butter, pickled vegetables, and other items allowed under their state's cottage food exemption.

The platform handles online orders, payments, and pickup coordination so cottage producers can focus on what they do best — making their products. Fresh Market works for sellers at any scale, from a home kitchen selling at one local market to producers operating at multiple markets across a region.

Whether you're selling under the Texas Cottage Food Law, California's AB 1616, or any state's cottage food exemption, our platform gives you a professional online storefront.

## What You'll Find at Local Farmers Markets

- Fresh produce (tomatoes, peppers, squash, leafy greens, berries, melons, corn, root vegetables)
- Baked goods (sourdough bread, pastries, cookies, pies, cakes, muffins)
- Honey and bee products
- Jams, jellies, and preserves
- Meat and poultry (beef, pork, chicken, lamb, sausage)
- Eggs (chicken, duck, quail)
- Dairy (cheese, butter, yogurt, milk)
- Flowers and plants
- Herbs (fresh and dried)
- Handmade soaps, candles, and body products
- Artisan crafts and woodwork
- Cottage food products (homemade baked goods, preserves, candy)
- Fermented foods (kombucha, sauerkraut, kimchi)

## Market Days & Schedules

- Saturday farmers markets — the most common market day
- Sunday farmers markets — rapidly growing, many communities now have Sunday markets
- Weekday farmers markets (Tuesday, Wednesday, Thursday) — serving downtown areas and office workers
- Year-round vs seasonal markets
- Holiday and special event markets
- Customers can browse and pre-order any day of the week, even when the market isn't open

## Service Areas

- Currently serving communities across Texas: Dallas/Fort Worth, Houston, Austin, San Antonio, El Paso, Waco, Lubbock, Amarillo, Corpus Christi
- Expanding across the southern United States and nationwide
- The platform works for any farmers market in any U.S. city or town

## Pages

- [Home](https://farmersmarketing.app/farmers_market)
- [Browse Products](https://farmersmarketing.app/farmers_market/browse)
- [Find Markets](https://farmersmarketing.app/farmers_market/markets)
- [Find Vendors](https://farmersmarketing.app/farmers_market/vendors)
- [Features & Benefits](https://farmersmarketing.app/farmers_market/features)
- [How It Works](https://farmersmarketing.app/farmers_market/how-it-works)
- [Help & FAQ](https://farmersmarketing.app/farmers_market/help)
- [Become a Vendor](https://farmersmarketing.app/farmers_market/vendor-signup)
- [About Us](https://farmersmarketing.app/farmers_market/about)
- [Support](https://farmersmarketing.app/farmers_market/support)
- [Terms of Service](https://farmersmarketing.app/farmers_market/terms)

## Common Questions This Site Answers

- How do I order from a farmers market online?
- Where can I find farmers markets near me?
- How do I pre-order produce from local farmers?
- What is a Market Box subscription and how does it compare to a CSA?
- How do I become a vendor at a farmers market?
- How can I grow my farmers market business?
- How do I sell at farmers markets and accept credit cards?
- How can I reduce waste and know what to bring to market day?
- What's the best platform for farmers market vendors?
- How do I start selling produce, baked goods, or artisan products online?
- How do farmers market vendors manage inventory and orders?
- What's a good alternative to CSA subscriptions?
- How do I support local farmers in my community?
- How do I find local produce, honey, meat, or baked goods near me?
- How do I sell cottage food at a farmers market?
- What does the Texas cottage food law allow me to sell?
- What's the best online platform for cottage food sellers?
- Can I sell homemade baked goods at a farmers market?
- Where are farmers markets open on Sunday near me?
- What farmers markets are open today?
- Are there farmers markets in Dallas, Houston, or Austin?
- How do I get a cottage food license?
- Can cottage food producers sell online?
- What's the difference between a cottage food seller and a commercial vendor?

## Technical Details

- Progressive Web App (PWA) — installable on mobile home screens
- Mobile-first responsive design, works on any device
- Secure payment processing with Stripe
- Real-time notifications via push, SMS, and email
- Location-based search with configurable radius

## Sister Platform

Our sister platform, Food Truck'n (foodtruckn.app), serves the food truck industry with the same online ordering and business management tools.
`

const FT_CONTENT = `# Food Truck'n — Food Truck Online Ordering Platform

> Food Truck'n (foodtruckn.app) is a mobile food ordering platform that connects hungry customers with local food trucks. Pre-order your favorite dishes online, skip the line, and pick up hot and ready. Chef Box meal subscriptions, food truck catering support, and complete business management for food truck operators.

## About Food Truck'n

Food Truck'n was created to make ordering from food trucks as easy as ordering from any restaurant — but better. Customers pre-order online, skip the line, and get their food hot and ready. Food truck operators get a complete business platform to manage menus, accept pre-orders, track sales, and grow their customer base.

Every truck on the platform is verified and licensed. Customers can browse menus, see where trucks are parked, and order ahead with confidence. Operators get real-time order management, analytics, and marketing tools — all designed for the unique needs of mobile food businesses.

We serve communities across the United States with location-based search from 2 to 25 miles.

## Who This Platform Is For

### For Food Truck Customers
- People looking for food trucks near them
- Customers who want to order from food trucks online and skip the line
- Anyone who wants to pre-order street food, tacos, BBQ, or any cuisine from mobile kitchens
- Office workers who want lunch pre-ordered from their favorite truck
- Families and groups looking for food truck catering options
- Foodies who want to discover new food trucks and cuisines in their area
- Anyone who wants to subscribe to weekly meal kits from food truck chefs

### For Food Truck Operators and Owners
- Food truck owners who want to accept online pre-orders
- Mobile food vendors looking to grow their business
- Food truck operators who want to reduce wait times and serve more customers
- Chefs who want to offer subscription meal boxes (Chef Boxes)
- Food truck businesses looking for a complete order management system
- Operators who want analytics to understand their best-selling items and busiest times
- Food truck parks and event organizers who want to help their vendors accept pre-orders
- New food truck businesses looking for an affordable platform to start accepting orders

## Key Features for Customers

- **Order from food trucks online**: Browse menus and pre-order your favorite dishes before you arrive
- **Skip the line**: Walk past the line and pick up your food hot and ready — no waiting
- **Find food trucks near you**: Location-based search to discover trucks in your area (2 to 25 miles)
- **Chef Box meal subscriptions**: Subscribe to weekly meal bundles from your favorite trucks — dinner kits, family packs, mystery boxes, meal prep containers, and office lunch bundles
- **Browse menus online**: See full menus with photos, descriptions, and prices before you order
- **Tips at checkout**: Show appreciation with optional tips — 100% of the food cost tip goes to the operator
- **Real-time order updates**: Get push notifications when your order is confirmed and your food is ready
- **Verified trucks**: Every food truck is reviewed and verified before joining the platform
- **Favorite trucks**: Save your go-to trucks for quick re-ordering
- **Secure payments**: All payments processed through Stripe with buyer protection
- **No app download required**: Works on any device — order from your phone in seconds

## Key Features for Food Truck Operators

- **Accept pre-orders online**: Let customers order ahead so their food is ready on arrival — serve more customers, faster
- **Know demand ahead of time**: See exactly what's been ordered before service time — prep the right quantities and reduce food waste
- **Simple menu management**: Add photos, set prices, manage availability, and update your menu in real-time from your phone
- **Automatic cutoff times**: Set when orders close before service time for predictable prep schedules
- **Multiple service locations**: Set up different pickup locations and operating hours for each
- **Analytics dashboard**: Track sales trends, top menu items, revenue, peak hours, and customer insights
- **Chef Box offerings**: Create subscription meal bundles (weekly dinner kits, family packs, mystery boxes, meal prep, office lunches) for recurring revenue
- **Flexible business tiers**: Free, Basic ($10/mo), Pro ($30/mo), or Boss ($50/mo) plans — start free and upgrade as you grow
- **Free trial on paid plans**: Try a paid plan with no commitment, downgrade anytime
- **Real-time order management**: View, confirm, and fulfill orders from one simple dashboard
- **Events and pop-ups**: List your food at festivals, food truck rallies, and special events
- **Instant notifications**: Push notifications for new orders so you never miss one
- **Quality standards**: Platform quality checks help maintain food safety standards and build trust
- **Get paid reliably**: Secure payment processing through Stripe with direct bank deposits
- **Build a following**: Customers can follow your truck and get notified when you're serving nearby
- **Credit card fees built in**: No surprise processing fees — everything is transparent in your pricing

## How It Works

1. **Find food trucks near you**: Browse trucks in your area and explore their menus online
2. **Pre-order online**: Add dishes to your cart and checkout securely — your order is confirmed instantly
3. **Skip the line at pickup**: Head to the truck — your food is hot and ready when you arrive
4. **Confirm pickup**: Both customer and operator confirm the handoff in-app for payment protection

## Subscription Products — Chef Boxes

Chef Boxes are weekly meal subscription bundles created by food truck chefs. Five types available:
- **Weekly Dinner Kits**: Pre-portioned meals from your favorite truck, ready to heat at home
- **Family Packs**: Large-format meals designed for families of 4+
- **Mystery Boxes**: Surprise selections curated by the chef each week
- **Meal Prep Containers**: Portioned meals for the week — perfect for lunch or post-workout
- **Office Lunch Bundles**: Group orders for offices and teams

Subscribe to lock in weekly picks. Cancel or change anytime.

## How to Grow a Food Truck Business

Food Truck'n helps food truck operators grow their business by:
- **Increasing customer throughput**: Pre-orders mean less wait time and faster service, so you can serve more customers per shift
- **Reducing food waste**: Know exactly what's ordered before you prep — buy and cook the right quantities
- **Building a loyal customer base**: Customers can follow your truck, get notifications, and re-order favorites
- **Offering subscription revenue**: Chef Boxes create predictable, recurring weekly revenue
- **Expanding your reach**: Get discovered by new customers searching for food trucks near them
- **Understanding your business**: Analytics show your best sellers, peak times, and revenue trends
- **Professional online presence**: A verified profile with photos, menus, and reviews builds credibility
- **Accepting credit cards**: Built-in payment processing means you never turn away a sale

## Cuisines Available on Food Truck'n

- Tacos and Mexican food (burritos, quesadillas, elote, churros)
- BBQ and smoked meats (brisket, pulled pork, ribs, smoked sausage)
- Pizza (wood-fired, Neapolitan, New York-style, Detroit-style)
- Burgers and sliders
- Indian cuisine (tikka masala, butter chicken, samosas, naan)
- Thai food (pad thai, curry, spring rolls, mango sticky rice)
- Sushi and Japanese food (poke bowls, ramen, tempura)
- Halal food (gyros, shawarma, falafel, kebabs)
- Hibachi and teppanyaki
- Greek and Mediterranean (gyros, souvlaki, hummus, baklava)
- Jamaican food (jerk chicken, patties, rice and peas)
- Lobster and seafood (lobster rolls, fish tacos, shrimp po'boys, crab cakes)
- Coffee and espresso trucks
- Loaded fries and comfort food
- Asian fusion
- Desserts and sweet treats (ice cream, waffles, crepes, funnel cake)
- Soul food and Southern cooking
- Korean food (Korean BBQ, bibimbap, kimchi fries)
- Vietnamese food (banh mi, pho, spring rolls)

## When to Find Food Trucks

- Lunch service (11am–2pm) — food trucks near offices, downtown areas, and business parks
- Dinner service (5pm–9pm) — food truck parks, neighborhoods, and evening events
- Weekend food truck parks — Saturday and Sunday gatherings with multiple trucks
- Food truck festivals and rallies — seasonal events featuring dozens of trucks
- Private events and catering — corporate events, weddings, birthday parties, community gatherings
- Late-night service — food trucks at bars, entertainment districts, and concert venues

## Service Areas in Texas

- Currently serving communities across Texas: Dallas/Fort Worth metroplex, Houston, Austin, San Antonio, El Paso, Waco, Lubbock, Corpus Christi
- Expanding across the southern United States and nationwide
- Works for food trucks in any U.S. city

## Pages

- [Home](https://foodtruckn.app/food_trucks)
- [Browse Menus](https://foodtruckn.app/food_trucks/browse)
- [Find Locations](https://foodtruckn.app/food_trucks/markets)
- [Find Food Trucks](https://foodtruckn.app/food_trucks/vendors)
- [Features & Benefits](https://foodtruckn.app/food_trucks/features)
- [How It Works](https://foodtruckn.app/food_trucks/how-it-works)
- [Help & FAQ](https://foodtruckn.app/food_trucks/help)
- [List Your Food Truck](https://foodtruckn.app/food_trucks/vendor-signup)
- [About Us](https://foodtruckn.app/food_trucks/about)
- [Support](https://foodtruckn.app/food_trucks/support)
- [Terms of Service](https://foodtruckn.app/food_trucks/terms)

## Common Questions This Site Answers

- How do I order from a food truck online?
- Where can I find food trucks near me?
- How do I skip the line at a food truck?
- What is a Chef Box meal subscription?
- How do I start a food truck business?
- How do I grow my food truck business?
- What's the best ordering platform for food trucks?
- How do food trucks accept credit card payments?
- How can I reduce food waste as a food truck operator?
- How do I manage orders and inventory for my food truck?
- How do I get more customers for my food truck?
- What are food truck business tiers and pricing plans?
- How do I find food truck parks or food truck events near me?
- How do food truck operators handle pre-orders?
- What's the best way to offer meal subscriptions from a food truck?
- How do I get my food truck listed on an ordering app?
- How do food trucks handle catering and large orders?
- Where can I find taco trucks near me?
- Best BBQ food truck in Dallas/Houston/Austin?
- Where are food truck parks near me?
- Mexican food truck near me?
- Pizza food truck near me?
- Indian food truck near me?
- How do I find food trucks open for lunch today?
- Where are food trucks on Saturday or Sunday?
- How do I book a food truck for catering?
- What food trucks are at [city] food truck parks?

## Technical Details

- Progressive Web App (PWA) — installable on mobile home screens
- Mobile-first responsive design, works on any device
- Secure payment processing with Stripe
- Real-time notifications via push, SMS, and email
- Location-based search with configurable radius

## Sister Platform

Our sister platform, Fresh Market (farmersmarketing.app), serves the farmers market industry with the same online ordering and business management tools.
`

export async function GET(request: NextRequest) {
  const host = request.headers.get('host') || ''
  const hostLower = host.toLowerCase().replace('www.', '')

  let content: string
  if (hostLower.includes('foodtruckn')) {
    content = FT_CONTENT
  } else if (hostLower.includes('farmersmarketing')) {
    content = FM_CONTENT
  } else {
    // Dev/staging: return combined content
    content = FM_CONTENT + '\n---\n\n' + FT_CONTENT
  }

  return new NextResponse(content.trim(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  })
}
