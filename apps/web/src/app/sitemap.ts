import { MetadataRoute } from 'next'

const VERTICALS = [
  { id: 'farmers_market', domain: 'https://farmersmarketing.app' },
  { id: 'food_trucks', domain: 'https://foodtruckn.app' },
]

const PUBLIC_PATHS = [
  '',            // homepage
  '/browse',
  '/features',
  '/how-it-works',
  '/help',
  '/about',
  '/terms',
  '/support',
  '/markets',
  '/vendors',
  '/vendor-signup',
]

export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = []

  for (const vertical of VERTICALS) {
    for (const path of PUBLIC_PATHS) {
      entries.push({
        url: `${vertical.domain}/${vertical.id}${path}`,
        lastModified: new Date(),
        changeFrequency: path === '/browse' ? 'daily' : 'weekly',
        priority: path === '' ? 1.0 : path === '/browse' ? 0.9 : 0.7,
      })
    }
  }

  return entries
}
