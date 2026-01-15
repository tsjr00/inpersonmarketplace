import Footer from '@/components/shared/Footer'
import Link from 'next/link'

export default function TermsPage() {
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
          Terms of Service
        </h1>
        <div style={{ color: '#4b5563', fontSize: 16, lineHeight: 1.8 }}>
          <p style={{ marginBottom: 20 }}><em>Last updated: January 2026</em></p>
          <p style={{ marginBottom: 20 }}>
            By using 815 Enterprises marketplace platforms, you agree to these terms of service.
          </p>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 32, marginBottom: 16, color: '#111827' }}>
            1. Acceptance of Terms
          </h2>
          <p style={{ marginBottom: 20 }}>
            By accessing or using our services, you agree to be bound by these Terms of Service.
          </p>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 32, marginBottom: 16, color: '#111827' }}>
            2. Use of Services
          </h2>
          <p style={{ marginBottom: 20 }}>
            Our marketplace connects vendors with buyers for local, in-person transactions.
          </p>
          <p style={{ marginBottom: 20, marginTop: 40 }}>
            <em>Full terms to be added. Contact us for questions.</em>
          </p>
        </div>
      </main>
      <Footer />
    </div>
  )
}
