// RANKUE 소개(About) 문안 — 7개 언어.
//
// 왜 shared 에 있는가: 이 문안은 두 곳에서 렌더된다.
//   1) client/src/pages/about.tsx — 사용자가 보는 React 페이지
//   2) server/prerender.ts        — 크롤러가 보는 프리렌더 HTML
// 두 출력이 갈라지면 "봇에게만 다른 내용을 보여주는" 클로킹이 된다.
// 그래서 문안은 반드시 이 파일 하나만 고친다. 어느 한쪽에 복사해 두지 말 것.

export interface Feature { name: string; desc: string; }
export interface Faq { q: string; a: string; }
export interface AboutContent {
  metaTitle: string;
  metaDesc: string;
  h1: string;
  tagline: string;
  intro: string;
  whatTitle: string;
  whatBody: string;
  featuresTitle: string;
  features: Feature[];
  whyTitle: string;
  whyBody: string;
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

// About 페이지가 지원하는 언어 목록 — 이것이 정본 화이트리스트다.
// 서버 프리렌더(server/prerender.ts)와 클라이언트(about.tsx)가 같은 배열을 쓴다.
// ⚠️ `ABOUT_CONTENT[q]` 로 유효성을 검사하면 안 된다: ?lang=constructor 처럼
//    Object.prototype 속성명이 truthy 로 통과해 실제 문안이 없는 값으로 진행하고 500 이 난다.
export const ABOUT_LANGS = ["ko", "en", "vi", "tr", "es", "ja", "zh"] as const;

export const ABOUT_CONTENT: Record<string, AboutContent> = {
  ko: {
    metaTitle: "랭큐(RANKUE) 소개 · 손안의 당구 점수판",
    metaDesc: "랭큐는 손안의 당구 점수판입니다. 스마트폰으로 당구 점수를 간편하게 기록하고, 이닝·평균·하이런을 자동 계산하며, 상대와 매칭해 경기하고 전적·랭킹을 남깁니다.",
    h1: "랭큐(RANKUE)란?",
    tagline: "손안의 당구 점수판",
    intro: "랭큐는 스마트폰이 당구 점수판이 되는 앱입니다. 터치 몇 번으로 점수를 기록하고, 이닝·평균·하이런을 자동으로 계산하며, 음성으로 안내합니다. 혼자 연습부터 상대와의 매칭 경기, 전적·랭킹까지 한 곳에서.",
    whatTitle: "무엇을 할 수 있나요",
    whatBody: "복잡한 계산 없이 스마트폰으로 당구 점수를 기록하세요. 이닝과 평균, 하이런이 자동으로 집계되고 되돌리기·음성 안내까지. 경기가 끝나면 전적으로 남고, 실력이 맞는 상대·크루와 함께 즐길 수 있습니다.",
    featuresTitle: "핵심 기능",
    features: [
      { name: "손안의 점수판", desc: "터치로 간편하게 점수 기록. 이닝·평균·하이런 자동 계산, 음성 안내, 되돌리기까지." },
      { name: "매칭 대결", desc: "상대와 1:1 경기. 핀(PIN) 코드로 상대가 같은 점수판에 함께 입장." },
      { name: "경기 기록", desc: "모든 경기를 자동 저장. 전적·평균·하이런을 한눈에." },
      { name: "크루", desc: "당구 동호회를 만들고 가입해 활동·사진·채팅으로 함께 즐기기." },
      { name: "시뮬레이터", desc: "화면 위 가상 당구대에서 혼자 3구·4구 연습." },
      { name: "랭킹", desc: "매장별·전국 3쿠션·4구 순위." },
    ],
    whyTitle: "왜 랭큐인가요?",
    whyBody: "당구장에서 종이나 계산기로 세던 점수를 스마트폰 하나로. 기록이 남으니 실력 변화가 보이고, 상대와 매칭도 됩니다. 당구를 더 편하고 재미있게.",
    howTitle: "이렇게 시작하세요",
    how: [
      "앱을 설치하고 휴대폰 번호 또는 소셜 계정으로 입장",
      "점수판을 열어 바로 점수 기록 — 혼자 연습 또는 매칭 대결",
      "경기가 끝나면 전적이 자동으로 저장",
      "라이벌·크루와 함께 랭킹에 도전",
    ],
    faqTitle: "자주 묻는 질문",
    faq: [
      { q: "랭큐는 무료인가요?", a: "네, 무료로 이용할 수 있으며 iOS와 Android에서 모두 사용할 수 있습니다." },
      { q: "점수는 어떻게 기록하나요?", a: "화면의 점수판에서 터치로 득점을 입력하면 이닝·평균·하이런이 자동 계산되고 음성으로 안내됩니다. 되돌리기도 됩니다." },
      { q: "어떤 종목을 지원하나요?", a: "3쿠션과 4구(사구) 캐롬 당구를 지원합니다." },
      { q: "계정을 삭제할 수 있나요?", a: "네, 앱의 전체 메뉴 → 계정 삭제에서 직접 영구 삭제할 수 있습니다." },
    ],
    ctaTitle: "지금 시작하세요",
    ctaBody: "손안의 당구 점수판, 랭큐.",
    langLabel: "언어",
    home: "홈으로",
    support: "고객지원",
    privacy: "개인정보처리방침",
  },
  en: {
    metaTitle: "About RANKUE · The Billiards Scoreboard in Your Pocket",
    metaDesc: "RANKUE is a billiards scoreboard in your pocket. Keep score on your phone with a tap, auto-calculate innings, average and high run, match with opponents, and save your records and rankings.",
    h1: "What is RANKUE?",
    tagline: "The billiards scoreboard in your pocket",
    intro: "RANKUE turns your phone into a billiards scoreboard. Score with a few taps, auto-calculate innings, average and high run, and hear voice call-outs. From solo practice to matches with opponents, plus records and rankings — all in one place.",
    whatTitle: "What you can do",
    whatBody: "Keep score on your phone without any mental math. Innings, average, and high run are tallied automatically, with undo and voice guidance. When a match ends it's saved to your record, and you can play with skill-matched rivals and crews.",
    featuresTitle: "Key features",
    features: [
      { name: "Pocket scoreboard", desc: "Score with a tap. Auto innings, average and high run, voice call-outs, and undo." },
      { name: "Match play", desc: "1:1 games with an opponent. A PIN code lets them join the same scoreboard." },
      { name: "Match records", desc: "Every game is saved automatically — record, average, and high run at a glance." },
      { name: "Crews", desc: "Create or join billiards clubs and share activities, photos, and chat." },
      { name: "Simulator", desc: "Practice 3-ball / 4-ball solo on an on-screen virtual table." },
      { name: "Rankings", desc: "Store and nationwide leaderboards for 3-cushion and 4-ball." },
    ],
    whyTitle: "Why RANKUE?",
    whyBody: "Replace paper and calculators at the hall with a single phone. Because your games are saved, you can see your progress and match with others. Billiards, made easier and more fun.",
    howTitle: "Getting started",
    how: [
      "Install the app and enter with your phone number or a social account",
      "Open the scoreboard and start scoring — solo practice or match play",
      "When the match ends, it's saved to your record automatically",
      "Challenge the rankings with rivals and crews",
    ],
    faqTitle: "Frequently asked questions",
    faq: [
      { q: "Is RANKUE free?", a: "Yes, it is free to use and available on both iOS and Android." },
      { q: "How do I keep score?", a: "Tap on the on-screen scoreboard to enter points; innings, average and high run are calculated automatically with voice call-outs, and you can undo." },
      { q: "Which disciplines are supported?", a: "3-cushion and 4-ball (carom) billiards." },
      { q: "Can I delete my account?", a: "Yes, you can permanently delete it in-app via All menu → Delete Account." },
    ],
    ctaTitle: "Get started now",
    ctaBody: "The billiards scoreboard in your pocket — RANKUE.",
    langLabel: "Language",
    home: "Home",
    support: "Support",
    privacy: "Privacy Policy",
  },
  vi: {
    metaTitle: "Giới thiệu RANKUE · Bảng điểm bi-a trong túi bạn",
    metaDesc: "RANKUE là bảng điểm bi-a trong túi bạn. Ghi điểm trên điện thoại chỉ bằng một chạm, tự động tính lượt cơ, trung bình và run cao nhất, ghép đối thủ và lưu lịch sử, xếp hạng.",
    h1: "RANKUE là gì?",
    tagline: "Bảng điểm bi-a trong túi bạn",
    intro: "RANKUE biến điện thoại của bạn thành bảng điểm bi-a. Ghi điểm chỉ với vài chạm, tự động tính lượt cơ, trung bình và run cao nhất, kèm thông báo bằng giọng nói. Từ luyện tập một mình đến trận đấu với đối thủ, cùng lịch sử và xếp hạng — tất cả ở một nơi.",
    whatTitle: "Bạn có thể làm gì",
    whatBody: "Ghi điểm trên điện thoại mà không cần tính nhẩm. Lượt cơ, trung bình và run cao nhất được tính tự động, có hoàn tác và hướng dẫn bằng giọng nói. Khi trận kết thúc, nó được lưu vào lịch sử, và bạn có thể chơi với đối thủ, crew cùng trình độ.",
    featuresTitle: "Tính năng chính",
    features: [
      { name: "Bảng điểm bỏ túi", desc: "Ghi điểm bằng một chạm. Tự động lượt cơ, trung bình, run cao nhất, thông báo giọng nói và hoàn tác." },
      { name: "Đấu ghép trận", desc: "Trận 1:1 với đối thủ. Mã PIN giúp họ vào cùng bảng điểm." },
      { name: "Lịch sử trận", desc: "Mọi trận được lưu tự động — lịch sử, trung bình và run cao nhất trong nháy mắt." },
      { name: "Crew", desc: "Tạo hoặc tham gia câu lạc bộ bi-a, chia sẻ hoạt động, ảnh và trò chuyện." },
      { name: "Trình mô phỏng", desc: "Luyện 3 bi / 4 bi một mình trên bàn bi-a ảo." },
      { name: "Bảng xếp hạng", desc: "Bảng xếp hạng theo quán và toàn quốc cho 3 băng và 4 bi." },
    ],
    whyTitle: "Vì sao chọn RANKUE?",
    whyBody: "Thay giấy và máy tính ở quán bằng một chiếc điện thoại. Vì các trận được lưu lại, bạn thấy được sự tiến bộ và ghép trận với người khác. Bi-a, dễ hơn và vui hơn.",
    howTitle: "Bắt đầu như thế nào",
    how: [
      "Cài ứng dụng và đăng nhập bằng số điện thoại hoặc tài khoản mạng xã hội",
      "Mở bảng điểm và bắt đầu ghi điểm — luyện tập hoặc đấu ghép trận",
      "Khi trận kết thúc, nó tự động được lưu vào lịch sử",
      "Chinh phục bảng xếp hạng cùng đối thủ và crew",
    ],
    faqTitle: "Câu hỏi thường gặp",
    faq: [
      { q: "RANKUE có miễn phí không?", a: "Có, miễn phí và có trên cả iOS lẫn Android." },
      { q: "Tôi ghi điểm như thế nào?", a: "Chạm vào bảng điểm trên màn hình để nhập điểm; lượt cơ, trung bình và run cao nhất được tính tự động kèm thông báo giọng nói, và có thể hoàn tác." },
      { q: "Hỗ trợ những thể loại nào?", a: "Bi-a carom 3 băng và 4 bi." },
      { q: "Tôi có thể xóa tài khoản không?", a: "Có, bạn có thể xóa vĩnh viễn trong ứng dụng qua Menu → Xóa tài khoản." },
    ],
    ctaTitle: "Bắt đầu ngay",
    ctaBody: "Bảng điểm bi-a trong túi bạn — RANKUE.",
    langLabel: "Ngôn ngữ",
    home: "Trang chủ",
    support: "Hỗ trợ",
    privacy: "Chính sách bảo mật",
  },
  tr: {
    metaTitle: "RANKUE Hakkında · Cebinizdeki bilardo skor tablosu",
    metaDesc: "RANKUE cebinizdeki bilardo skor tablosudur. Telefonda tek dokunuşla skor tutun; vuruş, ortalama ve en yüksek seriyi otomatik hesaplayın, rakip eşleştirin, kayıt ve sıralama tutun.",
    h1: "RANKUE nedir?",
    tagline: "Cebinizdeki bilardo skor tablosu",
    intro: "RANKUE telefonunuzu bir bilardo skor tablosuna dönüştürür. Birkaç dokunuşla skor tutun; vuruş, ortalama ve en yüksek seri otomatik hesaplanır ve sesli anons yapılır. Tek başına antrenmandan rakip maçlarına, kayıt ve sıralamaya kadar hepsi tek yerde.",
    whatTitle: "Neler yapabilirsiniz",
    whatBody: "Zihinden hesap yapmadan telefonda skor tutun. Vuruş, ortalama ve en yüksek seri otomatik toplanır; geri alma ve sesli yönlendirme vardır. Maç bitince kaydınıza işlenir ve seviyenize uygun rakip ve ekiplerle oynayabilirsiniz.",
    featuresTitle: "Öne çıkan özellikler",
    features: [
      { name: "Cepte skor tablosu", desc: "Tek dokunuşla skor. Otomatik vuruş, ortalama ve en yüksek seri, sesli anons ve geri alma." },
      { name: "Maç oyunu", desc: "Rakiple 1:1 maç. PIN kodu ile aynı skor tablosuna katılır." },
      { name: "Maç kayıtları", desc: "Her maç otomatik kaydedilir — kayıt, ortalama ve en yüksek seri bir bakışta." },
      { name: "Ekipler", desc: "Bilardo kulüpleri kurun veya katılın; etkinlik, fotoğraf ve sohbet paylaşın." },
      { name: "Simülatör", desc: "Ekrandaki sanal masada tek başınıza 3 top / 4 top çalışın." },
      { name: "Sıralamalar", desc: "3 bant ve 4 top için salon ve ülke geneli sıralamalar." },
    ],
    whyTitle: "Neden RANKUE?",
    whyBody: "Salondaki kâğıt ve hesap makinesini tek bir telefonla değiştirin. Maçlarınız kaydedildiği için gelişiminizi görür ve başkalarıyla eşleşirsiniz. Bilardo, daha kolay ve daha keyifli.",
    howTitle: "Nasıl başlanır",
    how: [
      "Uygulamayı yükleyin ve telefon numarası veya sosyal hesapla giriş yapın",
      "Skor tablosunu açıp skor tutmaya başlayın — antrenman veya maç",
      "Maç bitince otomatik olarak kaydınıza işlenir",
      "Rakip ve ekiplerle sıralamalara meydan okuyun",
    ],
    faqTitle: "Sık sorulan sorular",
    faq: [
      { q: "RANKUE ücretsiz mi?", a: "Evet, ücretsizdir ve hem iOS hem Android'de mevcuttur." },
      { q: "Skoru nasıl tutarım?", a: "Ekrandaki skor tablosuna dokunarak sayı girin; vuruş, ortalama ve en yüksek seri sesli anonsla otomatik hesaplanır ve geri alabilirsiniz." },
      { q: "Hangi disiplinler destekleniyor?", a: "3 bant ve 4 top (karambol) bilardo." },
      { q: "Hesabımı silebilir miyim?", a: "Evet, Menü → Hesabı Sil üzerinden uygulama içinde kalıcı olarak silebilirsiniz." },
    ],
    ctaTitle: "Hemen başlayın",
    ctaBody: "Cebinizdeki bilardo skor tablosu — RANKUE.",
    langLabel: "Dil",
    home: "Ana sayfa",
    support: "Destek",
    privacy: "Gizlilik Politikası",
  },
  es: {
    metaTitle: "Acerca de RANKUE · El marcador de billar en tu bolsillo",
    metaDesc: "RANKUE es un marcador de billar en tu bolsillo. Anota en el teléfono con un toque, calcula automáticamente entradas, promedio y mejor serie, empareja con rivales y guarda tus registros y rankings.",
    h1: "¿Qué es RANKUE?",
    tagline: "El marcador de billar en tu bolsillo",
    intro: "RANKUE convierte tu teléfono en un marcador de billar. Anota con unos toques, calcula automáticamente entradas, promedio y mejor serie, con avisos por voz. Desde practicar solo hasta partidas con rivales, más registros y rankings — todo en un solo lugar.",
    whatTitle: "Qué puedes hacer",
    whatBody: "Anota en el teléfono sin cálculos mentales. Las entradas, el promedio y la mejor serie se suman automáticamente, con deshacer y guía por voz. Al terminar la partida se guarda en tu registro, y puedes jugar con rivales y clubes de tu nivel.",
    featuresTitle: "Funciones clave",
    features: [
      { name: "Marcador de bolsillo", desc: "Anota con un toque. Entradas, promedio y mejor serie automáticos, avisos por voz y deshacer." },
      { name: "Partidas", desc: "Juegos 1:1 con un rival. Un código PIN le permite unirse al mismo marcador." },
      { name: "Registro de partidas", desc: "Cada partida se guarda automáticamente — registro, promedio y mejor serie de un vistazo." },
      { name: "Clubes", desc: "Crea o únete a clubes de billar y comparte actividades, fotos y chat." },
      { name: "Simulador", desc: "Practica 3 bolas / 4 bolas en solitario en una mesa virtual en pantalla." },
      { name: "Rankings", desc: "Clasificaciones por local y nacionales para 3 bandas y 4 bolas." },
    ],
    whyTitle: "¿Por qué RANKUE?",
    whyBody: "Reemplaza el papel y la calculadora del billar con un solo teléfono. Como tus partidas se guardan, ves tu progreso y te emparejas con otros. El billar, más fácil y más divertido.",
    howTitle: "Cómo empezar",
    how: [
      "Instala la app e ingresa con tu número de teléfono o una cuenta social",
      "Abre el marcador y empieza a anotar — práctica o partida",
      "Al terminar, se guarda en tu registro automáticamente",
      "Desafía los rankings con rivales y clubes",
    ],
    faqTitle: "Preguntas frecuentes",
    faq: [
      { q: "¿RANKUE es gratis?", a: "Sí, es gratis y está disponible en iOS y Android." },
      { q: "¿Cómo anoto los puntos?", a: "Toca el marcador en pantalla para introducir los puntos; las entradas, el promedio y la mejor serie se calculan automáticamente con avisos por voz, y puedes deshacer." },
      { q: "¿Qué disciplinas admite?", a: "Billar carambola a 3 bandas y 4 bolas." },
      { q: "¿Puedo eliminar mi cuenta?", a: "Sí, puedes eliminarla permanentemente en la app desde Menú → Eliminar cuenta." },
    ],
    ctaTitle: "Empieza ahora",
    ctaBody: "El marcador de billar en tu bolsillo — RANKUE.",
    langLabel: "Idioma",
    home: "Inicio",
    support: "Soporte",
    privacy: "Política de privacidad",
  },
  ja: {
    metaTitle: "RANKUE（랭큐）とは · 手のひらのビリヤード得点板",
    metaDesc: "RANKUEは手のひらのビリヤード得点板。スマホでタップして得点を記録し、イニング・アベレージ・ハイランを自動計算、相手とマッチングして記録・ランキングを残せます。",
    h1: "RANKUE（랭큐）とは？",
    tagline: "手のひらのビリヤード得点板",
    intro: "RANKUEはスマホがビリヤードの得点板になるアプリです。数タップで得点を記録し、イニング・アベレージ・ハイランを自動計算、音声で案内します。ひとり練習から相手とのマッチング対戦、記録・ランキングまで一つに。",
    whatTitle: "できること",
    whatBody: "暗算なしでスマホに得点を記録。イニング・アベレージ・ハイランが自動集計され、取り消しや音声案内も。試合が終わると記録に残り、実力の合う相手やクルーと楽しめます。",
    featuresTitle: "主な機能",
    features: [
      { name: "手のひらの得点板", desc: "タップで簡単に得点記録。イニング・アベレージ・ハイランの自動計算、音声案内、取り消しまで。" },
      { name: "マッチング対戦", desc: "相手と1対1の対戦。PINコードで同じ得点板に参加。" },
      { name: "対戦記録", desc: "すべての試合を自動保存。記録・アベレージ・ハイランを一目で。" },
      { name: "クルー", desc: "ビリヤードの同好会を作成・参加し、活動・写真・チャットで一緒に。" },
      { name: "シミュレーター", desc: "画面上の仮想台で3つ玉・4つ玉をひとり練習。" },
      { name: "ランキング", desc: "店舗別・全国の3クッション・4つ玉ランキング。" },
    ],
    whyTitle: "なぜRANKUE？",
    whyBody: "ビリヤード場の紙や電卓を、スマホひとつに。記録が残るので上達が見え、相手とのマッチングもできます。ビリヤードをもっと手軽に、もっと楽しく。",
    howTitle: "始め方",
    how: [
      "アプリをインストールし、電話番号またはソーシャルアカウントで入場",
      "得点板を開いてすぐ記録 — ひとり練習またはマッチング対戦",
      "試合が終わると自動で記録に保存",
      "ライバル・クルーと一緒にランキングへ挑戦",
    ],
    faqTitle: "よくある質問",
    faq: [
      { q: "RANKUEは無料ですか？", a: "はい、無料で利用でき、iOSとAndroidの両方で使えます。" },
      { q: "得点はどうやって記録しますか？", a: "画面の得点板をタップして得点を入力すると、イニング・アベレージ・ハイランが自動計算され音声で案内、取り消しもできます。" },
      { q: "対応種目は？", a: "3クッションと4つ玉（キャロム）ビリヤードです。" },
      { q: "アカウントは削除できますか？", a: "はい、アプリのメニュー →アカウント削除から完全に削除できます。" },
    ],
    ctaTitle: "今すぐ始めよう",
    ctaBody: "手のひらのビリヤード得点板、RANKUE。",
    langLabel: "言語",
    home: "ホーム",
    support: "サポート",
    privacy: "プライバシーポリシー",
  },
  zh: {
    metaTitle: "关于 RANKUE（랭큐）· 掌上台球记分板",
    metaDesc: "RANKUE 是掌上台球记分板。用手机轻点记分，自动计算局数、平均和最高连续得分，匹配对手并保存记录与排名。",
    h1: "RANKUE（랭큐）是什么？",
    tagline: "掌上台球记分板",
    intro: "RANKUE 让手机变成台球记分板。轻点几下即可记分，自动计算局数、平均和最高连续得分，并有语音提示。从单人练习到与对手的匹配对战，以及记录与排名，一应俱全。",
    whatTitle: "你可以做什么",
    whatBody: "无需心算，用手机记分即可。局数、平均和最高连续得分自动统计，还有撤销和语音提示。比赛结束后自动存入记录，你还能与水平相近的对手和俱乐部一起玩。",
    featuresTitle: "核心功能",
    features: [
      { name: "掌上记分板", desc: "轻点记分。自动计算局数、平均、最高连续得分，语音提示与撤销。" },
      { name: "匹配对战", desc: "与对手 1 对 1。用 PIN 码让对方进入同一记分板。" },
      { name: "比赛记录", desc: "每场比赛自动保存——记录、平均和最高连续得分一目了然。" },
      { name: "俱乐部", desc: "创建或加入台球俱乐部，分享活动、照片并聊天。" },
      { name: "模拟器", desc: "在屏幕上的虚拟台球桌单人练习三球 / 四球。" },
      { name: "排名", desc: "门店与全国的三库、四球排行榜。" },
    ],
    whyTitle: "为什么选 RANKUE？",
    whyBody: "把台球厅里的纸和计算器换成一部手机。因为比赛都被保存，你能看到自己的进步，也能与他人匹配。让台球更轻松、更有趣。",
    howTitle: "如何开始",
    how: [
      "安装应用，用手机号或社交账号进入",
      "打开记分板即可记分——单人练习或匹配对战",
      "比赛结束后自动存入记录",
      "与对手和俱乐部一起冲击排名",
    ],
    faqTitle: "常见问题",
    faq: [
      { q: "RANKUE 免费吗？", a: "是的，免费使用，iOS 和 Android 均可。" },
      { q: "如何记分？", a: "在屏幕上的记分板轻点输入得分，局数、平均和最高连续得分会自动计算并语音提示，还可撤销。" },
      { q: "支持哪些项目？", a: "三库和四球（开伦）台球。" },
      { q: "可以删除账号吗？", a: "可以，在应用的 菜单 → 删除账号 中永久删除。" },
    ],
    ctaTitle: "立即开始",
    ctaBody: "掌上台球记分板 —— RANKUE。",
    langLabel: "语言",
    home: "首页",
    support: "支持",
    privacy: "隐私政策",
  },
};
