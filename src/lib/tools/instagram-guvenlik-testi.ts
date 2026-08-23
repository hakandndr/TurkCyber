/**
 * Instagram güvenlik testi — a self-check, not an audit.
 *
 * Nothing here reads the visitor's account, and nothing asks for a
 * credential: the visitor opens their own settings, sees what is on, and
 * ticks it. That is the only honest way to do this without asking someone to
 * hand an unfamiliar page access to their account.
 *
 * MENU LABELS ARE DELIBERATELY ABSENT. Instagram's settings tree is renamed
 * often and differs between platforms and app versions; a checklist that says
 * "Ayarlar → Hesap Merkezi → Şifre ve güvenlik" is wrong for some readers the
 * day it ships and wrong for everyone eventually. Each item names the CAPABILITY
 * instead, which is stable, and the linked guide carries the walkthrough with a
 * visible `uiVerifiedAt` date.
 */
import type { ChecklistDefinition } from './checklist';

export const INSTAGRAM_GUVENLIK_TESTI: ChecklistDefinition = {
  id: 'instagram-guvenlik-testi',
  title: 'Instagram güvenlik testi',
  description:
    'Instagram hesabınızın ayarlarını yanınıza alıp tek tek işaretleyin. ' +
    'Eksik kalanlar, önem sırasına göre bir yapılacaklar listesine dönüşür.',
  disclaimer:
    'Bu liste en sık karşılaşılan eksikleri kapsar; bir hesabın güvende olduğunu kanıtlamaz. ' +
    'Hepsini işaretlemeniz hesabınızın ele geçirilemeyeceği anlamına gelmez — yalnızca ' +
    'bilinen kolay yolların kapalı olduğu anlamına gelir.',
  groups: [
    {
      id: 'giris',
      title: 'Girişi zorlaştıran ayarlar',
      items: [
        {
          id: 'iki-asamali',
          label: 'İki aşamalı doğrulama açık.',
          detail:
            'Şifreniz başkasının eline geçtiğinde tek başına yetmemesini sağlayan ayar. ' +
            'Instagram bunu güvenlik ayarları arasında sunar.',
          weight: 'critical',
          action:
            'İki aşamalı doğrulamayı açın. Seçenek varsa SMS yerine bir doğrulama uygulaması ' +
            'ya da güvenlik anahtarı seçin.',
          href: '/rehberler/2fa-nedir-sms-authenticator-guvenlik-anahtari/',
          hrefLabel: 'Hangi 2FA yöntemi?',
        },
        {
          id: 'benzersiz-sifre',
          label: 'Instagram şifrem başka hiçbir yerde kullanılmıyor.',
          detail:
            'Aynı şifreyi birden fazla yerde kullanmak, o yerlerden birinin sızmasını ' +
            'doğrudan Instagram hesabınızın sorunu hâline getirir.',
          weight: 'critical',
          action:
            'Instagram şifresini yalnızca Instagram için kullanılan yeni bir şifreyle ' +
            'değiştirin ve bir şifre yöneticisinde saklayın.',
          href: '/rehberler/guclu-sifre-yetmez/',
          hrefLabel: 'Neden güçlü şifre yetmez?',
        },
        {
          id: 'yedek-kodlar',
          label: 'Yedek kodlarımı aldım ve telefonumun dışında bir yerde saklıyorum.',
          detail:
            'Telefonunuzu kaybettiğinizde hesabınıza girmenin kalan tek yolu genellikle ' +
            'bu kodlar olur.',
          weight: 'important',
          action:
            'Yedek kodları alın; kâğıda yazıp saklayın ya da şifre yöneticinizin not alanına ' +
            'koyun. Kodları yalnızca telefonunuzda tutmayın.',
        },
        {
          id: 'kurtarma-eposta',
          label: 'Hesaba bağlı e-posta adresine hâlâ erişebiliyorum.',
          detail:
            'Yıllar önce açılmış, artık girilmeyen bir e-posta adresi hesabınızın en zayıf ' +
            'halkası olabilir.',
          weight: 'important',
          action:
            'Bağlı e-posta adresini kontrol edin, erişemiyorsanız güncelleyin. O e-posta ' +
            'hesabının kendisinde de iki aşamalı doğrulamayı açın.',
        },
      ],
    },
    {
      id: 'erisim',
      title: 'Hesaba kimler erişiyor',
      items: [
        {
          id: 'oturumlar',
          label: 'Açık oturumları son bir yıl içinde gözden geçirdim.',
          detail: 'Tanımadığınız bir cihaz veya konum görünüyorsa hesabınız hâlâ açık olabilir.',
          weight: 'important',
          action:
            'Giriş yapılmış cihazlar listesini açın, tanımadığınız oturumları kapatın ve ' +
            'ardından şifrenizi değiştirin.',
        },
        {
          id: 'baglı-uygulamalar',
          label: 'Hesabıma bağlı üçüncü taraf uygulamaları gözden geçirdim.',
          detail:
            'Yıllar önce "takipçi analizi" için izin verilmiş bir uygulama, izni geri ' +
            'alınmadığı sürece erişmeye devam eder.',
          weight: 'helpful',
          action: 'Tanımadığınız veya artık kullanmadığınız uygulamaların erişimini kaldırın.',
        },
        {
          id: 'giris-uyarilari',
          label: 'Yeni giriş bildirimleri açık.',
          detail: 'Bir giriş olduğunda haberdar olmanız, geç kalmamanızın en basit yolu.',
          weight: 'helpful',
          action: 'Giriş uyarılarını açın ve bildirimlerin ulaştığı adresi kontrol edin.',
        },
      ],
    },
    {
      id: 'tuzaklar',
      title: 'Dolandırıcılığa karşı alışkanlıklar',
      items: [
        {
          id: 'dm-link',
          label: 'DM ile gelen giriş bağlantılarına şifremi girmiyorum.',
          detail:
            'Ele geçirilen hesaplar en çok, tanıdık birinden gelmiş gibi görünen bir ' +
            'bağlantıya şifre girilerek kaybedilir.',
          weight: 'critical',
          action:
            'Bir bağlantıya asla şifre girmeyin. Girişi her zaman uygulamanın kendisinden ' +
            'başlatın.',
          href: '/rehberler/sahte-giris-sayfasi-nasil-anlasilir/',
          hrefLabel: 'Sahte giriş sayfası nasıl anlaşılır?',
        },
        {
          id: 'kod-paylasimi',
          label: 'Doğrulama kodumu kimseyle paylaşmıyorum — "destek" diyenler dahil.',
          detail:
            'Instagram destek ekibi doğrulama kodunuzu istemez. Kodu isteyen herkes, o an ' +
            'sizin hesabınıza girmeye çalışıyordur.',
          weight: 'critical',
          action:
            'Kodu kimseye vermeyin. Biri istediyse hesabınıza giriş denemesi yapılıyor ' +
            'demektir; şifrenizi hemen değiştirin.',
        },
        {
          id: 'mavi-tik-mesaji',
          label: '"Hesabınız kapatılacak" türü aciliyet mesajlarına hemen tepki vermiyorum.',
          detail:
            'Aciliyet, dolandırıcılığın en güvenilir işaretidir: düşünmenizi engellemek için ' +
            'oradadır.',
          weight: 'helpful',
          action:
            'Böyle bir mesaj aldığınızda bağlantıya dokunmadan uygulamayı kendiniz açın ve ' +
            'bildirimlerinizde gerçekten bir uyarı var mı bakın.',
        },
      ],
    },
  ],
};
