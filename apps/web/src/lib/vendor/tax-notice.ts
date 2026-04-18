/**
 * Returns vertical- and category-specific tax guidance for vendor signup.
 * Shared between vendor-signup page 2 and the success page fallback.
 */
export function getTaxNotice(vertical: string, vendorType: string): { title: string; message: string } | null {
  if (vertical === 'food_trucks') {
    return {
      title: 'Sales Tax Reminder',
      message: 'Prepared food sold for immediate consumption is subject to Texas sales tax. Sales tax will be automatically applied to your listings. Please ensure you have a Texas sales tax permit and are prepared to collect and remit sales tax in accordance with Texas Comptroller guidelines.',
    }
  }
  if (vertical !== 'farmers_market' || !vendorType) return null

  const type = vendorType.toLowerCase()
  if (type.includes('produce') || type.includes('dairy')) {
    return {
      title: 'Sales Tax Information',
      message: 'Fresh produce, dairy, and eggs sold for home consumption are generally exempt from Texas sales tax. However, if you also sell prepared foods, baked goods for immediate consumption, or non-food items, those may be subject to sales tax. You will set the tax status per item when creating listings. Please make sure you understand the tax rules that apply to your products and are prepared to comply with all applicable Texas tax laws.',
    }
  }
  if (type.includes('meat')) {
    return {
      title: 'Sales Tax Information',
      message: 'Raw and frozen meats sold for home consumption are generally exempt from Texas sales tax. However, cooked or ready-to-eat meat products (e.g., smoked brisket plates, rotisserie chicken) are taxable as prepared food. You will set the tax status per item when creating listings. Please ensure you understand which of your products are taxable and are prepared to comply with all applicable Texas tax laws.',
    }
  }
  if (type.includes('baked')) {
    return {
      title: 'Sales Tax Information',
      message: 'Baked goods sold for home consumption (loaves of bread, bags of cookies, whole pies) are generally exempt from Texas sales tax. However, items sold as individual servings for immediate consumption (a slice of pie with a fork, a cupcake with a napkin) are taxable. You will set the tax status per item when creating listings. Please ensure you understand the distinction and are prepared to comply with all applicable Texas tax laws.',
    }
  }
  if (type.includes('prepared')) {
    return {
      title: 'Sales Tax Reminder',
      message: 'Prepared foods sold for immediate consumption are subject to Texas sales tax. This includes hot foods, foods served with utensils, and foods sold at booths with seating. Sales tax will be automatically applied to your listings in this category. Please ensure you have a Texas sales tax permit and are prepared to collect and remit sales tax in accordance with Texas Comptroller guidelines.',
    }
  }
  // "Other" or unrecognized
  return {
    title: 'Sales Tax Information',
    message: 'Texas sales tax rules vary by product type. Food items sold for home consumption are generally exempt, while prepared foods, plants, crafts, and non-food items are typically taxable. You will set the tax status per item when creating your listings. Please make sure you understand the tax rules that apply to your specific products and are prepared to comply with all applicable Texas tax laws.',
  }
}
