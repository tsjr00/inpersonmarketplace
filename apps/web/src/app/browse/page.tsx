import { redirect } from 'next/navigation'
import { getServerDomainConfig } from '@/lib/domain/server'

export default async function BrowsePage() {
  const domainConfig = await getServerDomainConfig()

  if (!domainConfig.verticalId) {
    // Multi-vertical domain - need to specify vertical
    redirect('/')
  }

  // Redirect to the vertical-specific browse
  redirect(`/${domainConfig.verticalId}/browse`)
}
