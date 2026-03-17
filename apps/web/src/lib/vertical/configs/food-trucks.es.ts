import type { VerticalTerminologyConfig } from '../types'
import { foodTrucksConfig } from './food-trucks'

/**
 * Spanish translations for Food Trucks vertical.
 * Inherits features and radiusOptions from English config.
 * Only terminology and content are translated.
 */
export const foodTrucksEsConfig: VerticalTerminologyConfig = {
  ...foodTrucksConfig,

  terminology: {
    // Vertical identity (brand name stays English)
    display_name: "Food Truck'n",

    // Core nouns
    vendor: 'Food Truck',
    vendors: 'Food Trucks',
    vendor_person: 'Operador',
    vendor_people: 'operadores de food trucks y chefs',
    listing: 'Platillo',
    listings: 'Platillos',
    product: 'Platillo',
    products: 'Menú',
    market: 'Ubicación',
    markets: 'Ubicaciones',
    traditional_market: 'Ubicación Multi-Camión',
    traditional_markets: 'Ubicaciones Multi-Camión',
    private_pickup: 'Ubicación Individual',
    private_pickups: 'Ubicaciones Individuales',
    market_box: 'Chef Box',
    market_boxes: 'Chef Boxes',
    market_day: 'Hora de servicio',
    market_hours: 'Horario de Operación',
    event: 'Evento',
    events: 'Eventos',
    event_icon_emoji: '🎪',
    // Event system
    event_feature_name: 'Eventos Privados',
    event_request_heading: 'Reserva Food Trucks para Tu Evento',
    event_vendor_count_label: 'Número de Food Trucks',
    event_vendor_unit: 'truck',
    event_preference_label: 'Preferencias de Cocina',
    event_preference_placeholder: 'BBQ, mexicana, fusión asiática, etc.',
    event_hero_subtitle: 'Lleva food trucks a tu oficina, evento o reunión. Tus empleados ordenan y recogen su comida — sin bandejas de catering, sin sobras, solo buena comida.',
    event_submit_button: 'Enviar Solicitud de Evento',
    event_success_message: 'opciones de food trucks',

    // Descriptive phrases
    product_examples: 'tacos, BBQ, pizza, hamburguesas y comida callejera de cocinas de todo el mundo',
    vendor_location: 'cocina o comisariato',

    // Page-level text
    vendors_page_title: 'Food Trucks Locales',
    vendors_page_subtitle: 'Descubre operadores de food trucks, chefs y artesanos culinarios en tu área.',
    browse_page_subtitle: 'Descubre platillos y Chef Boxes de food trucks locales cerca de ti.',
    subscription_description: 'Los Chef Boxes son paquetes semanales de comida de tus food trucks favoritos. Suscríbete para asegurar tus favoritos cada semana.',

    // Emojis (same as English)
    no_results_vendor_emoji: '👨‍🍳',
    no_results_market_emoji: '🚚',
    vendor_section_emoji: '🚚',
    market_icon_emoji: '📍',
    vendor_icon_emoji: '👨‍🍳',

    // CTAs & nav labels
    browse_products_cta: 'Ver Menús',
    find_markets_cta: 'Buscar Parques',
    find_vendors_cta: 'Buscar Food Trucks',
    vendor_signup_cta: 'Registra Tu Food Truck',
    my_listings_nav: 'Mi Menú',
    create_listing_cta: 'Agregar Platillo',
    vendor_dashboard_nav: 'Panel del Vendedor',
    suggest_market_cta: 'Sugerir una Ubicación',

    // Trust indicators
    trust_vendors: 'Trucks Verificados',
    trust_pickup: 'Sin Filas',
    trust_payments: 'Pagos Seguros',
  },

  content: {
    hero: {
      headline_line1: 'Explora comida local',
      headline_line2: '¡Sin filas, a disfrutar!',
      subtitle: 'Encuentra food trucks cerca de ti. Pre-ordena tus favoritos en línea y evita la fila al recoger.',
    },
    how_it_works: {
      step1_title: 'Descubre',
      step1_text: 'Encuentra food trucks cerca de ti. Explora menús de operadores locales que sirven tus cocinas favoritas.',
      step2_title: 'Ordena por Adelantado',
      step2_text: 'Elige tu truck. Agrega platillos a tu carrito. Completa tu pedido con pago seguro.',
      step3_title: 'Sin Filas',
      step3_text: 'Ve al truck. Tu pre-orden está caliente y lista cuando llegas. Sin esperas.',
      step4_title: 'Disfruta',
      step4_text: 'Toma tu comida y ve, o quédate y descubre otros trucks mientras estás ahí.',
    },
    vendor_pitch: {
      headline: 'Haz Crecer Tu Negocio de Food Truck',
      subtitle: 'Únete a operadores de food trucks que ya reciben pre-órdenes a través de nuestra plataforma.',
      benefits: [
        'Acepta pre-órdenes antes del horario de servicio',
        'Conoce la demanda de antemano, reduce el desperdicio',
        'Administra tu menú y pedidos desde tu teléfono',
        'Comisiones de tarjeta de crédito incluidas en el precio',
        'Construye un grupo leal de clientes regulares',
        'Que te descubran personas hambrientas cerca de ti',
      ],
      cta: 'Registra Tu Food Truck',
      description: 'Todo lo que necesitas en un solo lugar — administra tu menú, rastrea pedidos y haz crecer tu base de clientes. Ya sea que sirvas tacos, pizza, hamburguesas o cocina fusión, nuestra plataforma está diseñada para food trucks de todos los tamaños.',
    },
    features: {
      verified: {
        title: 'Trucks Verificados',
        description: 'Cada truck es verificado antes de unirse. Ordena con confianza sabiendo que estás comprando de operadores legítimos y con licencia.',
      },
      local: {
        title: 'Enfoque Local',
        description: 'Busca de 2 a 25 millas para encontrar lo más cercano a ti. Siempre enfocado en tus trucks más cercanos primero.',
      },
      no_soldout: {
        title: 'Sin Filas',
        description: 'Pre-ordena tus favoritos y evita la espera. Tu comida está lista cuando llegas.',
      },
      schedule: {
        title: 'Tu Tiempo, Tu Manera',
        description: 'Pre-ordena y recoge a tu conveniencia. No más largas filas durante la hora del almuerzo.',
      },
      mobile: {
        title: 'Funciona en tu Celular',
        description: 'Ordena desde tu teléfono en segundos. Agrégalo a tu pantalla de inicio para acceso instantáneo.',
      },
      updates: {
        title: 'Actualizaciones de Pedido',
        description: 'Notificaciones en tiempo real cuando tu pedido es confirmado y está listo para recoger.',
      },
    },
    platform: {
      why_choose_headline: 'Por Qué Elegirnos',
      why_choose_subtitle: 'Diseñado para amantes de la comida y food trucks que valoran la calidad, conveniencia y comunidad',
    },
    features_page: {
      hero_subtitle: 'Pre-ordena de tus food trucks favoritos, evita las filas y recoge cuando tu comida esté lista.',
      shopper_preorder_desc: 'Pre-ordena tus platillos favoritos antes de la hora pico. Tu comida se prepara fresca y te espera.',
      shopper_skip_lines_desc: 'Pasa la fila y ve directo a la ventanilla de recogida. Tu pedido está listo cuando llegas.',
      vendor_pickup_desc: 'Establece tus propias ubicaciones y horarios de recogida. Los clientes eligen lo que les conviene.',
      get_started_step1: 'Encuentra food trucks cerca de ti',
      subscription_feature_desc: 'Suscríbete a Chef Boxes para paquetes semanales de comida — kits de cena, paquetes familiares, cajas sorpresa y más de tus trucks favoritos.',
      analytics_feature_desc: 'Rastrea tendencias de ventas, platillos populares e información de clientes con un panel de análisis integrado.',
      tiers_feature_desc: 'Elige entre los planes Gratis, Básico, Pro o Boss según las necesidades de tu negocio y desbloquea más funciones conforme creces.',
      trial_feature_desc: 'Comienza con un período promocional en un plan de pago — sin compromiso. Baja de plan cuando quieras.',
    },
    featured_section: {
      headline: 'Encuentra Food Trucks en Tu Área',
      paragraph1: 'Los food trucks unen a los vecindarios. Ya sean tacos, BBQ, thai, sushi, pizza o papas cargadas en un parque de food trucks un viernes por la noche, estas cocinas móviles traen la mejor comida callejera directamente a ti.',
      paragraph2: 'Cada pedido apoya a un operador independiente construyendo algo con sus propias manos. Estamos aquí para hacer que encontrar y ordenar de tus trucks favoritos sea fácil.',
      link_text: 'Encuentra food trucks cerca de ti',
    },
    trust_stats: {
      products_label: 'Platillos',
      vendors_label: 'Food Trucks',
      markets_label: 'Ubicaciones',
      tagline: 'Conectándote con food trucks locales en tu comunidad',
      tagline_location: 'Conectándote con food trucks locales en el área de {area}',
    },
    get_the_app: {
      headline: 'Ordena por Adelantado, Donde Estés',
      subtitle: 'Explora menús, pre-ordena tus favoritos y evita la fila al recoger. Recibe notificaciones cuando tu comida esté lista.',
      features: [
        'Pre-ordena y evita la fila',
        'Notificaciones de pedido en tiempo real',
        'Encuentra trucks cerca de ti',
        'Explora menús desde tu teléfono',
      ],
      phone_products: [
        { name: 'Tacos Callejeros', price: '$8.50', color: '#e74c3c' },
        { name: 'Papas Cargadas', price: '$6.00', color: '#f39c12' },
        { name: 'Puerco BBQ', price: '$12.00', color: '#8B4513' },
        { name: 'Limonada Artesanal', price: '$4.00', color: '#2ecc71' },
      ],
    },
    final_cta: {
      subtitle: 'Únete a operadores de food trucks y personas hambrientas que ya usan nuestra plataforma para evitar filas y descubrir nuevos favoritos.',
    },
  },
}
