// 홈(랜딩) 문안의 정본 — 5개 언어. 클라이언트 랜딩(client/src/pages/hiq/marketing-landing.tsx)과
// 서버 프리렌더(server/prerender.ts)가 **같은 객체**를 읽는다.
// 문안을 양쪽에 따로 적으면 봇이 보는 내용과 사람이 보는 내용이 갈려 클로킹이 된다.
//
// 다국어인 이유(2026-08-18 감사): 사이트맵은 홈에 en·vi·tr·es 언어판을 선언하는데
// 실제로는 5개 로케일 전부 동일한 한국어 문서를 서빙하고 있었다(html lang="ko" 고정).
// 선언과 실물이 어긋나면 hreflang 클러스터 전체가 무시된다.
//
// 제목은 "번역"이 아니라 **그 나라 사람이 검색창에 치는 말**로 쓴다. 실측 근거:
//   tr — "bilardo skor tablosu" / "3 bant" (Google Play·App Store 앱 제목에서 확인)
//   vi — "bảng điểm bida" / "bi-a 3 băng" (bida 표기가 검색에서 우세)
//   es — "marcador de billar" / "carambola" / "tres bandas"
//   en — "billiards scoreboard" / "3-cushion" / "carom"
// 용어는 shared/aboutContent.ts 의 각 언어판과 통일한다(같은 제품을 다르게 부르지 않기).

export interface LandingFeature { name: string; desc: string; }
export interface LandingFaq { q: string; a: string; }
export interface LandingCrewItem { t: string; d: string; }
export interface LandingContent {
  title: string;
  desc: string;
  h1: string;
  kicker: string;
  lead: string;
  chips: string[];
  features: LandingFeature[];
  /** 랜딩 화면에 실제로 보이는 문답. FAQPage JSON-LD 와 **같은 내용**이어야 한다
   *  (구조화데이터에만 있고 화면에 없는 문답은 구글 기준 위반). */
  faqs: LandingFaq[];
  crew: { title: string; desc: string; items: LandingCrewItem[] };
}

/** 홈이 언어판을 제공하는 로케일. 사이트맵 APP_LANGS 와 짝을 맞춘다. */
export const LANDING_LANGS = ["ko", "en", "vi", "tr", "es"] as const;

