export interface DomainConfig {
  domain: string
  verticalId: string | null  // null = show all (umbrella)
  isAdmin: boolean           // admin-only domain
  brandName: string
  logoPath: string | null
}

export const DOMAIN_CONFIG: Record<string, DomainConfig> = {
  // Production domains
  'fastwrks.com': {
    domain: 'fastwrks.com',
    verticalId: 'fireworks',
    isAdmin: false,
    brandName: 'FastWrks',
    logoPath: '/logos/fastwrks-logo.png'
  },
  'www.fastwrks.com': {
    domain: 'fastwrks.com',
    verticalId: 'fireworks',
    isAdmin: false,
    brandName: 'FastWrks',
    logoPath: '/logos/fastwrks-logo.png'
  },
  'farmersmarketing.app': {
    domain: 'farmersmarketing.app',
    verticalId: 'farmers_market',
    isAdmin: false,
    brandName: 'Farmers Marketing',
    logoPath: '/logos/farmersmarketing-logo.png'
  },
  'www.farmersmarketing.app': {
    domain: 'farmersmarketing.app',
    verticalId: 'farmers_market',
    isAdmin: false,
    brandName: 'Farmers Marketing',
    logoPath: '/logos/farmersmarketing-logo.png'
  },
  '815enterprises.com': {
    domain: '815enterprises.com',
    verticalId: null,
    isAdmin: true,
    brandName: '815 Enterprises',
    logoPath: null
  },
  'www.815enterprises.com': {
    domain: '815enterprises.com',
    verticalId: null,
    isAdmin: true,
    brandName: '815 Enterprises',
    logoPath: null
  },
  // Development/Staging
  'localhost:3002': {
    domain: 'localhost:3002',
    verticalId: null,  // Show all on localhost
    isAdmin: false,
    brandName: 'FastWrks Dev',
    logoPath: null
  },
  'inpersonmarketplace.vercel.app': {
    domain: 'inpersonmarketplace.vercel.app',
    verticalId: null,  // Show all on staging
    isAdmin: false,
    brandName: 'FastWrks Staging',
    logoPath: null
  }
}

export function getDomainConfig(host: string): DomainConfig {
  // Remove port for matching if needed
  const hostWithoutPort = host.split(':')[0]

  return DOMAIN_CONFIG[host] ||
         DOMAIN_CONFIG[hostWithoutPort] ||
         {
           domain: host,
           verticalId: null,
           isAdmin: false,
           brandName: 'Marketplace',
           logoPath: null
         }
}
