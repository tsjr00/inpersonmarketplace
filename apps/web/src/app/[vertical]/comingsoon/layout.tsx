import type { Metadata } from 'next'

interface ComingSoonLayoutProps {
  children: React.ReactNode
  params: Promise<{ vertical: string }>
}

const verticalTitles: Record<string, { title: string; description: string }> = {
  food_trucks: {
    title: "Food Truck'n App - Coming Soon!",
    description: "Sign up for early access to the Food Truck'n app. Grow your food truck business with our platform.",
  },
  farmers_market: {
    title: 'Farmers Marketing - Coming Soon!',
    description: 'Sign up for early access to Farmers Marketing. Make your market day easier.',
  },
}

const defaultTitle = {
  title: 'Coming Soon!',
  description: 'Sign up for early access to our marketplace platform.',
}

export async function generateMetadata({ params }: ComingSoonLayoutProps): Promise<Metadata> {
  const { vertical } = await params
  const meta = verticalTitles[vertical] || defaultTitle
  return {
    title: meta.title,
    description: meta.description,
  }
}

export default function ComingSoonLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        overflowY: 'auto',
        backgroundColor: '#ffffff',
      }}
    >
      {children}
    </div>
  )
}