export const LANDING: Record<string, LandingContent> = {
  ko: {
    title: "당구 점수판 랭큐 RANKUE · 당구 커뮤니티",
    desc: "랭큐는 손안의 당구 점수판입니다. 터치로 당구 점수를 기록하면 이닝·평균(에버리지)·하이런이 자동 계산되고, 상대와 매칭해 친 경기가 전적으로 남습니다. 크루로 당구 커뮤니티를 꾸리고 매장·전국 랭킹까지. 3쿠션·4구 지원, 무료.",
    h1: "손안의 당구 점수판",
    kicker: "3쿠션 · 4구 당구 점수판",
    lead: "복잡한 계산은 랭큐가 합니다. 터치로 점수만 올리면 이닝과 평균(에버리지), 하이런까지 알아서 기록돼요.",
    chips: ["3쿠션 · 4구 지원", "전적 자동 저장", "매장 · 전국 랭킹", "무료"],
    features: [
      { name: "손안의 점수판", desc: "터치로 점수만 올리면 됩니다. 이닝·평균(에버리지)·하이런을 자동으로 세고 음성으로 알려줘요. 잘못 눌렀으면 되돌리기." },
      { name: "당구 매칭 대결", desc: "상대와 1:1 경기. 핀(PIN) 코드를 입력하면 서로 다른 폰에서 같은 점수판에 함께 들어옵니다." },
      { name: "경기 기록", desc: "모든 경기가 자동 저장됩니다. 전적·평균·하이런이 어떻게 달라지는지 한눈에 보며 내 당구 기록을 쌓아가세요." },
      { name: "크루(당구 동호회)", desc: "당구 커뮤니티를 직접 만들거나 가입해서 활동하세요. 크루 사진첩·채팅·크루 랭킹까지 함께 굴러갑니다." },
      { name: "시뮬레이터", desc: "화면 위 가상 당구대에서 혼자 3구·4구 배치를 그려보고 연습할 수 있어요." },
      { name: "당구 랭킹", desc: "매장별·전국 3쿠션·4구 순위. 자주 가는 당구장에서 내가 몇 등인지 바로 확인합니다." },
    ],
    faqs: [
      { q: "당구 점수판 앱, 랭큐는 뭐가 좋아요?", a: "랭큐는 점수만 세는 계수기가 아니라 손안의 당구 점수판입니다. 터치로 점수를 올리면 이닝·평균(에버리지)·하이런이 자동으로 계산되고 음성으로 안내되며, 경기가 끝나면 전적으로 자동 저장돼 매장·전국 랭킹까지 이어집니다. 3쿠션과 4구를 모두 지원하고 무료입니다." },
      { q: "3쿠션 에버리지(평균)는 어떻게 계산하나요?", a: "에버리지는 득점을 이닝 수로 나눈 값입니다. 30점을 20이닝에 쳤다면 1.500이 되죠. 랭큐는 경기 중 이닝을 자동으로 세기 때문에 따로 계산할 필요 없이 에버리지와 하이런이 실시간으로 표시됩니다." },
      { q: "당구 커뮤니티나 동호회는 어디서 찾나요?", a: "랭큐의 크루에서 찾을 수 있습니다. 지역과 종목으로 당구 커뮤니티를 둘러보고 가입을 신청하거나, 직접 크루를 만들어 멤버를 모을 수 있어요. 크루 안에서는 활동 사진과 채팅, 크루 랭킹이 함께 제공됩니다." },
      { q: "설치하지 않고 먼저 써볼 수 있나요?", a: "네. 웹 브라우저에서 바로 시작할 수 있습니다. 휴대폰 번호로 로그인하면 그때까지의 기록이 그대로 이어지고, 푸시 알림과 음성 안내까지 편하게 쓰려면 iOS·Android 앱을 설치하세요." },
      { q: "랭큐는 무료인가요?", a: "네, 랭큐는 무료로 이용할 수 있으며 iOS와 Android에서 모두 사용할 수 있습니다." },
      { q: "어떤 언어를 지원하나요?", a: "한국어, 영어, 베트남어, 터키어, 스페인어를 지원합니다." },
    ],
    crew: {
      title: "혼자 치지 말고, 당구 커뮤니티에서",
      desc: "크루는 랭큐의 당구 동호회입니다. 지역·종목으로 마음 맞는 사람을 찾아 함께 치고, 정모와 사진·대화가 크루 안에 쌓입니다.",
      items: [
        { t: "크루 만들기 · 가입", d: "지역과 종목으로 동호회를 찾아 신청" },
        { t: "크루 랭킹", d: "멤버들의 전적·에버리지를 한 화면에" },
        { t: "사진첩 · 채팅", d: "정모 사진과 대화가 크루 안에 쌓입니다" },
      ],
    },
  },

  en: {
    title: "Billiards Scoreboard App — 3-Cushion & Carom Scoring | RANKUE",
    desc: "RANKUE is the billiards scoreboard in your pocket. Tap to add a point and your innings, average and high run are counted automatically. Match up with an opponent, keep every result, and climb your venue and national rankings. 3-cushion and four-ball, free.",
    h1: "The billiards scoreboard in your pocket",
    kicker: "3-cushion · four-ball scoreboard",
    lead: "Let RANKUE do the counting. Just tap the score — innings, average and high run are tracked for you.",
    chips: ["3-cushion · four-ball", "Every match saved", "Venue · national ranking", "Free"],
    features: [
      { name: "Scoreboard in your pocket", desc: "Just tap to add a point. Innings, average and high run are counted automatically with voice call-outs, and a mistap is one undo away." },
      { name: "Matched games", desc: "Play head to head. Enter a PIN code and both phones join the same scoreboard." },
      { name: "Match history", desc: "Every game is saved automatically. Watch your record, average and high run move as you play." },
      { name: "Crews (billiards clubs)", desc: "Start or join a billiards club. Crew photo album, chat and crew rankings come with it." },
      { name: "Simulator", desc: "Lay out 3-cushion and four-ball positions on a virtual table and practise on your own." },
      { name: "Rankings", desc: "3-cushion and four-ball standings by venue and nationwide. See where you place at your regular hall." },
    ],
    faqs: [
      { q: "What makes RANKUE different from a counter app?", a: "RANKUE is a full billiards scoreboard, not just a point counter. Tap to score and the innings, average and high run are calculated and announced for you. When the game ends it is saved as a result and feeds your venue and national rankings. 3-cushion and four-ball are both supported, and it is free." },
      { q: "How is 3-cushion average calculated?", a: "Average is your points divided by the number of innings. Score 30 in 20 innings and your average is 1.500. RANKUE counts innings during the game, so average and high run appear live without any maths on your side." },
      { q: "Where do I find a billiards club or community?", a: "In Crews. Browse billiards clubs by region and discipline and apply to join, or create your own crew and gather members. Each crew comes with an activity photo album, chat and crew rankings." },
      { q: "Can I try it before installing?", a: "Yes. You can start straight from a web browser. Sign in with your phone number and everything you recorded carries over; install the iOS or Android app when you want push notifications and voice call-outs." },
      { q: "Is RANKUE free?", a: "Yes, RANKUE is free to use and available on both iOS and Android." },
      { q: "Which languages are supported?", a: "Korean, English, Vietnamese, Turkish and Spanish." },
    ],
    crew: {
      title: "Don't play alone — find your billiards community",
      desc: "A crew is a billiards club on RANKUE. Find people near you playing the same discipline, then meet-ups, photos and chat all pile up inside the crew.",
      items: [
        { t: "Create · join a crew", d: "Search clubs by region and discipline" },
        { t: "Crew rankings", d: "Members' records and averages on one screen" },
        { t: "Photos · chat", d: "Meet-up photos and conversation stay in the crew" },
      ],
    },
  },

  vi: {
    title: "Ứng dụng bảng điểm bida — ghi điểm bi-a 3 băng | RANKUE",
    desc: "RANKUE là bảng điểm bida trong túi bạn. Chạm để cộng điểm, số lượt (inning), average và high run được tính tự động. Đấu với đối thủ, mọi trận đều được lưu, rồi leo bảng xếp hạng quán và toàn quốc. Hỗ trợ bi-a 3 băng và 4 bi, miễn phí.",
    h1: "Bảng điểm bida trong túi bạn",
    kicker: "Bảng điểm bi-a 3 băng · 4 bi",
    lead: "Cứ để RANKUE tính. Bạn chỉ cần chạm để cộng điểm — số lượt, average và high run tự động được ghi lại.",
    chips: ["Bi-a 3 băng · 4 bi", "Tự động lưu mọi trận", "BXH quán · toàn quốc", "Miễn phí"],
    features: [
      { name: "Bảng điểm trong túi", desc: "Chỉ cần chạm để cộng điểm. Số lượt, average và high run được đếm tự động kèm thông báo bằng giọng nói, bấm nhầm thì hoàn tác." },
      { name: "Đấu bida ghép cặp", desc: "Đấu 1 chọi 1. Nhập mã PIN là hai điện thoại cùng vào chung một bảng điểm." },
      { name: "Lịch sử trận đấu", desc: "Mọi trận được lưu tự động. Theo dõi thành tích, average và high run thay đổi ra sao qua từng trận." },
      { name: "Crew (câu lạc bộ bida)", desc: "Tự lập hoặc tham gia câu lạc bộ bida. Có album ảnh, trò chuyện và bảng xếp hạng trong crew." },
      { name: "Mô phỏng", desc: "Dựng thế bi 3 băng và 4 bi trên bàn ảo để luyện tập một mình." },
      { name: "Bảng xếp hạng", desc: "Thứ hạng bi-a 3 băng và 4 bi theo quán và toàn quốc. Biết ngay mình đứng thứ mấy ở quán quen." },
    ],
    faqs: [
      { q: "RANKUE khác gì so với app đếm điểm thường?", a: "RANKUE là bảng điểm bida đầy đủ chứ không chỉ đếm điểm. Chạm để ghi điểm là số lượt, average và high run được tính và đọc lên cho bạn. Kết thúc trận, kết quả được lưu và cộng vào bảng xếp hạng quán cũng như toàn quốc. Hỗ trợ cả bi-a 3 băng lẫn 4 bi và hoàn toàn miễn phí." },
      { q: "Average trong bi-a 3 băng được tính thế nào?", a: "Average là điểm chia cho số lượt (inning). Ghi 30 điểm trong 20 lượt thì average là 1.500. RANKUE đếm lượt ngay trong trận nên average và high run hiện theo thời gian thực, bạn không phải tính tay." },
      { q: "Tìm câu lạc bộ hay cộng đồng bida ở đâu?", a: "Ở mục Crew. Bạn có thể xem các câu lạc bộ bida theo khu vực và nội dung thi đấu rồi xin gia nhập, hoặc tự lập crew và mời thành viên. Mỗi crew có album ảnh hoạt động, trò chuyện và bảng xếp hạng riêng." },
      { q: "Chưa cài app thì dùng thử được không?", a: "Được. Bạn mở thẳng trên trình duyệt web là dùng được ngay. Đăng nhập bằng số điện thoại thì mọi dữ liệu đã ghi vẫn giữ nguyên; cài app iOS hoặc Android khi muốn có thông báo đẩy và đọc điểm bằng giọng nói." },
      { q: "RANKUE có miễn phí không?", a: "Có, RANKUE miễn phí và có trên cả iOS lẫn Android." },
      { q: "Hỗ trợ những ngôn ngữ nào?", a: "Tiếng Hàn, tiếng Anh, tiếng Việt, tiếng Thổ Nhĩ Kỳ và tiếng Tây Ban Nha." },
    ],
    crew: {
      title: "Đừng đánh một mình — vào cộng đồng bida",
      desc: "Crew là câu lạc bộ bida trên RANKUE. Tìm người hợp gu theo khu vực và nội dung để cùng chơi; buổi gặp mặt, ảnh và trò chuyện đều đọng lại trong crew.",
      items: [
        { t: "Lập · tham gia crew", d: "Tìm câu lạc bộ theo khu vực và nội dung" },
        { t: "BXH crew", d: "Thành tích và average của thành viên trên một màn hình" },
        { t: "Album · trò chuyện", d: "Ảnh buổi gặp và tin nhắn đọng lại trong crew" },
      ],
    },
  },

  tr: {
    title: "Bilardo Skor Tablosu — 3 Bant ve Karambol Sayaç | RANKUE",
    desc: "RANKUE cebinizdeki bilardo skor tablosudur. Sayıya dokunun; vuruş (inning), ortalama ve en yüksek seri otomatik hesaplansın. Rakibinizle eşleşin, her maç kayıtta kalsın, salon ve ülke sıralamasında yükselin. 3 bant ve karambol desteklenir, ücretsizdir.",
    h1: "Cebinizdeki bilardo skor tablosu",
    kicker: "3 bant · karambol skor tablosu",
    lead: "Hesabı RANKUE tutsun. Siz sadece sayıya dokunun — vuruş, ortalama ve en yüksek seri kendiliğinden işlenir.",
    chips: ["3 bant · karambol", "Her maç kayıtlı", "Salon · ülke sıralaması", "Ücretsiz"],
    features: [
      { name: "Cepteki skor tablosu", desc: "Sayı eklemek için dokunmanız yeter. Vuruş, ortalama ve en yüksek seri sesli bildirimle otomatik sayılır; yanlış dokunduysanız geri alın." },
      { name: "Eşleşmeli maç", desc: "Rakiple bire bir oynayın. PIN kodunu giren iki telefon aynı skor tablosuna girer." },
      { name: "Maç geçmişi", desc: "Bütün maçlar otomatik kaydedilir. Galibiyet, ortalama ve en yüksek serinizin nasıl değiştiğini tek bakışta görün." },
      { name: "Crew (bilardo kulübü)", desc: "Bilardo kulübü kurun ya da katılın. Kulüp fotoğraf albümü, sohbet ve kulüp sıralaması da beraberinde gelir." },
      { name: "Simülatör", desc: "Sanal masada 3 bant ve karambol duruşları kurup tek başınıza çalışın." },
      { name: "Sıralamalar", desc: "Salon ve ülke genelinde 3 bant ve karambol sıralaması. Devam ettiğiniz salonda kaçıncı olduğunuzu hemen görün." },
    ],
    faqs: [
      { q: "RANKUE sıradan bir sayaç uygulamasından nasıl farklı?", a: "RANKUE yalnızca sayı sayan bir sayaç değil, tam bir bilardo skor tablosudur. Sayıya dokunduğunuzda vuruş, ortalama ve en yüksek seri hesaplanır ve sesli bildirilir. Maç bitince sonuç kaydedilir, salon ve ülke sıralamanıza işlenir. 3 bant ve karambol desteklenir, ücretsizdir." },
      { q: "3 bantta ortalama nasıl hesaplanır?", a: "Ortalama, sayınızın vuruş (inning) sayısına bölümüdür. 20 vuruşta 30 sayı yaptıysanız ortalamanız 1.500 olur. RANKUE vuruşları maç sırasında saydığı için ortalama ve en yüksek seri siz hesap yapmadan anlık görünür." },
      { q: "Bilardo kulübünü nerede bulurum?", a: "Crew bölümünde. Bilardo kulüplerini bölgeye ve branşa göre inceleyip katılma isteği gönderebilir ya da kendi crew'unuzu kurup üye toplayabilirsiniz. Her crew'da etkinlik albümü, sohbet ve kulüp sıralaması bulunur." },
      { q: "Kurmadan önce deneyebilir miyim?", a: "Evet. Doğrudan web tarayıcısından başlayabilirsiniz. Telefon numaranızla giriş yaptığınızda o ana kadarki kayıtlarınız aynen devam eder; anlık bildirim ve sesli anons için iOS veya Android uygulamasını kurun." },
      { q: "RANKUE ücretsiz mi?", a: "Evet, RANKUE ücretsizdir ve hem iOS hem Android'de kullanılabilir." },
      { q: "Hangi diller destekleniyor?", a: "Korece, İngilizce, Vietnamca, Türkçe ve İspanyolca." },
    ],
    crew: {
      title: "Tek başına oynama — bilardo topluluğuna katıl",
      desc: "Crew, RANKUE'deki bilardo kulübüdür. Bölgeye ve branşa göre uyumlu kişileri bulup birlikte oynayın; buluşmalar, fotoğraflar ve sohbet crew içinde birikir.",
      items: [
        { t: "Crew kur · katıl", d: "Bölgeye ve branşa göre kulüp bulun" },
        { t: "Crew sıralaması", d: "Üyelerin karnesi ve ortalaması tek ekranda" },
        { t: "Albüm · sohbet", d: "Buluşma fotoğrafları ve sohbet crew'da kalır" },
      ],
    },
  },

  es: {
    title: "Marcador de Billar — App de carambola y tres bandas | RANKUE",
    desc: "RANKUE es el marcador de billar en tu bolsillo. Toca para anotar y las entradas, el promedio y la serie mayor se calculan solos. Emparéjate con un rival, guarda cada resultado y sube en el ranking de tu sala y nacional. Carambola y tres bandas, gratis.",
    h1: "El marcador de billar en tu bolsillo",
    kicker: "Marcador de carambola · tres bandas",
    lead: "Que cuente RANKUE. Tú solo toca el tanteo: entradas, promedio y serie mayor se registran solos.",
    chips: ["Carambola · tres bandas", "Cada partida guardada", "Ranking de sala · nacional", "Gratis"],
    features: [
      { name: "El marcador en tu bolsillo", desc: "Solo toca para anotar. Entradas, promedio y serie mayor se cuentan solos con aviso por voz, y si te equivocas puedes deshacer." },
      { name: "Partidas emparejadas", desc: "Juega uno contra uno. Con un código PIN los dos móviles entran al mismo marcador." },
      { name: "Historial de partidas", desc: "Cada partida se guarda sola. Mira cómo evolucionan tu récord, tu promedio y tu serie mayor." },
      { name: "Crews (clubes de billar)", desc: "Crea o únete a un club de billar. Incluye álbum de fotos, chat y ranking del club." },
      { name: "Simulador", desc: "Monta posiciones de tres bandas y cuatro bolas en una mesa virtual y practica por tu cuenta." },
      { name: "Rankings", desc: "Clasificación de carambola y tres bandas por sala y a nivel nacional. Mira en qué puesto estás en tu sala habitual." },
    ],
    faqs: [
      { q: "¿En qué se diferencia RANKUE de un simple contador?", a: "RANKUE es un marcador de billar completo, no solo un contador de puntos. Al tocar el tanteo se calculan y se anuncian las entradas, el promedio y la serie mayor. Al terminar, la partida se guarda como resultado y alimenta el ranking de tu sala y el nacional. Admite carambola y tres bandas, y es gratis." },
      { q: "¿Cómo se calcula el promedio a tres bandas?", a: "El promedio son los puntos divididos entre el número de entradas. Si haces 30 puntos en 20 entradas, tu promedio es 1.500. RANKUE cuenta las entradas durante la partida, así que el promedio y la serie mayor aparecen en tiempo real sin que hagas cuentas." },
      { q: "¿Dónde encuentro un club o comunidad de billar?", a: "En Crews. Puedes ver clubes de billar por zona y modalidad y solicitar entrar, o crear tu propio crew y reunir miembros. Cada crew trae álbum de actividades, chat y ranking del club." },
      { q: "¿Puedo probarlo sin instalar nada?", a: "Sí. Puedes empezar directamente desde el navegador. Si inicias sesión con tu número de teléfono conservas todo lo registrado; instala la app de iOS o Android cuando quieras notificaciones y avisos por voz." },
      { q: "¿RANKUE es gratis?", a: "Sí, RANKUE es gratuito y está disponible en iOS y Android." },
      { q: "¿Qué idiomas admite?", a: "Coreano, inglés, vietnamita, turco y español." },
    ],
    crew: {
      title: "No juegues solo: únete a la comunidad del billar",
      desc: "Un crew es un club de billar en RANKUE. Encuentra gente afín por zona y modalidad para jugar juntos; quedadas, fotos y conversación se quedan dentro del crew.",
      items: [
        { t: "Crear · unirte a un crew", d: "Busca clubes por zona y modalidad" },
        { t: "Ranking del crew", d: "Récord y promedio de los miembros en una pantalla" },
        { t: "Álbum · chat", d: "Fotos de las quedadas y charla se quedan en el crew" },
      ],
    },
  },
};

/** 화이트리스트 조회 — ?lang=constructor 같은 프로토타입 속성명이 통과하지 못하게 한다. */
export function landingContent(lang?: string | null): LandingContent {
  return (LANDING_LANGS as readonly string[]).includes(lang ?? "") ? LANDING[lang as string] : LANDING.ko;
}

// ── 하위호환 별칭 (기존 import 유지) — 값은 항상 ko판 ──
export const LANDING_META = {
  title: LANDING.ko.title, desc: LANDING.ko.desc, h1: LANDING.ko.h1,
  kicker: LANDING.ko.kicker, lead: LANDING.ko.lead,
} as const;
export const LANDING_FEATURES = LANDING.ko.features;
export const LANDING_FAQS = LANDING.ko.faqs;
export const LANDING_CHIPS = LANDING.ko.chips;
export const LANDING_CREW = LANDING.ko.crew;
