import { Metadata } from 'next'
import Link from 'next/link'
import { colors, spacing, typography, radius, containers } from '@/lib/design-tokens'
import { defaultBranding } from '@/lib/branding/defaults'
import { getLocale } from '@/lib/locale/server'
import { organizationJsonLd, breadcrumbJsonLd } from '@/lib/marketing/json-ld'

interface AboutPageProps {
  params: Promise<{ vertical: string }>
}

const TEXAS_CITIES = ['Dallas', 'Fort Worth', 'Houston', 'Austin', 'San Antonio', 'El Paso']

export async function generateMetadata({ params }: AboutPageProps): Promise<Metadata> {
  const { vertical } = await params
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market
  const isFT = vertical === 'food_trucks'

  return {
    title: isFT
      ? `Order from Local Food Trucks Online — Skip the Line | ${branding.brand_name}`
      : `Local Farmers Market Online — Buy & Sell Homegrown, Homemade | ${branding.brand_name}`,
    description: isFT
      ? 'Pre-order tacos, BBQ, burgers and more from local independent food trucks. Skip the line, never miss the special, and support passionate local cooks — plus food truck catering for events.'
      : 'Buy and sell homegrown produce, homemade baked goods, honey, jam, and handmade crafts with local neighbors — no storefront, no formal business. Shop local and support your community.',
  }
}

export default async function AboutPage({ params }: AboutPageProps) {
  const { vertical } = await params
  const locale = await getLocale()
  const isEs = (locale || '').startsWith('es')
  const branding = defaultBranding[vertical] || defaultBranding.farmers_market
  const baseUrl = `https://${branding.domain}`
  const isFT = vertical === 'food_trucks'

  const orgSchema = organizationJsonLd({
    name: branding.brand_name,
    url: baseUrl,
    description: isFT
      ? 'Mobile food ordering platform connecting customers with local food trucks. Pre-order tacos, BBQ, pizza, burgers, and more — skip the line and pick up hot and ready.'
      : 'Online marketplace connecting neighbors who sell homegrown produce, homemade baked goods, honey, jam, and handmade crafts with local shoppers for farmers market pickup.',
    areaServed: TEXAS_CITIES.map(city => `${city}, Texas`),
  })

  const breadcrumbs = breadcrumbJsonLd([
    { name: 'Home', url: `${baseUrl}/${vertical}` },
    { name: 'About', url: `${baseUrl}/${vertical}/about` },
  ])

  return (
    <main style={{ maxWidth: containers.md || 800, margin: '0 auto', padding: `${spacing.xl} ${spacing.md}` }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(orgSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }} />

      {isFT
        ? <FoodTruckAbout vertical={vertical} branding={branding} isEs={isEs} />
        : <FarmersMarketAbout vertical={vertical} branding={branding} isEs={isEs} />}
    </main>
  )
}

// ── Farmers Market — purpose-first, community-driven (2026-07-19; es 2026-07-19) ─

