import Link from 'next/link'

export default function TermsAndPrivacyHub() {
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
          <Link href="/support" style={{ color: '#666', textDecoration: 'none' }}>Support</Link>
        </div>
      </nav>

      {/* Header */}
      <section style={{
        padding: '60px 40px',
        textAlign: 'center',
        backgroundColor: 'white'
      }}>
        <h1 style={{ fontSize: 36, fontWeight: 'bold', marginBottom: 16, color: '#222' }}>
          Terms &amp; Privacy
        </h1>
        <p style={{ fontSize: 18, color: '#666', maxWidth: 600, margin: '0 auto', lineHeight: 1.6 }}>
          815 Enterprises operates multiple marketplace platforms. Each platform has its own terms of service and privacy policy.
        </p>
      </section>

      {/* Terms of Service Section */}
      <section style={{ padding: '60px 40px 30px', maxWidth: 800, margin: '0 auto' }}>
        <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 30, color: '#333' }}>
          Terms of Service
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Farmers Marketing Terms */}
          <Link
            href="/farmers_market/terms"
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
              Farmers Marketing
            </h3>
            <p style={{ color: '#555', margin: 0, lineHeight: 1.6 }}>
              Terms of service for the Farmers Marketing platform at farmersmarketing.app
            </p>
            <span style={{ display: 'inline-block', marginTop: 12, color: '#2d4a5e', fontWeight: 600 }}>
              View Terms →
            </span>
          </Link>

          {/* Food Truck'n Terms */}
          <Link
            href="/food_trucks/terms"
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
              Food Truck&apos;n
            </h3>
            <p style={{ color: '#555', margin: 0, lineHeight: 1.6 }}>
              Terms of service for the Food Truck&apos;n platform at foodtruckn.app
            </p>
            <span style={{ display: 'inline-block', marginTop: 12, color: '#ff5757', fontWeight: 600 }}>
              View Terms →
            </span>
          </Link>
        </div>
      </section>

      {/* Privacy Policy Section */}
      <section style={{ padding: '30px 40px 60px', maxWidth: 800, margin: '0 auto' }}>
        <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 30, color: '#333' }}>
          Privacy Policies
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Farmers Marketing Privacy */}
          <Link
            href="/farmers_market/terms#privacy-policy"
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
              Farmers Marketing
            </h3>
            <p style={{ color: '#555', margin: 0, lineHeight: 1.6 }}>
              Privacy policy for the Farmers Marketing platform at farmersmarketing.app
            </p>
            <span style={{ display: 'inline-block', marginTop: 12, color: '#2d4a5e', fontWeight: 600 }}>
              View Privacy Policy →
            </span>
          </Link>

          {/* Food Truck'n Privacy */}
          <Link
            href="/food_trucks/terms#privacy-policy"
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
              Food Truck&apos;n
            </h3>
            <p style={{ color: '#555', margin: 0, lineHeight: 1.6 }}>
              Privacy policy for the Food Truck&apos;n platform at foodtruckn.app
            </p>
            <span style={{ display: 'inline-block', marginTop: 12, color: '#ff5757', fontWeight: 600 }}>
              View Privacy Policy →
            </span>
          </Link>
        </div>
      </section>

      {/* General Info */}
      <section style={{ padding: '0 40px 60px', maxWidth: 800, margin: '0 auto' }}>
        <div style={{ padding: 24, backgroundColor: 'white', borderRadius: 12, border: '1px solid #e5e7eb' }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: '#333' }}>
            General Information
          </h3>
          <p style={{ color: '#555', lineHeight: 1.8, margin: '0 0 12px 0' }}>
            All platforms operated by 815 Enterprises (VIIIXV LLC d/b/a 815 Enterprises) are subject to the platform-specific terms and privacy policies linked above. By using any of our platforms, you agree to the applicable terms of service and privacy policy.
          </p>
          <p style={{ color: '#555', lineHeight: 1.8, margin: '0 0 12px 0' }}>
            Across all platforms, we follow these core privacy principles:
          </p>
          <ul style={{ color: '#555', lineHeight: 2, paddingLeft: 20, margin: '0 0 12px 0' }}>
            <li>We only collect data necessary to provide our services</li>
            <li>We never sell your personal information to third parties</li>
            <li>Payment processing is handled securely by Stripe</li>
            <li>You can request deletion of your account and data at any time</li>
          </ul>
          <p style={{ color: '#555', lineHeight: 1.8, margin: 0 }}>
            For questions about our terms or privacy, visit our <Link href="/support" style={{ color: '#0070f3' }}>support page</Link> or contact us at{' '}
            <a href="mailto:contact@815enterprises.com" style={{ color: '#0070f3' }}>contact@815enterprises.com</a>.
          </p>
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
