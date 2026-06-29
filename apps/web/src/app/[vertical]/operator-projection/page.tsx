import type { Metadata } from 'next'
import OperatorProjectionTool from '@/components/projection/OperatorProjectionTool'
import { containers, spacing } from '@/lib/design-tokens'

export const metadata: Metadata = {
  title: 'Market Operator Revenue Projection',
  description:
    'Estimate what you could earn operating farmers markets or food truck parks on the platform. An interactive projection — estimates only.',
}

/**
 * Public, unauthenticated revenue-projection tool for prospective Regional
 * Managers AND existing market managers considering a switch to platform booth
 * rentals. Pure client-side math (no DB, no auth) — usable as a marketing /
 * onboarding asset and linked from the market-manager program page.
 */
export default async function OperatorProjectionPage({
  params,
}: {
  params: Promise<{ vertical: string }>
}) {
  const { vertical } = await params
  return (
    <div style={{ maxWidth: containers.lg, margin: '0 auto', padding: spacing.md }}>
      <OperatorProjectionTool vertical={vertical} />
    </div>
  )
}
