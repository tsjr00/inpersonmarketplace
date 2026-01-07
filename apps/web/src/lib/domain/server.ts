import { headers } from 'next/headers'
import { getDomainConfig, DomainConfig } from './config'

export async function getServerDomainConfig(): Promise<DomainConfig> {
  const headersList = await headers()
  const host = headersList.get('host') || 'localhost:3002'
  return getDomainConfig(host)
}
