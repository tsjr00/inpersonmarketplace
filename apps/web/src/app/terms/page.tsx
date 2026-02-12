'use client'

import { useEffect } from 'react'
import Footer from '@/components/shared/Footer'
import Link from 'next/link'
import { colors, spacing, typography } from '@/lib/design-tokens'

export default function TermsPage() {
  // Handle scroll to hash on page load
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      const id = window.location.hash.slice(1)
      const element = document.getElementById(id)
      if (element) {
        setTimeout(() => {
          element.scrollIntoView({ behavior: 'smooth' })
        }, 100)
      }
    }
  }, [])

  const sectionStyle = {
    marginBottom: spacing.xl,
  }

  const h2Style = {
    fontSize: typography.sizes['2xl'],
    fontWeight: typography.weights.bold,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
    color: colors.textPrimary,
    paddingTop: spacing.md,
  }

  const h3Style = {
    fontSize: typography.sizes.lg,
    fontWeight: typography.weights.semibold,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    color: colors.textPrimary,
  }

  const pStyle = {
    marginBottom: spacing.md,
    lineHeight: typography.leading.relaxed,
  }

  const listStyle = {
    marginBottom: spacing.md,
    paddingLeft: spacing.lg,
    lineHeight: typography.leading.relaxed,
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        padding: '16px 20px',
        borderBottom: `1px solid ${colors.border}`,
        backgroundColor: colors.surfaceElevated
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <Link href="/farmers_market" style={{ fontSize: 20, fontWeight: 700, color: colors.textPrimary, textDecoration: 'none' }}>
            farmersmarketing.app
          </Link>
        </div>
      </header>

      <main style={{ flex: 1, maxWidth: 800, margin: '40px auto', padding: '0 20px' }}>
        <h1 style={{ fontSize: typography.sizes['3xl'], fontWeight: typography.weights.bold, marginBottom: spacing.md, color: colors.textPrimary }}>
          Terms of Service
        </h1>
        <p style={{ marginBottom: spacing.lg, color: colors.textMuted, fontSize: typography.sizes.sm }}>
          <em>Last updated: February 2026</em>
        </p>

        <div style={{ color: colors.textSecondary, fontSize: typography.sizes.base }}>

          {/* Introduction */}
          <section style={sectionStyle}>
            <p style={pStyle}>
              Welcome to farmersmarketing.app. These Terms of Service (&quot;Terms&quot;) govern your use of our platform,
              which connects local producers and artisans with shoppers at farmers markets and similar venues.
              By accessing or using our services, you agree to be bound by these Terms.
            </p>
            <p style={pStyle}>
              Please read these Terms carefully before using our platform. If you do not agree to these Terms,
              you may not access or use our services.
            </p>
          </section>

          {/* 1. User Accounts */}
          <section style={sectionStyle}>
            <h2 id="user-accounts" style={h2Style}>1. User Accounts</h2>

            <h3 style={h3Style}>1.1 Account Registration</h3>
            <p style={pStyle}>
              To use certain features of our platform, you must create an account. You agree to provide accurate,
              current, and complete information during registration and to update such information to keep it
              accurate, current, and complete.
            </p>

            <h3 style={h3Style}>1.2 Account Security</h3>
            <p style={pStyle}>
              You are responsible for safeguarding your account credentials and for all activities that occur
              under your account. You agree to notify us immediately of any unauthorized use of your account.
            </p>

            <h3 style={h3Style}>1.3 Account Types</h3>
            <p style={pStyle}>
              Our platform supports two primary account types:
            </p>
            <ul style={listStyle}>
              <li><strong>Shopper accounts:</strong> For individuals who wish to browse products and place orders from vendors.</li>
              <li><strong>Vendor accounts:</strong> For producers, farmers, bakers, artisans, and other sellers who wish to list and sell products through our platform.</li>
            </ul>
          </section>

          {/* 2. Vendor Obligations */}
          <section style={sectionStyle}>
            <h2 id="vendor-obligations" style={h2Style}>2. Vendor Obligations</h2>

            <h3 style={h3Style}>2.1 Vendor Eligibility</h3>
            <p style={pStyle}>
              Vendors must be approved by platform administrators before listing products. Approval requires
              verification of your identity, business information, and compliance with applicable laws and regulations
              for your product categories.
            </p>

            <h3 style={h3Style}>2.2 Product Listings</h3>
            <p style={pStyle}>
              Vendors agree to:
            </p>
            <ul style={listStyle}>
              <li>Provide accurate and complete descriptions of all products listed</li>
              <li>Set fair and transparent pricing for all items</li>
              <li>Maintain accurate inventory levels to prevent overselling</li>
              <li>Use only images that accurately represent the products being sold</li>
              <li>Comply with all applicable food safety, labeling, and health regulations</li>
            </ul>

            <h3 style={h3Style}>2.3 Order Fulfillment</h3>
            <p style={pStyle}>
              Vendors are responsible for:
            </p>
            <ul style={listStyle}>
              <li>Preparing orders accurately and on time for the designated pickup</li>
              <li>Maintaining product quality and freshness standards</li>
              <li>Being present at the market or pickup location during scheduled times</li>
              <li>Communicating promptly with shoppers about any order issues</li>
            </ul>

            <h3 style={h3Style}>2.4 Customer Service</h3>
            <p style={pStyle}>
              Vendors are solely responsible for customer service related to their products, including handling
              questions, complaints, and any issues with orders. The platform facilitates connections but does
              not mediate individual transactions.
            </p>
          </section>

          {/* 3. Buyer/Shopper Obligations */}
          <section style={sectionStyle}>
            <h2 id="buyer-obligations" style={h2Style}>3. Shopper Obligations</h2>

            <h3 style={h3Style}>3.1 Order Commitment</h3>
            <p style={pStyle}>
              When you place an order, you are committing to pick up and pay for those items. Repeated
              no-shows or order abandonment may result in account restrictions.
            </p>

            <h3 style={h3Style}>3.2 Pickup Responsibility</h3>
            <p style={pStyle}>
              Shoppers agree to:
            </p>
            <ul style={listStyle}>
              <li>Pick up orders at the designated market or location during specified hours</li>
              <li>Bring valid identification or order confirmation as needed</li>
              <li>Inspect products at the time of pickup and raise any concerns with the vendor directly</li>
              <li>Communicate promptly if unable to pick up an order as scheduled</li>
            </ul>

            <h3 style={h3Style}>3.3 Respectful Conduct</h3>
            <p style={pStyle}>
              Shoppers are expected to treat vendors, market staff, and other community members with respect
              and courtesy at all times.
            </p>
          </section>

          {/* 4. Payment Terms */}
          <section style={sectionStyle}>
            <h2 id="payment-terms" style={h2Style}>4. Payment Terms</h2>

            <h3 style={h3Style}>4.1 Payment Processing</h3>
            <p style={pStyle}>
              All payments are processed securely through our third-party payment processor (Stripe).
              By making a purchase, you agree to Stripe&apos;s terms of service in addition to these Terms.
            </p>

            <h3 style={h3Style}>4.2 Pricing</h3>
            <p style={pStyle}>
              All prices displayed on the platform are set by individual vendors. Prices include applicable
              platform fees and payment processing costs. Vendors receive the listed price minus platform
              and processing fees.
            </p>

            <h3 style={h3Style}>4.3 Refunds and Cancellations</h3>
            <p style={pStyle}>
              Refund and cancellation policies are determined by individual vendors. Shoppers should review
              vendor policies before placing orders. The platform does not guarantee refunds for any transaction.
            </p>
            <p style={pStyle}>
              In general:
            </p>
            <ul style={listStyle}>
              <li>Orders may be cancelled before the market&apos;s order cutoff time</li>
              <li>After the cutoff time, cancellations are at the vendor&apos;s discretion</li>
              <li>Product quality issues should be addressed directly with the vendor at pickup</li>
            </ul>
          </section>

          {/* 5. Liability Limitations */}
          <section style={sectionStyle}>
            <h2 id="liability" style={h2Style}>5. Liability Limitations</h2>

            <h3 style={h3Style}>5.1 Platform Role</h3>
            <p style={pStyle}>
              Our platform serves as a marketplace connecting vendors and shoppers. We do not produce,
              manufacture, or prepare any products sold through the platform. All transactions are
              between the vendor and the shopper.
            </p>

            <h3 style={h3Style}>5.2 No Warranty</h3>
            <p style={pStyle}>
              THE PLATFORM IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED.
              WE DO NOT WARRANT THAT THE PLATFORM WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE.
            </p>

            <h3 style={h3Style}>5.3 Limitation of Liability</h3>
            <p style={pStyle}>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
              SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE PLATFORM OR ANY
              PRODUCTS PURCHASED THROUGH IT.
            </p>

            <h3 style={h3Style}>5.4 Food Safety</h3>
            <p style={pStyle}>
              Vendors are solely responsible for compliance with all applicable food safety laws and regulations.
              The platform does not inspect, certify, or guarantee the safety of any food products. Shoppers
              purchase food products at their own risk.
            </p>
          </section>

          {/* 6. Dispute Resolution */}
          <section style={sectionStyle}>
            <h2 id="disputes" style={h2Style}>6. Dispute Resolution</h2>

            <h3 style={h3Style}>6.1 Between Shoppers and Vendors</h3>
            <p style={pStyle}>
              Disputes regarding product quality, order fulfillment, or refunds should be resolved directly
              between the shopper and vendor. We encourage respectful communication and good-faith efforts
              to resolve issues.
            </p>

            <h3 style={h3Style}>6.2 Platform Disputes</h3>
            <p style={pStyle}>
              For disputes related to platform functionality or these Terms, please contact us through our
              contact form. We will make reasonable efforts to address concerns promptly.
            </p>

            <h3 style={h3Style}>6.3 Governing Law</h3>
            <p style={pStyle}>
              These Terms shall be governed by and construed in accordance with the laws of the State of Illinois,
              without regard to its conflict of law provisions.
            </p>
          </section>

          {/* 7. Platform Usage Rules */}
          <section style={sectionStyle}>
            <h2 id="usage-rules" style={h2Style}>7. Platform Usage Rules</h2>

            <h3 style={h3Style}>7.1 Prohibited Activities</h3>
            <p style={pStyle}>
              Users may not:
            </p>
            <ul style={listStyle}>
              <li>Use the platform for any illegal purpose</li>
              <li>Misrepresent your identity or affiliation</li>
              <li>Interfere with or disrupt the platform&apos;s operation</li>
              <li>Attempt to gain unauthorized access to any part of the platform</li>
              <li>Use automated systems to access the platform without permission</li>
              <li>Harass, threaten, or abuse other users</li>
              <li>Post false, misleading, or defamatory content</li>
            </ul>

            <h3 style={h3Style}>7.2 Content Standards</h3>
            <p style={pStyle}>
              All content posted to the platform (including product listings, images, and reviews) must be
              accurate, lawful, and respectful. We reserve the right to remove any content that violates
              these standards.
            </p>

            <h3 style={h3Style}>7.3 Account Termination</h3>
            <p style={pStyle}>
              We reserve the right to suspend or terminate accounts that violate these Terms, engage in
              fraudulent activity, or negatively impact other users&apos; experience on the platform.
            </p>
          </section>

          {/* 8. SMS and Text Messaging Terms */}
          <section style={sectionStyle}>
            <h2 id="sms-terms" style={h2Style}>8. SMS and Text Messaging Terms</h2>

            <h3 style={h3Style}>8.1 Consent to Receive Messages</h3>
            <p style={pStyle}>
              By creating an account on farmersmarketing.app and providing your mobile phone number, you may
              opt in to receive SMS/text message notifications related to your account and orders. SMS notifications
              are used for time-sensitive, transactional messages including but not limited to:
            </p>
            <ul style={listStyle}>
              <li>Order cancellation alerts</li>
              <li>Pickup issue notifications</li>
              <li>Urgent order status changes</li>
            </ul>
            <p style={pStyle}>
              By opting in, you consent to receive recurring automated text messages from farmersmarketing.app
              at the mobile number you provide. Consent is not a condition of purchase. Message frequency varies
              based on your order activity (typically 1-5 messages per week during active order periods).
            </p>

            <h3 style={h3Style}>8.2 Message and Data Rates</h3>
            <p style={pStyle}>
              Message and data rates may apply. Your mobile carrier&apos;s standard messaging and data rates will apply
              to any SMS messages you receive from us. Check with your carrier for details about your plan.
            </p>

            <h3 style={h3Style}>8.3 Opt-Out and Help</h3>
            <p style={pStyle}>
              You can opt out of SMS notifications at any time by:
            </p>
            <ul style={listStyle}>
              <li>Replying <strong>STOP</strong> to any text message from us</li>
              <li>Disabling SMS notifications in your account notification preferences</li>
              <li>Removing your phone number from your account profile</li>
            </ul>
            <p style={pStyle}>
              After opting out, you will receive one final confirmation message. You will still receive
              in-app and email notifications for order updates.
            </p>
            <p style={pStyle}>
              For help with SMS messaging, reply <strong>HELP</strong> to any text message from us, or
              contact us through our <Link href="/about#contact" style={{ color: colors.primary }}>contact form</Link>.
            </p>

            <h3 style={h3Style}>8.4 Supported Carriers</h3>
            <p style={pStyle}>
              SMS messaging is supported on most major US carriers. Carriers are not liable for delayed or
              undelivered messages.
            </p>
          </section>

          {/* 9. Changes to Terms */}
          <section style={sectionStyle}>
            <h2 id="changes" style={h2Style}>9. Changes to Terms</h2>
            <p style={pStyle}>
              We may modify these Terms at any time. We will notify users of significant changes via email
              or platform notification. Continued use of the platform after changes constitutes acceptance
              of the modified Terms.
            </p>
          </section>

          {/* Privacy Policy Section */}
          <section style={{ ...sectionStyle, borderTop: `2px solid ${colors.border}`, paddingTop: spacing.xl, marginTop: spacing['2xl'] }}>
            <h2 id="privacy-policy" style={{ ...h2Style, marginTop: 0 }}>Privacy Policy</h2>
            <p style={{ marginBottom: spacing.lg, color: colors.textMuted, fontSize: typography.sizes.sm }}>
              <em>This Privacy Policy is part of our Terms of Service</em>
            </p>

            <h3 style={h3Style}>Information We Collect</h3>
            <p style={pStyle}>
              We collect information you provide directly to us, including:
            </p>
            <ul style={listStyle}>
              <li><strong>Account Information:</strong> Name, email address, phone number, and password when you create an account</li>
              <li><strong>Profile Information:</strong> Business name, address, and description for vendor accounts</li>
              <li><strong>Transaction Information:</strong> Order details, payment information (processed securely by Stripe), and pickup preferences</li>
              <li><strong>Location Information:</strong> Your location when you choose to share it for finding nearby markets</li>
              <li><strong>Communications:</strong> Messages you send through the platform</li>
            </ul>

            <h3 style={h3Style}>How We Use Your Information</h3>
            <p style={pStyle}>
              We use collected information to:
            </p>
            <ul style={listStyle}>
              <li>Provide, maintain, and improve our services</li>
              <li>Process transactions and send related notifications</li>
              <li>Connect shoppers with vendors at local markets</li>
              <li>Send you updates about orders, markets, and platform features</li>
              <li>Respond to your comments, questions, and support requests</li>
              <li>Monitor and analyze trends, usage, and activities</li>
              <li>Detect, investigate, and prevent fraudulent or unauthorized activity</li>
            </ul>

            <h3 style={h3Style}>Information Sharing</h3>
            <p style={pStyle}>
              We share your information only in the following circumstances:
            </p>
            <ul style={listStyle}>
              <li><strong>With Vendors/Shoppers:</strong> Order information is shared between parties to facilitate transactions</li>
              <li><strong>Service Providers:</strong> With third parties who perform services on our behalf (payment processing, email delivery, SMS messaging)</li>
              <li><strong>Legal Requirements:</strong> When required by law or to protect rights, safety, or property</li>
              <li><strong>Business Transfers:</strong> In connection with any merger, acquisition, or sale of assets</li>
            </ul>

            <h3 style={h3Style}>Mobile Information Privacy</h3>
            <p style={pStyle}>
              We are committed to protecting your mobile information:
            </p>
            <ul style={listStyle}>
              <li>We will <strong>never sell, rent, or share your mobile phone number</strong> with third parties or affiliates for promotional or marketing purposes</li>
              <li>Your phone number is used solely for transactional notifications related to your account and orders on farmersmarketing.app</li>
              <li>Third-party SMS service providers who deliver messages on our behalf are contractually prohibited from using your phone number for any purpose other than delivering our messages</li>
            </ul>

            <h3 style={h3Style}>Data Security</h3>
            <p style={pStyle}>
              We implement appropriate security measures to protect your personal information. However,
              no method of transmission over the Internet is 100% secure, and we cannot guarantee absolute security.
            </p>

            <h3 style={h3Style}>Your Rights and Choices</h3>
            <p style={pStyle}>
              You may:
            </p>
            <ul style={listStyle}>
              <li>Access, update, or delete your account information at any time</li>
              <li>Opt out of promotional communications</li>
              <li>Opt out of SMS notifications by replying STOP, disabling SMS in your notification preferences, or removing your phone number from your profile</li>
              <li>Request a copy of your personal data</li>
              <li>Request deletion of your account and associated data</li>
            </ul>

            <h3 style={h3Style}>Cookies and Tracking</h3>
            <p style={pStyle}>
              We use cookies and similar technologies to remember your preferences, understand how you
              use our platform, and improve our services. You can control cookies through your browser settings.
            </p>

            <h3 style={h3Style}>Children&apos;s Privacy</h3>
            <p style={pStyle}>
              Our platform is not intended for children under 13. We do not knowingly collect personal
              information from children under 13.
            </p>

            <h3 style={h3Style}>Contact Us About Privacy</h3>
            <p style={pStyle}>
              If you have questions about this Privacy Policy or our data practices, please contact us
              through our <Link href="/about#contact" style={{ color: colors.primary }}>contact form</Link>.
            </p>
          </section>

          {/* Contact Section */}
          <section style={sectionStyle}>
            <h2 id="contact" style={h2Style}>Contact Us</h2>
            <p style={pStyle}>
              If you have any questions about these Terms of Service, please contact us through our{' '}
              <Link href="/about#contact" style={{ color: colors.primary }}>About page</Link>.
            </p>
          </section>

        </div>
      </main>
      <Footer />
    </div>
  )
}
