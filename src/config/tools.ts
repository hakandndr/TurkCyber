/**
 * The interactive tools, defined once.
 *
 * This list used to live inline in `/araclar/index.astro`, which meant the
 * tools existed for a visitor browsing that page and nowhere else: not in the
 * sitemap, not in search. Someone searching "instagram testi" could not find
 * the Instagram tool. Defining them here lets the index page, the sitemap and
 * the search index all derive from the same entries.
 *
 * A `planned` tool is listed as planned and is deliberately excluded from the
 * sitemap and from search — announcing a page that does not exist is worse
 * than not announcing it.
 */
import type { CategoryId } from './site';

export interface ToolListing {
  id: string;
  title: string;
  /** One sentence describing what the visitor gets out of it. */
  description: string;
  status: 'ready' | 'planned';
  /** Set for `ready` tools. */
  href?: string;
  /** Which problem area it belongs to, for search and cross-linking. */
  category?: CategoryId;
  tags?: string[];
}

export const TOOLS: readonly ToolListing[] = [
  {
    id: 'bu-mesaj-sahte-mi',
    title: 'Bu mesaj sahte mi?',
    description:
      'Altı gerçekçi mesaj gösterip her biri için ne yapardınız diye soruyoruz. ' +
      'Sonunda hangi işaretleri kaçırdığınızı görüyorsunuz.',
    status: 'ready',
    href: '/araclar/bu-mesaj-sahte-mi/',
    category: 'dolandiricilik-phishing',
    tags: ['phishing', 'sahte mesaj', 'sms', 'dolandırıcılık', 'test'],
  },
  {
    id: 'instagram-guvenlik-testi',
    title: 'Instagram güvenlik testi',
    description:
      'Instagram hesabınızın ayarlarını adım adım gözden geçiren bir kontrol listesi. ' +
      'Şifrenizi sormaz; sadece hangi ayarların açık olduğunu siz işaretlersiniz.',
    status: 'ready',
    href: '/araclar/instagram-guvenlik-testi/',
    category: 'instagram-sosyal-medya',
    tags: ['instagram', 'sosyal medya', 'hesap güvenliği', 'kontrol listesi'],
  },
  {
    id: 'hesap-guvenlik-puani',
    title: 'Hesap güvenlik puanı',
    description:
      'Birkaç soruyla en zayıf halkanızı bulan kısa bir değerlendirme. ' +
      'Sonuç bir yüzde değil, sırayla ne yapmanız gerektiğini söyleyen bir liste.',
    status: 'ready',
    href: '/araclar/hesap-guvenlik-puani/',
    category: 'hesap-guvenligi',
    tags: ['hesap güvenliği', 'şifre', '2fa', 'değerlendirme'],
  },
] as const;

export const READY_TOOLS = TOOLS.filter((tool) => tool.status === 'ready');
