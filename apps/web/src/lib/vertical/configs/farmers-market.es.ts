import type { VerticalTerminologyConfig } from '../types'
import { farmersMarketConfig } from './farmers-market'

/**
 * Spanish translations for Farmers Market vertical.
 * Inherits features and radiusOptions from English config.
 * Only terminology and content are translated.
 */
export const farmersMarketEsConfig: VerticalTerminologyConfig = {
  ...farmersMarketConfig,

  terminology: {
    // Vertical identity (brand name stays English)
    display_name: 'Farmers Market',

    // Core nouns
    vendor: 'Vendedor',
    vendors: 'Vendedores',
    vendor_person: 'Agricultor',
    vendor_people: 'agricultores, panaderos y artesanos',
    listing: 'Producto',
    listings: 'Productos',
    product: 'Producto',
    products: 'Productos',
    market: 'Mercado',
    markets: 'Mercados',
    traditional_market: 'Mercado de Agricultores',
    traditional_markets: 'Mercados de Agricultores',
    private_pickup: 'Recogida Privada',
    private_pickups: 'Recogidas Privadas',
    market_box: 'Caja del Mercado',
    market_boxes: 'Cajas del Mercado',
    market_day: 'Día de mercado',
    market_hours: 'Horario del Mercado',
    event: 'Evento',
    events: 'Eventos',
    event_icon_emoji: '🎪',
    // Event system
    event_feature_name: 'Mercados Emergentes',
    event_request_heading: 'Organiza un Mercado Emergente',
    event_vendor_count_label: 'Número de Vendedores',
    event_vendor_unit: 'vendedor',
    event_preference_label: 'Preferencias de Tipo de Vendedor',
    event_preference_placeholder: 'Frutas y verduras, pan artesanal, mermeladas, artesanías, etc.',
    event_hero_subtitle: 'Organiza un mercado emergente en tu oficina, vecindario o evento comunitario. Los vendedores traen productos frescos, pan artesanal y productos artesanales para que tus invitados exploren y compren.',
    event_submit_button: 'Enviar Solicitud',
    event_success_message: 'opciones de vendedores',

    // Descriptive phrases
    product_examples: 'frutas y verduras frescas, pan artesanal, miel, mermeladas y productos artesanales — incluyendo productos caseros',
    vendor_location: 'granja o tienda',

    // Page-level text
    vendors_page_title: 'Vendedores Locales',
    vendors_page_subtitle: 'Descubre agricultores, panaderos y artesanos que venden en mercados cerca de ti.',
    browse_page_subtitle: 'Descubre productos y cajas del mercado de vendedores locales cerca de ti.',
    subscription_description: 'Las Cajas del Mercado son suscripciones de 4 semanas con selecciones frescas de vendedores locales. Suscríbete para recibir productos frescos cada semana.',

    // Emojis (same as English)
    no_results_vendor_emoji: '🧑‍🌾',
    no_results_market_emoji: '🧺',
    vendor_section_emoji: '🏪',
    market_icon_emoji: '🧺',
    vendor_icon_emoji: '🧑‍🌾',

    // CTAs & nav labels
    browse_products_cta: 'Ver Productos',
    find_markets_cta: 'Buscar Mercados',
    find_vendors_cta: 'Buscar Vendedores',
    vendor_signup_cta: 'Ser Vendedor',
    my_listings_nav: 'Mis Productos',
    create_listing_cta: 'Crear Nuevo Producto',
    vendor_dashboard_nav: 'Panel del Vendedor',
    suggest_market_cta: 'Sugerir un Mercado',

    // Trust indicators
    trust_vendors: 'Vendedores Verificados',
    trust_pickup: 'Recogida Local',
    trust_payments: 'Pagos Seguros',
  },

  content: {
    hero: {
      headline_line1: 'Comida Fresca y Local',
      headline_line2: 'y Productos Artesanales',
      subtitle: 'Explora productos de agricultores y artesanos locales. Haz tu pedido en línea y recógelo en tu mercado más cercano.',
    },
    how_it_works: {
      step1_title: 'Descubre',
      step1_text: 'Encuentra mercados de agricultores y vendedores cerca de ti. Explora frutas y verduras frescas, pan artesanal y productos artesanales.',
      step2_title: 'Compra y Ordena',
      step2_text: 'Elige tu mercado. Agrega productos a tu carrito. Completa tu pedido con pago seguro (de uno o más vendedores).',
      step3_title: 'Recoge Fresco',
      step3_text: 'Visita el mercado. Recoge tus productos pre-ordenados — tus selecciones están apartadas y esperándote.',
      step4_title: 'Disfruta el Mercado',
      step4_text: 'Tómate tu tiempo explorando otros vendedores, encuentra amigos y disfruta ser parte de tu comunidad local.',
    },
    vendor_pitch: {
      headline: 'Haz Crecer Tu Negocio',
      subtitle: 'Únete a agricultores, panaderos, productores caseros y artesanos locales que ya venden a través de nuestra plataforma.',
      benefits: [
        'Pre-vende productos antes del día de mercado',
        'Sabe qué llevar, reduce el desperdicio',
        'Administra pedidos e inventario fácilmente',
        'Comisiones de tarjeta de crédito ya incluidas',
        'Construye una base de clientes leales',
        'Que te descubran compradores locales',
      ],
      cta: 'Ser Vendedor',
      description: 'Todo lo que necesitas en un solo lugar — administra tus productos, rastrea pedidos y haz crecer tu base de clientes. Desde operaciones de comida casera y panaderos hasta vendedores de mercado de tiempo completo, nuestra plataforma apoya a vendedores de todos los tamaños.',
    },
    features: {
      verified: {
        title: 'Vendedores Verificados',
        description: 'Cada vendedor es verificado antes de unirse. Compra con confianza sabiendo que estás comprando de vendedores locales legítimos.',
      },
      local: {
        title: 'Enfoque Local',
        description: 'Busca de 10 a 100 millas para encontrar lo más cercano a ti. Diseñado para servir tanto a vecindarios urbanos como a comunidades rurales — siempre enfocado en tus vendedores más cercanos primero.',
      },
      no_soldout: {
        title: 'Sin Productos Agotados',
        description: 'Pre-ordena tus favoritos con disponibilidad confirmada por el vendedor. Duerme tranquilo el día del mercado y aún así obtén todo lo que quieres.',
      },
      schedule: {
        title: 'Tu Tiempo, Tu Manera',
        description: 'Pre-ordena y recoge a tu conveniencia. Disfruta la experiencia del mercado sin la prisa de la mañana.',
      },
      mobile: {
        title: 'Funciona en tu Celular',
        description: 'Compra desde cualquier dispositivo, ya sea que estés fuera de casa o navegando desde tu sofá. No necesitas computadora — todo funciona perfectamente desde tu teléfono.',
      },
      updates: {
        title: 'Actualizaciones de Pedido',
        description: 'Mantente informado con notificaciones en la app, SMS y correo electrónico. Elige lo que prefieras y nunca pierdas una actualización.',
      },
    },
    platform: {
      why_choose_headline: 'Por Qué Elegirnos',
      why_choose_subtitle: 'Diseñado para compradores y vendedores que valoran la calidad, conveniencia y comunidad',
    },
    features_page: {
      hero_subtitle: 'Pre-ordena de tus vendedores favoritos del mercado, evita las filas y recoge a tu conveniencia.',
      shopper_preorder_desc: 'Pre-ordena las mejores frutas, verduras, pan artesanal y productos artesanales antes de que se agoten. Tus productos están reservados y esperándote.',
      shopper_skip_lines_desc: 'Pasa de largo las multitudes y ve directo a recoger. Disfruta tu tiempo en el mercado sin esperas.',
      vendor_pickup_desc: 'Ofrece recogida en mercados de agricultores o establece ubicaciones privadas de recogida. Flexibilidad para ti y tus clientes.',
      get_started_step1: 'Busca mercados de agricultores locales',
      subscription_feature_desc: 'Suscríbete a Cajas del Mercado para recibir selecciones semanales de frutas, verduras, pan artesanal y más de tus vendedores favoritos.',
      analytics_feature_desc: 'Rastrea tendencias de ventas, productos principales e información de clientes con un panel de análisis integrado.',
      tiers_feature_desc: 'Elige entre los planes Gratis, Estándar, Premium o Destacado según las necesidades de tu negocio y crece a tu propio ritmo.',
      trial_feature_desc: 'Comienza con un período promocional en un plan de pago — sin compromiso. Baja de plan cuando quieras.',
    },
    featured_section: {
      headline: 'Descubre Mercados en Tu Comunidad',
      paragraph1: 'Los mercados de agricultores son más que compras — son el corazón de las comunidades locales. Para granjas familiares, productores caseros, panaderos y artesanos, un puesto semanal en el mercado es ingreso esencial que mantiene vivas sus operaciones.',
      paragraph2: 'Cada dólar gastado localmente circula de vuelta a tu vecindario, apoyando a los productores, creadores y familias que hacen vibrante tu comunidad. Estamos aquí para hacer esa conexión más fácil.',
      link_text: 'Busca mercados cerca de ti',
    },
    trust_stats: {
      products_label: 'Productos',
      vendors_label: 'Vendedores',
      markets_label: 'Mercados',
      tagline: 'Apoyando a productores y artesanos locales en tu comunidad',
      tagline_location: 'Apoyando a productores y artesanos locales en el área de {area}',
    },
    get_the_app: {
      headline: 'Fresco y Local, Donde Estés',
      subtitle: 'Explora vendedores, haz pedidos y administra recogidas desde tu teléfono. Recibe notificaciones cuando tu pedido esté listo.',
      features: [
        'Pedidos rápidos desde cualquier lugar',
        'Notificaciones de pedido en tiempo real',
        'Descubre vendedores fácilmente',
        'Navega desde tu teléfono',
      ],
      phone_products: [
        { name: 'Tomates Frescos', price: '$4.50', color: '#e74c3c' },
        { name: 'Miel Local', price: '$12.00', color: '#f39c12' },
        { name: 'Pan Artesanal', price: '$7.00', color: '#d4a574' },
        { name: 'Frutas del Bosque', price: '$6.00', color: '#8e44ad' },
      ],
    },
    final_cta: {
      subtitle: 'Únete a nuestra comunidad creciente que conecta a productores locales, artesanos y los vecinos que los apoyan.',
    },
  },
}
