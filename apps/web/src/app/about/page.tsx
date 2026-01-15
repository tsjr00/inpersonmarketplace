import Footer from '@/components/shared/Footer'
import Link from 'next/link'

export default function AboutPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        padding: '16px 20px',
        borderBottom: '1px solid #e5e7eb',
        backgroundColor: 'white'
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <Link href="/" style={{ fontSize: 20, fontWeight: 700, color: '#111827', textDecoration: 'none' }}>
            815 Enterprises
          </Link>
        </div>
      </header>

      <main style={{ flex: 1, maxWidth: 800, margin: '40px auto', padding: '0 20px' }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 24, color: '#111827' }}>
          About 815 Enterprises
        </h1>
        <div style={{ color: '#4b5563', fontSize: 16, lineHeight: 1.8 }}>
          <p style={{ marginBottom: 20 }}>
            815 Enterprises provides specialized platform solutions for in-person marketplace businesses.
            We connect vendors with local customers through industry-specific marketplaces.
          </p>
          <p style={{ marginBottom: 20 }}>
            Our mission is to empower local vendors with the tools they need to reach customers
            and grow their businesses efficiently.
          </p>
          <p style={{ marginBottom: 20 }}>
            <strong>Contact:</strong> For inquiries, please reach out through our marketplace platforms.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  )
}
