/**
 * Single authoritative source for site identity, navigation and taxonomy.
 *
 * Categories are defined ONCE here. Content frontmatter validation, category
 * index pages, navigation and the search index all derive from this file.
 * Never duplicate the category list elsewhere.
 */

export const SITE = {
  name: 'TurkCyber',
  domain: 'turkcyber.com',
  url: 'https://turkcyber.com',
  /** Public-facing language. All visitor-visible copy is Turkish. */
  locale: 'tr-TR',
  htmlLang: 'tr',
  email: 'admin@turkcyber.com',
  tagline: 'Dijital güvenlik karmaşık olmak zorunda değil.',
  description:
    'Hesaplarınızı, cihazlarınızı ve kişisel bilgilerinizi korumak için gerçekten bilmeniz ' +
    'gerekenleri sade ve görsel rehberlerle anlatıyoruz.',
  owner: { name: 'DNDR Labs', url: 'https://dndr.net' },
  /** Operational timezone for analytics day boundaries. */
  analyticsTimeZone: 'America/Los_Angeles',
} as const;

/**
 * Contact form configuration.
 *
 * The Formspree endpoint is PUBLIC configuration, not a secret: it appears in
 * the rendered form's `action` attribute and is visible to every visitor. It
 * lives here so there is one authoritative value, and it can still be
 * overridden per environment with `PUBLIC_FORMSPREE_ENDPOINT` (useful for
 * pointing a staging build at a separate form).
 *
 * `resolveFormspreeEndpoint` validates whatever it is given against the real
 * Formspree URL shape and returns an empty string otherwise. `/iletisim/` then
 * renders the email address instead of a form — a form posting to a malformed
 * endpoint would accept messages and discard them silently, which is worse
 * than having no form.
 */
export const CONTACT_FORM = {
  /** Production endpoint. Public by nature. */
  formspreeEndpoint: 'https://formspree.io/f/mljrvker',
  /** Honeypot field name. Formspree drops a submission when this is non-empty. */
  honeypotField: '_gotcha',
} as const;

const FORMSPREE_URL_PATTERN = /^https:\/\/formspree\.io\/f\/[A-Za-z0-9]+$/;

export function resolveFormspreeEndpoint(override?: string): string {
  const candidate = (override ?? '').trim() || CONTACT_FORM.formspreeEndpoint;
  return FORMSPREE_URL_PATTERN.test(candidate) ? candidate : '';
}

/**
 * Heritage.
 *
 * turkcyber.com was registered in 2005 and ran as a cybersecurity and community
 * forum in that era, then went dormant for a long stretch before this relaunch.
 *
 * The short badge is a founding date, the way a masthead carries one. It must
 * never be presented as continuous publication — every longer form below says
 * the dormant period out loud, and no copy anywhere may claim an unbroken run.
 */
export const HERITAGE = {
  foundedYear: 2005,
  /** Compact badge for the header and the OG card. */
  badge: "2005'ten beri",
  /** One line for the footer. */
  footer:
    "turkcyber.com 2005'te kuruldu ve o dönemde bir siber güvenlik forumu olarak " +
    'yayındaydı. Uzun bir aradan sonra yeniden yayında.',
  /** Two sentences for the About page, where there is room to be precise. */
  about:
    'Bu alan adı 2005 yılında kaydedildi ve o dönemde bir siber güvenlik ve ' +
    'topluluk forumu olarak kullanıldı. Ardından uzun süre yayında olmadı; ' +
    'bugünkü TurkCyber, aynı alan adı üzerinde kurulan yeni bir yayın projesidir.',
} as const;

export type CategoryId =
  | 'hesap-guvenligi'
  | 'instagram-sosyal-medya'
  | 'dolandiricilik-phishing'
  | 'telefon-cihaz-guvenligi'
  | 'sifreler-2fa'
  | 'gizlilik'
  | 'web-tarayici-guvenligi'
  | 'guvenlik-haberleri';

export interface Category {
  id: CategoryId;
  /** Visitor-facing Turkish label. */
  name: string;
  /** Short Turkish description used on category index pages and meta tags. */
  description: string;
  /**
   * The question a visitor would actually type, in their own words. Used on
   * listing surfaces so someone can recognise their problem without first
   * learning what "phishing" or "2FA" means.
   */
  question: string;
  /** Accent role — maps to a CSS custom property, not a raw colour. */
  accent: 'green' | 'cyan';
  /**
   * `primary` categories are the six real-world problem areas most people
   * arrive with, and lead every listing surface. `secondary` categories are
   * real but narrower, and sit below.
   */
  prominence: 'primary' | 'secondary';
}

/**
 * Ordered by how often an ordinary visitor arrives with that problem, not
 * alphabetically and not by how a security professional would file it.
 * Listing surfaces render this order directly.
 */