function FarmersMarketAbout({ vertical, branding, isEs }: { vertical: string; branding: { brand_name: string }; isEs: boolean }) {
  const brand = branding.brand_name
  const en = {
    heroH1: 'A Local Farmers Market Where Neighbors Sell to Neighbors',
    heroSub: `${brand} is a place to sell the surplus of your garden, your kitchen, or your craft to the people around you — buy and sell homegrown produce, homemade food, and handmade goods with no storefront, and no traditional or formal business required.`,
    s1Title: 'Homegrown and Homemade, Sold the Way It Always Was',
    s1Body: `For most of history, people grew their own food and made things by hand — kept what they needed, and sold or shared the rest with the folks nearby. Fresh vegetables, eggs, honey, jam, and baked goods moved from one neighbor’s kitchen or garden to the next, long before corporations and grocery chains. In much of rural America, that neighbor-to-neighbor selling never went away — but in cities and suburbs it’s been almost entirely lost. ${brand} exists to make selling homegrown and homemade goods easy again, and to help urban and suburban neighbors tap back into one of the oldest, most dependable fixtures of American community life.`,
    s2Title: 'Shop Local: Commerce That Stays in the Community',
    s2Body: 'Selling to your neighbors is still selling — people want to earn, and many are funding a garden, a hobby, or real extra income. But it’s rarely only about the money. There’s pride in the tomatoes you grew, the bread you baked, the thing you made well — and there’s something worth protecting in commerce that stays close to home. When you shop local and buy from a neighbor, that money stays in your community instead of leaving with a big-box or dollar-store chain. That local impact is one of the reasons this matters — not the whole reason, but a real one.',
    s3Title: 'Buy Local Food and Get to Know Your Neighbors',
    s3Body: 'Somewhere along the way, we stopped knowing our neighbors. With a store on every corner, it’s easy to go years without learning what the people down the street can grow, bake, or build. We don’t know our neighbors anymore — and buying and selling local food is a great way to reconnect. Every order of farm-fresh produce or homemade goods is a small introduction: a reason for neighbors to meet, to invest in one another, and to become a little more of a community again.',
    s4Title: 'Sell Your Produce, Baked Goods, and Crafts — No Full-Season Commitment',
    s4Body: `Not everyone wants to commit to a full market season — and they shouldn’t have to. Some people sell garden produce only at harvest, offer homemade baked goods or cottage foods around the holidays, or list handmade crafts just once in a while. Every one of them has something their community is better off having, so ${brand} welcomes all of them — no full-season market requirement, no storefront, no overhead.`,
    b1Lead: 'In cities and suburbs', b1Rest: '— an easy way to become a local farmers market vendor and get back into neighbor-to-neighbor selling.',
    b2Lead: 'In rural communities', b2Rest: '— a way to earn extra income where the old small-business opportunities have faded, without renting a storefront or taking on fixed costs.',
    b3Lead: 'For longtime growers and makers', b3Rest: '— a way to keep sharing the produce and goods you love with the people who appreciate them most.',
    ctaTitle: 'Start Shopping and Selling Local Today',
    ctaIntro: 'However you want to take part, there’s a place for you here.',
    ctaBtn1: 'Shop local produce and goods', ctaBtn2: 'Sell your homegrown or homemade items', ctaBtn3: 'Bring your farmers market online',
    ctaClosing: 'Because a community is stronger when its neighbors know — and support — one another.',
    contactTitle: 'Contact Us',
    contactBody: 'Questions, feedback, or need a hand? We’re here to help.',
    contactSupport: 'Contact support',
    contactHelp: 'Browse the help center',
  }
  const es = {
    heroH1: 'Un Mercado de Agricultores Local Donde los Vecinos se Venden entre Sí',
    heroSub: `${brand} es un lugar para vender el excedente de tu jardín, tu cocina o tu oficio a las personas que te rodean — compra y vende productos cultivados en casa, comida casera y artículos hechos a mano, sin tienda física y sin necesidad de un negocio tradicional o formal.`,
    s1Title: 'Cultivado y Hecho en Casa, Vendido Como Siempre Se Hizo',
    s1Body: `Durante casi toda la historia, las personas cultivaban su propia comida y hacían cosas a mano — se quedaban con lo que necesitaban y vendían o compartían el resto con los vecinos. Verduras frescas, huevos, miel, mermelada y productos horneados pasaban de la cocina o el jardín de un vecino al siguiente, mucho antes de las corporaciones y las cadenas de supermercados. En gran parte de la América rural, esa venta de vecino a vecino nunca desapareció — pero en las ciudades y los suburbios casi se ha perdido por completo. ${brand} existe para que vender productos cultivados y hechos en casa vuelva a ser fácil, y para ayudar a los vecinos urbanos y suburbanos a reconectar con una de las tradiciones más antiguas y confiables de la vida comunitaria estadounidense.`,
    s2Title: 'Compra Local: Comercio Que Se Queda en la Comunidad',
    s2Body: 'Venderle a tus vecinos sigue siendo vender — la gente quiere ganar, y muchos financian un jardín, un pasatiempo o un ingreso extra de verdad. Pero rara vez se trata solo del dinero. Hay orgullo en los tomates que cultivaste, el pan que horneaste, lo que hiciste bien — y hay algo que vale la pena proteger en un comercio que se queda cerca de casa. Cuando compras local y le compras a un vecino, ese dinero se queda en tu comunidad en lugar de irse con una gran cadena o una tienda de descuento. Ese impacto local es una de las razones por las que esto importa — no la única razón, pero sí una real.',
    s3Title: 'Compra Comida Local y Conoce a Tus Vecinos',
    s3Body: 'En algún punto del camino, dejamos de conocer a nuestros vecinos. Con una tienda en cada esquina, es fácil pasar años sin enterarse de lo que la gente de la cuadra puede cultivar, hornear o crear. Ya no conocemos a nuestros vecinos — y comprar y vender comida local es una gran manera de reconectar. Cada pedido de productos frescos del campo o comida casera es una pequeña presentación: un motivo para que los vecinos se conozcan, inviertan unos en otros y vuelvan a ser un poco más una comunidad.',
    s4Title: 'Vende Tus Productos, Panadería y Artesanías — Sin Compromiso de Temporada Completa',
    s4Body: `No todos quieren comprometerse con una temporada completa de mercado — y no deberían tener que hacerlo. Algunas personas venden productos del jardín solo en la cosecha, ofrecen productos horneados o comida casera en las fiestas, o publican artesanías hechas a mano de vez en cuando. Cada una tiene algo que su comunidad estaría mejor teniendo, así que ${brand} les da la bienvenida a todas — sin requisito de temporada completa, sin tienda física, sin gastos fijos.`,
    b1Lead: 'En ciudades y suburbios', b1Rest: '— una manera fácil de convertirte en vendedor de un mercado de agricultores local y volver a la venta de vecino a vecino.',
    b2Lead: 'En comunidades rurales', b2Rest: '— una manera de ganar ingresos extra donde las viejas oportunidades de pequeños negocios se han desvanecido, sin rentar un local ni asumir costos fijos.',
    b3Lead: 'Para agricultores y artesanos de siempre', b3Rest: '— una manera de seguir compartiendo los productos y artículos que amas con las personas que más los aprecian.',
    ctaTitle: 'Empieza a Comprar y Vender Local Hoy',
    ctaIntro: 'Como sea que quieras participar, aquí hay un lugar para ti.',
    ctaBtn1: 'Compra productos y artículos locales', ctaBtn2: 'Vende tus artículos cultivados o hechos en casa', ctaBtn3: 'Lleva tu mercado de agricultores en línea',
    ctaClosing: 'Porque una comunidad es más fuerte cuando sus vecinos se conocen — y se apoyan — entre sí.',
    contactTitle: 'Contáctanos',
    contactBody: '¿Preguntas, comentarios o necesitas ayuda? Estamos para ayudarte.',
    contactSupport: 'Contactar soporte',
    contactHelp: 'Ver el centro de ayuda',
  }
  const c = isEs ? es : en
  return (
    <div style={{ color: colors.textSecondary, fontSize: typography.sizes.base, lineHeight: typography.leading.relaxed }}>
      <header style={{ textAlign: 'center', marginBottom: spacing['2xl'] }}>
        <h1 style={{ fontSize: typography.sizes['3xl'], fontWeight: typography.weights.bold, color: colors.textPrimary, marginBottom: spacing.sm }}>
          {c.heroH1}
        </h1>
        <p style={{ fontSize: typography.sizes.lg, color: colors.textSecondary, maxWidth: 620, margin: '0 auto' }}>{c.heroSub}</p>
      </header>

      <Section title={c.s1Title}><p>{c.s1Body}</p></Section>
      <Section title={c.s2Title}><p>{c.s2Body}</p></Section>
      <Section title={c.s3Title}><p>{c.s3Body}</p></Section>

      <Section title={c.s4Title}>
        <p>{c.s4Body}</p>
        <ul style={{ paddingLeft: spacing.lg, marginTop: spacing.sm }}>
          <li style={{ marginBottom: spacing.xs }}><strong>{c.b1Lead}</strong> {c.b1Rest}</li>
          <li style={{ marginBottom: spacing.xs }}><strong>{c.b2Lead}</strong> {c.b2Rest}</li>
          <li style={{ marginBottom: spacing.xs }}><strong>{c.b3Lead}</strong> {c.b3Rest}</li>
        </ul>
      </Section>

      <section id="get-started" style={{ marginTop: spacing['2xl'], paddingTop: spacing.lg, borderTop: `1px solid ${colors.border}` }}>
        <h2 style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: colors.textPrimary, marginBottom: spacing.sm }}>{c.ctaTitle}</h2>
        <p style={{ marginBottom: spacing.lg }}>{c.ctaIntro}</p>
        <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap', marginBottom: spacing.lg }}>
          <CtaLink href={`/${vertical}/browse`} variant="solid">{c.ctaBtn1}</CtaLink>
          <CtaLink href={`/${vertical}/vendor-signup`} variant="outline">{c.ctaBtn2}</CtaLink>
          <CtaLink href={`/${vertical}/market-manager-program`} variant="outline">{c.ctaBtn3}</CtaLink>
        </div>
        <p style={{ fontSize: typography.sizes.base, color: colors.textMuted, fontStyle: 'italic' }}>{c.ctaClosing}</p>
      </section>

      {/* Contact — tester finding 2026-07-23: the footer Contact link pointed at
          #contact, but that anchor sat on the CTA section (no contact content).
          A real Contact section that routes to the working support + help pages. */}
      <section id="contact" style={{ marginTop: spacing['2xl'], paddingTop: spacing.lg, borderTop: `1px solid ${colors.border}` }}>
        <h2 style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: colors.textPrimary, marginBottom: spacing.sm }}>{c.contactTitle}</h2>
        <p style={{ marginBottom: spacing.md }}>{c.contactBody}</p>
        <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
          <CtaLink href={`/${vertical}/support`} variant="solid">{c.contactSupport}</CtaLink>
          <CtaLink href={`/${vertical}/help`} variant="outline">{c.contactHelp}</CtaLink>
        </div>
      </section>
    </div>
  )
}

