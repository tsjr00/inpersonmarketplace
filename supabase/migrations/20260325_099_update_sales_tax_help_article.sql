-- Migration 099: Rewrite sales tax help article to reflect marketplace facilitator status
-- Previous version told vendors they were responsible for collecting and remitting.
-- Under TX Tax Code, 815 Enterprises is the marketplace facilitator and handles
-- sales tax collection and remittance on all marketplace transactions.

UPDATE knowledge_articles
SET body = 'As a marketplace facilitator under Texas law, 815 Enterprises collects and remits applicable sales tax on all transactions processed through the platform. This means you do not need to separately collect sales tax from buyers on orders placed through our marketplace.

This page explains how sales tax works on the platform and what you still need to do as a Texas-based vendor.

## How Sales Tax Works on the Platform

When a buyer places an order through the platform, sales tax is automatically calculated based on:
- **The product category** — some items are taxable and some are exempt under Texas law
- **The pickup location** — Texas sales tax rates vary by city and county (6.25% state base rate plus up to 2% local rate, for a maximum of 8.25%)

The platform adds sales tax as a separate line item at checkout. The buyer pays the tax as part of their total. The platform collects the tax and remits it to the Texas Comptroller on your behalf.

**You do not need to calculate, collect, or remit sales tax on platform transactions.**

## What Is Taxable in Texas?

### Food Trucks — All Items Are Taxable
All prepared food sold for immediate consumption is subject to Texas sales tax. This includes hot foods, cold prepared items, beverages, and any food served with utensils. The platform automatically marks all food truck listings as taxable.

Pre-packaged food items that you did not produce (chips, bottled water, etc.) are not permitted on the platform.

### Farmers Markets — Depends on the Product Category

**Exempt from sales tax (food for home consumption):**
- Fresh produce (fruits, vegetables, herbs)
- Dairy products and eggs
- Pantry items (jams, honey, sauces, pickles)
- Raw and frozen meats (not cooked or heated)
- Baked goods sold for take-home (whole loaves, bags of cookies, whole pies)

**Subject to sales tax:**
- Prepared foods sold for immediate consumption (hot food, individual servings with utensils)
- Plants and flowers
- Health and wellness products (soaps, lotions, candles)
- Art, crafts, and home goods
- Cooked or heated meat products (smoked brisket plates, rotisserie chicken)
- Baked goods sold as individual servings for immediate consumption (slice of pie with a fork)

When you create a listing, the platform automatically determines the tax status based on your product category. For categories where it depends on how the item is served (meat and baked goods), the platform asks a simple question to determine the correct treatment.

## What You Still Need to Do

Even though the platform collects and remits sales tax on marketplace transactions, Texas law requires vendors to:

1. **Maintain a Texas sales tax permit** — You must register with the Texas Comptroller and obtain your own sales tax permit. You can apply for free at the Texas Comptroller website (comptroller.texas.gov). Having a permit does not mean you owe additional tax on platform sales — it is a registration requirement.

2. **Report marketplace sales on your tax return** — When you file your Texas sales tax return, you should report platform sales as marketplace sales. The Texas Comptroller provides specific lines on the return for marketplace provider transactions. These sales are reported but the tax has already been collected and remitted by the platform.

3. **Collect tax on non-platform sales** — If you make sales outside the platform (walk-up cash sales at your booth, direct orders not placed through the app), you are responsible for collecting and remitting sales tax on those transactions yourself.

4. **Keep records** — You are required to maintain sales records for at least as long as applicable federal and state law requires. The platform provides sales reports and analytics in your vendor dashboard that can help with your recordkeeping.

## Using the Platform for Tax Records

- **Sales reports** — Your vendor dashboard shows total sales, taxable vs. non-taxable breakdowns, and sales by date range.
- **Order history** — Every order shows whether tax was collected and the amount.
- **CSV export** — Download your sales data for your accountant or tax records (available on Pro and Boss tier plans).

## Important Notes

- The platform collects and remits Texas sales tax as a marketplace facilitator under Texas Tax Code Section 151.0242.
- Sales tax is calculated on the product price. Platform service fees are separate from the taxable amount.
- Tax rates are determined by the pickup location, not the buyer''s home address.
- The platform''s tax collection applies only to transactions processed through the marketplace. Sales made outside the platform are your responsibility.
- Tax laws can change. The platform updates its tax calculations as required by law. For questions about your specific tax situation, consult a tax professional or contact the Texas Comptroller at 1-800-252-5555.

## Helpful Resources

- Texas Comptroller — Sales Tax: https://comptroller.texas.gov/taxes/sales/
- Texas Comptroller — Marketplace Providers and Sellers: https://comptroller.texas.gov/taxes/sales/marketplace-providers-sellers.php
- Apply for a Sales Tax Permit: https://comptroller.texas.gov/taxes/permit/
- Texas Cottage Food Law FAQ: https://www.dshs.texas.gov/foods/cottage-food-production',
updated_at = NOW()
WHERE title = 'Sales Tax: What Vendors Need to Know' AND vertical_id IS NULL;
