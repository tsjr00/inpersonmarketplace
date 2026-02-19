import { HeaderWrapper } from '@/components/layout/HeaderWrapper'
import { CartProviderWrapper } from '@/components/cart/CartProviderWrapper'
import { getVerticalCSSVars } from '@/lib/design-tokens'

// Force dynamic rendering to ensure header always reflects current user
// This prevents caching issues when users switch accounts or duplicate tabs
export const dynamic = 'force-dynamic'

interface VerticalLayoutProps {
  children: React.ReactNode
  params: Promise<{ vertical: string }>
}

export default async function VerticalLayout({
  children,
  params
}: VerticalLayoutProps) {
  const { vertical } = await params
  const cssVars = getVerticalCSSVars(vertical)

  return (
    <CartProviderWrapper vertical={vertical}>
      <div style={{ minHeight: '100vh', background: 'var(--color-surface-base)', ...cssVars } as React.CSSProperties}>
        <HeaderWrapper vertical={vertical} />
        <main>{children}</main>
      </div>
    </CartProviderWrapper>
  )
}
