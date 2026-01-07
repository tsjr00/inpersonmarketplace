import { redirect } from 'next/navigation'
import { getServerDomainConfig } from '@/lib/domain/server'

export default async function VendorSignupPage() {
  const domainConfig = await getServerDomainConfig()

  if (!domainConfig.verticalId) {
    redirect('/')
  }

  redirect(`/${domainConfig.verticalId}/vendor-signup`)
}
