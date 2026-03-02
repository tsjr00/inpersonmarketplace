import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/*/dashboard/',
          '/*/admin/',
          '/*/vendor/',
          '/*/checkout/',
          '/*/order/',
        ],
      },
    ],
    sitemap: [
      'https://farmersmarketing.app/sitemap.xml',
      'https://foodtruckn.app/sitemap.xml',
    ],
  }
}
