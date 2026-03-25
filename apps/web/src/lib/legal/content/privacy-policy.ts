import type { LegalDocument } from '../types'

export function getPrivacyPolicy(): LegalDocument {
  return {
    type: 'privacy_policy',
    title: 'PRIVACY POLICY',
    lastUpdated: 'March 2026',
    preamble: [
      'This Privacy Policy describes how 815 Enterprises ("Company," "we," "us," "our") collects, uses, shares, and protects your personal information when you use our marketplace platform located at [PLATFORM_DOMAIN] (the "Platform"). This Privacy Policy is incorporated into and forms part of the Platform User Agreement.',
    ],
    sections: [
      {
        id: 'privacy-info-collect',
        title: '1. INFORMATION WE COLLECT',
        level: 'article',
        content: [],
        subsections: [
          {
            id: 'privacy-info-collect-1.1',
            title: '1.1 Information You Provide',
            level: 'section',
            content: [
              '(a) Account Information: Name, email address, and password when you create an account;\n\n(b) Optional Contact Information: Phone number, if you choose to provide one for SMS notifications;\n\n(c) Profile Information: Business name, address, description, certifications, social media links, and other business details for vendor accounts;\n\n(d) Transaction Information: Order details, pickup preferences, tipping selections, and payment references (payment card details are collected and processed directly by our PCI-compliant payment processor — we do not store full payment card numbers, CVV codes, or card expiration dates);\n\n(e) Location Information: Your location when you choose to share it for finding nearby [VERTICAL_MARKET_TERM]s, vendors, and pickup locations (via browser geolocation with your permission, or manual ZIP code entry);\n\n(f) Support Requests: Information submitted through the Platform\'s support page, including name, email, and message content;\n\n(g) Feedback and Reviews: Post-transaction ratings (1-5 stars) and optional written comments about vendor experiences; and\n\n(h) Vendor Documentation: Business licenses, certifications, insurance documents, tax identification information, permits, and other documentation submitted during the vendor onboarding process.',
            ],
          },
          {
            id: 'privacy-info-collect-1.2',
            title: '1.2 Information Collected Automatically',
            level: 'section',
            content: [
              '(a) Device and Usage Information: Browser type, operating system, pages visited, features used, and general interaction patterns;\n\n(b) Location Cookie: If you share your location, we store it in a secure, httpOnly cookie (not accessible to JavaScript) that persists for 30 days, used solely to display nearby [VERTICAL_MARKET_TERM]s and vendors;\n\n(c) Push Notification Data: If you opt in to push notifications, we store the push subscription endpoint provided by your browser, used solely to deliver requested notifications; and\n\n(d) Log Data: Server logs, IP addresses, access times, and error reports used for security monitoring and Platform maintenance.',
            ],
          },
        ],
      },
      {
        id: 'privacy-how-we-use',
        title: '2. HOW WE USE YOUR INFORMATION',
        level: 'article',
        content: [
          'We use collected information to:\n\n(a) Provide, operate, maintain, and improve the Platform and its features;\n\n(b) Process transactions, manage orders, and facilitate payouts;\n\n(c) Connect shoppers with vendors at local [VERTICAL_MARKET_TERM]s, venues, and pickup locations;\n\n(d) Send transactional notifications about orders, account activity, and Platform features;\n\n(e) Respond to support requests, comments, and questions;\n\n(f) Monitor and analyze usage trends and activities to improve Platform performance;\n\n(g) Detect, investigate, and prevent fraudulent, unauthorized, or illegal activity;\n\n(h) Enforce our terms of service and protect the rights, property, and safety of the Company, its users, and third parties;\n\n(i) Comply with legal obligations and respond to lawful requests from governmental authorities; and\n\n(j) Communicate important updates about the Platform, including changes to our terms and policies.',
        ],
      },
      {
        id: 'privacy-sharing',
        title: '3. INFORMATION SHARING',
        level: 'article',
        content: [
          'We share your information only in the following circumstances:\n\n(a) With Vendors/Shoppers: Order-related information is shared between parties to facilitate transactions, including names, order details, and pickup information;\n\n(b) Service Providers: We share information with third-party service providers who perform services on our behalf, including:\n- Stripe — payment processing and vendor payouts\n- Resend — transactional email delivery\n- Twilio — SMS messaging (when available)\n- Supabase — database hosting and user authentication\n- Vercel — web application hosting\n- Sentry — error monitoring and reporting (error context only)\n- US Census Bureau / OpenStreetMap — location geocoding (coordinates only, no personal data)\n\nThese providers are contractually obligated to use your information only for the purpose of providing their services to us and are bound by appropriate data protection obligations;\n\n(c) Legal Requirements: When required by law, subpoena, court order, or governmental regulation, or when we believe in good faith that disclosure is necessary to protect our rights, your safety, or the safety of others, investigate fraud, or respond to a government request;\n\n(d) Business Transfers: In connection with any merger, acquisition, reorganization, sale of assets, or bankruptcy proceeding, your information may be transferred as a business asset. We will notify you of any such transfer and any choices you may have regarding your information; and\n\n(e) Aggregated Data: We may share anonymized, aggregated statistics about Platform usage that cannot be used to identify any individual user.\n\nWe do not sell your personal information to third parties for monetary consideration or otherwise. We do not use third-party advertising trackers or share data with advertising networks.',
        ],
      },
      {
        id: 'privacy-mobile',
        title: '4. MOBILE INFORMATION PRIVACY',
        level: 'article',
        content: [
          '(a) We will never sell, rent, or share your mobile phone number with third parties or affiliates for promotional or marketing purposes;\n\n(b) Your phone number is used solely for transactional notifications related to your account and orders; and\n\n(c) Third-party SMS service providers who deliver messages on our behalf are contractually prohibited from using your phone number for any purpose other than delivering our messages.',
        ],
      },
      {
        id: 'privacy-retention',
        title: '5. DATA RETENTION',
        level: 'article',
        content: [
          '(a) Active Accounts: Personal information and account data are retained for as long as your account remains active;\n\n(b) Transaction Records: Records of transactions, payments, and payouts are retained for a minimum of seven (7) years for tax reporting, legal compliance, and dispute resolution purposes;\n\n(c) Tax-Related Data: As a marketplace facilitator under Texas Tax Code Section 151.0242, the Company retains transaction records — including sales amounts, sales tax collected, tax rates applied, product taxability classifications, pickup locations, and associated vendor and buyer information — for a minimum of four (4) years as required by Texas law. These records may be shared with the Texas Comptroller of Public Accounts, the Internal Revenue Service, payment processors, and tax reporting service providers as required by law;\n\n(d) Deleted Accounts: Upon account deletion, personal information is anonymized (display name replaced, email removed, location data cleared). Anonymized transaction records and tax-related data persist as required by law for accounting, tax compliance, and legal purposes;\n\n(e) System Logs: Error logs are retained for ninety (90) days. Notification records are retained for sixty (60) days. Public activity events expire after seven (7) days;\n\n(f) Vendor Agreement Records: Records of vendor agreement acceptances, including timestamps and IP addresses, are retained indefinitely to support enforcement of contractual obligations;\n\n(g) Vendor Tax Information: Taxpayer identification numbers, legal names, addresses, and 1099-K data collected for federal tax reporting are retained for a minimum of seven (7) years as required by IRS regulations; and\n\n(h) Audit Logs: Records of administrative actions and data changes are retained indefinitely for security and compliance purposes.',
        ],
      },
      {
        id: 'privacy-security',
        title: '6. DATA SECURITY',
        level: 'article',
        content: [],
        subsections: [
          {
            id: 'privacy-security-6.1',
            title: '6.1 Security Measures',
            level: 'section',
            content: [
              'We implement industry-standard technical and organizational security measures to protect your personal information, including encryption of data in transit (TLS/SSL), secure authentication mechanisms, row-level security controls on database access, httpOnly cookies, access controls, and regular security monitoring. However, no method of electronic transmission or storage is completely secure, and we cannot guarantee absolute security.',
            ],
          },
          {
            id: 'privacy-security-6.2',
            title: '6.2 Data Breach Notification',
            level: 'section',
            content: [
              'In the event of a data breach affecting your personal information, we will notify affected users in accordance with applicable law, including the Texas Identity Theft Enforcement and Protection Act (Tex. Bus. & Com. Code Chapter 521). Notification will include information about the nature of the breach and recommended protective steps.',
            ],
          },
        ],
      },
      {
        id: 'privacy-cookies',
        title: '7. COOKIES AND TRACKING',
        level: 'article',
        content: [
          '(a) Essential Cookie: We use a single essential cookie (user_location) to store your location preference for finding nearby [VERTICAL_MARKET_TERM]s. This cookie is httpOnly (not accessible to JavaScript), persists for 30 days, and contains only location coordinates and display text;\n\n(b) Authentication: Session authentication is managed by our database provider and does not use traditional tracking cookies; and\n\n(c) No Third-Party Tracking: We do not use third-party advertising trackers, analytics cookies, or tracking pixels. We do not share browsing data with advertising networks.',
        ],
      },
      {
        id: 'privacy-rights',
        title: '8. YOUR RIGHTS AND CHOICES',
        level: 'article',
        content: [
          '(a) Access and Update: You may access, update, or correct your account information at any time through your account settings;\n\n(b) Notification Preferences: You may control which notification channels are active (email, SMS, push) through your account settings. In-app notifications for active orders cannot be disabled;\n\n(c) Location: You may decline to share your location. The Platform will function with reduced local relevance but will not prevent you from browsing or placing orders;\n\n(d) Account Deletion: You may request deletion of your account and associated personal data through your account settings, subject to our data retention obligations and any surviving contractual obligations; and\n\n(e) SMS Opt-Out: You may opt out of SMS notifications by replying STOP, adjusting your notification preferences, or removing your phone number from your profile.',
        ],
        subsections: [
          {
            id: 'privacy-rights-8.1',
            title: '8.1 Texas Residents',
            level: 'section',
            content: [
              'If you are a Texas resident, you may have additional rights under the Texas Data Privacy and Security Act (effective July 1, 2024), including the right to access, correct, delete, and obtain a copy of your personal data, and the right to opt out of the processing of your personal data for targeted advertising, sale, or profiling. To exercise these rights, contact us through the Platform\'s support page.',
            ],
          },
          {
            id: 'privacy-rights-8.2',
            title: '8.2 California Residents (CCPA)',
            level: 'section',
            content: [
              'If you are a California resident, you have rights under the California Consumer Privacy Act (CCPA), including: the right to know what personal information we collect and how it is used; the right to request deletion of your personal information; the right to opt out of the sale of your personal information (we do not sell personal information); and the right to non-discrimination for exercising your rights.',
            ],
          },
          {
            id: 'privacy-rights-8.3',
            title: '8.3 Illinois Residents',
            level: 'section',
            content: [
              'We do not collect biometric information. If this practice changes, we will obtain informed consent in compliance with the Illinois Biometric Information Privacy Act (BIPA).',
            ],
          },
        ],
      },
      {
        id: 'privacy-children',
        title: '9. CHILDREN\'S PRIVACY',
        level: 'article',
        content: [
          'The Platform is not intended for children under thirteen (13) years of age. We do not knowingly collect personal information from children under 13. If we become aware that we have collected personal information from a child under 13, we will take steps to delete that information promptly.',
        ],
      },
      {
        id: 'privacy-geographic',
        title: '10. GEOGRAPHIC SCOPE',
        level: 'article',
        content: [
          'The Platform is designed to operate within the United States. All personal data is processed and stored within the United States. If you access the Platform from outside the United States, you acknowledge that your data will be transferred to and processed in the United States, which may have different data protection laws than your country of residence.',
        ],
      },
      {
        id: 'privacy-contact',
        title: '11. CONTACT US',
        level: 'article',
        content: [
          'If you have questions about this Privacy Policy, wish to exercise any of your rights, or have concerns about our data practices, please contact us through the Platform\'s support page at [PLATFORM_DOMAIN]/support.',
        ],
      },
      {
        id: 'privacy-changes',
        title: '12. CHANGES TO THIS PRIVACY POLICY',
        level: 'article',
        content: [
          'We may update this Privacy Policy to reflect changes in our practices, technology, legal requirements, or other factors. Material changes will be communicated via email or in-app notification at least thirty (30) days prior to taking effect. Your continued use of the Platform after changes constitutes acceptance of the updated Privacy Policy.',
        ],
      },
    ],
  }
}
