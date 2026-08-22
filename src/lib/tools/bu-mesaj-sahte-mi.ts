/**
 * "Bu mesaj sahte mi?" — the first interactive tool.
 *
 * Six messages of the kind people actually receive. Every scenario is written
 * for this quiz: no real message is reproduced, no real company is named as the
 * sender of a fraudulent message, and no claim is made about any platform's
 * actual behaviour beyond what the guides already document.
 *
 * The scenarios that are legitimate matter as much as the fraudulent ones — a
 * quiz where the answer is always "sahte" teaches suspicion rather than
 * judgement.
 */
import type { ToolDefinition } from './types';

export const BU_MESAJ_SAHTE_MI: ToolDefinition = {
  id: 'bu-mesaj-sahte-mi',
  title: 'Bu mesaj sahte mi?',
  description:
    'Altı mesaj göstereceğiz. Her biri için tek soru: buna güvenir miydiniz? ' +
    'Cevaplarınız tarayıcınızdan çıkmaz.',

  questions: [
    {
      id: 'q1',
      prompt: 'Bu mesaj size gelse ne yapardınız?',
      scenario:
        'Instagram Destek\n\n' +
        'Hesabınız telif hakkı ihlali nedeniyle 24 saat içinde kalıcı olarak ' +
        'kapatılacaktır. İtiraz etmek için aşağıdaki bağlantıdan giriş yapın.\n\n' +
        'instagram-itiraz-formu.com/giris',
      options: [
        { id: 'a', label: 'Bağlantıya tıklayıp itiraz ederdim', score: 0 },
        {
          id: 'b',
          label: 'Uygulamayı kendim açar, bildirim var mı diye bakardım',
          score: 2,
          correct: true,
        },
        { id: 'c', label: 'Mesajı yanıtlayıp bilgi isterdim', score: 0 },
      ],
      explanation:
        'Bu bir oltalama mesajı. İki işaret var: aciliyet baskısı ("24 saat") ve ' +
        'adres. Alan adı instagram.com değil, instagram-itiraz-formu.com. Gerçek bir ' +
        'uyarı varsa uygulamanın kendi içinde de görünür — bağlantıya tıklamak yerine ' +
        'uygulamayı açmak bu saldırıyı tamamen etkisiz kılar.',
    },
    {
      id: 'q2',
      prompt: 'Yakın bir arkadaşınızdan bu mesaj geldi. Ne yapardınız?',
      scenario:
        'Selam, yanlışlıkla senin numarana bir doğrulama kodu gönderdim. ' +
        'Bana iletebilir misin? Acil lazım.',
      options: [
        { id: 'a', label: 'Arkadaşım olduğu için kodu iletirdim', score: 0 },
        { id: 'b', label: 'Önce yazışmadan kodu doğrulardım', score: 0 },
        {
          id: 'c',
          label: 'Kodu iletmez, arkadaşımı başka bir kanaldan arardım',
          score: 2,
          correct: true,
        },
      ],
      explanation:
        'Klasik bir kalıp. Arkadaşınızın hesabı çoktan ele geçirilmiş olabilir ve ' +
        'mesajı yazan o değildir. Gelen kod büyük ihtimalle sizin hesabınızı ele ' +
        'geçirmek için istenmiştir. Doğrulama kodu hiç kimseyle paylaşılmaz — ' +
        'arkadaşınızla da. Onu telefonla arayarak durumu doğrulayın.',
    },
    {
      id: 'q3',
      prompt: 'Bu e-posta hakkında ne düşünürsünüz?',
      scenario:
        'Kargo Takip\n\n' +
        'Paketiniz adres bilgisi eksik olduğu için teslim edilemedi. ' +
        'Gümrük ücreti olarak 27,90 TL ödeme yapmanız gerekiyor.\n\n' +
        'Ödeme için: kargo-odeme-tr.info',
      options: [
        {
          id: 'a',
          label: 'Küçük bir tutar, öderdim',
          score: 0,
        },
        {
          id: 'b',
          label: 'Kargo firmasının kendi uygulamasından takip numarasını kontrol ederdim',
          score: 2,
          correct: true,
        },
        { id: 'c', label: 'Beklediğim bir kargo varsa öderdim', score: 0 },
      ],
      explanation:
        'Tutarın küçük olması kasıtlıdır — düşünmeden ödemenizi kolaylaştırır. ' +
        'Amaç 27,90 TL değil, kart bilgilerinizdir. Beklediğiniz bir kargo olması ' +
        'da bir kanıt değil; bu mesajlar toplu gönderilir ve bir kısmı doğal olarak ' +
        'gerçekten kargo bekleyen kişilere denk gelir.',
    },
    {
      id: 'q4',
      prompt: 'Bu bildirim hakkında ne düşünürsünüz?',
      scenario:
        'Hesabınıza yeni bir cihazdan giriş yapıldı.\n\n' +
        'Cihaz: Windows · Tarayıcı: Chrome\n' +
        'Konum: Ankara\n\n' +
        'Bu siz değilseniz hesabınızı güvene alın.\n\n' +
        '(Bu bildirimi uygulamanın kendi bildirimler ekranında gördünüz.)',
      options: [
        {
          id: 'a',
          label: 'Uygulamadan geldiği için güvenilir; oturumları kontrol ederim',
          score: 2,
          correct: true,
        },
        { id: 'b', label: 'Bu da sahtedir, yok sayarım', score: 0 },
        { id: 'c', label: 'Hemen tüm hesaplarımın şifresini değiştiririm', score: 1 },
      ],
      explanation:
        'Bu mesaj gerçek olabilir — ve önemli olan nereden geldiği. Uygulamanın ' +
        'kendi bildirim ekranında gördüyseniz, bir bağlantıya tıklamanız gerekmez; ' +
        'zaten uygulamadasınız. Yapılacak şey oturum listesini açıp tanımadığınız ' +
        'cihaz var mı diye bakmak. Her uyarıyı sahte saymak da bir hatadır: gerçek ' +
        'uyarıları kaçırmanıza yol açar.',
    },
    {
      id: 'q5',
      prompt: 'Bu mesaja nasıl yaklaşırdınız?',
      scenario:
        'Merhaba! Markanız için iş birliği teklifimiz var. ' +
        'Detaylı sözleşmeyi görmek için hesabınızla giriş yapmanız yeterli:\n\n' +
        'marka-isbirligi.co/partner',
      options: [
        { id: 'a', label: 'Teklifi görmek için giriş yapardım', score: 0 },
        {
          id: 'b',
          label: 'Hesabımla giriş gerektirmesi tuhaf, girmezdim',
          score: 2,
          correct: true,
        },
        { id: 'c', label: 'Önce profillerine bakar, gerçekse giriş yapardım', score: 0 },
      ],
      explanation:
        'Anahtar soru şu: bir sözleşmeyi okumak için neden sosyal medya hesabınızla ' +
        'giriş yapmanız gereksin? Gerçek bir iş birliği teklifi sizden hesap girişi ' +
        'istemez. Profilin inandırıcı görünmesi bir kanıt değildir — sahte profiller ' +
        'tam da inandırıcı görünmek için hazırlanır.',
    },
    {
      id: 'q6',
      prompt: 'Şifre sıfırlama e-postası aldınız ama siz talep etmediniz. Ne yapardınız?',
      scenario:
        'Şifre sıfırlama talebiniz alındı.\n\n' +
        'Şifrenizi sıfırlamak için bağlantıya tıklayın. ' +
        'Bu talebi siz yapmadıysanız bu e-postayı yok sayabilirsiniz.',
      options: [
        {
          id: 'a',
          label: 'Yok sayar, ama hesabımın güvenlik ayarlarını kendim kontrol ederim',
          score: 2,
          correct: true,
        },
        { id: 'b', label: 'Bağlantıya tıklayıp ne olduğunu görürüm', score: 0 },
        { id: 'c', label: 'Hiçbir şey yapmam, yok sayarım', score: 1 },
      ],
      explanation:
        'İki ihtimal var: ya birisi sizin hesabınızın şifresini sıfırlamaya çalışıyor, ' +
        'ya da e-postanın kendisi sahte. Her iki durumda da bağlantıya tıklamak ' +
        'gerekmez. Doğru hamle, siteye kendiniz giderek şifrenizi ve iki aşamalı ' +
        'doğrulamanızı kontrol etmek. Tamamen yok saymak da riskli: birileri ' +
        'hesabınızı deniyor olabilir.',
    },
  ],

  bands: [
    {
      minPercent: 85,
      title: 'Bu tuzakları tanıyorsunuz',
      message:
        'Aciliyet baskısını, adres uyumsuzluğunu ve kod isteme kalıbını fark ediyorsunuz. ' +
        'Bir adım daha: hesaplarınızda passkey veya authenticator kullanmıyorsanız, ' +
        'dikkatinizin yetmediği durumlar için de bir güvenlik ağı kurmuş olursunuz.',
      accent: 'green',
    },
    {
      minPercent: 50,
      title: 'Temeli biliyorsunuz, birkaç boşluk var',
      message:
        'Bazı kalıpları yakaladınız, bazılarını kaçırdınız. Yukarıdaki açıklamaları ' +
        'okuyun; özellikle "bağlantıya tıklamak yerine uygulamayı kendim açarım" ' +
        'alışkanlığı, bu mesajların çoğunu tek başına etkisiz kılar.',
      accent: 'amber',
    },
    {
      minPercent: 0,
      title: 'Bu mesajlar tam da işe yaradıkları için yaygın',
      message:
        'Kötü hissetmeyin — bu mesajlar milyonlarca kişiye gönderiliyor çünkü ' +
        'çalışıyorlar. İki alışkanlık farkın çoğunu kapatır: bağlantıya tıklamak ' +
        'yerine uygulamayı kendiniz açın, ve doğrulama kodunu hiç kimseyle ' +
        'paylaşmayın. Rehberlerimiz bunları adım adım anlatıyor.',
      accent: 'red',
    },
  ],
};
