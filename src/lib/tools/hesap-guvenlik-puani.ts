/**
 * Hesap güvenlik puanı — a weakest-link finder, not a score out of a hundred.
 *
 * The name says "puan" because that is what people search for, and the tool
 * does give a verdict. What it deliberately does NOT give is a number:
 *
 *   - Nothing here measures anything. The visitor self-reports, and the list
 *     covers what is common rather than everything that matters.
 *   - A percentage averages away the thing that actually decides the outcome.
 *     Someone with a password manager, a passkey and no recovery access is
 *     one lost phone from losing everything, and any weighted average would
 *     call that "%80 güvende".
 *
 * So the result is a band derived from WHICH items are missing, plus the gaps
 * in the order they should be closed. See src/lib/tools/checklist.ts.
 */
import type { ChecklistDefinition } from './checklist';

export const HESAP_GUVENLIK_PUANI: ChecklistDefinition = {
  id: 'hesap-guvenlik-puani',
  title: 'Hesap güvenlik puanı',
  description:
    'On soruda en zayıf halkanızı bulur. Sonuç bir yüzde değil: neyi önce yapmanız ' +
    'gerektiğini söyleyen sıralı bir liste.',
  disclaimer:
    'Bu bir ölçüm değil, bir kontrol listesidir. Verdiğiniz cevaplar tarayıcınızdan çıkmaz ve ' +
    'hiçbir hesabınıza bakılmaz. Hepsini işaretlemeniz "hiçbir şey olmaz" demek değildir; ' +
    'yalnızca bilinen kolay yolların kapalı olduğu anlamına gelir.',
  groups: [
    {
      id: 'temel',
      title: 'Temel',
      items: [
        {
          id: 'sifre-yoneticisi',
          label: 'Şifrelerimi bir şifre yöneticisinde tutuyorum.',
          detail:
            'Akılda tutulabilen şifreler ya tekrarlanır ya tahmin edilebilir. Üçüncü bir ' +
            'seçenek, onları akılda tutmamaktır.',
          weight: 'critical',
          action:
            'Bir şifre yöneticisi kurun ve en az e-posta, banka ve sosyal medya hesaplarınızı ' +
            'oraya taşıyın.',
          href: '/rehberler/sifre-yoneticisi-guvenli-mi/',
          hrefLabel: 'Şifre yöneticisi güvenli mi?',
        },
        {
          id: 'benzersiz-sifreler',
          label: 'Önemli hesaplarımın hiçbirinde aynı şifreyi kullanmıyorum.',
          detail:
            'Sızıntılar toplu hâlde satılır ve otomatik olarak diğer sitelerde denenir. ' +
            'Tekrar eden tek bir şifre bütün zincirin kilidini açar.',
          weight: 'critical',
          action:
            'Aynı şifreyi paylaşan hesapları listeleyin ve en az e-posta ile bankadan ' +
            'başlayarak hepsini ayırın.',
          href: '/rehberler/guclu-sifre-yetmez/',
          hrefLabel: 'Neden güçlü şifre yetmez?',
        },
        {
          id: 'eposta-2fa',
          label: 'Ana e-posta hesabımda iki aşamalı doğrulama açık.',
          detail:
            'E-posta hesabı diğer hesapların kurtarma kapısıdır. Oraya giren, sırayla ' +
            'hepsini alabilir.',
          weight: 'critical',
          action:
            'Önce e-postanızda iki aşamalı doğrulamayı açın. Sıralamada bu her zaman ilk sıradadır.',
          href: '/rehberler/2fa-nedir-sms-authenticator-guvenlik-anahtari/',
          hrefLabel: '2FA nedir?',
        },
      ],
    },
    {
      id: 'dayaniklilik',
      title: 'Bir şey ters gittiğinde',
      items: [
        {
          id: 'kurtarma-erisimi',
          label: 'Telefonumu bugün kaybetsem hesaplarıma yine de girebilirim.',
          detail:
            'Doğrulama yöntemi tek bir cihazda toplandıysa, o cihazı kaybetmek hesabı ' +
            'kaybetmekle aynı şeydir.',
          weight: 'critical',
          action:
            'Yedek kodlarınızı çıkarın ya da ikinci bir doğrulama yöntemi ekleyin. ' +
            'Kaybetmeden önce deneyin.',
          href: '/rehberler/telefonunuz-kaybolursa-ilk-15-dakika/',
          hrefLabel: 'Telefonunuz kaybolursa ilk 15 dakika',
        },
        {
          id: 'kurtarma-guncel',
          label: 'Hesaplarımdaki kurtarma e-postası ve telefon numarası güncel.',
          detail:
            'Artık kullanılmayan bir numara başkasına tahsis edilebilir, eski bir e-posta ' +
            'adresi kapanmış olabilir.',
          weight: 'important',
          action: 'Önemli hesaplarınızın kurtarma bilgilerini gözden geçirin ve güncelleyin.',
        },
        {
          id: 'yedek',
          label: 'Telefonumdaki fotoğraf ve belgelerin bir yedeği var.',
          detail: 'Güvenlik sadece hesabı korumak değil, kaybettiğinizde geri dönebilmektir.',
          weight: 'helpful',
          action: 'Otomatik bir yedekleme açın ve yedeğin gerçekten alındığını bir kez doğrulayın.',
        },
      ],
    },
    {
      id: 'cihaz',
      title: 'Cihaz',
      items: [
        {
          id: 'ekran-kilidi',
          label: 'Telefonumda ekran kilidi var.',
          detail:
            'Kilitsiz bir telefon, SMS ile gelen doğrulama kodları dahil her şeye açık kapıdır.',
          weight: 'critical',
          action: 'Bir PIN, parola veya biyometrik kilit tanımlayın.',
        },
        {
          id: 'guncellemeler',
          label: 'Telefonumun ve tarayıcımın güncellemelerini geciktirmiyorum.',
          detail:
            'Güvenlik güncellemeleri, bilinen ve kullanımdaki açıkları kapatır. Ertelenen ' +
            'güncelleme açık bırakılmış kapıdır.',
          weight: 'important',
          action: 'Otomatik güncellemeyi açın ve bekleyen güncellemeleri bugün kurun.',
        },
      ],
    },
    {
      id: 'alışkanlık',
      title: 'Alışkanlıklar',
      items: [
        {
          id: 'kod-vermeme',
          label: 'Beni arayan hiç kimseye doğrulama kodu vermem.',
          detail:
            'Bankalar, platformlar ve kamu kurumları telefonda doğrulama kodu istemez. ' +
            'Kodu isteyen, o anda giriş yapmaya çalışıyordur.',
          weight: 'critical',
          action:
            'Kural basit: gelen aramada kod yok. Konuşmayı bitirin, kurumu kendi ' +
            'numarasından siz arayın.',
        },
        {
          id: 'link-girisi',
          label: 'E-posta veya SMS’teki bağlantılardan giriş yapmam.',
          detail:
            'Sahte giriş sayfaları gerçeğinden ayırt edilemeyecek kadar iyi olabilir; ' +
            'sayfaya bakarak karar vermek güvenilir bir yöntem değildir.',
          weight: 'important',
          action: 'Girişi her zaman kendi yazdığınız adresten veya uygulamadan başlatın.',
          href: '/rehberler/sahte-giris-sayfasi-nasil-anlasilir/',
          hrefLabel: 'Sahte giriş sayfası nasıl anlaşılır?',
        },
      ],
    },
  ],
};
