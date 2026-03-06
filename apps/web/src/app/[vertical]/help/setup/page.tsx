import { Metadata } from 'next'
import Link from 'next/link'
import { statusColors, spacing, typography, radius } from '@/lib/design-tokens'
import { defaultBranding } from '@/lib/branding'

interface SetupGuideProps {
  params: Promise<{ vertical: string }>
}

export async function generateMetadata({ params }: SetupGuideProps): Promise<Metadata> {
  const { vertical } = await params
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market
  return {
    title: `Setup Guide | ${branding.brand_name}`,
    description: `How to enable notifications and install ${branding.brand_name} on your phone.`,
  }
}

/* ─── style helpers ─── */
const card = {
  backgroundColor: 'white',
  border: `1px solid ${statusColors.neutral200}`,
  borderRadius: radius.md,
  padding: spacing.md,
  marginBottom: spacing.sm,
} as const

const stepNum = {
  display: 'inline-flex' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  width: 28,
  height: 28,
  borderRadius: '50%',
  backgroundColor: statusColors.infoDark,
  color: 'white',
  fontWeight: 700,
  fontSize: typography.sizes.sm,
  marginRight: spacing['2xs'],
  flexShrink: 0,
}

const stepRow = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: spacing['2xs'],
  marginBottom: spacing.xs,
} as const

const sectionTitle = {
  fontSize: typography.sizes.lg,
  fontWeight: typography.weights.semibold,
  color: statusColors.neutral900,
  marginBottom: spacing.xs,
  marginTop: 0,
} as const

const browserTitle = {
  fontSize: typography.sizes.base,
  fontWeight: typography.weights.semibold,
  color: statusColors.neutral800,
  marginBottom: spacing['2xs'],
  marginTop: 0,
} as const

const stepText = {
  fontSize: typography.sizes.sm,
  color: statusColors.neutral700,
  lineHeight: typography.leading.relaxed,
  margin: 0,
} as const

const tipBox = {
  padding: spacing.sm,
  backgroundColor: statusColors.infoLight,
  border: `1px solid ${statusColors.infoBorder}`,
  borderRadius: radius.sm,
  marginTop: spacing.xs,
  marginBottom: spacing.xs,
} as const

