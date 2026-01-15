import Footer from '@/components/shared/Footer'
import Link from 'next/link'

export default function PrivacyPage() {
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
          Privacy Policy
        </h1>
        <div style={{ color: '#4b5563', fontSize: 16, lineHeight: 1.8 }}>
          <p style={{ marginBottom: 20 }}><em>Last updated: January 2026</em></p>
          <p style={{ marginBottom: 20 }}>
            815 Enterprises is committed to protecting your privacy.
          </p>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 32, marginBottom: 16, color: '#111827' }}>
            Information We Collect
          </h2>
          <p style={{ marginBottom: 20 }}>
            We collect information you provide directly, including account details and transaction information.
          </p>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginTop: 32, marginBottom: 16, color: '#111827' }}>
            How We Use Information
          </h2>
          <p style={{ marginBottom: 20 }}>
            We use your information to provide and improve our services and process transactions.
          </p>
          <p style={{ marginBottom: 20, marginTop: 40 }}>
            <em>Full privacy policy to be added. Contact us for questions.</em>
          </p>
        </div>
      </main>
      <Footer />
    </div>
  )
}
