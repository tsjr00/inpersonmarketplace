import Link from 'next/link'

export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer
      style={{
        marginTop: 'auto',
        padding: '48px 20px 24px',
        backgroundColor: '#f9fafb',
        borderTop: '1px solid #e5e7eb'
      }}
    >
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Footer Content */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 40,
            marginBottom: 32
          }}
        >
          {/* Company Info */}
          <div>
            <h4 style={{ marginBottom: 16, fontSize: 18, fontWeight: 600, color: '#111827' }}>
              815 Enterprises
            </h4>
            <p style={{ color: '#6b7280', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
              Connecting local vendors with their communities through innovative marketplace solutions.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600, color: '#111827' }}>
              Company
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li style={{ marginBottom: 12 }}>
                <Link
                  href="/about"
                  style={{
                    color: '#6b7280',
                    textDecoration: 'none',
                    fontSize: 14
                  }}
                >
                  About Us
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 style={{ marginBottom: 16, fontSize: 16, fontWeight: 600, color: '#111827' }}>
              Legal
            </h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li style={{ marginBottom: 12 }}>
                <Link
                  href="/terms"
                  style={{
                    color: '#6b7280',
                    textDecoration: 'none',
                    fontSize: 14
                  }}
                >
                  Terms of Service
                </Link>
              </li>
              <li style={{ marginBottom: 12 }}>
                <Link
                  href="/privacy"
                  style={{
                    color: '#6b7280',
                    textDecoration: 'none',
                    fontSize: 14
                  }}
                >
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Copyright */}
        <div
          style={{
            paddingTop: 24,
            borderTop: '1px solid #e5e7eb',
            textAlign: 'center'
          }}
        >
          <p style={{ color: '#9ca3af', fontSize: 14, margin: 0 }}>
            © {currentYear} 815 Enterprises. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
