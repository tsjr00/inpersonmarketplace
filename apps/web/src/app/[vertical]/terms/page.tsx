'use client'

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { colors, spacing, typography } from '@/lib/design-tokens'

export default function TermsPage() {
  const { vertical } = useParams<{ vertical: string }>()

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

  const tocLinkStyle = {
    color: colors.primary,
    textDecoration: 'none' as const,
    display: 'block' as const,
    padding: `${spacing['3xs']} 0`,
    lineHeight: typography.leading.relaxed,
  }

  return (
    <main style={{ maxWidth: 800, margin: '40px auto', padding: '0 20px' }}>
      <h1 style={{ fontSize: typography.sizes['3xl'], fontWeight: typography.weights.bold, marginBottom: spacing.md, color: colors.textPrimary }}>
        Terms of Service
      </h1>
      <p style={{ marginBottom: spacing.lg, color: colors.textMuted, fontSize: typography.sizes.sm }}>
        <em>Last updated: March 2026</em>
      </p>

      <div style={{ color: colors.textSecondary, fontSize: typography.sizes.base }}>

        {/* Table of Contents */}
        <section style={{ ...sectionStyle, background: colors.surfaceMuted, padding: spacing.md, borderRadius: '8px', border: `1px solid ${colors.border}` }}>
          <h2 style={{ fontSize: typography.sizes.lg, fontWeight: typography.weights.bold, marginBottom: spacing.sm, color: colors.textPrimary }}>
            Table of Contents
          </h2>
          <nav>
            <p style={{ fontWeight: typography.weights.semibold, marginBottom: spacing['3xs'], marginTop: spacing.sm, color: colors.textPrimary }}>Terms of Service</p>
            <a href="#user-accounts" style={tocLinkStyle}>1. User Accounts</a>
            <a href="#vendor-obligations" style={tocLinkStyle}>2. Vendor Obligations</a>
            <a href="#buyer-obligations" style={tocLinkStyle}>3. Shopper Obligations</a>
            <a href="#payment-terms" style={tocLinkStyle}>4. Payment Terms</a>
            <a href="#subscription-services" style={tocLinkStyle}>5. Subscription Services</a>
            <a href="#intellectual-property" style={tocLinkStyle}>6. Intellectual Property</a>
            <a href="#liability" style={tocLinkStyle}>7. Liability Limitations</a>
            <a href="#disputes" style={tocLinkStyle}>8. Dispute Resolution</a>
            <a href="#usage-rules" style={tocLinkStyle}>9. Platform Usage Rules</a>
            <a href="#multi-vertical" style={tocLinkStyle}>10. Multi-Vertical Platform</a>
            <a href="#sms-terms" style={tocLinkStyle}>11. SMS and Text Messaging Terms</a>
            <a href="#changes" style={tocLinkStyle}>12. Changes to Terms</a>

            <p style={{ fontWeight: typography.weights.semibold, marginBottom: spacing['3xs'], marginTop: spacing.sm, color: colors.textPrimary }}>Privacy Policy</p>
            <a href="#privacy-policy" style={tocLinkStyle}>Privacy Policy</a>
            <a href="#pp-information-collect" style={tocLinkStyle}>1. Information We Collect</a>
            <a href="#pp-how-we-use" style={tocLinkStyle}>2. How We Use Your Information</a>
            <a href="#pp-information-sharing" style={tocLinkStyle}>3. Information Sharing</a>
            <a href="#pp-mobile-privacy" style={tocLinkStyle}>4. Mobile Information Privacy</a>
            <a href="#pp-data-retention" style={tocLinkStyle}>5. Data Retention</a>
            <a href="#pp-data-security" style={tocLinkStyle}>6. Data Security</a>
            <a href="#pp-your-rights" style={tocLinkStyle}>7. Your Rights and Choices</a>
            <a href="#pp-cookies" style={tocLinkStyle}>8. Cookies and Tracking</a>
            <a href="#pp-geographic-scope" style={tocLinkStyle}>9. Geographic Scope</a>
            <a href="#pp-children" style={tocLinkStyle}>10. Children&apos;s Privacy</a>
            <a href="#pp-contact" style={tocLinkStyle}>11. Contact Us About Privacy</a>
            <a href="#pp-changes" style={tocLinkStyle}>12. Changes to Privacy Policy</a>
          </nav>
        </section>

        {/* Introduction */}
        <section style={sectionStyle}>
          <p style={pStyle}>
            Welcome to our marketplace platform operated by 815 Enterprises. These Terms of Service (&quot;Terms&quot;) govern your use of our platform,
            which connects local vendors and businesses with customers at markets, events, and community venues.
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
            <li><strong>Vendor accounts:</strong> For vendors, producers, and other sellers who wish to list and sell products or services through our platform.</li>
          </ul>

          <h3 style={h3Style}>1.4 Minimum Age</h3>
          <p style={pStyle}>
            Vendor accounts require the account holder to be at least 18 years of age. Shopper accounts
            are available to individuals 13 years of age and older; users under 18 must have parental
            or legal guardian consent to create and use an account. By creating an account, you represent
            that you meet these age requirements.
          </p>

          <h3 style={h3Style}>1.5 Account Deletion</h3>
          <p style={pStyle}>
            You may request deletion of your account at any time through your account settings or by
            contacting us through our{' '}
            <Link href={`/${vertical}/support`} style={{ color: colors.primary }}>support page</Link>.
            Upon deletion, your personal information will be removed in accordance with our Privacy Policy.
            Certain transaction records may be retained as required by law or for legitimate business purposes,
            as described in the Data Retention section of our Privacy Policy.
          </p>
        </section>

        {/* 2. Vendor Obligations */}
        <section style={sectionStyle}>
          <h2 id="vendor-obligations" style={h2Style}>2. Vendor Obligations</h2>

          <h3 style={h3Style}>2.1 Vendor Eligibility</h3>
          <p style={pStyle}>
            Vendors must be approved by platform administrators before listing products. Approval requires
            admin review of your identity, business information, and compliance with applicable laws and regulations
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

          <h3 style={h3Style}>2.5 Prohibited Items</h3>
          <p style={pStyle}>
            Certain items are prohibited from being listed or sold on our platform. Vendors are responsible
            for ensuring that all products comply with applicable laws and our platform policies. For a
            detailed list of prohibited items and categories, please refer to our{' '}
            <Link href={`/${vertical}/vendor/prohibited-items`} style={{ color: colors.primary }}>Prohibited Items Policy</Link>.
            Listing prohibited items may result in immediate removal of the listing, suspension of your
            vendor account, or permanent termination at the platform&apos;s discretion.
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
            All payments are processed securely through our third-party payment processing service.
            By making a purchase, you agree to the payment processor&apos;s terms of service in addition to these Terms.
          </p>

          <h3 style={h3Style}>4.2 Pricing & Fees</h3>
          <p style={pStyle}>
            All prices displayed on the platform are set by individual vendors. The platform charges
            service fees to facilitate transactions:
          </p>
          <ul style={listStyle}>
            <li><strong>Buyer service fee:</strong> 6.5% of the order subtotal, added to the buyer&apos;s total at checkout.</li>
            <li><strong>Vendor service fee (online payment):</strong> 6.5% of the order subtotal, deducted from the vendor&apos;s payout. This covers payment processing and platform services.</li>
            <li><strong>Vendor service fee (cash/external payment):</strong> 3.5% of the order subtotal, invoiced to the vendor. This reduced rate reflects the absence of payment processing costs.</li>
            <li><strong>Order service fee:</strong> $0.15 per order, split between buyer and vendor ($0.15 each).</li>
          </ul>
          <p style={pStyle}>
            Fee percentages may be updated with notice. Current rates are always displayed during checkout.
            Vendors can view their fee history in their dashboard.
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
            <li>Orders may be cancelled before the market&apos;s order cutoff time for a full refund</li>
            <li>After the cutoff time but before vendor confirmation, cancellations are at the vendor&apos;s discretion</li>
            <li>After a vendor has confirmed an order, a cancellation fee of up to 25% of the order subtotal may apply to cover preparation costs already incurred by the vendor</li>
            <li>A brief grace period following vendor confirmation may be provided during which cancellation remains available without penalty, at the platform&apos;s discretion</li>
            <li>Product quality issues should be addressed directly with the vendor at pickup</li>
          </ul>

          <h3 style={h3Style}>4.4 Tipping</h3>
          <p style={pStyle}>
            The platform provides an optional tipping feature at checkout. Tips are entirely voluntary and are
            not required to complete a purchase. Tips are directed to the vendor minus applicable payment
            processing costs. The platform does not retain any portion of tips beyond what is necessary
            to cover third-party payment processing fees on the tip amount. Tip amounts and percentages
            are displayed transparently at checkout.
          </p>
        </section>

        {/* 5. Subscription Services */}
        <section style={sectionStyle}>
          <h2 id="subscription-services" style={h2Style}>5. Subscription Services</h2>

          <h3 style={h3Style}>5.1 Vendor Plans</h3>
          <p style={pStyle}>
            Vendors may subscribe to paid plans that provide additional features and higher listing limits.
            Vendor plans are billed on a monthly or annual basis, as selected at the time of subscription.
            Promotional periods may be offered at the platform&apos;s discretion. By subscribing, you authorize
            recurring charges to your payment method at the applicable rate until you cancel.
          </p>
          <ul style={listStyle}>
            <li>Plan pricing and features are displayed on the vendor subscription page and may be updated with notice</li>
            <li>No prorated refunds are provided for partial billing periods upon cancellation; your plan remains active through the end of the current billing cycle</li>
            <li>If you downgrade to a lower plan tier, any listings or features exceeding the limits of the new plan may be deactivated at the start of the next billing cycle</li>
            <li>Failure to maintain an active subscription when required may result in reduced platform features or listing visibility</li>
          </ul>

          <h3 style={h3Style}>5.2 Prepaid Offerings (Market Boxes / Chef Boxes)</h3>
          <p style={pStyle}>
            The platform supports prepaid multi-week product offerings (referred to as &quot;Market Boxes,&quot;
            &quot;Chef Boxes,&quot; or similar names depending on the vertical). These are 4-week prepaid purchases
            and are <strong>not auto-renewing subscriptions</strong>. Key terms:
          </p>
          <ul style={listStyle}>
            <li>Payment is collected in full at the time of purchase for the entire offering period</li>
            <li>Vendors are obligated to fulfill each scheduled week of the offering as described in the listing</li>
            <li>If a vendor fails to fulfill one or more weeks of a prepaid offering, the platform may issue account credit to the buyer for unfulfilled weeks at its discretion</li>
            <li>Buyers may not cancel a prepaid offering after purchase except as required by applicable law</li>
            <li>Vendors receive payouts for prepaid offerings after order completion and mutual confirmation</li>
          </ul>

          <h3 style={h3Style}>5.3 Buyer Premium</h3>
          <p style={pStyle}>
            The platform may offer an optional buyer premium subscription that provides enhanced features
            or benefits. Buyer premium subscriptions may be cancelled at any time, and cancellation takes
            effect at the end of the current billing period. Features and pricing of buyer premium
            subscriptions are displayed at the time of enrollment.
          </p>
        </section>

        {/* 6. Intellectual Property */}
        <section style={sectionStyle}>
          <h2 id="intellectual-property" style={h2Style}>6. Intellectual Property</h2>

          <h3 style={h3Style}>6.1 Platform Content</h3>
          <p style={pStyle}>
            The platform, including its design, text, graphics, logos, icons, software, and all other content
            not submitted by users, is the property of 815 Enterprises and is protected by applicable
            intellectual property laws. You may not reproduce, distribute, modify, or create derivative
            works from any platform content without our prior written consent.
          </p>

          <h3 style={h3Style}>6.2 User Content</h3>
          <p style={pStyle}>
            You retain ownership of any content you submit to the platform, including product listings,
            images, descriptions, and reviews. By submitting content to the platform, you grant 815 Enterprises
            a non-exclusive, worldwide, royalty-free license to use, display, reproduce, distribute, and
            promote your content in connection with operating and marketing the platform. This license
            continues for the duration your content remains on the platform and for a reasonable period
            afterward to accommodate cached or archived copies.
          </p>

          <h3 style={h3Style}>6.3 Trademarks</h3>
          <p style={pStyle}>
            &quot;Farmers Marketing,&quot; &quot;Food Truck&apos;n,&quot; &quot;815 Enterprises,&quot; and associated logos and branding
            are trademarks of 815 Enterprises. You may not use these marks without our prior written
            permission, except as necessary to accurately refer to the platform in a descriptive manner.
          </p>

          <h3 style={h3Style}>6.4 Feedback</h3>
          <p style={pStyle}>
            If you provide us with suggestions, ideas, or other feedback about the platform, you acknowledge
            that we may use such feedback without any obligation to compensate you or maintain confidentiality.
            We are under no obligation to implement any feedback received.
          </p>
        </section>

        {/* 7. Liability Limitations */}
        <section style={sectionStyle}>
          <h2 id="liability" style={h2Style}>7. Liability Limitations</h2>

          <h3 style={h3Style}>7.1 Platform Role</h3>
          <p style={pStyle}>
            Our platform serves as a marketplace connecting vendors and shoppers. We do not produce,
            manufacture, or prepare any products sold through the platform. All transactions are
            between the vendor and the shopper.
          </p>

          <h3 style={h3Style}>7.2 No Warranty</h3>
          <p style={pStyle}>
            THE PLATFORM IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED.
            WE DO NOT WARRANT THAT THE PLATFORM WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE.
          </p>

          <h3 style={h3Style}>7.3 Limitation of Liability</h3>
          <p style={pStyle}>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL,
            SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE PLATFORM OR ANY
            PRODUCTS PURCHASED THROUGH IT.
          </p>

          <h3 style={h3Style}>7.4 Food Safety</h3>
          <p style={pStyle}>
            Vendors are solely responsible for compliance with all applicable food safety laws and regulations.
            The platform does not inspect, certify, or guarantee the safety of any food products. Shoppers
            purchase food products at their own risk.
          </p>

          <h3 style={h3Style}>7.5 Indemnification</h3>
          <p style={pStyle}>
            You agree to indemnify, defend, and hold harmless 815 Enterprises, its officers, directors,
            employees, and agents from and against any claims, liabilities, damages, losses, and expenses
            (including reasonable legal fees) arising out of or in any way connected with: (a) your access
            to or use of the platform; (b) your violation of these Terms; (c) any products you sell or
            purchase through the platform (including but not limited to food safety claims); or (d) your
            violation of any third-party rights.
          </p>

          <h3 style={h3Style}>7.6 Force Majeure</h3>
          <p style={pStyle}>
            Neither party shall be liable for any failure or delay in performance resulting from causes
            beyond their reasonable control, including but not limited to: acts of nature, severe weather
            events, natural disasters, fire, flood, earthquake, epidemic or pandemic, government actions
            or orders, war, terrorism, civil unrest, labor disputes, power failures, internet or
            telecommunications outages, or market closures by market operators or government authorities.
          </p>
        </section>

        {/* 8. Dispute Resolution */}
        <section style={sectionStyle}>
          <h2 id="disputes" style={h2Style}>8. Dispute Resolution</h2>

          <h3 style={h3Style}>8.1 Between Shoppers and Vendors</h3>
          <p style={pStyle}>
            Disputes regarding product quality, order fulfillment, or refunds should be resolved directly
            between the shopper and vendor. We encourage respectful communication and good-faith efforts
            to resolve issues.
          </p>

          <h3 style={h3Style}>8.2 Platform Disputes</h3>
          <p style={pStyle}>
            For disputes related to platform functionality or these Terms, please contact us through our{' '}
            <Link href={`/${vertical}/support`} style={{ color: colors.primary }}>support page</Link>.
          </p>

          <h3 style={h3Style}>8.3 Governing Law</h3>
          <p style={pStyle}>
            These Terms shall be governed by and construed in accordance with the laws of the State of Illinois,
            without regard to its conflict of law provisions.
          </p>
        </section>

        {/* 9. Platform Usage Rules */}
        <section style={sectionStyle}>
          <h2 id="usage-rules" style={h2Style}>9. Platform Usage Rules</h2>

          <h3 style={h3Style}>9.1 Prohibited Activities</h3>
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

          <h3 style={h3Style}>9.2 Content Standards</h3>
          <p style={pStyle}>
            All content posted to the platform (including product listings, images, and reviews) must be
            accurate, lawful, and respectful. We reserve the right to remove any content that violates
            these standards.
          </p>

          <h3 style={h3Style}>9.3 Account Termination</h3>
          <p style={pStyle}>
            We reserve the right to suspend or terminate accounts that violate these Terms, engage in
            fraudulent activity, or negatively impact other users&apos; experience on the platform.
          </p>

          <h3 style={h3Style}>9.4 Third-Party Links</h3>
          <p style={pStyle}>
            The platform may contain links to third-party websites and services, including payment
            dashboards and external tools used in connection with your account. These links are provided
            for your convenience only. We are not responsible for the content, accuracy, privacy practices,
            or availability of any third-party websites or services. Your use of third-party services is
            at your own risk and subject to the terms and conditions of those services.
          </p>
        </section>

        {/* 10. Multi-Vertical Platform */}
        <section style={sectionStyle}>
          <h2 id="multi-vertical" style={h2Style}>10. Multi-Vertical Platform</h2>

          <h3 style={h3Style}>10.1 Applicability Across Verticals</h3>
          <p style={pStyle}>
            These Terms of Service apply across all verticals and marketplaces operated by 815 Enterprises,
            including but not limited to farmers markets, food trucks, and any additional verticals
            introduced in the future. Where specific terms or features differ by vertical (such as product
            categories, pickup procedures, or subscription offerings), those differences will be communicated
            within the relevant sections of the platform.
          </p>

          <h3 style={h3Style}>10.2 Unified Accounts, Per-Vertical Vendor Applications</h3>
          <p style={pStyle}>
            A single user account provides access across all verticals on the platform. Shopper functionality
            is available across all verticals with one account. However, vendor applications and approvals
            are handled on a per-vertical basis. If you wish to sell products in multiple verticals, you
            must submit a separate vendor application for each and receive approval from platform
            administrators for each vertical independently.
          </p>
        </section>

        {/* 11. SMS and Text Messaging Terms */}
        <section style={sectionStyle}>
          <h2 id="sms-terms" style={h2Style}>11. SMS and Text Messaging Terms</h2>

          <h3 style={h3Style}>11.1 Consent to Receive Messages</h3>
          <p style={pStyle}>
            By creating an account on our platform and providing your mobile phone number, you may
            opt in to receive SMS/text message notifications related to your account and orders. SMS notifications
            are used for time-sensitive, transactional messages including but not limited to:
          </p>
          <ul style={listStyle}>
            <li>Order cancellation alerts</li>
            <li>Pickup issue notifications</li>
            <li>Urgent order status changes</li>
          </ul>
          <p style={pStyle}>
            By opting in, you consent to receive recurring automated text messages from our platform
            at the mobile number you provide. Consent is not a condition of purchase. Message frequency varies
            based on your order activity (typically 1-5 messages per week during active order periods).
          </p>

          <h3 style={h3Style}>11.2 Message and Data Rates</h3>
          <p style={pStyle}>
            Message and data rates may apply. Your mobile carrier&apos;s standard messaging and data rates will apply
            to any SMS messages you receive from us. Check with your carrier for details about your plan.
          </p>

          <h3 style={h3Style}>11.3 Opt-Out and Help</h3>
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
            contact us through our <Link href={`/${vertical}/support`} style={{ color: colors.primary }}>support page</Link>.
          </p>

          <h3 style={h3Style}>11.4 Supported Carriers</h3>
          <p style={pStyle}>
            SMS messaging is supported on most major US carriers. Carriers are not liable for delayed or
            undelivered messages.
          </p>
        </section>

        {/* 12. Changes to Terms */}
        <section style={sectionStyle}>
          <h2 id="changes" style={h2Style}>12. Changes to Terms</h2>
          <p style={pStyle}>
            We may modify these Terms at any time. We will notify users of significant changes via email
            or platform notification. Continued use of the platform after changes constitutes acceptance
            of the modified Terms.
          </p>
        </section>

        {/* ==================== PRIVACY POLICY ==================== */}
        <section style={{ ...sectionStyle, borderTop: `2px solid ${colors.border}`, paddingTop: spacing.xl, marginTop: spacing['2xl'] }}>
          <h2 id="privacy-policy" style={{ ...h2Style, marginTop: 0 }}>Privacy Policy</h2>
          <p style={{ marginBottom: spacing.lg, color: colors.textMuted, fontSize: typography.sizes.sm }}>
            <em>Last updated: March 2026 &mdash; This Privacy Policy is part of our Terms of Service</em>
          </p>

          {/* PP 1. Information We Collect */}
          <h3 id="pp-information-collect" style={h3Style}>1. Information We Collect</h3>
          <p style={pStyle}>
            We collect information you provide directly to us, as well as information collected automatically
            when you use our platform:
          </p>

          <p style={{ ...pStyle, fontWeight: typography.weights.semibold }}>Information You Provide:</p>
          <ul style={listStyle}>
            <li><strong>1.1 Account Information:</strong> Name, email address, phone number, and password when you create an account</li>
            <li><strong>1.2 Profile Information:</strong> Business name, address, and description for vendor accounts</li>
            <li><strong>1.3 Transaction Information:</strong> Order details, payment information (processed securely by our payment processing service), and pickup preferences</li>
            <li><strong>1.4 Location Information:</strong> Your location when you choose to share it for finding nearby markets and vendors</li>
            <li><strong>1.5 Communications:</strong> Messages you send through the platform, support requests, and feedback</li>
          </ul>

          <p style={{ ...pStyle, fontWeight: typography.weights.semibold }}>Information Collected Automatically:</p>
          <ul style={listStyle}>
            <li><strong>1.6 Device & Usage Information:</strong> Browser type and version, operating system, pages visited, features used, time spent on the platform, referring URLs, and general interaction patterns. This information helps us improve platform performance and user experience.</li>
            <li><strong>1.7 Push Notification Data:</strong> If you opt in to browser push notifications, we collect and store the push subscription endpoint provided by your browser. This data is used solely to deliver push notifications you have requested and is not shared with third parties for marketing purposes.</li>
          </ul>

          {/* PP 2. How We Use Your Information */}
          <h3 id="pp-how-we-use" style={h3Style}>2. How We Use Your Information</h3>
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

          {/* PP 3. Information Sharing */}
          <h3 id="pp-information-sharing" style={h3Style}>3. Information Sharing</h3>
          <p style={pStyle}>
            We share your information only in the following circumstances:
          </p>
          <ul style={listStyle}>
            <li><strong>3.1 With Vendors/Shoppers:</strong> Order information is shared between parties to facilitate transactions</li>
            <li>
              <strong>3.2 Service Providers:</strong> We share information with third-party service providers who
              perform services on our behalf, including:
              <ul style={{ ...listStyle, marginTop: spacing['2xs'], marginBottom: spacing['2xs'] }}>
                <li>Payment processing services</li>
                <li>Email delivery services</li>
                <li>SMS messaging services</li>
                <li>Cloud hosting and infrastructure providers</li>
                <li>Error monitoring and reliability services</li>
              </ul>
              These providers are contractually obligated to use your information only for the purpose of providing their services to us.
            </li>
            <li><strong>3.3 Legal Requirements:</strong> When required by law or to protect rights, safety, or property</li>
            <li><strong>3.4 Business Transfers:</strong> In connection with any merger, acquisition, or sale of assets</li>
            <li><strong>3.5 Aggregated Data:</strong> We may share anonymized, aggregated statistics about platform usage that cannot be used to identify any individual user. This data may be used for research, marketing, or business development purposes.</li>
          </ul>

          {/* PP 4. Mobile Information Privacy */}
          <h3 id="pp-mobile-privacy" style={h3Style}>4. Mobile Information Privacy</h3>
          <p style={pStyle}>
            We are committed to protecting your mobile information:
          </p>
          <ul style={listStyle}>
            <li>We will <strong>never sell, rent, or share your mobile phone number</strong> with third parties or affiliates for promotional or marketing purposes</li>
            <li>Your phone number is used solely for transactional notifications related to your account and orders on our platform</li>
            <li>Third-party SMS service providers who deliver messages on our behalf are contractually prohibited from using your phone number for any purpose other than delivering our messages</li>
          </ul>

          {/* PP 5. Data Retention */}
          <h3 id="pp-data-retention" style={h3Style}>5. Data Retention</h3>
          <p style={pStyle}>
            We retain your information as follows:
          </p>
          <ul style={listStyle}>
            <li><strong>5.1 Active Accounts:</strong> Your personal information and account data are retained for as long as your account remains active and you continue to use the platform.</li>
            <li><strong>5.2 Transaction Records:</strong> Records of transactions (orders, payments, payouts) are retained for a reasonable period after the transaction to support tax reporting, legal compliance, and dispute resolution.</li>
            <li><strong>5.3 Deleted Accounts:</strong> Upon account deletion, personal information (name, email, phone number, profile details) is removed within a reasonable period. Anonymized transaction records may persist indefinitely for accounting and legal purposes.</li>
            <li><strong>5.4 Inactive Accounts:</strong> Accounts that have been inactive for an extended period may be flagged for cleanup. We will attempt to notify you via email before any action is taken on an inactive account.</li>
          </ul>

          {/* PP 6. Data Security */}
          <h3 id="pp-data-security" style={h3Style}>6. Data Security</h3>

          <h3 style={{ ...h3Style, fontSize: typography.sizes.base }}>6.1 Security Measures</h3>
          <p style={pStyle}>
            We implement appropriate technical and organizational security measures to protect your personal
            information, including encryption of data in transit, secure authentication mechanisms, and
            access controls. However, no method of transmission over the Internet or electronic storage
            is 100% secure, and we cannot guarantee absolute security.
          </p>

          <h3 style={{ ...h3Style, fontSize: typography.sizes.base }}>6.2 Data Breach Notification</h3>
          <p style={pStyle}>
            In the event of a data breach that affects your personal information, we will notify affected
            users in accordance with applicable law. Notification may be provided via email, in-app
            notification, or other appropriate means, and will include information about the nature of the
            breach and steps you can take to protect yourself.
          </p>

          {/* PP 7. Your Rights and Choices */}
          <h3 id="pp-your-rights" style={h3Style}>7. Your Rights and Choices</h3>
          <p style={pStyle}>
            You may:
          </p>
          <ul style={listStyle}>
            <li><strong>7.1 Access and Update:</strong> Access, update, or delete your account information at any time through your account settings</li>
            <li><strong>7.2 Communications:</strong> Opt out of promotional communications while still receiving essential transactional notifications</li>
            <li><strong>7.3 Data Portability:</strong> Request an export of your personal data in a commonly used format by contacting us through our <Link href={`/${vertical}/support`} style={{ color: colors.primary }}>support page</Link></li>
            <li><strong>7.4 Account Deletion:</strong> Request deletion of your account and associated personal data, subject to our data retention obligations</li>
          </ul>
          <p style={pStyle}>
            You may also opt out of SMS notifications by replying STOP, disabling SMS in your notification
            preferences, or removing your phone number from your profile.
          </p>

          <h3 style={{ ...h3Style, fontSize: typography.sizes.base }}>7.5 California Residents (CCPA)</h3>
          <p style={pStyle}>
            If you are a California resident, you have additional rights under the California Consumer Privacy
            Act (CCPA), including:
          </p>
          <ul style={listStyle}>
            <li><strong>Right to Know:</strong> You may request disclosure of the categories and specific pieces of personal information we have collected about you</li>
            <li><strong>Right to Delete:</strong> You may request deletion of your personal information, subject to certain legal exceptions</li>
            <li><strong>Right to Opt Out of Sale:</strong> You have the right to opt out of the &quot;sale&quot; of your personal information. <strong>We do not sell your personal information</strong> to third parties for monetary consideration or otherwise</li>
            <li><strong>Non-Discrimination:</strong> We will not discriminate against you for exercising your CCPA rights</li>
          </ul>
          <p style={pStyle}>
            To exercise your rights, contact us through our{' '}
            <Link href={`/${vertical}/support`} style={{ color: colors.primary }}>support page</Link>.
            We will verify your identity before fulfilling any request.
          </p>

          <h3 style={{ ...h3Style, fontSize: typography.sizes.base }}>7.6 Illinois Residents</h3>
          <p style={pStyle}>
            We do not collect biometric information (such as fingerprints, facial recognition data, or
            voiceprints) from our users. If this practice changes in the future, we will obtain informed
            consent from affected users in compliance with the Illinois Biometric Information Privacy Act
            (BIPA) before collecting any such data.
          </p>

          {/* PP 8. Cookies and Tracking */}
          <h3 id="pp-cookies" style={h3Style}>8. Cookies and Tracking</h3>
          <p style={pStyle}>
            We use cookies and similar technologies to operate and improve our platform. Our use of
            cookies falls into the following categories:
          </p>
          <ul style={listStyle}>
            <li><strong>8.1 Essential Cookies:</strong> Required for core platform functionality, including your authentication session and location preference cookie. These cannot be disabled without affecting platform functionality.</li>
            <li><strong>8.2 Functional Cookies:</strong> Used to remember your preferences and settings to provide a personalized experience, such as display preferences and notification settings.</li>
            <li><strong>8.3 Analytics Cookies:</strong> Used to understand how visitors interact with the platform so we can improve performance and user experience. We do <strong>not</strong> use third-party advertising trackers or share analytics data with advertising networks.</li>
          </ul>
          <p style={pStyle}>
            You can control cookies through your browser settings. Disabling essential cookies may prevent
            you from using certain features of the platform.
          </p>

          {/* PP 9. Geographic Scope */}
          <h3 id="pp-geographic-scope" style={h3Style}>9. Geographic Scope</h3>
          <p style={pStyle}>
            Our platform is designed to operate within the United States. All personal data is processed and
            stored within the United States using cloud hosting providers located in the US. If you access
            the platform from outside the United States, you acknowledge that your data will be transferred
            to and processed in the United States, which may have different data protection laws than your
            country of residence.
          </p>

          {/* PP 10. Children's Privacy */}
          <h3 id="pp-children" style={h3Style}>10. Children&apos;s Privacy</h3>
          <p style={pStyle}>
            Our platform is not intended for or directed at children under the age of 13. We do not knowingly
            collect personal information from children under 13. Vendor accounts require the account holder
            to be at least 18 years of age. If we become aware that we have collected personal information
            from a child under 13, we will take steps to delete that information promptly. If you believe
            a child under 13 has provided us with personal information, please contact us through our{' '}
            <Link href={`/${vertical}/support`} style={{ color: colors.primary }}>support page</Link>.
          </p>

          {/* PP 11. Contact Us About Privacy */}
          <h3 id="pp-contact" style={h3Style}>11. Contact Us About Privacy</h3>
          <p style={pStyle}>
            If you have questions about this Privacy Policy, our data practices, or wish to exercise any of
            your rights described above, please contact us through our{' '}
            <Link href={`/${vertical}/support`} style={{ color: colors.primary }}>support page</Link>.
          </p>

          {/* PP 12. Changes to Privacy Policy */}
          <h3 id="pp-changes" style={h3Style}>12. Changes to Privacy Policy</h3>
          <p style={pStyle}>
            We may update this Privacy Policy from time to time to reflect changes in our practices,
            technology, legal requirements, or other factors. When we make significant changes to this
            Privacy Policy, we will notify you via email and/or an in-app notification. The &quot;Last updated&quot;
            date at the top of this Privacy Policy indicates when it was most recently revised. Your
            continued use of the platform after any changes to this Privacy Policy constitutes your
            acceptance of the updated policy.
          </p>
        </section>

        {/* Contact Section */}
        <section style={sectionStyle}>
          <h2 id="contact" style={h2Style}>Contact Us</h2>
          <p style={pStyle}>
            If you have any questions about these Terms of Service or our Privacy Policy, please visit our{' '}
            <Link href={`/${vertical}/support`} style={{ color: colors.primary }}>support page</Link>.
          </p>
        </section>

      </div>
    </main>
  )
}
