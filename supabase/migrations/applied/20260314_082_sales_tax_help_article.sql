-- Migration 082: Seed sales tax help article for vendors (both verticals)
-- Global article (vertical_id = NULL) so it appears for FM and FT vendors

INSERT INTO knowledge_articles (vertical_id, category, title, body, sort_order, is_published)
SELECT NULL, 'For Vendors', 'Sales Tax: What Vendors Need to Know',
'As a vendor on our platform, you are responsible for collecting and remitting any applicable sales tax on your transactions. Our platform does not collect or remit sales tax on your behalf.

This page covers the basics for Texas-based vendors. Tax laws vary by state — always consult a tax professional or your state comptroller for guidance specific to your situation.

## What Is Taxable in Texas?

Texas imposes a 6.25% state sales tax (plus up to 2% local tax) on most tangible goods. However, many items sold at farmers markets and by food trucks have specific exemptions.

### Generally EXEMPT (no sales tax):
• Unprocessed fresh fruits and vegetables (whole produce sold as-is)
• Raw eggs sold directly by the producer
• Raw, unprocessed meat and poultry (direct farm-to-consumer sales)
• Live plants, seeds, and seedlings
• Food sold under the Texas Cottage Food Law is still subject to sales tax — the cottage food exemption covers permits and inspections, not tax

### Generally TAXABLE (sales tax applies):
• Baked goods (bread, cookies, cakes, pies)
• Jams, jellies, honey, and preserves
• Prepared foods and ready-to-eat items
• Candy and soft drinks
• Crafts, art, jewelry, and handmade goods
• Clothing, soaps, candles, and non-food items
• All food truck / prepared food sales (hot or cold prepared items)

## Your Responsibilities as a Vendor

1. **Determine if your products are taxable** — Use the checkbox on each listing to mark taxable items. This helps you track taxable vs. non-taxable sales.

2. **Collect sales tax from buyers** — If your item is taxable, you are responsible for including tax in your pricing or collecting it separately at pickup.

3. **Get a Texas Sales Tax Permit** — If you sell taxable items, you must register with the Texas Comptroller for a sales tax permit (free to obtain). Apply at the Texas Comptroller website.

4. **File and remit sales tax** — File returns on the schedule assigned by the Comptroller (monthly, quarterly, or annually based on your volume). Use your Analytics dashboard to see a breakdown of taxable vs. total sales to help with filing.

5. **Keep records** — Maintain records of all sales, including which items were taxable, for at least 4 years.

## Using the Platform to Track Taxable Sales

• **Mark items as taxable** — When creating or editing a listing, check the "This item is subject to sales tax" box.
• **View your tax report** — Go to your Analytics dashboard to see a breakdown of taxable sales vs. total sales for any date range.
• **Export data** — If your plan supports CSV export, download your sales data for your tax records.

## Important Notes

• Our platform is a marketplace that connects vendors with buyers. We do not act as your tax agent.
• The platform fee and buyer convenience fee are separate from sales tax.
• When in doubt about whether your product is taxable, consult the Texas Comptroller or a tax professional.

## Helpful Resources

• Texas Comptroller — Sales Tax: https://comptroller.texas.gov/taxes/sales/
• Texas Cottage Food Law FAQ: https://www.dshs.texas.gov/foods/cottage-food-production
• Apply for a Sales Tax Permit: https://comptroller.texas.gov/taxes/permit/', 20, true
WHERE NOT EXISTS (SELECT 1 FROM knowledge_articles WHERE title = 'Sales Tax: What Vendors Need to Know' AND vertical_id IS NULL);
