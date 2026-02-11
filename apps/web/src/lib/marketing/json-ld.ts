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
