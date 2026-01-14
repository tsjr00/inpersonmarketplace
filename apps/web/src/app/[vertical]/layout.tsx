import { HeaderWrapper } from '@/components/layout/HeaderWrapper'
import { CartProviderWrapper } from '@/components/cart/CartProviderWrapper'

interface VerticalLayoutProps {
  children: React.ReactNode
  params: Promise<{ vertical: string }>
}

export default async function VerticalLayout({
  children,
  params
}: VerticalLayoutProps) {
  const { vertical } = await params

  return (
    <CartProviderWrapper vertical={vertical}>
      <div style={{ minHeight: '100vh' }}>
        <HeaderWrapper vertical={vertical} />
        <main>{children}</main>
      </div>
    </CartProviderWrapper>
  )
}
