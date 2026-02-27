import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: "Food Truck'n App - Coming Soon!",
  description:
    "Sign up for early access to the Food Truck'n app. Grow your food truck business with our platform.",
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