// ── Food Trucks — culinary-passion + convenience (2026-07-19; es 2026-07-19) ────

function FoodTruckAbout({ vertical, branding, isEs }: { vertical: string; branding: { brand_name: string }; isEs: boolean }) {
  const brand = branding.brand_name
  const en = {
    heroH1: 'Order from Local Food Trucks — Skip the Line, Never Miss the Special',
    heroSub: 'Pre-order from independent local food trucks and pick up without the wait — real food from real cooks, ready when you arrive.',
    s1Title: 'A Chef’s Vision, Without the Restaurant',
    s1Body: 'A food truck is a cook’s vision on wheels. It lets someone with a real culinary point of view share it without the enormous cost of building and outfitting a restaurant — the buildout, the lease, the dining room, the years of overhead. With less to carry and the freedom to move, the food can reflect the cook, the place, and the moment instead of a fixed menu built to fill seats. That’s how a great taco, a specific style of BBQ, or one perfect dish becomes a business.',
    s2Title: 'Closer to the Chef: Independent Cooks Doing One Thing Well',
    s2Body: 'In a traditional restaurant, you order off a menu designed to keep a whole dining room profitable — the chef’s vision is only part of it. A food truck is different. It’s often one or two things done exceptionally well, by the person who dreamed them up. A specialty that could never carry a full restaurant can absolutely carry a truck — and you taste the difference when someone gets to focus on exactly what they love to make.',
    s3Title: 'Back the Independent Cook, Not the Chain',
    s3Body: `There’s a reason people go out of their way for a good truck. It’s the pull of backing a passionate, quality-obsessed independent over another fast-food counter — supporting local, and supporting the person who actually cares about the food. Every truck on ${brand} is someone building something of their own, one great dish at a time.`,
    s4Title: 'All the Food-Truck Experience, None of the Wait',
    s4Body: 'You know the routine: you track down where the truck is parked, drive over, wait in line — and the thing you came for just sold out, sometimes to the person right in front of you. Or the food’s made fresh, which means it’s better, but you’re standing around waiting for your number to be called. Ordering ahead through the app fixes the frustrating part. Your order is placed and paid before you arrive, the truck knows it’s coming, and your food is ready when you get there. You still get to be out enjoying great street food — you just skip the line and never miss the special.',
    s5Title: 'Better for the Cooks, Too',
    s5Body: 'It’s not just easier for customers. When orders come in ahead of time, a truck can prep for what’s actually coming instead of guessing and scrambling from one order to the next. And because a lot of a truck’s business comes from events and catering, we connect trucks with event organizers and hosts — so they can spend their energy cooking, not planning.',
    ctaTitle: 'Find and Order from Local Food Trucks Today',
    ctaIntro: 'However you like your food-truck fix, there’s a place for you here.',
    ctaBtn1: 'Order from local food trucks', ctaBtn2: 'Run a food truck', ctaBtn3: 'Book a truck for your event',
    ctaClosing: 'Real food, made by people who love making it — ready when you are.',
    contactTitle: 'Contact Us',
    contactBody: 'Questions, feedback, or need a hand? We’re here to help.',
    contactSupport: 'Contact support',
    contactHelp: 'Browse the help center',
  }
  const es = {
    heroH1: 'Pide a Food Trucks Locales — Sáltate la Fila y Nunca Te Pierdas el Especial',
    heroSub: 'Haz tu pedido por adelantado a food trucks locales e independientes y recógelo sin esperar — comida de verdad, de cocineros de verdad, lista cuando llegas.',
    s1Title: 'La Visión de un Chef, Sin el Restaurante',
    s1Body: 'Un food truck es la visión de un cocinero sobre ruedas. Le permite a alguien con un verdadero punto de vista culinario compartirlo sin el enorme costo de construir y equipar un restaurante — la remodelación, el alquiler, el comedor, los años de gastos fijos. Con menos que cargar y la libertad de moverse, la comida puede reflejar al cocinero, el lugar y el momento, en vez de un menú fijo diseñado para llenar mesas. Así es como un gran taco, un estilo específico de BBQ o un platillo perfecto se convierte en un negocio.',
    s2Title: 'Más Cerca del Chef: Cocineros Independientes Haciendo Una Cosa Bien',
    s2Body: 'En un restaurante tradicional, pides de un menú diseñado para mantener rentable todo un comedor — la visión del chef es solo una parte. Un food truck es diferente. Suele ser una o dos cosas hechas excepcionalmente bien, por la persona que las ideó. Una especialidad que nunca podría sostener un restaurante completo sí puede sostener un truck — y notas la diferencia cuando alguien puede concentrarse exactamente en lo que ama hacer.',
    s3Title: 'Apoya al Cocinero Independiente, No a la Cadena',
    s3Body: `Hay una razón por la que la gente se desvía de su camino por un buen truck. Es el atractivo de apoyar a un independiente apasionado y obsesionado con la calidad en vez de a otro mostrador de comida rápida — apoyar lo local, y apoyar a la persona a la que de verdad le importa la comida. Cada truck en ${brand} es alguien construyendo algo propio, un gran platillo a la vez.`,
    s4Title: 'Toda la Experiencia del Food Truck, Sin la Espera',
    s4Body: 'Ya conoces la rutina: localizas dónde está estacionado el truck, manejas hasta allá, haces fila — y justo lo que ibas a pedir se acaba de agotar, a veces con la persona que está delante de ti. O la comida se hace fresca, lo que significa que es mejor, pero te quedas esperando a que llamen tu número. Pedir por adelantado a través de la app arregla la parte frustrante. Tu pedido queda hecho y pagado antes de que llegues, el truck sabe que viene, y tu comida está lista cuando llegas. Sigues disfrutando de estar afuera comiendo buena comida callejera — solo que te saltas la fila y nunca te pierdes el especial.',
    s5Title: 'Mejor para los Cocineros, También',
    s5Body: 'No solo es más fácil para los clientes. Cuando los pedidos llegan con anticipación, un truck puede preparar lo que realmente va a llegar en vez de adivinar y correr de un pedido al siguiente. Y como gran parte del negocio de un truck viene de eventos y catering, conectamos a los trucks con organizadores de eventos y anfitriones — para que puedan gastar su energía cocinando, no planeando.',
    ctaTitle: 'Encuentra y Pide a Food Trucks Locales Hoy',
    ctaIntro: 'Como sea que disfrutes tu antojo de food truck, aquí hay un lugar para ti.',
    ctaBtn1: 'Pide a food trucks locales', ctaBtn2: 'Opera un food truck', ctaBtn3: 'Reserva un truck para tu evento',
    ctaClosing: 'Comida de verdad, hecha por personas que aman hacerla — lista cuando tú lo estés.',
    contactTitle: 'Contáctanos',
    contactBody: '¿Preguntas, comentarios o necesitas ayuda? Estamos para ayudarte.',
    contactSupport: 'Contactar soporte',
    contactHelp: 'Ver el centro de ayuda',
  }
  const c = isEs ? es : en
  return (
    <div style={{ color: colors.textSecondary, fontSize: typography.sizes.base, lineHeight: typography.leading.relaxed }}>
      <header style={{ textAlign: 'center', marginBottom: spacing['2xl'] }}>
        <h1 style={{ fontSize: typography.sizes['3xl'], fontWeight: typography.weights.bold, color: colors.textPrimary, marginBottom: spacing.sm }}>
          {c.heroH1}
        </h1>
        <p style={{ fontSize: typography.sizes.lg, color: colors.textSecondary, maxWidth: 620, margin: '0 auto' }}>{c.heroSub}</p>
      </header>

      <Section title={c.s1Title}><p>{c.s1Body}</p></Section>
      <Section title={c.s2Title}><p>{c.s2Body}</p></Section>
      <Section title={c.s3Title}><p>{c.s3Body}</p></Section>
      <Section title={c.s4Title}><p>{c.s4Body}</p></Section>
      <Section title={c.s5Title}><p>{c.s5Body}</p></Section>

      <section id="get-started" style={{ marginTop: spacing['2xl'], paddingTop: spacing.lg, borderTop: `1px solid ${colors.border}` }}>
        <h2 style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: colors.textPrimary, marginBottom: spacing.sm }}>{c.ctaTitle}</h2>
        <p style={{ marginBottom: spacing.lg }}>{c.ctaIntro}</p>
        <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap', marginBottom: spacing.lg }}>
          <CtaLink href={`/${vertical}/browse`} variant="solid">{c.ctaBtn1}</CtaLink>
          <CtaLink href={`/${vertical}/vendor-signup`} variant="outline">{c.ctaBtn2}</CtaLink>
          <CtaLink href={`/${vertical}/events`} variant="outline">{c.ctaBtn3}</CtaLink>
        </div>
        <p style={{ fontSize: typography.sizes.base, color: colors.textMuted, fontStyle: 'italic' }}>{c.ctaClosing}</p>
      </section>

      {/* Contact — tester finding 2026-07-23 (see FM component). Real Contact
          section routing to the working support + help pages. */}
      <section id="contact" style={{ marginTop: spacing['2xl'], paddingTop: spacing.lg, borderTop: `1px solid ${colors.border}` }}>
        <h2 style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: colors.textPrimary, marginBottom: spacing.sm }}>{c.contactTitle}</h2>
        <p style={{ marginBottom: spacing.md }}>{c.contactBody}</p>
        <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
          <CtaLink href={`/${vertical}/support`} variant="solid">{c.contactSupport}</CtaLink>
          <CtaLink href={`/${vertical}/help`} variant="outline">{c.contactHelp}</CtaLink>
        </div>
      </section>
    </div>
  )
}

