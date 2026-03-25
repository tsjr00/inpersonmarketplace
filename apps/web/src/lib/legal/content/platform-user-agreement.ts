import type { LegalDocument } from '../types'

export function getPlatformUserAgreement(): LegalDocument {
  return {
    type: 'platform_user',
    title: 'PLATFORM USER AGREEMENT',
    lastUpdated: 'March 2026',
    preamble: [
      'This Platform User Agreement ("Agreement") is a legally binding contract between you ("User," "you," "your") and 815 Enterprises ("Company," "we," "us," "our"), governing your access to and use of the marketplace platform located at [PLATFORM_DOMAIN], including any related services or tools (the "Platform").',
      'BY ACCESSING OR USING THE PLATFORM, YOU ACKNOWLEDGE THAT YOU HAVE READ, UNDERSTOOD, AND AGREE TO BE BOUND BY THIS AGREEMENT. IF YOU DO NOT AGREE TO THESE TERMS, YOU MUST IMMEDIATELY CEASE ALL USE OF THE PLATFORM.',
    ],
    sections: [
      {
        id: 'acceptance',
        title: 'ARTICLE 1 — ACCEPTANCE OF TERMS',
        level: 'article',
        content: [],
        subsections: [
          {
            id: 'acceptance-1',
            title: '1.1 Agreement to Terms.',
            level: 'section',
            content: [
              'By accessing, browsing, creating an account on, or making a purchase through the Platform, you agree to be bound by this Agreement and all terms incorporated herein by reference. This Agreement is effective upon your first access to or use of the Platform.',
            ],
          },
          {
            id: 'acceptance-2',
            title: '1.2 Modifications.',
            level: 'section',
            content: [
              'The Company may modify this Agreement at any time by posting the revised terms on the Platform and updating the "Last updated" date. For material changes, the Company will provide notice via email or in-app notification at least thirty (30) days prior to the changes taking effect. Your continued use of the Platform after the effective date of any modification constitutes acceptance of the modified Agreement. If you do not agree to any modification, you must cease use of the Platform.',
            ],
          },
          {
            id: 'acceptance-3',
            title: '1.3 Additional Agreements.',
            level: 'section',
            content: [
              'Certain users may be subject to additional agreements based on their level of engagement with the Platform, including the Vendor Service Agreement and Vendor Partner Agreement. Where applicable, those additional agreements supplement this Agreement.',
            ],
          },
        ],
      },
      {
        id: 'user-accounts',
        title: 'ARTICLE 2 — USER ACCOUNTS',
        level: 'article',
        content: [],
        subsections: [
          {
            id: 'user-accounts-1',
            title: '2.1 Account Registration.',
            level: 'section',
            content: [
              'To access certain features of the Platform, you must create an account by providing accurate, current, and complete information. You agree to promptly update your account information to maintain its accuracy. Providing false or misleading information is grounds for immediate account termination.',
            ],
          },
          {
            id: 'user-accounts-2',
            title: '2.2 Account Security.',
            level: 'section',
            content: [
              'You are solely responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You agree to immediately notify the Company of any unauthorized access to or use of your account. The Company shall not be liable for any loss or damage arising from your failure to secure your account credentials.',
            ],
          },
          {
            id: 'user-accounts-3',
            title: '2.3 Account Types.',
            level: 'section',
            content: [
              'The Platform supports the following account types:\n\n(a) Shopper Accounts — For individuals who wish to browse products, place orders, and purchase goods from vendors through the Platform.\n\n(b) Vendor Accounts — For vendors, producers, food service providers, and other sellers who wish to list and sell products or services through the Platform. Vendor accounts are subject to additional terms as set forth in the Vendor Service Agreement.',
            ],
          },
          {
            id: 'user-accounts-4',
            title: '2.4 Minimum Age.',
            level: 'section',
            content: [
              'You represent and warrant that you are at least thirteen (13) years of age. Users under eighteen (18) must have verifiable parental or legal guardian consent. Vendor accounts require the account holder to be at least eighteen (18) years of age.',
            ],
          },
          {
            id: 'user-accounts-5',
            title: '2.5 Account Deletion.',
            level: 'section',
            content: [
              'You may request deletion of your account at any time through your account settings or by contacting us through the Platform\'s support page. Upon deletion, your personal information will be anonymized in accordance with our Privacy Policy. Certain transaction records may be retained as required by applicable law or for legitimate business purposes, including tax compliance and financial reporting. Account deletion does not release you from obligations accrued prior to deletion, including any confidentiality obligations that survive termination.',
            ],
          },
          {
            id: 'user-accounts-6',
            title: '2.6 Account Suspension and Termination.',
            level: 'section',
            content: [
              'The Company reserves the right to suspend, restrict, or terminate any account at any time, with or without cause, at the Company\'s sole discretion, including but not limited to situations involving: violation of this Agreement, fraudulent or deceptive activity, quality or safety concerns, regulatory changes, business restructuring, or conduct that the Company determines, in its sole judgment, to be detrimental to the Platform or its community. The Company will make reasonable efforts to provide notice of suspension or termination, but is not required to do so where immediate action is warranted.',
            ],
          },
        ],
      },
      {
        id: 'shopper-obligations',
        title: 'ARTICLE 3 — SHOPPER OBLIGATIONS',
        level: 'article',
        content: [],
        subsections: [
          {
            id: 'shopper-obligations-1',
            title: '3.1 Order Commitment.',
            level: 'section',
            content: [
              'When you place an order through the Platform, you are making a binding commitment to pick up and pay for those items at the designated time and location. Repeated no-shows, order abandonment, or patterns of disruptive ordering behavior may result in account restrictions, suspension, or termination.',
            ],
          },
          {
            id: 'shopper-obligations-2',
            title: '3.2 Pickup Responsibility.',
            level: 'section',
            content: [
              'As a Shopper, you agree to:\n\n(a) Pick up orders at the designated [VERTICAL_MARKET_TERM], venue, or pickup location during the specified hours;\n\n(b) Present valid identification or order confirmation as reasonably required;\n\n(c) Inspect products at the time of pickup and raise any quality concerns with the vendor directly at that time;\n\n(d) Submit order cancellations, report fulfillment issues, and provide post-transaction feedback through the Platform\'s order management tools; and\n\n(e) Treat vendors, [VERTICAL_MARKET_TERM] staff, and other community members with respect and courtesy.',
            ],
          },
          {
            id: 'shopper-obligations-3',
            title: '3.3 No Direct Messaging.',
            level: 'section',
            content: [
              'The Platform does not provide direct messaging between shoppers and vendors. In-person interaction at the point of pickup is the primary means of communication between shoppers and vendors regarding order details, product questions, or quality concerns.',
            ],
          },
          {
            id: 'shopper-obligations-4',
            title: '3.4 External Payment Methods.',
            level: 'section',
            content: [
              'Certain vendors may offer alternative payment methods for in-person transactions, including but not limited to cash, Venmo, Cash App, PayPal, or other direct payment arrangements between you and the vendor ("External Payment Methods"). When you elect to use an External Payment Method:\n\n(a) The transaction is conducted directly between you and the vendor;\n\n(b) The Platform facilitates the order, tracks fulfillment, and applies applicable fees, but does not process the payment itself;\n\n(c) Refunds for transactions completed through External Payment Methods must be arranged directly between you and the vendor — the Platform cannot process refunds for External Payment transactions; and\n\n(d) You acknowledge that the vendor\'s use of External Payment Methods is subject to the vendor\'s agreement with the Company and applicable Platform policies.',
            ],
          },
        ],
      },
      {
        id: 'payment-terms',
        title: 'ARTICLE 4 — PAYMENT TERMS',
        level: 'article',
        content: [],
        subsections: [
          {
            id: 'payment-terms-1',
            title: '4.1 Platform-Processed Payments.',
            level: 'section',
            content: [
              'Payments made via credit or debit card through the Platform ("Platform-Processed Payments") are processed securely through Stripe, Inc., a PCI-compliant third-party payment processor ("Payment Processor"). By making a Platform-Processed Payment, you agree to the Payment Processor\'s terms of service in addition to this Agreement. The Company does not directly store your full payment card information.',
            ],
          },
          {
            id: 'payment-terms-2',
            title: '4.2 Platform Fees.',
            level: 'section',
            content: [
              'The Platform charges service fees to facilitate transactions and sustain Platform operations:\n\n(a) Buyer Service Fee: A fee of six and one-half percent (6.5%) of the order subtotal is included in the transaction amount for each order. This fee is incorporated into the displayed product prices on the Platform and covers Platform services, technology infrastructure, and transaction facilitation.\n\n(b) Order Service Fee: A flat fee of fifteen cents ($0.15) per order is applied to Platform-Processed Payment orders. This fee is displayed as a separate line item at checkout.\n\n(c) Small Order Fee: Orders below [SMALL_ORDER_THRESHOLD] may be subject to a small order fee of [SMALL_ORDER_FEE], displayed at checkout.\n\n(d) The Company reserves the right to modify fee rates upon thirty (30) days\' notice to active users. Updated fee rates will be reflected in product pricing and at checkout.',
            ],
          },
          {
            id: 'payment-terms-3',
            title: '4.3 Vendor Fee Structure.',
            level: 'section',
            content: [
              'Vendors are subject to service fees as set forth in the Vendor Service Agreement. Specific fee structures, rates, and payment terms applicable to vendors are disclosed to vendors under the terms of their applicable vendor agreements and are not addressed in this Agreement.',
            ],
          },
          {
            id: 'payment-terms-4',
            title: '4.4 Refunds and Cancellations.',
            level: 'section',
            content: [
              '(a) Grace Period: Orders may be cancelled within [GRACE_PERIOD] of placement for a full refund, regardless of vendor status.\n\n(b) After Grace Period, Before Vendor Confirmation: If the vendor has not yet confirmed the order, cancellation results in a full refund.\n\n(c) After Grace Period, After Vendor Confirmation: A cancellation fee of twenty-five percent (25%) of the order total (including applicable buyer fees) applies. The remaining seventy-five percent (75%) is refunded to the shopper.\n\n(d) Vendor-Initiated Cancellation: If a vendor cancels or rejects your order, you will receive a full refund.\n\n(e) Product Quality Issues: Product quality concerns should be addressed directly with the vendor at the time of pickup. After pickup, you may report a fulfillment issue through the Platform\'s order management tools. The vendor may resolve the issue by issuing a refund or by confirming delivery.\n\n(f) Order Expiration: If a vendor does not confirm your order within the applicable confirmation window, the order will be automatically cancelled and a full refund issued.',
            ],
          },
          {
            id: 'payment-terms-5',
            title: '4.5 Tipping.',
            level: 'section',
            content: [
              'The Platform provides an optional tipping feature at checkout, available for certain verticals. Tips are entirely voluntary and are not required to complete a purchase.\n\n(a) Tip amounts are calculated as a percentage of the displayed order subtotal. Preset options (10%, 15%, 20%) and a custom option are available.\n\n(b) The vendor receives the portion of the tip calculated on the product cost. A small portion of the tip corresponding to the buyer service fee component of the order is retained by the Company to offset associated processing costs.\n\n(c) Tip amounts and the selected percentage are displayed at checkout before the order is finalized.',
            ],
          },
          {
            id: 'payment-terms-6',
            title: '4.6 Transaction Liability.',
            level: 'section',
            content: [
              'The Company acts as a marketplace facilitator as defined under Texas Tax Code Section 151.0242. While the Company facilitates transactions between vendors and shoppers and fulfills certain tax collection obligations as required by law, the Company is not a party to the underlying transaction between vendor and shopper. The Company is not responsible for disputes, losses, product quality issues, or other issues arising from any transaction facilitated through the Platform. All purchases are made at the shopper\'s own risk.',
            ],
          },
          {
            id: 'payment-terms-7',
            title: '4.7 Sales Tax.',
            level: 'section',
            content: [
              'As a marketplace facilitator under Texas law, the Company collects applicable state and local sales tax on taxable items purchased through the Platform. Sales tax is calculated based on the product category and the tax rate applicable to the pickup location. Sales tax is displayed as a separate line item at checkout and is included in the total amount charged to the buyer. The Company remits collected sales tax to the Texas Comptroller of Public Accounts as required by law. Sales tax rates and product taxability are determined in accordance with Texas Tax Code Chapter 151 and applicable Texas Comptroller rules.',
            ],
          },
          {
            id: 'payment-terms-8',
            title: '4.8 Tax-Related Data.',
            level: 'section',
            content: [
              'The Company collects, stores, and retains transaction data — including purchase amounts, tax amounts, product categories, pickup locations, and associated tax rates — for a minimum of four (4) years as required by Texas tax law. This data may be shared with tax authorities, payment processors, and tax reporting service providers as required by law or as necessary to fulfill the Company\'s obligations as a marketplace facilitator. By using the Platform, you consent to this collection, storage, and sharing of tax-related transaction data.',
            ],
          },
        ],
      },
      {
        id: 'subscriptions',
        title: 'ARTICLE 5 — SUBSCRIPTION AND PREPAID SERVICES',
        level: 'article',
        content: [],
        subsections: [
          {
            id: 'subscriptions-1',
            title: '5.1 Vendor Subscription Plans.',
            level: 'section',
            content: [
              'Vendors may subscribe to paid plans that provide enhanced features, increased listing limits, and access to additional Platform tools. Specific plan details and pricing are set forth in the Vendor Service Agreement.',
            ],
          },
          {
            id: 'subscriptions-2',
            title: '5.2 Prepaid Product Offerings.',
            level: 'section',
            content: [
              'The Platform supports prepaid multi-week product offerings (referred to as "[VERTICAL_BOX_TERM]" on the Platform). These are prepaid purchases for a defined period and are not auto-renewing subscriptions:\n\n(a) Payment is collected in full at the time of purchase for the entire offering period;\n\n(b) Vendors are obligated to fulfill each scheduled pickup within the offering as described in the listing;\n\n(c) Prepaid offerings are non-refundable after purchase except as required by applicable law;\n\n(d) If a vendor fails to fulfill a scheduled pickup, the Platform may issue account credit to the shopper for the unfulfilled portion at its discretion; and\n\n(e) Scheduled pickups require mutual confirmation between vendor and shopper through the Platform\'s confirmation process.',
            ],
          },
        ],
      },
      {
        id: 'usage-rules',
        title: 'ARTICLE 6 — PLATFORM USAGE RULES',
        level: 'article',
        content: [],
        subsections: [
          {
            id: 'usage-rules-1',
            title: '6.1 Prohibited Activities.',
            level: 'section',
            content: [
              'You shall not, and shall not permit any third party to:\n\n(a) Use the Platform for any unlawful purpose or in violation of any applicable federal, state, or local law or regulation;\n\n(b) Misrepresent your identity, qualifications, or affiliation with any person or entity;\n\n(c) Interfere with, disrupt, or place an unreasonable burden on the Platform or its infrastructure;\n\n(d) Attempt to gain unauthorized access to any portion of the Platform, its systems, networks, or data;\n\n(e) Use any automated systems, including but not limited to bots, spiders, crawlers, scrapers, or scripts, to access the Platform or collect data therefrom without the Company\'s prior written consent;\n\n(f) Harass, threaten, intimidate, or abuse other users, vendors, or Platform personnel;\n\n(g) Post false, misleading, defamatory, or libelous content;\n\n(h) Transmit any virus, malware, or other harmful code through the Platform;\n\n(i) Engage in any activity that could damage, disable, overburden, or impair the Platform; or\n\n(j) Assist, encourage, or enable any third party to engage in any of the foregoing prohibited activities.',
            ],
          },
          {
            id: 'usage-rules-2',
            title: '6.2 Content Standards.',
            level: 'section',
            content: [
              'All content posted to the Platform must be accurate, lawful, and respectful. The Company reserves the right to remove, without notice, any content that violates these standards or that the Company determines, in its sole discretion, to be harmful to the Platform or its community.',
            ],
          },
          {
            id: 'usage-rules-3',
            title: '6.3 Third-Party Links and Services.',
            level: 'section',
            content: [
              'The Platform may contain links to third-party websites and services. The Company is not responsible for the content, accuracy, privacy practices, or availability of third-party websites or services. Your use of third-party services is at your own risk and subject to the terms and conditions of those services.',
            ],
          },
        ],
      },
      {
        id: 'sms-terms',
        title: 'ARTICLE 7 — SMS AND TEXT MESSAGING TERMS',
        level: 'article',
        content: [],
        subsections: [
          {
            id: 'sms-terms-1',
            title: '7.1 Consent to Receive Messages.',
            level: 'section',
            content: [
              'By creating an account and opting in to SMS notifications, you consent to receive recurring automated text messages from the Platform at the mobile phone number you provide. Messages include transactional notifications such as order confirmations, cancellation alerts, pickup reminders, and urgent status changes. Consent is not a condition of purchase. Message frequency varies based on order activity.',
            ],
          },
          {
            id: 'sms-terms-2',
            title: '7.2 Message and Data Rates.',
            level: 'section',
            content: [
              'Standard message and data rates charged by your mobile carrier may apply. The Company is not responsible for carrier charges.',
            ],
          },
          {
            id: 'sms-terms-3',
            title: '7.3 Opt-Out.',
            level: 'section',
            content: [
              'You may opt out of SMS notifications at any time by: (a) replying STOP to any text message from the Platform; (b) disabling SMS notifications in your account settings; or (c) removing your phone number from your account profile. After opting out, you will receive one final confirmation message. You will continue to receive in-app and email notifications.',
            ],
          },
          {
            id: 'sms-terms-4',
            title: '7.4 Help.',
            level: 'section',
            content: [
              'For assistance with SMS messaging, reply HELP to any text message from the Platform or contact us through the Platform\'s support page.',
            ],
          },
          {
            id: 'sms-terms-5',
            title: '7.5 Supported Carriers.',
            level: 'section',
            content: [
              'SMS messaging is supported on most major US carriers. Carriers are not liable for delayed or undelivered messages. SMS availability may vary based on carrier authorization status.',
            ],
          },
        ],
      },
      {
        id: 'intellectual-property',
        title: 'ARTICLE 8 — INTELLECTUAL PROPERTY AND PROPRIETARY RIGHTS',
        level: 'article',
        content: [],
        subsections: [
          {
            id: 'intellectual-property-1',
            title: '8.1 Platform Ownership.',
            level: 'section',
            content: [
              'The Platform, including but not limited to its software, source code, object code, algorithms, databases, data compilations, design elements, user interfaces, text, graphics, logos, icons, images, audio clips, digital downloads, and all other content and materials not submitted by users (collectively, "Platform Content"), is the exclusive property of 815 Enterprises and is protected by United States and international copyright, trademark, patent, trade secret, and other intellectual property and proprietary rights laws.',
            ],
          },
          {
            id: 'intellectual-property-2',
            title: '8.2 Restrictions on Use.',
            level: 'section',
            content: [
              'Except as expressly authorized by this Agreement, you shall not, directly or indirectly:\n\n(a) Copy, reproduce, distribute, modify, adapt, translate, create derivative works from, publicly display, publicly perform, republish, or transmit any Platform Content;\n\n(b) Reverse engineer, decompile, disassemble, or otherwise attempt to derive the source code, algorithms, data structures, or underlying ideas or techniques of the Platform or any component thereof;\n\n(c) Use any data mining, robots, scraping, or similar data gathering or extraction methods on or in connection with the Platform;\n\n(d) Systematically download, store, or cache any Platform data, including but not limited to vendor information, product listings, pricing data, [VERTICAL_MARKET_TERM] schedules, user data, or marketplace analytics;\n\n(e) Use any information obtained from the Platform to develop, improve, or assist in the development or improvement of any product, service, or platform that competes with any aspect of the Platform;\n\n(f) Frame, mirror, or incorporate any portion of the Platform into any other product, service, or website without the Company\'s prior written consent;\n\n(g) Remove, alter, or obscure any copyright, trademark, or other proprietary rights notices on the Platform; or\n\n(h) Use the Platform or any information obtained therefrom for any purpose that is competitive with, detrimental to, or inconsistent with the Company\'s business interests.',
            ],
          },
          {
            id: 'intellectual-property-3',
            title: '8.3 User Content.',
            level: 'section',
            content: [
              'You retain ownership of content you submit to the Platform, including product listings, images, descriptions, and reviews ("User Content"). By submitting User Content, you grant the Company a non-exclusive, worldwide, royalty-free, sublicensable, and transferable license to use, display, reproduce, distribute, modify, and promote your User Content in connection with operating, improving, and marketing the Platform. This license continues for the duration your content remains on the Platform and for a reasonable period afterward. The Company reserves the right to remove any User Content at any time and for any reason without notice.',
            ],
          },
          {
            id: 'intellectual-property-4',
            title: '8.4 Trademarks.',
            level: 'section',
            content: [
              '"[PLATFORM_NAME]," "815 Enterprises," and all associated logos, trade names, service marks, and branding are the trademarks and intellectual property of 815 Enterprises. You may not use these marks without the Company\'s prior written permission, except as necessary to accurately refer to the Platform in a descriptive, non-commercial manner that does not imply endorsement or affiliation.',
            ],
          },
          {
            id: 'intellectual-property-5',
            title: '8.5 Feedback.',
            level: 'section',
            content: [
              'If you provide the Company with suggestions, ideas, enhancement requests, recommendations, or other feedback regarding the Platform ("Feedback"), you hereby assign to the Company all right, title, and interest in and to such Feedback. The Company may use, implement, modify, and commercialize Feedback without restriction, attribution, or compensation to you.',
            ],
          },
          {
            id: 'intellectual-property-6',
            title: '8.6 Competitive Use Prohibition.',
            level: 'section',
            content: [
              'You agree that any information, data, observations, knowledge, or insights gained through your use of the Platform — including but not limited to knowledge of Platform features, business processes, marketplace dynamics, vendor management systems, payment facilitation methods, pricing strategies, or user interface designs — shall not be used, directly or indirectly, to:\n\n(a) Develop, design, build, operate, advise on, invest in, or contribute to any product, service, or platform that competes with any aspect of the Platform;\n\n(b) Solicit, recruit, or attempt to recruit vendors, shoppers, or other users away from the Platform for the benefit of a competing platform or service;\n\n(c) Provide competitive intelligence, consulting, or advisory services to any entity that operates or intends to operate a competing marketplace; or\n\n(d) Publish, share, or otherwise disseminate detailed descriptions of Platform processes, features, or business methods in a manner that could enable replication by third parties.\n\nThis Section 8.6 shall survive termination of this Agreement.',
            ],
          },
        ],
      },
      {
        id: 'business-relationship',
        title: 'ARTICLE 9 — BUSINESS RELATIONSHIP AND CONSIDERATION',
        level: 'article',
        content: [],
        subsections: [
          {
            id: 'business-relationship-1',
            title: '9.1 Formation of Relationship.',
            level: 'section',
            content: [
              'By accessing, browsing, registering for an account on, or otherwise using the Platform, you enter into a business relationship with 815 Enterprises. This relationship is governed by the terms and conditions set forth in this Agreement. The nature and scope of this business relationship may deepen as you engage with additional Platform features and services, and additional terms may apply as described herein.',
            ],
          },
          {
            id: 'business-relationship-2',
            title: '9.2 Acceptance and Consideration.',
            level: 'section',
            content: [
              'You acknowledge and agree that, in exchange for your agreement to be bound by this Agreement, the Company provides you with the following valuable benefits and consideration:\n\n(a) Access to a curated marketplace connecting you with verified local vendors, producers, and food service providers;\n\n(b) A secure, technology-enabled ordering and transaction platform that facilitates efficient commerce between buyers and sellers;\n\n(c) Access to vendor information, product listings, [VERTICAL_MARKET_TERM] schedules, pricing, and availability data compiled and maintained by the Company;\n\n(d) Customer support services and issue resolution facilitation;\n\n(e) Quality assurance measures, including vendor verification, quality monitoring, and community standards enforcement;\n\n(f) Access to location-based search functionality and marketplace features;\n\n(g) Secure payment processing infrastructure and transaction management services; and\n\n(h) Membership in a community marketplace ecosystem that provides ongoing value through network effects, vendor curation, and platform improvements.\n\nYou acknowledge that the foregoing benefits constitute adequate and sufficient consideration for the obligations you assume under this Agreement.',
            ],
          },
          {
            id: 'business-relationship-3',
            title: '9.3 Acknowledgment of Proprietary Platform.',
            level: 'section',
            content: [
              'You acknowledge that the Platform, including its design, architecture, features, processes, workflows, algorithms, business methods, and all related technology and intellectual property, represents substantial investment by the Company and constitutes proprietary and confidential business assets.',
            ],
          },
        ],
      },
      {
        id: 'liability',
        title: 'ARTICLE 10 — LIABILITY LIMITATIONS',
        level: 'article',
        content: [],
        subsections: [
          {
            id: 'liability-1',
            title: '10.1 Platform Role.',
            level: 'section',
            content: [
              'The Platform serves as a technology-enabled marketplace connecting vendors and shoppers. The Company does not produce, manufacture, prepare, inspect, or certify any products sold through the Platform. All transactions are between the vendor and the shopper, and the Company acts solely as a facilitator. The Company is not responsible for the quality, safety, legality, or availability of any products listed on the Platform, regardless of whether the transaction is completed via Platform-Processed Payment or External Payment Method.',
            ],
          },
          {
            id: 'liability-2',
            title: '10.2 Disclaimer of Warranties.',
            level: 'section',
            content: [
              'THE PLATFORM AND ALL CONTENT, FEATURES, AND SERVICES PROVIDED THROUGH IT ARE PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. THE COMPANY DOES NOT WARRANT THAT THE PLATFORM WILL BE UNINTERRUPTED, SECURE, ERROR-FREE, OR FREE OF VIRUSES OR OTHER HARMFUL COMPONENTS.',
            ],
          },
          {
            id: 'liability-3',
            title: '10.3 Limitation of Liability.',
            level: 'section',
            content: [
              'TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL 815 ENTERPRISES, ITS OFFICERS, DIRECTORS, MEMBERS, MANAGERS, EMPLOYEES, AGENTS, AFFILIATES, SUCCESSORS, OR ASSIGNS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, GOODWILL, OR BUSINESS OPPORTUNITY, ARISING OUT OF OR RELATED TO YOUR USE OF OR INABILITY TO USE THE PLATFORM OR ANY PRODUCTS OR SERVICES OBTAINED THROUGH IT, WHETHER BASED ON CONTRACT, TORT (INCLUDING NEGLIGENCE), STRICT LIABILITY, OR ANY OTHER LEGAL THEORY, EVEN IF THE COMPANY HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. THE COMPANY\'S TOTAL AGGREGATE LIABILITY FOR ALL CLAIMS ARISING OUT OF OR RELATED TO THIS AGREEMENT SHALL NOT EXCEED THE GREATER OF (A) THE TOTAL FEES PAID BY YOU TO THE COMPANY IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM, OR (B) ONE HUNDRED DOLLARS ($100.00).',
            ],
          },
          {
            id: 'liability-4',
            title: '10.4 Food Safety.',
            level: 'section',
            content: [
              'Vendors are solely responsible for compliance with all applicable federal, state, and local food safety laws and regulations, including but not limited to the Texas Food, Drug, and Cosmetic Act, the Texas Cottage Food Law (Texas Health and Safety Code Chapter 437), and all applicable health department regulations. The Platform does not inspect, certify, or guarantee the safety, quality, or legality of any food products. Shoppers purchase food products at their own risk and should exercise their own judgment regarding food safety.',
            ],
          },
          {
            id: 'liability-5',
            title: '10.5 Indemnification.',
            level: 'section',
            content: [
              'You agree to indemnify, defend, and hold harmless 815 Enterprises, its officers, directors, members, managers, employees, agents, affiliates, successors, and assigns (collectively, "Indemnified Parties") from and against any and all claims, liabilities, damages, losses, costs, and expenses (including reasonable attorneys\' fees and court costs) arising out of or in any way connected with: (a) your access to or use of the Platform; (b) your violation of this Agreement or any applicable law; (c) any products you sell or purchase through the Platform; (d) your violation of any third-party rights; or (e) any dispute between you and another user of the Platform. This indemnification obligation shall survive termination of this Agreement.',
            ],
          },
          {
            id: 'liability-6',
            title: '10.6 Force Majeure.',
            level: 'section',
            content: [
              'Neither party shall be liable for any failure or delay in performance resulting from causes beyond such party\'s reasonable control, including but not limited to: acts of God, severe weather, natural disasters, fire, flood, earthquake, epidemic or pandemic, government actions or orders, war, terrorism, civil unrest, labor disputes, power failures, internet or telecommunications outages, cyberattacks, or [VERTICAL_MARKET_TERM] closures by operators or governmental authorities.',
            ],
          },
        ],
      },
      {
        id: 'disputes',
        title: 'ARTICLE 11 — DISPUTE RESOLUTION',
        level: 'article',
        content: [],
        subsections: [
          {
            id: 'disputes-1',
            title: '11.1 Informal Resolution.',
            level: 'section',
            content: [
              'Before initiating any formal dispute resolution proceeding, you agree to first contact the Company through the Platform\'s support page and attempt to resolve any dispute informally for a period of at least thirty (30) days.',
            ],
          },
          {
            id: 'disputes-2',
            title: '11.2 Binding Arbitration.',
            level: 'section',
            content: [
              'Any dispute, claim, or controversy arising out of or relating to this Agreement or the breach, termination, enforcement, interpretation, or validity thereof, including the determination of the scope or applicability of this agreement to arbitrate, shall be determined by binding arbitration in accordance with the rules of the American Arbitration Association ("AAA"). The arbitration shall be conducted by a single arbitrator and shall take place in the State of Texas. The arbitrator\'s award shall be final and binding and may be entered as a judgment in any court of competent jurisdiction.',
            ],
          },
          {
            id: 'disputes-3',
            title: '11.3 Class Action Waiver.',
            level: 'section',
            content: [
              'YOU AND THE COMPANY AGREE THAT EACH MAY BRING CLAIMS AGAINST THE OTHER ONLY IN YOUR OR ITS INDIVIDUAL CAPACITY AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY PURPORTED CLASS, COLLECTIVE, OR REPRESENTATIVE PROCEEDING.',
            ],
          },
          {
            id: 'disputes-4',
            title: '11.4 Small Claims Exception.',
            level: 'section',
            content: [
              'Notwithstanding the foregoing, either party may bring an individual action in small claims court for claims within the jurisdictional limits of such court.',
            ],
          },
          {
            id: 'disputes-5',
            title: '11.5 Injunctive Relief.',
            level: 'section',
            content: [
              'Notwithstanding the arbitration provisions above, either party may seek temporary or preliminary injunctive relief in any court of competent jurisdiction to prevent irreparable harm pending arbitration, particularly with respect to violations of intellectual property rights, confidentiality obligations, or competitive use prohibitions.',
            ],
          },
          {
            id: 'disputes-6',
            title: '11.6 Governing Law.',
            level: 'section',
            content: [
              'This Agreement shall be governed by and construed in accordance with the laws of the State of Texas, without regard to its conflict of law principles. To the extent any dispute is not subject to arbitration, the exclusive jurisdiction and venue for any such action shall be the state and federal courts located in the State of Texas, and you hereby consent to the personal jurisdiction of such courts.',
            ],
          },
        ],
      },
      {
        id: 'general',
        title: 'ARTICLE 12 — GENERAL PROVISIONS',
        level: 'article',
        content: [],
        subsections: [
          {
            id: 'general-1',
            title: '12.1 Entire Agreement.',
            level: 'section',
            content: [
              'This Agreement, together with the Privacy Policy and any additional agreements you enter into with the Company (including, if applicable, the Vendor Service Agreement and Vendor Partner Agreement), constitutes the entire agreement between you and the Company regarding the Platform and supersedes all prior agreements, understandings, and representations.',
            ],
          },
          {
            id: 'general-2',
            title: '12.2 Severability.',
            level: 'section',
            content: [
              'If any provision of this Agreement is held to be invalid, illegal, or unenforceable by a court of competent jurisdiction, the remaining provisions shall continue in full force and effect. The invalid provision shall be modified to the minimum extent necessary to make it valid and enforceable while preserving the parties\' original intent.',
            ],
          },
          {
            id: 'general-3',
            title: '12.3 Waiver.',
            level: 'section',
            content: [
              'The Company\'s failure to enforce any provision of this Agreement shall not constitute a waiver of that provision or any other provision. A waiver of any provision shall be effective only if made in writing and signed by the Company.',
            ],
          },
          {
            id: 'general-4',
            title: '12.4 Assignment.',
            level: 'section',
            content: [
              'You may not assign or transfer this Agreement or any rights hereunder without the Company\'s prior written consent. The Company may assign this Agreement without restriction, including in connection with a merger, acquisition, reorganization, or sale of substantially all of its assets.',
            ],
          },
          {
            id: 'general-5',
            title: '12.5 Notices.',
            level: 'section',
            content: [
              'Notices to the Company should be submitted through the Platform\'s support page. Notices to you will be sent to the email address associated with your account or displayed through in-app notifications.',
            ],
          },
          {
            id: 'general-6',
            title: '12.6 Electronic Acceptance.',
            level: 'section',
            content: [
              'You acknowledge and agree that by clicking "I agree," creating an account, or continuing to use the Platform, you are entering into a legally binding agreement with the Company. You consent to the use of electronic records and signatures in connection with this Agreement in accordance with the federal Electronic Signatures in Global and National Commerce Act ("E-SIGN Act"), 15 U.S.C. 7001 et seq., and the Texas Uniform Electronic Transactions Act, Tex. Bus. & Com. Code Chapter 43.',
            ],
          },
        ],
      },
      {
        id: 'company-info',
        title: 'ARTICLE 13 — COMPANY INFORMATION',
        level: 'article',
        content: [],
        subsections: [
          {
            id: 'company-info-1',
            title: '13.1 Operating Entity.',
            level: 'section',
            content: [
              'The Platform is operated by VIIIXV LLC, a Texas limited liability company doing business as 815 Enterprises and [PLATFORM_NAME]. All references to "815 Enterprises" or "the Company" in this Agreement refer to VIIIXV LLC, d/b/a 815 Enterprises. Any legal disputes arising under this Agreement shall be subject to the exclusive jurisdiction of the courts located in Potter County, Texas.',
            ],
          },
          {
            id: 'company-info-2',
            title: '13.2 Geographic Scope.',
            level: 'section',
            content: [
              'The Platform is designed to operate within the United States. All personal data is processed and stored within the United States.',
            ],
          },
          {
            id: 'company-info-3',
            title: '13.3 Contact.',
            level: 'section',
            content: [
              'For questions about this Agreement, to exercise any rights described herein, or for general inquiries, please contact us through the Platform\'s support page at [PLATFORM_DOMAIN]/support.',
            ],
          },
        ],
      },
    ],
  }
}
