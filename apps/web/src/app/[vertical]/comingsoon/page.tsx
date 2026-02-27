import Image from 'next/image'
import { ComingSoonForm } from '@/components/landing/ComingSoonForm'
import { FMComingSoon } from '@/components/landing/FMComingSoon'

interface ComingSoonPageProps {
  params: Promise<{ vertical: string }>
}

/* SVG icons matching the mockup's white line-art inside red circles */
const featureIcons = {
  location: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
  dollar: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M16 8h-2a3 3 0 0 0 0 6h0a3 3 0 0 1 0 6H8" />
      <path d="M12 2v2m0 16v2" />
    </svg>
  ),
  box: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  bell: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  ),
  clock: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  devices: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12.01" y2="18" />
    </svg>
  ),
  shield: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  ),
}

const features = [
  {
    title: 'More Traffic to Your Food Truck',
    description:
      'Customers can search from 2 to 25 miles to find what\'s nearest to them. Always focused on the local trucks first.',
    icon: featureIcons.location,
  },
  {
    title: 'Multiple Payment Methods Supported',
    description:
      'Stripe supported payments, Google pay, CashApp, Venmo, Paypal and in person cash payments.',
    icon: featureIcons.dollar,
  },
  {
    title: 'Chef Boxes for Easy Catering Options',
    description:
      'Customers can pre-order larger family meals, meals for meal prep, office lunches, or Chef\'s choice for special limited run items.',
    icon: featureIcons.box,
  },
  {
    title: 'Order Updates',
    description:
      'You can receive order notifications via email, SMS, and/or in app notifications.',
    icon: featureIcons.bell,
  },
  {
    title: '30 Minute Ordering Windows',
    description:
      'Pre-orders won\'t overload your food truck with our 30 minute lead time. Giving you plenty of time to get their orders ready.',
    icon: featureIcons.clock,
  },
  {
    title: 'Multi Device Friendly',
    description:
      'Food Truck\'n app works with tablets, desktops and mobile phones.',
    icon: featureIcons.devices,
  },
  {
    title: 'Simple Verification Process',
    description:
      'Every truck is verified before joining. State Food/Health/Business documentation required.',
    icon: featureIcons.shield,
  },
]

export default async function ComingSoonPage({ params }: ComingSoonPageProps) {
  const { vertical } = await params

  if (vertical === 'farmers_market') {
    return <FMComingSoon vertical={vertical} />
  }

  // ── Food Trucks (default) ──────────────────────────────────
  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}>
      {/* ── Header Bar ──────────────────────────────────────────── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '10px 24px',
          borderBottom: '1px solid #e5e5e5',
          backgroundColor: '#fff',
        }}
      >
        <Image
          src="/logos/food-truckn-logo.png"
          alt="Food Truck'n"
          width={40}
          height={40}
          style={{ borderRadius: '50%' }}
        />
        <span style={{ fontSize: '18px', fontWeight: 700, color: '#1a1a1a' }}>
          Food Truck&apos;n App.{' '}
          <span style={{ color: '#ff5757' }}>Coming Soon!</span>
        </span>
      </header>

      {/* ── Hero Section ────────────────────────────────────────── */}
      <section style={{ backgroundColor: '#f0f0f0' }}>
        <div style={{ position: 'relative', width: '100%', maxWidth: '1200px', margin: '0 auto' }}>
          <Image
            src="/images/comingsoon-hero.png"
            alt="Grow Your Food Truck Business"
            width={1200}
            height={500}
            style={{ width: '100%', height: 'auto', display: 'block' }}
            priority
          />
        </div>
      </section>

      {/* ── Middle Section ──────────────────────────────────────── */}
      <section style={{ backgroundColor: '#f5f5f5', padding: '40px 24px' }}>
        <div
          className="comingsoon-grid"
          style={{
            maxWidth: '1000px',
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '40px',
            alignItems: 'start',
          }}
        >
          {/* Left column — Features */}
          <div>
            {features.map((feature, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  gap: '16px',
                  marginBottom: '28px',
                  alignItems: 'flex-start',
                }}
              >
                <div
                  style={{
                    flexShrink: 0,
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    backgroundColor: '#ff5757',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {feature.icon}
                </div>
                <div>
                  <h3
                    style={{
                      margin: '0 0 4px',
                      fontSize: '15px',
                      fontWeight: 700,
                      color: '#1a1a1a',
                    }}
                  >
                    {feature.title}
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      fontSize: '13px',
                      color: '#555',
                      lineHeight: 1.5,
                    }}
                  >
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Right column — Form */}
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '12px',
              padding: '28px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
            }}
          >
            <ComingSoonForm vertical={vertical} />
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer
        style={{
          backgroundColor: '#333',
          color: '#fff',
          padding: '40px 24px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            maxWidth: '600px',
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <Image
            src="/logos/food-truckn-logo.png"
            alt="Food Truck'n"
            width={80}
            height={80}
            style={{ borderRadius: '50%' }}
          />
          <h2
            style={{
              margin: 0,
              fontSize: '32px',
              fontWeight: 800,
              color: '#ff5757',
            }}
          >
            Coming Soon!
          </h2>
          <p style={{ margin: 0, fontSize: '14px', color: '#ccc', lineHeight: 1.5 }}>
            Follow us on Facebook and Instagram to be
            <br />
            notified when it&apos;s in your area
          </p>
          <div style={{ display: 'flex', gap: '16px', marginTop: '4px' }}>
            {/* Facebook */}
            <a
              href="https://www.facebook.com/foodtrucknapp/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Facebook"
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#333',
                textDecoration: 'none',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
            </a>
            {/* Instagram */}
            <a
              href="#"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram"
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                backgroundColor: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#333',
                textDecoration: 'none',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
              </svg>
            </a>
          </div>
        </div>
      </footer>

      {/* ── Responsive styles ───────────────────────────────────── */}
      <style>{`
        @media (max-width: 768px) {
          .comingsoon-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  )
}
