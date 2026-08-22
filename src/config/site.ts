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

export type CategoryId =
  | 'hesap-guvenligi'
  | 'sifreler-passkeys'
  | 'iki-faktorlu-dogrulama'
  | 'sosyal-medya'
  | 'dolandiricilik-phishing'
  | 'web-tarayici-guvenligi'
  | 'telefon-cihaz-guvenligi'
  | 'gizlilik'
  | 'guvenlik-haberleri';

export interface Category {
  id: CategoryId;
  /** Visitor-facing Turkish label. */
  name: string;
  /** Short Turkish description used on category index pages and meta tags. */
  description: string;
  /** Accent role — maps to a CSS custom property, not a raw colour. */
  accent: 'green' | 'cyan';
}

export const CATEGORIES: readonly Category[] = [
  {
    id: 'hesap-guvenligi',
    name: 'Hesap Güvenliği',
    description:
      'Hesaplarınızın ele geçirilmesini zorlaştıran ayarlar, kurtarma seçenekleri ve oturum kontrolü.',
    accent: 'green',
  },
  {
    id: 'sifreler-passkeys',
    name: 'Şifreler & Passkeys',
    description:
      'Şifre yöneticileri, güçlü şifre alışkanlıkları ve passkey (geçiş anahtarı) kullanımı.',
    accent: 'green',
  },
  {
    id: 'iki-faktorlu-dogrulama',
    name: '2FA & Kimlik Doğrulama',
    description:
      'SMS, authenticator uygulamaları ve donanım güvenlik anahtarları arasındaki gerçek farklar.',
    accent: 'cyan',
  },
  {
    id: 'sosyal-medya',
    name: 'Sosyal Medya',
    description: 'Instagram, X ve diğer platformlarda hesap güvenliği ve gizlilik ayarları.',
    accent: 'cyan',
  },
  {
    id: 'dolandiricilik-phishing',
    name: 'Dolandırıcılık & Phishing',
    description:
      'Sahte giriş sayfaları, QR kod tuzakları, sahte destek hesapları ve oltalama yöntemleri.',
    accent: 'green',
  },
  {
    id: 'web-tarayici-guvenligi',
    name: 'Web & Tarayıcı Güvenliği',
    description: 'Tarayıcı eklentileri, sertifikalar, adres çubuğu kontrolü ve güvenli gezinme.',
    accent: 'cyan',
  },
  {
    id: 'telefon-cihaz-guvenligi',
    name: 'Telefon & Cihaz Güvenliği',
    description: 'Uygulama izinleri, kayıp cihaz senaryoları, SIM swap ve cihaz şifreleme.',
    accent: 'green',
  },
  {
    id: 'gizlilik',
    name: 'Gizlilik',
    description: 'Veri paylaşımı, izleme, kişisel bilgilerin sızması ve gizlilik ayarları.',
    accent: 'cyan',
  },
  {
    id: 'guvenlik-haberleri',
    name: 'Güncel Güvenlik Haberleri',
    description: 'Sizi doğrudan etkileyebilecek sızıntılar, saldırılar ve platform değişiklikleri.',
    accent: 'green',
  },
] as const;

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
  { href: '/haberler/', label: 'Haberler' },
  { href: '/konular/', label: 'Konular' },
  { href: '/hakkinda/', label: 'Hakkında' },
] as const;

export const FOOTER_LINKS = [
  { href: '/rehberler/', label: 'Rehberler' },
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
