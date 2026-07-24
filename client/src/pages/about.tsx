import { useLocation } from "wouter";
import { useT, LOCALES, type Locale } from "@/lib/i18n";
import { useSeo } from "@/hooks/useSeo";

// RANKUE 소개(About) — 공개·다국어 페이지. SEO/AEO/GEO 대상 마케팅 콘텐츠.
// 번역은 이 파일 안에 로케일별로 co-locate (전역 사전 비대화 방지).

interface Feature { name: string; desc: string; }
interface Faq { q: string; a: string; }
interface AboutContent {
  metaTitle: string;
  metaDesc: string;
  h1: string;
  tagline: string;
  intro: string;
  whatTitle: string;
  whatBody: string;
  featuresTitle: string;
  features: Feature[];
  rpTitle: string;
  rpBody: string;
  howTitle: string;
  how: string[];
  faqTitle: string;
  faq: Faq[];
  ctaTitle: string;
  ctaBody: string;
  langLabel: string;
  home: string;
  support: string;
  privacy: string;
}

const CONTENT: Record<Locale, AboutContent> = {
  ko: {
    metaTitle: "랭큐(RANKUE) 소개 · 당구 실력 랭킹·매칭 앱",
    metaDesc: "랭큐는 당구 실력을 RP 레이팅으로 측정하고 경기를 자동 기록하는 당구 랭킹·매칭 앱입니다. 3쿠션·4구 실력 관리, 라이벌·크루 매칭, 매장·전국 랭킹.",
    h1: "랭큐(RANKUE)란?",
    tagline: "당구를 제대로 즐기는 법",
    intro: "랭큐는 당구 실력을 객관적인 RP 레이팅으로 측정하고, 실력이 맞는 상대와 겨루고, 경기를 자동으로 기록하는 당구 랭킹·매칭 앱입니다. iOS·Android에서 무료로 이용할 수 있습니다.",
    whatTitle: "무엇을 할 수 있나요",
    whatBody: "애매한 자칭 다마(핸디) 대신, 실제 경기 결과로 오르내리는 RP 점수로 내 실력을 정확히 확인하세요. 3쿠션과 4구를 각각 관리하고, 비슷한 실력의 라이벌·크루를 찾고, 매장과 전국 랭킹에 도전할 수 있습니다.",
    featuresTitle: "핵심 기능",
    features: [
      { name: "RP 레이팅", desc: "승패 결과로 오르내리는 객관적 당구 실력 점수. 3쿠션·4구 각각 산정." },
      { name: "매칭 대결", desc: "실력이 맞는 상대와 1:1 랭킹전. 핀(PIN) 코드로 상대가 같은 경기에 입장." },
      { name: "경기 기록", desc: "이닝·하이런·평균·RP 변화까지 공식 경기를 자동 기록." },
      { name: "크루", desc: "당구 동호회를 만들고 가입해 활동·사진·채팅으로 함께 즐기기." },
      { name: "시뮬레이터", desc: "화면 위 가상 당구대에서 혼자 3구·4구 연습." },
      { name: "랭킹", desc: "매장별·전국 3쿠션·4구 실시간 랭킹." },
    ],
    rpTitle: "RP 레이팅이란?",
    rpBody: "RP(Rating Point)는 경기 승패에 따라 오르내리는 당구 실력 점수입니다. 3쿠션과 4구가 별도로 산정되며, 실력이 비슷한 상대를 매칭하고 랭킹을 매기는 기준이 됩니다.",
    howTitle: "이렇게 시작하세요",
    how: [
      "앱을 설치하고 휴대폰 번호 또는 소셜 계정으로 입장",
      "매칭 대결·핀 참여로 경기를 시작",
      "경기가 끝나면 RP·기록이 자동 반영",
      "라이벌·크루와 함께 랭킹에 도전",
    ],
    faqTitle: "자주 묻는 질문",
    faq: [
      { q: "랭큐는 무료인가요?", a: "네, 무료로 이용할 수 있으며 iOS와 Android에서 모두 사용할 수 있습니다." },
      { q: "어떤 종목을 지원하나요?", a: "3쿠션과 4구(사구) 캐롬 당구를 지원합니다." },
      { q: "어떤 언어를 지원하나요?", a: "한국어, 영어, 베트남어, 터키어, 스페인어를 지원합니다." },
      { q: "계정을 삭제할 수 있나요?", a: "네, 앱의 전체 메뉴 → 계정 삭제에서 직접 영구 삭제할 수 있습니다." },
    ],
    ctaTitle: "지금 시작하세요",
    ctaBody: "당구를 제대로 즐기는 법, 랭큐에서.",
    langLabel: "언어",
    home: "홈으로",
    support: "고객지원",
    privacy: "개인정보처리방침",
  },
  en: {
    metaTitle: "About RANKUE · Billiards Skill Ranking & Matchmaking App",
    metaDesc: "RANKUE measures your billiards skill as an RP rating and auto-records your matches. Manage 3-cushion & 4-ball skill, match with rivals and crews, climb store and national rankings.",
    h1: "What is RANKUE?",
    tagline: "The right way to enjoy billiards",
    intro: "RANKUE is a billiards ranking and matchmaking app that measures your skill as an objective RP rating, matches you with opponents of similar level, and records your matches automatically. Free on iOS and Android.",
    whatTitle: "What you can do",
    whatBody: "Instead of vague self-reported handicaps, see your true level through an RP score that rises and falls with real results. Track 3-cushion and 4-ball separately, find skill-matched rivals and crews, and challenge store and national rankings.",
    featuresTitle: "Key features",
    features: [
      { name: "RP rating", desc: "An objective billiards skill score that moves with win/loss results — separate for 3-cushion and 4-ball." },
      { name: "Skill matchmaking", desc: "1:1 ranked matches against similar-level players. A PIN code lets your opponent join the same game." },
      { name: "Match records", desc: "Every official match is auto-recorded — innings, high run, average, and RP changes." },
      { name: "Crews", desc: "Create or join billiards clubs and share activities, photos, and chat." },
      { name: "Simulator", desc: "Practice 3-ball / 4-ball solo on an on-screen virtual table." },
      { name: "Rankings", desc: "Real-time store and nationwide leaderboards for 3-cushion and 4-ball." },
    ],
    rpTitle: "What is RP rating?",
    rpBody: "RP (Rating Point) is a billiards skill score that rises and falls with match results. It is calculated separately for 3-cushion and 4-ball and is the basis for matchmaking and rankings.",
    howTitle: "Getting started",
    how: [
      "Install the app and enter with your phone number or a social account",
      "Start a game via skill matchmaking or PIN entry",
      "When the match ends, RP and records update automatically",
      "Challenge the rankings with rivals and crews",
    ],
    faqTitle: "Frequently asked questions",
    faq: [
      { q: "Is RANKUE free?", a: "Yes, it is free to use and available on both iOS and Android." },
      { q: "Which disciplines are supported?", a: "3-cushion and 4-ball (carom) billiards." },
      { q: "Which languages are supported?", a: "Korean, English, Vietnamese, Turkish, and Spanish." },
      { q: "Can I delete my account?", a: "Yes, you can permanently delete it in-app via All menu → Delete Account." },
    ],
    ctaTitle: "Get started now",
    ctaBody: "The right way to enjoy billiards — with RANKUE.",
    langLabel: "Language",
    home: "Home",
    support: "Support",
    privacy: "Privacy Policy",
  },
  vi: {
    metaTitle: "Giới thiệu RANKUE · Ứng dụng xếp hạng & ghép trận bi-a",
    metaDesc: "RANKUE đo trình độ bi-a của bạn bằng điểm RP và tự động ghi lại các trận đấu. Quản lý trình độ 3 băng & 4 bi, ghép đối thủ và crew, leo bảng xếp hạng.",
    h1: "RANKUE là gì?",
    tagline: "Cách tận hưởng bi-a đúng nghĩa",
    intro: "RANKUE là ứng dụng xếp hạng và ghép trận bi-a, đo trình độ của bạn bằng điểm RP khách quan, ghép bạn với đối thủ cùng trình độ và tự động ghi lại trận đấu. Miễn phí trên iOS và Android.",
    whatTitle: "Bạn có thể làm gì",
    whatBody: "Thay vì tự nhận trình độ mơ hồ, hãy thấy trình độ thật của bạn qua điểm RP thay đổi theo kết quả thực tế. Quản lý 3 băng và 4 bi riêng biệt, tìm đối thủ và crew cùng trình độ, chinh phục bảng xếp hạng.",
    featuresTitle: "Tính năng chính",
    features: [
      { name: "Điểm RP", desc: "Điểm trình độ khách quan thay đổi theo thắng/thua — riêng cho 3 băng và 4 bi." },
      { name: "Ghép trận theo trình độ", desc: "Trận xếp hạng 1:1 với người cùng trình độ. Mã PIN giúp đối thủ vào cùng trận." },
      { name: "Ghi lại trận đấu", desc: "Mọi trận chính thức được ghi tự động — lượt cơ, run cao nhất, trung bình, thay đổi RP." },
      { name: "Crew", desc: "Tạo hoặc tham gia câu lạc bộ bi-a, chia sẻ hoạt động, ảnh và trò chuyện." },
      { name: "Trình mô phỏng", desc: "Luyện 3 bi / 4 bi một mình trên bàn bi-a ảo." },
      { name: "Bảng xếp hạng", desc: "Bảng xếp hạng thời gian thực theo cửa hàng và toàn quốc cho 3 băng và 4 bi." },
    ],
    rpTitle: "Điểm RP là gì?",
    rpBody: "RP (Rating Point) là điểm trình độ bi-a thay đổi theo kết quả trận đấu. Được tính riêng cho 3 băng và 4 bi, là cơ sở cho việc ghép trận và xếp hạng.",
    howTitle: "Bắt đầu như thế nào",
    how: [
      "Cài ứng dụng và đăng nhập bằng số điện thoại hoặc tài khoản mạng xã hội",
      "Bắt đầu trận qua ghép trình độ hoặc nhập PIN",
      "Khi trận kết thúc, RP và lịch sử cập nhật tự động",
      "Chinh phục bảng xếp hạng cùng đối thủ và crew",
    ],
    faqTitle: "Câu hỏi thường gặp",
    faq: [
      { q: "RANKUE có miễn phí không?", a: "Có, miễn phí và có trên cả iOS lẫn Android." },
      { q: "Hỗ trợ những thể loại nào?", a: "Bi-a carom 3 băng và 4 bi." },
      { q: "Hỗ trợ những ngôn ngữ nào?", a: "Tiếng Hàn, Anh, Việt, Thổ Nhĩ Kỳ và Tây Ban Nha." },
      { q: "Tôi có thể xóa tài khoản không?", a: "Có, bạn có thể xóa vĩnh viễn trong ứng dụng qua Menu → Xóa tài khoản." },
    ],
    ctaTitle: "Bắt đầu ngay",
    ctaBody: "Cách tận hưởng bi-a đúng nghĩa — cùng RANKUE.",
    langLabel: "Ngôn ngữ",
    home: "Trang chủ",
    support: "Hỗ trợ",
    privacy: "Chính sách bảo mật",
  },
  tr: {
    metaTitle: "RANKUE Hakkında · Bilardo Sıralama ve Eşleştirme Uygulaması",
    metaDesc: "RANKUE bilardo seviyenizi RP puanı olarak ölçer ve maçlarınızı otomatik kaydeder. 3 bant ve 4 top seviyesini yönetin, rakip ve ekip eşleştirin, sıralamada yükselin.",
    h1: "RANKUE nedir?",
    tagline: "Bilardonun tadını doğru çıkarmanın yolu",
    intro: "RANKUE, seviyenizi nesnel bir RP puanıyla ölçen, sizi benzer seviyedeki rakiplerle eşleştiren ve maçlarınızı otomatik kaydeden bir bilardo sıralama ve eşleştirme uygulamasıdır. iOS ve Android'de ücretsiz.",
    whatTitle: "Neler yapabilirsiniz",
    whatBody: "Belirsiz beyanlar yerine, gerçek sonuçlarla değişen bir RP puanıyla gerçek seviyenizi görün. 3 bant ve 4 topu ayrı ayrı takip edin, seviyenize uygun rakip ve ekipler bulun, sıralamalara meydan okuyun.",
    featuresTitle: "Öne çıkan özellikler",
    features: [
      { name: "RP puanı", desc: "Galibiyet/mağlubiyetle değişen nesnel bilardo seviye puanı — 3 bant ve 4 top için ayrı." },
      { name: "Seviye eşleştirme", desc: "Benzer seviyeli oyuncularla 1:1 dereceli maç. PIN kodu ile rakip aynı maça katılır." },
      { name: "Maç kayıtları", desc: "Her resmi maç otomatik kaydedilir — vuruş, en yüksek seri, ortalama ve RP değişimi." },
      { name: "Ekipler", desc: "Bilardo kulüpleri kurun veya katılın; etkinlik, fotoğraf ve sohbet paylaşın." },
      { name: "Simülatör", desc: "Ekrandaki sanal masada tek başınıza 3 top / 4 top çalışın." },
      { name: "Sıralamalar", desc: "3 bant ve 4 top için salon ve ülke geneli gerçek zamanlı sıralamalar." },
    ],
    rpTitle: "RP puanı nedir?",
    rpBody: "RP (Rating Point), maç sonuçlarıyla değişen bir bilardo seviye puanıdır. 3 bant ve 4 top için ayrı hesaplanır ve eşleştirme ile sıralamanın temelidir.",
    howTitle: "Nasıl başlanır",
    how: [
      "Uygulamayı yükleyin ve telefon numarası veya sosyal hesapla giriş yapın",
      "Seviye eşleştirme veya PIN ile maça başlayın",
      "Maç bitince RP ve kayıtlar otomatik güncellenir",
      "Rakip ve ekiplerle sıralamalara meydan okuyun",
    ],
    faqTitle: "Sık sorulan sorular",
    faq: [
      { q: "RANKUE ücretsiz mi?", a: "Evet, ücretsizdir ve hem iOS hem Android'de mevcuttur." },
      { q: "Hangi disiplinler destekleniyor?", a: "3 bant ve 4 top (karambol) bilardo." },
      { q: "Hangi diller destekleniyor?", a: "Korece, İngilizce, Vietnamca, Türkçe ve İspanyolca." },
      { q: "Hesabımı silebilir miyim?", a: "Evet, Menü → Hesabı Sil üzerinden uygulama içinde kalıcı olarak silebilirsiniz." },
    ],
    ctaTitle: "Hemen başlayın",
    ctaBody: "Bilardonun tadını doğru çıkarmanın yolu — RANKUE ile.",
    langLabel: "Dil",
    home: "Ana sayfa",
    support: "Destek",
    privacy: "Gizlilik Politikası",
  },
  es: {
    metaTitle: "Acerca de RANKUE · App de ranking y emparejamiento de billar",
    metaDesc: "RANKUE mide tu nivel de billar como una puntuación RP y registra tus partidas automáticamente. Gestiona 3 bandas y 4 bolas, empareja con rivales y clubes, sube en el ranking.",
    h1: "¿Qué es RANKUE?",
    tagline: "La forma correcta de disfrutar el billar",
    intro: "RANKUE es una app de ranking y emparejamiento de billar que mide tu nivel con una puntuación RP objetiva, te empareja con rivales de nivel similar y registra tus partidas automáticamente. Gratis en iOS y Android.",
    whatTitle: "Qué puedes hacer",
    whatBody: "En lugar de hándicaps vagos, conoce tu nivel real mediante una puntuación RP que sube y baja con resultados reales. Gestiona 3 bandas y 4 bolas por separado, encuentra rivales y clubes de tu nivel y desafía los rankings.",
    featuresTitle: "Funciones clave",
    features: [
      { name: "Puntuación RP", desc: "Puntuación objetiva de nivel que cambia con victorias/derrotas — separada para 3 bandas y 4 bolas." },
      { name: "Emparejamiento por nivel", desc: "Partidas clasificatorias 1:1 con jugadores de nivel similar. Un código PIN permite que tu rival entre a la misma partida." },
      { name: "Registro de partidas", desc: "Cada partida oficial se registra automáticamente — entradas, mejor serie, promedio y cambios de RP." },
      { name: "Clubes", desc: "Crea o únete a clubes de billar y comparte actividades, fotos y chat." },
      { name: "Simulador", desc: "Practica 3 bolas / 4 bolas en solitario en una mesa virtual en pantalla." },
      { name: "Rankings", desc: "Clasificaciones en tiempo real por local y nacionales para 3 bandas y 4 bolas." },
    ],
    rpTitle: "¿Qué es la puntuación RP?",
    rpBody: "RP (Rating Point) es una puntuación de nivel de billar que sube y baja con los resultados. Se calcula por separado para 3 bandas y 4 bolas y es la base del emparejamiento y los rankings.",
    howTitle: "Cómo empezar",
    how: [
      "Instala la app e ingresa con tu número de teléfono o una cuenta social",
      "Empieza una partida por emparejamiento o con un PIN",
      "Al terminar, el RP y los registros se actualizan automáticamente",
      "Desafía los rankings con rivales y clubes",
    ],
    faqTitle: "Preguntas frecuentes",
    faq: [
      { q: "¿RANKUE es gratis?", a: "Sí, es gratis y está disponible en iOS y Android." },
      { q: "¿Qué disciplinas admite?", a: "Billar carambola a 3 bandas y 4 bolas." },
      { q: "¿Qué idiomas admite?", a: "Coreano, inglés, vietnamita, turco y español." },
      { q: "¿Puedo eliminar mi cuenta?", a: "Sí, puedes eliminarla permanentemente en la app desde Menú → Eliminar cuenta." },
    ],
    ctaTitle: "Empieza ahora",
    ctaBody: "La forma correcta de disfrutar el billar — con RANKUE.",
    langLabel: "Idioma",
    home: "Inicio",
    support: "Soporte",
    privacy: "Política de privacidad",
  },
};

