export interface DomainConfig {
  domain: string
  verticalId: string | null  // null = show all (umbrella)
  isAdmin: boolean           // admin-only domain
  isUmbrella?: boolean       // umbrella company domain (815enterprises.com)
  brandName: string
  logoPath: string | null
}

export const DOMAIN_CONFIG: Record<string, DomainConfig> = {
  // Production domains
  'fastwrks.com': {
    domain: 'fastwrks.com',
    verticalId: 'fire_works',
    isAdmin: false,
    brandName: 'FastWrks',
    logoPath: '/logos/fastwrks-logo.png'
  },
  'www.fastwrks.com': {
    domain: 'fastwrks.com',
    verticalId: 'fire_works',
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
    isAdmin: false,
    isUmbrella: true,
    brandName: '815 Enterprises',
    logoPath: null
  },
  'www.815enterprises.com': {
    domain: '815enterprises.com',
    verticalId: null,
    isAdmin: false,
    isUmbrella: true,
    brandName: '815 Enterprises',
    logoPath: null
  },
  'foodtruckn.app': {
    domain: 'foodtruckn.app',
    verticalId: 'food_trucks',
    isAdmin: false,
    brandName: "Food Truck'n",
    logoPath: '/logos/street-eats-logo.svg'
  },
  'www.foodtruckn.app': {
    domain: 'foodtruckn.app',
    verticalId: 'food_trucks',
    isAdmin: false,
    brandName: "Food Truck'n",
    logoPath: '/logos/street-eats-logo.svg'
  },
  // Development/Staging
  'localhost:3002': {
    domain: 'localhost:3002',
    verticalId: null,  // Show all on localhost
    isAdmin: false,
    brandName: 'Marketplace Dev',
    logoPath: null
  },
  'inpersonmarketplace.vercel.app': {
    domain: 'inpersonmarketplace.vercel.app',
    verticalId: null,  // Show all on staging
    isAdmin: false,
    brandName: 'Marketplace Staging',
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
