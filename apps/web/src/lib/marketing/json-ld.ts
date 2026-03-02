/**
 * JSON-LD Structured Data generators for SEO
 *
 * Generates schema.org structured data for Google Rich Results.
 * Used in server components via <script type="application/ld+json">.
 */

interface VendorProfileJsonLdParams {
  name: string
  url: string
  description?: string | null
  imageUrl?: string | null
  averageRating?: number | null
  ratingCount?: number | null
  socialLinks?: Record<string, string> | null
}

export function vendorProfileJsonLd(params: VendorProfileJsonLdParams): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: params.name,
    url: params.url,
  }

  if (params.description) {
    schema.description = params.description
  }

  if (params.imageUrl) {
    schema.image = params.imageUrl
  }

  if (params.ratingCount && params.ratingCount > 0 && params.averageRating) {
    schema.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: params.averageRating.toFixed(1),
      reviewCount: params.ratingCount,
      bestRating: 5,
      worstRating: 1,
    }
  }

  const sameAs: string[] = []
  if (params.socialLinks) {
    if (params.socialLinks.facebook) sameAs.push(params.socialLinks.facebook)
    if (params.socialLinks.instagram) sameAs.push(params.socialLinks.instagram)
    if (params.socialLinks.website) sameAs.push(params.socialLinks.website)
  }
  if (sameAs.length > 0) {
    schema.sameAs = sameAs
  }

  return schema
}

interface ListingJsonLdParams {
  name: string
  description?: string | null
  imageUrl?: string | null
  url: string
  priceCents: number
  quantity?: number | null
  category?: string | null
  vendorName: string
}

export function listingJsonLd(params: ListingJsonLdParams): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: params.name,
    url: params.url,
    offers: {
      '@type': 'Offer',
      price: (params.priceCents / 100).toFixed(2),
      priceCurrency: 'USD',
      availability: params.quantity === 0
        ? 'https://schema.org/OutOfStock'
        : 'https://schema.org/InStock',
      seller: {
        '@type': 'LocalBusiness',
        name: params.vendorName,
      },
    },
  }

  if (params.description) {
    schema.description = params.description
  }

  if (params.imageUrl) {
    schema.image = params.imageUrl
  }

  if (params.category) {
    schema.category = params.category
  }

  return schema
}

interface MarketBoxJsonLdParams {
  name: string
  description?: string | null
  imageUrl?: string | null
  url: string
  priceCents: number
  vendorName: string
}

export function marketBoxJsonLd(params: MarketBoxJsonLdParams): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: params.name,
    ...(params.description && { description: params.description }),
    ...(params.imageUrl && { image: params.imageUrl }),
    url: params.url,
    category: 'Subscription Box',
    offers: {
      '@type': 'Offer',
      price: (params.priceCents / 100).toFixed(2),
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      seller: {
        '@type': 'LocalBusiness',
        name: params.vendorName,
      },
    },
  }
}

// --- SEO Structured Data for Informational Pages ---

/** FAQPage schema — expandable Q&A in Google search results */
export function faqPageJsonLd(
  questions: Array<{ question: string; answer: string }>
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map(q => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: q.answer,
      },
    })),
  }
}

/** HowTo schema — numbered step cards in Google search results */
export function howToJsonLd(params: {
  name: string
  description: string
  steps: Array<{ name: string; text: string }>
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: params.name,
    description: params.description,
    step: params.steps.map((s, i) => ({
      '@type': 'HowToStep',
      position: i + 1,
      name: s.name,
      text: s.text,
    })),
  }
}

/** Organization schema — brand identity in Knowledge Panel */
export function organizationJsonLd(params: {
  name: string
  url: string
  logo?: string
  description?: string
  sameAs?: string[]
  areaServed?: string[]
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: params.name,
    url: params.url,
    ...(params.logo && { logo: params.logo }),
    ...(params.description && { description: params.description }),
    ...(params.sameAs && params.sameAs.length > 0 && { sameAs: params.sameAs }),
    ...(params.areaServed && params.areaServed.length > 0 && {
      areaServed: params.areaServed.map(area => ({
        '@type': 'City',
        name: area,
      })),
    }),
  }
}

/** WebSite schema — tells Google this is a searchable website */
export function webSiteJsonLd(params: {
  name: string
  url: string
  description?: string
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: params.name,
    url: params.url,
    ...(params.description && { description: params.description }),
  }
}

/** BreadcrumbList schema — site hierarchy in search results */
export function breadcrumbJsonLd(
  items: Array<{ name: string; url: string }>
): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  }
}

/** ItemList schema — list of features/items in search results */
export function itemListJsonLd(params: {
  name: string
  description?: string
  items: Array<{ name: string; description?: string }>
}): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: params.name,
    ...(params.description && { description: params.description }),
    itemListElement: params.items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      ...(item.description && { description: item.description }),
    })),
  }
}