// ── Shared presentational helpers ─────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: spacing.xl }}>
      <h2 style={{ fontSize: typography.sizes['2xl'], fontWeight: typography.weights.bold, color: colors.textPrimary, marginBottom: spacing.md }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

function CtaLink({ href, variant, children }: { href: string; variant: 'solid' | 'outline'; children: React.ReactNode }) {
  const solid = variant === 'solid'
  // Tester finding 2026-07-23: the three CTA buttons had uneven-length labels
  // and grew oversized (esp. on mobile). Equal-width columns that share one row
  // on desktop and stack on mobile; centered text wraps to ~2 lines with a
  // uniform min-height so all three match. flex: 1 1 0 = equal share of the row.
  return (
    <Link
      href={href}
      style={{
        flex: '1 1 0',
        minWidth: 160,
        minHeight: 60,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: `${spacing.sm} ${spacing.md}`,
        borderRadius: radius.md,
        fontWeight: typography.weights.semibold,
        fontSize: typography.sizes.base,
        lineHeight: typography.leading.snug,
        textDecoration: 'none',
        backgroundColor: solid ? colors.primary : 'transparent',
        color: solid ? 'white' : colors.primary,
        border: `2px solid ${colors.primary}`,
      }}
    >
      {children}
    </Link>
  )
}