export default function About() {
  const { locale, setLocale } = useT();
  const [, setLocation] = useLocation();
  const c = CONTENT[locale] ?? CONTENT.ko;

  useSeo({
    title: c.metaTitle,
    description: c.metaDesc,
    path: "/about",
    locale,
    image: "https://www.rankue.co.kr/og.png",
  });

  return (
    <div className="min-h-screen w-full bg-[#f2f0eb] text-[rgba(0,0,0,0.87)] font-sans">
      <div className="mx-auto max-w-2xl px-5 py-12">
        {/* 언어 선택 */}
        <div className="flex items-center gap-2 flex-wrap mb-8" aria-label={c.langLabel}>
          {LOCALES.map((l) => (
            <button
              key={l.code}
              onClick={() => setLocale(l.code)}
              className={`text-[12px] font-semibold px-3 py-1.5 rounded-full transition-colors ${
                locale === l.code ? "bg-brand text-white" : "bg-black/[0.05] text-black/55 hover:bg-black/[0.08]"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>

        {/* Hero */}
        <header className="mb-12">
          <img src="/icon-192.png" alt="RANKUE" className="w-16 h-16 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.08)] mb-5" />
          <h1 className="text-[32px] font-bold tracking-tight leading-tight">{c.h1}</h1>
          <p className="text-[15px] font-semibold text-brand mt-2">{c.tagline}</p>
          <p className="text-[15px] text-black/70 leading-relaxed mt-4">{c.intro}</p>
        </header>

        {/* What */}
        <section className="mb-11">
          <h2 className="text-[20px] font-bold tracking-tight mb-3">{c.whatTitle}</h2>
          <p className="text-[15px] text-black/70 leading-relaxed">{c.whatBody}</p>
        </section>

        {/* Features */}
        <section className="mb-11">
          <h2 className="text-[20px] font-bold tracking-tight mb-4">{c.featuresTitle}</h2>
          <div className="grid gap-3">
            {c.features.map((f) => (
              <article key={f.name} className="bg-white rounded-2xl p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <h3 className="text-[15px] font-bold text-ink-1">{f.name}</h3>
                <p className="text-[13.5px] text-black/60 leading-relaxed mt-1">{f.desc}</p>
              </article>
            ))}
          </div>
        </section>

        {/* RP */}
        <section className="mb-11">
          <h2 className="text-[20px] font-bold tracking-tight mb-3">{c.rpTitle}</h2>
          <p className="text-[15px] text-black/70 leading-relaxed">{c.rpBody}</p>
        </section>

        {/* How */}
        <section className="mb-11">
          <h2 className="text-[20px] font-bold tracking-tight mb-4">{c.howTitle}</h2>
          <ol className="space-y-2.5">
            {c.how.map((step, i) => (
              <li key={i} className="flex gap-3 text-[15px] text-black/70 leading-relaxed">
                <span className="shrink-0 w-6 h-6 rounded-full bg-brand text-white text-[13px] font-bold flex items-center justify-center">{i + 1}</span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* FAQ */}
        <section className="mb-12">
          <h2 className="text-[20px] font-bold tracking-tight mb-4">{c.faqTitle}</h2>
          <div className="space-y-2.5">
            {c.faq.map((item) => (
              <details key={item.q} className="bg-white rounded-2xl p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <summary className="text-[15px] font-bold text-ink-1 cursor-pointer list-none">{item.q}</summary>
                <p className="text-[14px] text-black/65 leading-relaxed mt-2">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-3xl bg-brand p-7 text-center shadow-[0_8px_24px_rgba(0,98,65,0.20)] mb-10">
          <h2 className="text-[20px] font-bold text-white">{c.ctaTitle}</h2>
          <p className="text-[14px] text-white/85 mt-2">{c.ctaBody}</p>
          <button
            onClick={() => setLocation("/")}
            className="mt-5 inline-flex h-11 px-7 items-center justify-center rounded-full bg-white text-brand text-[14px] font-bold active:scale-[0.98] transition-transform"
          >
            {c.home}
          </button>
        </section>

        {/* Footer links */}
        <nav className="flex items-center justify-center gap-5 text-[13px] font-medium text-black/45">
          <a href="/support" className="hover:text-black/70">{c.support}</a>
          <span aria-hidden>·</span>
          <a href="/privacy" className="hover:text-black/70">{c.privacy}</a>
        </nav>
      </div>
    </div>
  );
}