export default async function SetupGuidePage({ params }: SetupGuideProps) {
  const { vertical } = await params
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 20px' }}>
      {/* Navigation */}
      <div style={{ marginBottom: spacing.lg }}>
        <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'center' }}>
          <Link
            href={`/${vertical}/help`}
            style={{ color: statusColors.neutral500, textDecoration: 'none', fontSize: typography.sizes.sm }}
          >
            ← Help & FAQ
          </Link>
          <span style={{ color: statusColors.neutral300 }}>|</span>
          <Link
            href={`/${vertical}/dashboard`}
            style={{ color: statusColors.neutral500, textDecoration: 'none', fontSize: typography.sizes.sm }}
          >
            ← Dashboard
          </Link>
        </div>
        <h1 style={{ color: statusColors.neutral900, marginBottom: spacing['2xs'], marginTop: spacing.xs, fontSize: typography.sizes['2xl'] }}>
          Setup Guide
        </h1>
        <p style={{ color: statusColors.neutral500, margin: 0, fontSize: typography.sizes.sm }}>
          Get the most out of {branding.brand_name} by enabling notifications and installing the app on your device.
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════
          SECTION 1: ENABLE NOTIFICATIONS
          ═══════════════════════════════════════════════════════ */}
      <div style={{ marginBottom: spacing.xl }}>
        <h2 style={{
          fontSize: typography.sizes.xl,
          fontWeight: typography.weights.bold,
          color: statusColors.infoDark,
          marginBottom: spacing.sm,
          paddingBottom: spacing['2xs'],
          borderBottom: `2px solid ${statusColors.infoBorder}`,
        }}>
          Enable Notifications
        </h2>
        <p style={{ ...stepText, marginBottom: spacing.md }}>
          Turn on notifications so you never miss an order update, pickup reminder, or important message.
          Follow the instructions for your browser below.
        </p>

        {/* ── Chrome (Desktop) ── */}
        <div style={card}>
          <h3 style={browserTitle}>Google Chrome — Desktop (Windows / Mac)</h3>
          <div style={stepRow}><span style={stepNum}>1</span><p style={stepText}>Click the <strong>lock icon</strong> (or tune icon) in the address bar, to the left of the URL.</p></div>
          <div style={stepRow}><span style={stepNum}>2</span><p style={stepText}>Find <strong>Notifications</strong> in the permissions list.</p></div>
          <div style={stepRow}><span style={stepNum}>3</span><p style={stepText}>Change it from &quot;Block&quot; or &quot;Ask&quot; to <strong>Allow</strong>.</p></div>
          <div style={stepRow}><span style={stepNum}>4</span><p style={stepText}>Reload the page. You should see a notification prompt appear — click <strong>Allow</strong>.</p></div>
        </div>

        {/* ── Chrome (Android) ── */}
        <div style={card}>
          <h3 style={browserTitle}>Google Chrome — Android</h3>
          <div style={stepRow}><span style={stepNum}>1</span><p style={stepText}>Tap the <strong>three-dot menu</strong> (⋮) in the top-right corner.</p></div>
          <div style={stepRow}><span style={stepNum}>2</span><p style={stepText}>Tap <strong>Settings</strong> → <strong>Site settings</strong> → <strong>Notifications</strong>.</p></div>
          <div style={stepRow}><span style={stepNum}>3</span><p style={stepText}>Make sure notifications are <strong>turned on</strong> (toggle should be blue).</p></div>
          <div style={stepRow}><span style={stepNum}>4</span><p style={stepText}>Go back to {branding.brand_name} and reload the page. Tap <strong>Allow</strong> when prompted.</p></div>
          <div style={tipBox}>
            <p style={{ ...stepText, fontWeight: 600, color: statusColors.infoDark }}>
              Tip: Also check your Android system settings — go to Settings → Apps → Chrome → Notifications and make sure they are enabled.
            </p>
          </div>
        </div>

        {/* ── Safari (Mac) ── */}
        <div style={card}>
          <h3 style={browserTitle}>Safari — Mac</h3>
          <div style={stepRow}><span style={stepNum}>1</span><p style={stepText}>In the Safari menu bar, click <strong>Safari</strong> → <strong>Settings</strong> (or Preferences).</p></div>
          <div style={stepRow}><span style={stepNum}>2</span><p style={stepText}>Go to the <strong>Websites</strong> tab, then click <strong>Notifications</strong> in the left sidebar.</p></div>
          <div style={stepRow}><span style={stepNum}>3</span><p style={stepText}>Find <strong>{branding.domain}</strong> in the list and set it to <strong>Allow</strong>.</p></div>
          <div style={stepRow}><span style={stepNum}>4</span><p style={stepText}>If it&apos;s not listed, visit the site and you should see a prompt — click <strong>Allow</strong>.</p></div>
        </div>

        {/* ── Safari (iPhone / iPad) ── */}
        <div style={card}>
          <h3 style={browserTitle}>Safari — iPhone &amp; iPad</h3>
          <div style={tipBox}>
            <p style={{ ...stepText, fontWeight: 600, color: statusColors.warningDark }}>
              Important: Safari on iOS only supports notifications for apps that have been added to your Home Screen. Follow the &quot;Install the App&quot; instructions below first!
            </p>
          </div>
          <div style={stepRow}><span style={stepNum}>1</span><p style={stepText}><strong>Add the app to your Home Screen first</strong> (see instructions below).</p></div>
          <div style={stepRow}><span style={stepNum}>2</span><p style={stepText}>Open the app from your Home Screen (not from Safari).</p></div>
          <div style={stepRow}><span style={stepNum}>3</span><p style={stepText}>When prompted, tap <strong>Allow</strong> to enable notifications.</p></div>
          <div style={stepRow}><span style={stepNum}>4</span><p style={stepText}>You can also go to <strong>iPhone Settings</strong> → scroll down to the app → <strong>Notifications</strong> → toggle on.</p></div>
        </div>

        {/* ── Firefox ── */}
        <div style={card}>
          <h3 style={browserTitle}>Firefox — Desktop</h3>
          <div style={stepRow}><span style={stepNum}>1</span><p style={stepText}>Click the <strong>lock icon</strong> in the address bar.</p></div>
          <div style={stepRow}><span style={stepNum}>2</span><p style={stepText}>Click <strong>Connection secure</strong> → <strong>More Information</strong>.</p></div>
          <div style={stepRow}><span style={stepNum}>3</span><p style={stepText}>Go to the <strong>Permissions</strong> tab.</p></div>
          <div style={stepRow}><span style={stepNum}>4</span><p style={stepText}>Find <strong>Send Notifications</strong> — uncheck &quot;Use Default&quot; and select <strong>Allow</strong>.</p></div>
          <div style={stepRow}><span style={stepNum}>5</span><p style={stepText}>Reload the page and accept the notification prompt.</p></div>
        </div>

        {/* ── Firefox (Android) ── */}
        <div style={card}>
          <h3 style={browserTitle}>Firefox — Android</h3>
          <div style={stepRow}><span style={stepNum}>1</span><p style={stepText}>Tap the <strong>three-dot menu</strong> (⋮) → <strong>Settings</strong>.</p></div>
          <div style={stepRow}><span style={stepNum}>2</span><p style={stepText}>Tap <strong>Notifications</strong> and make sure they are enabled.</p></div>
          <div style={stepRow}><span style={stepNum}>3</span><p style={stepText}>Go back to {branding.brand_name}, reload, and tap <strong>Allow</strong> when prompted.</p></div>
        </div>

        {/* ── Edge ── */}
        <div style={card}>
          <h3 style={browserTitle}>Microsoft Edge — Desktop</h3>
          <div style={stepRow}><span style={stepNum}>1</span><p style={stepText}>Click the <strong>lock icon</strong> in the address bar.</p></div>
          <div style={stepRow}><span style={stepNum}>2</span><p style={stepText}>Click <strong>Permissions for this site</strong>.</p></div>
          <div style={stepRow}><span style={stepNum}>3</span><p style={stepText}>Set <strong>Notifications</strong> to <strong>Allow</strong>.</p></div>
          <div style={stepRow}><span style={stepNum}>4</span><p style={stepText}>Reload the page and accept the prompt.</p></div>
        </div>

        {/* ── Samsung Internet ── */}
        <div style={card}>
          <h3 style={browserTitle}>Samsung Internet — Android</h3>
          <div style={stepRow}><span style={stepNum}>1</span><p style={stepText}>Tap the <strong>menu icon</strong> (☰) → <strong>Settings</strong>.</p></div>
          <div style={stepRow}><span style={stepNum}>2</span><p style={stepText}>Tap <strong>Sites and downloads</strong> → <strong>Notifications</strong>.</p></div>
          <div style={stepRow}><span style={stepNum}>3</span><p style={stepText}>Make sure notifications are allowed.</p></div>
          <div style={stepRow}><span style={stepNum}>4</span><p style={stepText}>Visit {branding.brand_name} and tap <strong>Allow</strong> when prompted.</p></div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          SECTION 2: INSTALL THE APP
          ═══════════════════════════════════════════════════════ */}
      <div style={{ marginBottom: spacing.xl }}>
        <h2 style={{
          fontSize: typography.sizes.xl,
          fontWeight: typography.weights.bold,
          color: statusColors.infoDark,
          marginBottom: spacing.sm,
          paddingBottom: spacing['2xs'],
          borderBottom: `2px solid ${statusColors.infoBorder}`,
        }}>
          Install the App on Your Phone
        </h2>
        <p style={{ ...stepText, marginBottom: spacing.md }}>
          {branding.brand_name} works like a native app when you add it to your home screen — no app store needed!
          You get a full-screen experience, faster loading, and (on supported devices) push notifications.
        </p>

        {/* ── iPhone / iPad (Safari) ── */}
        <div style={card}>
          <h3 style={browserTitle}>iPhone &amp; iPad (Safari)</h3>
          <div style={stepRow}><span style={stepNum}>1</span><p style={stepText}>Open <strong>{branding.domain}</strong> in <strong>Safari</strong> (this does not work in Chrome or other browsers on iOS).</p></div>
          <div style={stepRow}><span style={stepNum}>2</span><p style={stepText}>Tap the <strong>Share button</strong> (the square with an arrow pointing up) at the bottom of the screen.</p></div>
          <div style={stepRow}><span style={stepNum}>3</span><p style={stepText}>Scroll down and tap <strong>&quot;Add to Home Screen&quot;</strong>.</p></div>
          <div style={stepRow}><span style={stepNum}>4</span><p style={stepText}>Tap <strong>Add</strong> in the top-right corner.</p></div>
          <div style={stepRow}><span style={stepNum}>5</span><p style={stepText}>The app icon will appear on your home screen. Open it from there for the full app experience!</p></div>
          <div style={tipBox}>
            <p style={{ ...stepText, fontWeight: 600, color: statusColors.infoDark }}>
              Tip: After installing, open the app from your home screen (not Safari) to enable push notifications on iPhone.
            </p>
          </div>
        </div>

        {/* ── Android (Chrome) ── */}
        <div style={card}>
          <h3 style={browserTitle}>Android (Google Chrome)</h3>
          <div style={stepRow}><span style={stepNum}>1</span><p style={stepText}>Open <strong>{branding.domain}</strong> in Chrome.</p></div>
          <div style={stepRow}><span style={stepNum}>2</span><p style={stepText}>Tap the <strong>three-dot menu</strong> (⋮) in the top-right corner.</p></div>
          <div style={stepRow}><span style={stepNum}>3</span><p style={stepText}>Tap <strong>&quot;Add to Home screen&quot;</strong> or <strong>&quot;Install app&quot;</strong>.</p></div>
          <div style={stepRow}><span style={stepNum}>4</span><p style={stepText}>Tap <strong>Install</strong> or <strong>Add</strong> to confirm.</p></div>
          <div style={stepRow}><span style={stepNum}>5</span><p style={stepText}>The app will appear in your app drawer and on your home screen.</p></div>
          <div style={tipBox}>
            <p style={{ ...stepText, fontWeight: 600, color: statusColors.infoDark }}>
              Tip: You might also see a &quot;Install {branding.brand_name}&quot; banner at the bottom of the page — just tap it!
            </p>
          </div>
        </div>

        {/* ── Android (Samsung Internet) ── */}
        <div style={card}>
          <h3 style={browserTitle}>Android (Samsung Internet)</h3>
          <div style={stepRow}><span style={stepNum}>1</span><p style={stepText}>Open <strong>{branding.domain}</strong> in Samsung Internet.</p></div>
          <div style={stepRow}><span style={stepNum}>2</span><p style={stepText}>Tap the <strong>menu icon</strong> (☰) at the bottom.</p></div>
          <div style={stepRow}><span style={stepNum}>3</span><p style={stepText}>Tap <strong>&quot;Add page to&quot;</strong> → <strong>&quot;Home screen&quot;</strong>.</p></div>
          <div style={stepRow}><span style={stepNum}>4</span><p style={stepText}>Tap <strong>Add</strong> to confirm.</p></div>
        </div>

        {/* ── Android (Firefox) ── */}
        <div style={card}>
          <h3 style={browserTitle}>Android (Firefox)</h3>
          <div style={stepRow}><span style={stepNum}>1</span><p style={stepText}>Open <strong>{branding.domain}</strong> in Firefox.</p></div>
          <div style={stepRow}><span style={stepNum}>2</span><p style={stepText}>Tap the <strong>three-dot menu</strong> (⋮).</p></div>
          <div style={stepRow}><span style={stepNum}>3</span><p style={stepText}>Tap <strong>&quot;Install&quot;</strong> or <strong>&quot;Add to Home screen&quot;</strong>.</p></div>
          <div style={stepRow}><span style={stepNum}>4</span><p style={stepText}>Confirm by tapping <strong>Add</strong>.</p></div>
        </div>

        {/* ── Desktop (Chrome / Edge) ── */}
        <div style={card}>
          <h3 style={browserTitle}>Desktop — Chrome &amp; Edge</h3>
          <div style={stepRow}><span style={stepNum}>1</span><p style={stepText}>Visit <strong>{branding.domain}</strong> in Chrome or Edge.</p></div>
          <div style={stepRow}><span style={stepNum}>2</span><p style={stepText}>Look for the <strong>install icon</strong> (a monitor with a down arrow) in the address bar, or click the three-dot menu.</p></div>
          <div style={stepRow}><span style={stepNum}>3</span><p style={stepText}>Click <strong>&quot;Install {branding.brand_name}&quot;</strong>.</p></div>
          <div style={stepRow}><span style={stepNum}>4</span><p style={stepText}>The app opens in its own window — you can pin it to your taskbar or dock.</p></div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          TROUBLESHOOTING
          ═══════════════════════════════════════════════════════ */}
      <div style={{ marginBottom: spacing.xl }}>
        <h2 style={{
          fontSize: typography.sizes.xl,
          fontWeight: typography.weights.bold,
          color: statusColors.neutral700,
          marginBottom: spacing.sm,
          paddingBottom: spacing['2xs'],
          borderBottom: `2px solid ${statusColors.neutral300}`,
        }}>
          Troubleshooting
        </h2>

        <div style={card}>
          <h3 style={browserTitle}>I don&apos;t see the notification prompt</h3>
          <p style={{ ...stepText, marginBottom: spacing['2xs'] }}>
            If you previously blocked notifications, your browser won&apos;t ask again automatically. Follow the steps above for your browser to manually change the setting to &quot;Allow&quot;, then reload the page.
          </p>
        </div>

        <div style={card}>
          <h3 style={browserTitle}>Notifications are allowed but I&apos;m not getting them</h3>
          <ul style={{ ...stepText, paddingLeft: 20, margin: 0 }}>
            <li style={{ marginBottom: spacing['3xs'] }}>Make sure your device&apos;s <strong>Do Not Disturb</strong> mode is off.</li>
            <li style={{ marginBottom: spacing['3xs'] }}>Check your device&apos;s <strong>notification settings</strong> for the browser app itself.</li>
            <li style={{ marginBottom: spacing['3xs'] }}>On iPhone, notifications only work when the app is <strong>installed to your home screen</strong>.</li>
            <li>Try closing and reopening the app or browser.</li>
          </ul>
        </div>

        <div style={card}>
          <h3 style={browserTitle}>I can&apos;t find &quot;Add to Home Screen&quot;</h3>
          <ul style={{ ...stepText, paddingLeft: 20, margin: 0 }}>
            <li style={{ marginBottom: spacing['3xs'] }}>On iPhone, you <strong>must use Safari</strong> — other browsers on iOS don&apos;t support this feature.</li>
            <li style={{ marginBottom: spacing['3xs'] }}>On Android, try Chrome for the best experience.</li>
            <li>Make sure you&apos;re on the main site, not inside another app&apos;s built-in browser (like Facebook or Instagram).</li>
          </ul>
        </div>

        <div style={{
          padding: spacing.sm,
          backgroundColor: statusColors.neutral50,
          border: `1px solid ${statusColors.neutral200}`,
          borderRadius: radius.md,
          marginTop: spacing.sm,
        }}>
          <p style={{ margin: 0, fontSize: typography.sizes.sm, color: statusColors.neutral600 }}>
            Still having trouble?{' '}
            <Link href={`/${vertical}/support`} style={{ color: statusColors.infoDark, fontWeight: 600 }}>
              Contact Support
            </Link>{' '}
            and let us know your device type and browser — we&apos;ll help you get set up.
          </p>
        </div>
      </div>
    </div>
  )
}
