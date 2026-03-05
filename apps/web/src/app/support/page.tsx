import Link from 'next/link'

export default function SupportHub() {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#f8f9fa',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      {/* Navigation */}
      <nav style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '20px 40px',
        backgroundColor: 'white',
        borderBottom: '1px solid #eee'
      }}>
        <Link href="/" style={{ fontSize: 24, fontWeight: 'bold', color: '#333', textDecoration: 'none' }}>
          815 Enterprises
        </Link>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <Link href="/terms" style={{ color: '#666', textDecoration: 'none' }}>Terms &amp; Privacy</Link>
        </div>
      </nav>

      {/* Header */}
      <section style={{
        padding: '60px 40px',
        textAlign: 'center',
        backgroundColor: 'white'
      }}>
        <h1 style={{ fontSize: 36, fontWeight: 'bold', marginBottom: 16, color: '#222' }}>
          Support
        </h1>
        <p style={{ fontSize: 18, color: '#666', maxWidth: 600, margin: '0 auto', lineHeight: 1.6 }}>
          Need help? Choose your platform below to reach the right support team, or contact us directly for general inquiries.
        </p>
      </section>

      {/* Platform Support Links */}
      <section style={{ padding: '60px 40px', maxWidth: 800, margin: '0 auto' }}>
        <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 30, color: '#333' }}>
          Platform Support
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Farmers Marketing */}
          <Link
            href="/farmers_market/support"
            style={{
              display: 'block',
              padding: 24,
              backgroundColor: 'white',
              border: '2px solid #2d4a5e',
              borderRadius: 12,
              textDecoration: 'none',
            }}
          >
            <h3 style={{ color: '#2d4a5e', fontSize: 20, marginBottom: 8 }}>
              Farmers Marketing Support
            </h3>
            <p style={{ color: '#555', margin: 0, lineHeight: 1.6 }}>
              Get help with orders, vendor accounts, market boxes, and everything related to the Farmers Marketing platform.
            </p>
            <span style={{ display: 'inline-block', marginTop: 12, color: '#2d4a5e', fontWeight: 600 }}>
              Go to Support →
            </span>
          </Link>

          {/* Food Truck'n */}
          <Link
            href="/food_trucks/support"
            style={{
              display: 'block',
              padding: 24,
              backgroundColor: 'white',
              border: '2px solid #ff5757',
              borderRadius: 12,
              textDecoration: 'none',
            }}
          >
            <h3 style={{ color: '#ff5757', fontSize: 20, marginBottom: 8 }}>
              Food Truck&apos;n Support
            </h3>
            <p style={{ color: '#555', margin: 0, lineHeight: 1.6 }}>
              Get help with orders, vendor accounts, chef boxes, and everything related to the Food Truck&apos;n platform.
            </p>
            <span style={{ display: 'inline-block', marginTop: 12, color: '#ff5757', fontWeight: 600 }}>
              Go to Support →
            </span>
          </Link>
        </div>

        {/* General Contact */}
        <div style={{ marginTop: 40, padding: 24, backgroundColor: 'white', borderRadius: 12, border: '1px solid #e5e7eb' }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: '#333' }}>
            General Inquiries
          </h3>
          <p style={{ color: '#555', lineHeight: 1.8, margin: '0 0 16px 0' }}>
            For business inquiries, partnerships, or questions not specific to a single platform, contact us directly:
          </p>
          <a
            href="mailto:contact@815enterprises.com"
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              backgroundColor: '#333',
              color: 'white',
              textDecoration: 'none',
              borderRadius: 8,
              fontWeight: 600
            }}
          >
            contact@815enterprises.com
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        padding: '30px 40px',
        backgroundColor: '#222',
        color: '#888',
        textAlign: 'center'
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginBottom: 15, fontSize: 14 }}>
          <Link href="/terms" style={{ color: '#aaa', textDecoration: 'none' }}>Terms &amp; Privacy</Link>
          <Link href="/support" style={{ color: '#aaa', textDecoration: 'none' }}>Support</Link>
        </div>
        <p style={{ fontSize: 14, margin: 0 }}>
          &copy; 2026 VIIIXV LLC d/b/a 815 Enterprises. All rights reserved.
        </p>
      </footer>
    </div>
  )
}
