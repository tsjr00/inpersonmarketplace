import { permanentRedirect } from 'next/navigation'

interface FeaturesPageProps {
  params: Promise<{ vertical: string }>
}

/**
 * The standalone Features page was consolidated (2026-07-19): its value-prop
 * content moved to /about and its operational content lives on /how-it-works.
 * A permanent (308) redirect keeps inbound links working and passes the page's
 * SEO equity to How-it-works.
 */
export default async function FeaturesPage({ params }: FeaturesPageProps) {
  const { vertical } = await params
  permanentRedirect(`/${vertical}/how-it-works`)
}