export const CATEGORIES: readonly Category[] = [
  {
    id: 'instagram-sosyal-medya',
    name: 'Instagram & Sosyal Medya',
    description:
      'Instagram, X ve diğer platformlarda hesabınızı korumak, ele geçirilen bir hesabı ' +
      'geri almak ve sahte destek mesajlarını tanımak.',
    question: 'Instagram hesabımı nasıl korurum?',
    accent: 'cyan',
    prominence: 'primary',
  },
  {
    id: 'dolandiricilik-phishing',
    name: 'Dolandırıcılık & Phishing',
    description:
      'Sahte giriş sayfaları, sahte destek hesapları, QR kod tuzakları, doğrulama ve ' +
      'hesap kurtarma bahaneli dolandırıcılıklar.',
    question: 'Bu mesaj sahte mi?',
    accent: 'green',
    prominence: 'primary',
  },
  {
    id: 'hesap-guvenligi',
    name: 'Hesap Güvenliği',
    description:
      'Hesaplarınızın ele geçirilmesini zorlaştıran ayarlar, kurtarma seçenekleri ve ' +
      'açık oturum kontrolü.',
    question: 'Hesabımı nasıl güvene alırım?',
    accent: 'green',
    prominence: 'primary',
  },
  {
    id: 'telefon-cihaz-guvenligi',
    name: 'Telefon & Cihaz Güvenliği',
    description:
      'Kayıp veya çalınan telefon, uygulama izinleri, SIM kart güvenliği ve cihaz ' + 'şifreleme.',
    question: 'Telefonumu kaybettim, ne yapmalıyım?',
    accent: 'cyan',
    prominence: 'primary',
  },
  {
    id: 'sifreler-2fa',
    name: 'Şifreler, Passkeys & 2FA',
    description:
      'Şifre yöneticileri, passkey (geçiş anahtarı) ve iki aşamalı doğrulama ' +
      'yöntemleri arasındaki gerçek farklar.',
    question: 'Şifrelerimi nasıl yönetmeliyim?',
    accent: 'green',
    prominence: 'primary',
  },
  {
    id: 'gizlilik',
    name: 'Gizlilik',
    description:
      'Kişisel bilgilerinizin nereye gittiği, izleme, veri sızıntıları ve gizlilik ' + 'ayarları.',
    question: 'Verilerim nereye gidiyor?',
    accent: 'cyan',
    prominence: 'primary',
  },
  {
    id: 'web-tarayici-guvenligi',
    name: 'Web & Tarayıcı Güvenliği',
    description: 'Tarayıcı eklentileri, sertifikalar, adres çubuğu kontrolü ve güvenli gezinme.',
    question: 'Bu siteye güvenebilir miyim?',
    accent: 'cyan',
    prominence: 'secondary',
  },
  {
    id: 'guvenlik-haberleri',
    name: 'Güncel Güvenlik Haberleri',
    description: 'Sizi doğrudan etkileyebilecek sızıntılar, saldırılar ve platform değişiklikleri.',
    question: 'Beni etkileyen bir şey oldu mu?',
    accent: 'green',
    prominence: 'secondary',
  },
] as const;

/** The six problem areas that lead every listing surface. */
export const PRIMARY_CATEGORIES = CATEGORIES.filter((c) => c.prominence === 'primary');
export const SECONDARY_CATEGORIES = CATEGORIES.filter((c) => c.prominence === 'secondary');

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [CategoryId, ...CategoryId[]];

const CATEGORY_MAP = new Map<string, Category>(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id: string): Category | undefined {
  return CATEGORY_MAP.get(id);
}

/**
 * Public navigation. `/boss` is deliberately absent — the private console is
 * never linked, never in the sitemap and never indexed.
 */
export const NAV = [
  { href: '/rehberler/', label: 'Rehberler' },
  { href: '/efsane-mi-gercek-mi/', label: 'Efsane mi?' },
  { href: '/araclar/', label: 'Araçlar' },
  { href: '/haberler/', label: 'Haberler' },
  { href: '/konular/', label: 'Konular' },
  { href: '/hakkinda/', label: 'Hakkında' },
] as const;

export const FOOTER_LINKS = [
  { href: '/rehberler/', label: 'Rehberler' },
  { href: '/efsane-mi-gercek-mi/', label: 'Efsane mi, gerçek mi?' },
  { href: '/araclar/', label: 'Araçlar' },
  { href: '/haberler/', label: 'Haberler' },
  { href: '/hakkinda/', label: 'Hakkında' },
  { href: '/iletisim/', label: 'İletişim' },
  { href: '/gizlilik/', label: 'Gizlilik' },
] as const;

export const DIFFICULTY_LABELS = {
  baslangic: 'Başlangıç',
  orta: 'Orta',
  ileri: 'İleri',
} as const;

export type Difficulty = keyof typeof DIFFICULTY_LABELS;
