/**
 * 큐 케이스 — 당구의 수집(2026-10-16 기획: docs/01-plan/features/billiards-cue-case.md).
 * 골프는 도장첩 · 볼마커, 등산은 정상 도장 · 와펜. 당구는 실제로 들고 다니는 **큐 케이스**에 담는다.
 *
 * 이 파일은 목록(무엇이 있고 · 어디에 속하고 · 무엇으로 받는가)만 안다. 받았는지는 서버가 기록을 읽어 정한다(server/storage/cueCase.repo).
 *  - 큐 77: 실전 전용 20 · 온라인 전용 24 · 공통 19 · 양쪽 7 · 크루 6 · 2단계(매장 QR) 1
 *  - 초크 16(같이 친 사람) · 장갑 16(달마다 12칸) · 페넌트 8(크루 홈)
 * 균형 규칙은 하나: **실전 공식 1판 = 온라인 대전 3판**(REAL_TO_ONLINE). 실전은 공식 경기만, 온라인은 레이팅에 반영된 대전만 센다.
 * 그림: client/public/billiards/case/<kind>/<img>.webp(docs/.../billiards-cue-case/tools/export.py 가 따내고 굵기를 맞춘 것).
 * 이름은 다섯 언어(당구는 모든 언어 화면). 조건 글은 cueHow 가 규칙에서 만든다.
 * ⚠️ 서버가 부른다 — 상대 임포트는 ./x.js.
 */
import type { TierId } from "./sim/rank.js";

export type CaseLocale = "ko" | "en" | "es" | "vi" | "tr";
export type Names = Readonly<Record<CaseLocale, string>>;
export type CaseKind = "cue" | "chalk" | "glove" | "pennant";
/** 큐가 속한 칸 — 화면의 탭 */
export type CueGroup = "real" | "online" | "common" | "both" | "crew" | "stage2" | "limited";

/** 실전 공식 1판 = 온라인 대전 3판 */
export const REAL_TO_ONLINE = 3;
/** 실전 하이런 — 4구는 3쿠션 구간의 두 배(기획 4.1 "4구는 구간을 따로": 운영 기록의 최고가 3쿠션 5 · 4구 25) */
export const REAL_RUN_4C = 2;

export type Rule =
    | { k: "realGames"; n: number } | { k: "realRun"; n: number }
    | { k: "realScene"; s: "finisher" | "shutout" | "comeback" | "noMiss" | "overTarget" | "damaUp" }
    | { k: "realRegular"; n: number } | { k: "realNewFace"; n: number }
    | { k: "hidden"; s: "jjajang" | "dawn" | "triple3" | "anniversary" }
    | { k: "onTier"; tier: TierId } | { k: "onCup"; place: 1 | 2 | 4 } | { k: "onMonthTop" }
    | { k: "onWins"; n: number } | { k: "onGames"; n: number } | { k: "onRun"; n: number }
    | { k: "bank"; n: number } | { k: "fiveCushion" } | { k: "streak"; n: number } | { k: "onComeback" } | { k: "rival"; n: number }
    | { k: "season"; s: Season } | { k: "sagunja"; s: Season }
    | { k: "people"; n: number }
    | { k: "both"; s: "firstWins" | "sameMonth" | "run10" | "people30" | "games100" | "gloves12" | "gold" }
    | { k: "crew"; s: "cupWin" | "cupRunner" | "regular" | "founder" | "battle" | "hundred" }
    | { k: "stores"; n: number }
    | { k: "seasonPeople"; s: Season; n: number } | { k: "world" } | { k: "sameOpp"; n: number } | { k: "crewBattle" }
    | { k: "glove"; m: number } | { k: "gloveFirst" } | { k: "gloveYear" } | { k: "gloveCrew"; n: number } | { k: "gloveCup" }
    | { k: "pennant"; s: "games100" | "games500" | "cup5" | "cup20" | "battle10" | "regular" | "crewOfMonth" | "stores5" }
    | { k: "limited"; s: LimitedRule }
    /** 친구 초대(2026-10-16) — 내 초대 링크 · 코드로 **새로 가입한** 사람 수(가입만 센다 — 오너) · 친구의 초대로 가입했다 */
    | { k: "invite"; n: number } | { k: "invited" }
    /** 친구 30명마다 한 자루를 고른다(디자인마다 10자루) — 판정으로는 안 들어오고 고를 때만 들어온다 */
    | { k: "invitePick" };
/** 한정판 다섯(2026-10-16 오너: "열기 어려운 채는 수량 한정 넘버링 — 따로 새로 · 모두 99자루") */
export type LimitedRule = "doubleMaster" | "thousand" | "tripleCup" | "legendRun" | "fiveNations";
export type Season = "spring" | "summer" | "autumn" | "winter";

export interface CaseItem {
    /** 목록의 id — 받은 기록의 열쇠(바꾸지 않는다) */
    id: string;
    kind: CaseKind;
    /** 큐만 — 탭 */
    group?: CueGroup;
    /** 그림 이름(client/public/billiards/case/<kind>/<img>.webp) */
    img: string;
    name: Names;
    rule: Rule;
    /** 받기 전에는 조건을 감춘다('?') */
    hidden?: boolean;
    /** 온라인에서 받는 것 — 그림에 청록 네온 링, 화면에 '온라인' */
    online?: boolean;
    /** 한정판 — 이 수만큼만 번호가 나가고, 다 나가면 다시 열리지 않는다(완판) */
    limit?: number;
}

const N = (ko: string, en: string, es: string, vi: string, tr: string): Names => ({ ko, en, es, vi, tr });
/** id 는 칸마다 머리말이 다르다(실전 cue- · 온라인 cue-on- · 크루 cue-crew-) — 실전과 온라인에 같은 이름(50판 · 하이런 · 역전)이 있다 */
const CUE_PREFIX: Readonly<Record<CueGroup, string>> = { real: "cue-", online: "cue-on-", common: "cue-", both: "cue-", crew: "cue-crew-", stage2: "cue-", limited: "cue-lt-" };
/** 친구 초대 단계(2026-10-16 오너: 1명 초크 · 3명 장갑 · 10명 큐 · 30명 한정) */
export const INVITE_STEPS = [1, 3, 10, 30] as const;
/** 초대 한정 — 30명마다 한 자루를 고르고, 디자인마다 10자루(오너: "모두 선택 가능하고 각각 10개 넘버링") */
export const INVITE_PICK_EVERY = INVITE_STEPS[3];
export const INVITE_PICK_LIMIT = 10;
export const invitePicks = (invites: number, used: number): { total: number; left: number } => {
    const total = Math.floor(Math.max(0, invites) / INVITE_PICK_EVERY);
    return { total, left: Math.max(0, total - used) };
};
/** 한정판 한 자루의 수 — 모두 99(오너 10/16) */
export const LIMITED_COUNT = 99;
const cue = (group: CueGroup, id: string, img: string, name: Names, rule: Rule, extra: Partial<CaseItem> = {}): CaseItem => ({ id: `${CUE_PREFIX[group]}${id}`, kind: "cue", group, img, name, rule, ...(group === "online" ? { online: true } : {}), ...extra });

export const CUES: readonly CaseItem[] = [
    // ── 실전 전용 20 ─────────────────────────────────────────
    cue("real", "first", "games-10", N("민무늬 메이플", "Plain Maple", "Arce liso", "Phong trơn", "Düz Akçaağaç"), { k: "realGames", n: 1 }),
    cue("real", "games-50", "games-50", N("체리 포인트", "Cherry Points", "Puntas de cerezo", "Mũi gỗ anh đào", "Kiraz Uçlar"), { k: "realGames", n: 50 }),
    cue("real", "games-100", "games-100", N("월넛 다이아", "Walnut Diamond", "Diamante de nogal", "Kim cương óc chó", "Ceviz Elmas"), { k: "realGames", n: 100 }),
    cue("real", "games-300", "games-300", N("레드 진주 점", "Red Pearl Dots", "Perlas en rojo", "Chấm ngọc đỏ", "Kırmızı İnci Noktalar"), { k: "realGames", n: 300 }),
    cue("real", "games-500", "games-500", N("흑단 금테", "Ebony Gold Band", "Ébano anillo dorado", "Mun viền vàng", "Abanoz Altın Bant"), { k: "realGames", n: 500 }),
    cue("real", "games-1000", "games-1000", N("흑단 금세공", "Ebony Filigree", "Ébano filigrana", "Mun chạm vàng", "Abanoz Telkari"), { k: "realGames", n: 1000 }),
    cue("real", "run-5", "run-5", N("작은 불꽃", "Spark Flame", "Llama pequeña", "Ngọn lửa nhỏ", "Küçük Alev"), { k: "realRun", n: 5 }),
    cue("real", "run-10", "run-10", N("타오르는 불꽃", "Wildfire", "Llamarada", "Lửa bùng", "Yangın"), { k: "realRun", n: 10 }),
    cue("real", "run-15", "run-15", N("푸른 번개", "Blue Lightning", "Rayo azul", "Sét xanh", "Mavi Şimşek"), { k: "realRun", n: 15 }),
    cue("real", "run-20", "run-20", N("보랏빛 벼락", "Violet Thunderbolt", "Relámpago violeta", "Tia sét tím", "Mor Yıldırım"), { k: "realRun", n: 20 }),
    cue("real", "finisher", "finisher", N("흑단 화살", "Ebony Arrow", "Flecha de ébano", "Mũi tên mun", "Abanoz Ok"), { k: "realScene", s: "finisher" }),
    cue("real", "shutout", "shutout", N("진주 방패", "Pearl Shield", "Escudo de nácar", "Khiên xà cừ", "İnci Kalkan"), { k: "realScene", s: "shutout" }),
    cue("real", "comeback", "comeback", N("노을 지그재그", "Sunset Zigzag", "Zigzag atardecer", "Zigzag hoàng hôn", "Gün Batımı Zikzak"), { k: "realScene", s: "comeback" }),
    cue("real", "no-miss", "no-miss", N("백자 결", "White Birdseye", "Ojo de pájaro blanco", "Vân mắt chim trắng", "Beyaz Kuş Gözü"), { k: "realScene", s: "noMiss" }),
    cue("real", "over-target", "over-target", N("초록 V무늬", "Green Chevron", "Galón verde", "Chữ V xanh lá", "Yeşil Şerit"), { k: "realScene", s: "overTarget" }),
    cue("real", "dama-up", "dama-up", N("푸른 구슬", "Blue Beads", "Cuentas azules", "Hạt cườm xanh", "Mavi Boncuklar"), { k: "realScene", s: "damaUp" }),
    cue("real", "regular", "regular", N("가죽 리벳", "Leather & Rivets", "Cuero y remaches", "Da đinh tán", "Deri Perçin"), { k: "realRegular", n: 30 }),
    cue("real", "new-face", "new-face", N("점 고리", "Ring of Dots", "Anillo de puntos", "Vòng chấm", "Nokta Halkası"), { k: "realNewFace", n: 10 }),
    cue("real", "jjajang", "jjajang", N("교차 젓가락", "Crossed Chopsticks", "Palillos cruzados", "Đũa bắt chéo", "Çapraz Çubuklar"), { k: "hidden", s: "jjajang" }, { hidden: true }),
    cue("real", "dawn", "dawn", N("새벽달", "Dawn Moon", "Luna del alba", "Trăng rạng sáng", "Şafak Ayı"), { k: "hidden", s: "dawn" }, { hidden: true }),
    // ── 온라인 전용 24 ───────────────────────────────────────
    cue("online", "tier-iron", "tier-iron", N("아이언", "Iron", "Hierro", "Sắt", "Demir"), { k: "onTier", tier: "iron" }),
    cue("online", "tier-bronze", "tier-bronze", N("브론즈", "Bronze", "Bronce", "Đồng", "Bronz"), { k: "onTier", tier: "bronze" }),
    cue("online", "tier-silver", "tier-silver", N("실버", "Silver", "Plata", "Bạc", "Gümüş"), { k: "onTier", tier: "silver" }),
    cue("online", "tier-gold", "tier-gold", N("골드", "Gold", "Oro", "Vàng", "Altın"), { k: "onTier", tier: "gold" }),
    cue("online", "tier-platinum", "tier-platinum", N("플래티넘", "Platinum", "Platino", "Bạch kim", "Platin"), { k: "onTier", tier: "platinum" }),
    cue("online", "tier-diamond", "tier-diamond", N("다이아몬드", "Diamond", "Diamante", "Kim cương", "Elmas"), { k: "onTier", tier: "diamond" }),
    cue("online", "tier-master", "tier-master", N("마스터", "Master", "Maestro", "Bậc thầy", "Usta"), { k: "onTier", tier: "master" }),
    cue("online", "cup-champion", "cup-champion", N("월대회 우승", "Cup Champion", "Campeón de copa", "Vô địch cúp", "Kupa Şampiyonu"), { k: "onCup", place: 1 }),
    cue("online", "cup-runnerup", "cup-runnerup", N("월대회 준우승", "Cup Runner-up", "Subcampeón", "Á quân cúp", "Kupa İkincisi"), { k: "onCup", place: 2 }),
    cue("online", "cup-semi", "cup-semi", N("월대회 4강", "Cup Semi-finalist", "Semifinalista", "Bán kết cúp", "Kupa Yarı Finalisti"), { k: "onCup", place: 4 }),
    cue("online", "month-top", "month-top", N("이달의 1위", "Player of the Month", "Número 1 del mes", "Số 1 của tháng", "Ayın Birincisi"), { k: "onMonthTop" }),
    cue("online", "first-win", "online-first-win", N("청록 별", "Teal Star", "Estrella turquesa", "Ngôi sao xanh ngọc", "Turkuaz Yıldız"), { k: "onWins", n: 1 }),
    cue("online", "games-50", "on-games-50", N("다섯 고리", "Five Rings", "Cinco anillos", "Năm vòng", "Beş Halka"), { k: "onGames", n: 50 }),
    cue("online", "games-300", "on-games-300", N("금속 그립", "Steel Grip", "Empuñadura de acero", "Tay cầm thép", "Çelik Kavrama"), { k: "onGames", n: 300 }),
    cue("online", "wins-100", "online-100", N("네온 회로", "Neon Circuit", "Circuito neón", "Mạch neon", "Neon Devre"), { k: "onWins", n: 100 }),
    cue("online", "run-5", "on-run-5", N("청록 불씨", "Teal Ember", "Brasa turquesa", "Tàn lửa xanh ngọc", "Turkuaz Kor"), { k: "onRun", n: 5 }),
    cue("online", "run-10", "on-run-10", N("청록 불꽃", "Teal Flame", "Llama turquesa", "Lửa xanh ngọc", "Turkuaz Alev"), { k: "onRun", n: 10 }),
    cue("online", "run-15", "on-run-15", N("보라 전격", "Violet Surge", "Descarga violeta", "Luồng điện tím", "Mor Akım"), { k: "onRun", n: 15 }),
    cue("online", "bank-first", "bank-first", N("뱅크 궤적", "Bank Line", "Trayectoria de banda", "Đường băng", "Bant İzi"), { k: "bank", n: 1 }),
    cue("online", "bank-50", "bank-50", N("금선 별빛", "Gold Starburst", "Estallido dorado", "Tia sao vàng", "Altın Yıldız Patlaması"), { k: "bank", n: 50 }),
    cue("online", "five-cushion", "five-cushion", N("다섯 꺾임", "Five Rails", "Cinco quiebres", "Năm khúc gãy", "Beş Kırılma"), { k: "fiveCushion" }),
    cue("online", "streak", "online-streak", N("청록 메달리온", "Teal Medallion", "Medallón turquesa", "Huy chương xanh ngọc", "Turkuaz Madalyon"), { k: "streak", n: 5 }),
    cue("online", "comeback", "on-comeback", N("청록 지그재그", "Teal Zigzag", "Zigzag turquesa", "Zigzag xanh ngọc", "Turkuaz Zikzak"), { k: "onComeback" }),
    cue("online", "rival", "rival", N("마주 선 별", "Facing Stars", "Estrellas enfrentadas", "Hai ngôi sao đối mặt", "Karşılıklı Yıldızlar"), { k: "rival", n: 10 }),
    // ── 공통(합산) 19 ────────────────────────────────────────
    cue("common", "spring", "spring", N("벚꽃 가지", "Cherry Blossom Branch", "Rama de cerezo", "Cành anh đào", "Kiraz Dalı"), { k: "season", s: "spring" }),
    cue("common", "summer", "summer", N("청록 파도", "Teal Wave", "Ola turquesa", "Sóng xanh ngọc", "Turkuaz Dalga"), { k: "season", s: "summer" }),
    cue("common", "autumn", "autumn", N("단풍잎", "Maple Leaves", "Hojas de arce", "Lá phong", "Akçaağaç Yaprakları"), { k: "season", s: "autumn" }),
    cue("common", "winter", "winter", N("눈 덮인 솔", "Snowy Pine", "Pino nevado", "Thông phủ tuyết", "Karlı Çam"), { k: "season", s: "winter" }),
    cue("common", "plum", "kr-plum", N("매(梅)", "Plum Blossom", "Ciruelo", "Hoa mai", "Erik Çiçeği"), { k: "sagunja", s: "spring" }),
    cue("common", "orchid", "kr-orchid", N("난(蘭)", "Orchid", "Orquídea", "Hoa lan", "Orkide"), { k: "sagunja", s: "summer" }),
    cue("common", "chrysanthemum", "kr-chrysanthemum", N("국(菊)", "Chrysanthemum", "Crisantemo", "Hoa cúc", "Kasımpatı"), { k: "sagunja", s: "autumn" }),
    cue("common", "bamboo", "kr-bamboo", N("죽(竹)", "Bamboo", "Bambú", "Trúc", "Bambu"), { k: "sagunja", s: "winter" }),
    cue("common", "triple-three", "triple-three", N("세 마름모", "Three Diamonds", "Tres rombos", "Ba hình thoi", "Üç Baklava"), { k: "hidden", s: "triple3" }, { hidden: true }),
    cue("common", "anniversary", "anniversary", N("리본 별", "Ribbon Star", "Estrella con lazo", "Sao ruy băng", "Kurdeleli Yıldız"), { k: "hidden", s: "anniversary" }, { hidden: true }),
    cue("common", "dancheong", "kr-dancheong", N("단청", "Dancheong", "Dancheong", "Dancheong", "Dancheong"), { k: "people", n: 1 }),
    cue("common", "munsal", "kr-munsal", N("한옥 문살", "Hanok Lattice", "Celosía hanok", "Song cửa Hanok", "Hanok Kafesi"), { k: "people", n: 3 }),
    cue("common", "lantern", "kr-lantern", N("청사초롱", "Silk Lantern", "Farol de seda", "Đèn lồng lụa", "İpek Fener"), { k: "people", n: 5 }),
    cue("common", "sipjangsaeng", "kr-sipjangsaeng", N("십장생", "Ten Longevity", "Diez longevidades", "Thập trường sinh", "On Uzun Ömür"), { k: "people", n: 10 }),
    cue("common", "moonjar", "kr-moonjar", N("달항아리", "Moon Jar", "Vasija luna", "Bình trăng", "Ay Küpü"), { k: "people", n: 20 }),
    cue("common", "celadon", "kr-celadon", N("고려청자", "Goryeo Celadon", "Celadón Goryeo", "Gốm men ngọc Goryeo", "Goryeo Seladonu"), { k: "people", n: 30 }),
    cue("common", "hahoe", "kr-hahoe", N("하회탈", "Hahoe Mask", "Máscara Hahoe", "Mặt nạ Hahoe", "Hahoe Maskesi"), { k: "people", n: 50 }),
    cue("common", "turtleship", "kr-turtleship", N("거북선", "Turtle Ship", "Barco tortuga", "Thuyền rùa", "Kaplumbağa Gemisi"), { k: "people", n: 100 }),
    cue("common", "jogakbo", "kr-jogakbo", N("조각보", "Jogakbo Patchwork", "Retazos jogakbo", "Vải chắp Jogakbo", "Jogakbo Yama"), { k: "people", n: 200 }),
    // 친구 초대 10명 — 초대 묶음은 만화 그림(맨 위 한정 '말랑 큐볼'과 같은 큐볼 친구들)
    cue("common", "invite-10", "invite-10", N("큐볼 삼총사", "Cue Ball Trio", "Trío de bolas", "Bộ ba bi cái", "Top Üçlüsü"), { k: "invite", n: 10 }),
    // ── 양쪽(둘 다) 7 ────────────────────────────────────────
    cue("both", "saekdong", "kr-saekdong", N("색동", "Saekdong Stripes", "Rayas saekdong", "Sọc Saekdong", "Saekdong Çizgileri"), { k: "both", s: "firstWins" }),
    cue("both", "minhwa-tiger", "kr-minhwa-tiger", N("민화 호랑이", "Folk Tiger", "Tigre popular", "Hổ tranh dân gian", "Halk Kaplanı"), { k: "both", s: "sameMonth" }),
    cue("both", "najeon-peony", "kr-najeon-peony", N("나전 모란", "Pearl Peony", "Peonía de nácar", "Mẫu đơn khảm xà cừ", "Sedef Şakayık"), { k: "both", s: "run10" }),
    cue("both", "najeon-crane", "kr-najeon-crane", N("나전 학", "Pearl Crane", "Grulla de nácar", "Hạc khảm xà cừ", "Sedef Turna"), { k: "both", s: "people30" }),
    cue("both", "ilwol", "kr-ilwol", N("일월오봉도", "Sun, Moon and Five Peaks", "Sol, luna y cinco picos", "Nhật nguyệt ngũ phong", "Güneş, Ay ve Beş Tepe"), { k: "both", s: "games100" }),
    cue("both", "silla-crown", "kr-silla-crown", N("신라 금관", "Silla Gold Crown", "Corona de oro Silla", "Vương miện vàng Silla", "Silla Altın Tacı"), { k: "both", s: "gloves12" }),
    cue("both", "baekho", "kr-baekho", N("백호", "White Tiger", "Tigre blanco", "Bạch hổ", "Beyaz Kaplan"), { k: "both", s: "gold" }),
    // ── 크루 6 ───────────────────────────────────────────────
    cue("crew", "cup-win", "crew-champion", N("붉은 월계관", "Crimson Laurel", "Laurel carmesí", "Vòng nguyệt quế đỏ", "Kızıl Defne"), { k: "crew", s: "cupWin" }),
    cue("crew", "cup-runner", "crew-runnerup", N("은빛 월계관", "Silver Laurel", "Laurel plateado", "Vòng nguyệt quế bạc", "Gümüş Defne"), { k: "crew", s: "cupRunner" }),
    cue("crew", "regular", "crew-regular", N("삼각 깃발", "Pennant Flags", "Banderines", "Cờ tam giác", "Flama Bayraklar"), { k: "crew", s: "regular" }),
    cue("crew", "founder", "crew-founder", N("창립의 열쇠", "Founder's Key", "Llave fundadora", "Chìa khóa sáng lập", "Kurucu Anahtarı"), { k: "crew", s: "founder" }),
    cue("crew", "battle", "crew-battle", N("맞선 깃발", "Crossed Flags", "Banderas cruzadas", "Cờ bắt chéo", "Çapraz Bayraklar"), { k: "crew", s: "battle" }),
    cue("crew", "hundred", "crew-hundred", N("금빛 매듭", "Golden Knot", "Nudo dorado", "Nút thắt vàng", "Altın Düğüm"), { k: "crew", s: "hundred" }),
    // ── 한정판 6 — 자루마다 99개, 선착순 번호, 다 나가면 완판 ──────
    // 맨 위 — 친구 30명 초대(2026-10-16 오너: "바이럴에 중요해서 진짜 가지고 싶은 디자인 · 제일 중요한 아이템")
    // → 만화풍 여섯 + 고급 공예풍 여섯, 30명마다 하나를 골라 갖는다(디자인마다 10자루 · No.01~10)
    ...([
        ["jelly", N("말랑 큐볼", "Jelly Cue Ball", "Bola de gelatina", "Bi thạch dẻo", "Jöle Top")],
        ["octopus", N("문어 포옹", "Octopus Hug", "Abrazo de pulpo", "Cái ôm bạch tuộc", "Ahtapot Sarılması")],
        ["cheer", N("응원단", "Cheer Squad", "Porra animadora", "Đội cổ vũ", "Tezahürat Ekibi")],
        ["doodle", N("형광 낙서", "Neon Doodles", "Garabatos neón", "Hình vẽ neon", "Neon Karalamalar")],
        ["bubble", N("물방울 수조", "Bubble Tank", "Pecera de burbujas", "Bể bong bóng", "Baloncuk Akvaryum")],
        ["melty", N("녹는 딸기바", "Melty Strawberry", "Fresa derretida", "Kem dâu tan chảy", "Eriyen Çilek")],
        ["pearl", N("백진주 별자리", "Pearl Constellation", "Constelación de perla", "Chòm sao ngọc trai", "İnci Takımyıldızı")],
        ["aurora", N("오로라 전복", "Aurora Abalone", "Abulón aurora", "Bào ngư cực quang", "Aurora Deniz Kulağı")],
        ["phoenix", N("나전 봉황", "Pearl Phoenix", "Fénix de nácar", "Phượng hoàng khảm xà cừ", "Sedef Anka")],
        ["thirty", N("서른 빛 띠", "Thirty Lights", "Treinta luces", "Ba mươi sắc", "Otuz Işık")],
        ["galaxy", N("은하수", "Milky Way", "Vía Láctea", "Dải Ngân Hà", "Samanyolu")],
        ["rings", N("이어진 고리", "Linked Rings", "Anillos enlazados", "Vòng nối kết", "Bağlı Halkalar")],
    ] as const).map(([k, name]) => cue("limited", `inv-${k}`, `lt-inv-${k}`, name, { k: "invitePick" }, { limit: INVITE_PICK_LIMIT })),
    cue("limited", "double-master", "lt-double-master", N("더블 마스터", "Double Master", "Doble Maestro", "Song bậc thầy", "Çifte Usta"), { k: "limited", s: "doubleMaster" }, { limit: LIMITED_COUNT, online: false }),
    cue("limited", "thousand", "lt-thousand", N("천 판의 장인", "Master of a Thousand", "Maestro de mil", "Bậc thầy nghìn trận", "Bin Maçın Ustası"), { k: "limited", s: "thousand" }, { limit: LIMITED_COUNT }),
    cue("limited", "triple-cup", "lt-triple-cup", N("삼관왕", "Triple Crown", "Triple corona", "Ba vương miện", "Üçlü Taç"), { k: "limited", s: "tripleCup" }, { limit: LIMITED_COUNT }),
    cue("limited", "legend-run", "lt-legend-run", N("레전드 런", "Legend Run", "Serie legendaria", "Chuỗi huyền thoại", "Efsane Seri"), { k: "limited", s: "legendRun" }, { limit: LIMITED_COUNT }),
    cue("limited", "five-nations", "lt-five-nations", N("다섯 나라", "Five Nations", "Cinco naciones", "Năm quốc gia", "Beş Ülke"), { k: "limited", s: "fiveNations" }, { limit: LIMITED_COUNT }),
    // ── 2단계(매장 QR) 1 ─────────────────────────────────────
    cue("stage2", "traveller", "traveller", N("나침반", "Compass Rose", "Rosa de los vientos", "La bàn", "Pusula Gülü"), { k: "stores", n: 5 }),
];

const chalk = (id: string, img: string, name: Names, rule: Rule, extra: Partial<CaseItem> = {}): CaseItem => ({ id: `chalk-${id}`, kind: "chalk", img, name, rule, ...extra });
/** 사람 초크 아홉 — 그림은 원래 권역별로 그렸지만 지역을 뺐으므로 무늬로만 부른다(기획 2장) */
export const PEOPLE_STEPS = [1, 3, 5, 10, 20, 30, 50, 100, 200] as const;
export const CHALKS: readonly CaseItem[] = [
    chalk("palace", "seoul", N("궁궐 초크", "Palace Chalk", "Tiza palacio", "Phấn cung điện", "Saray Tebeşiri"), { k: "people", n: 1 }),
    chalk("hill", "gyeonggi", N("언덕 초크", "Hill Chalk", "Tiza colina", "Phấn đồi", "Tepe Tebeşiri"), { k: "people", n: 3 }),
    chalk("wave", "incheon", N("파도 초크", "Wave Chalk", "Tiza ola", "Phấn sóng", "Dalga Tebeşiri"), { k: "people", n: 5 }),
    chalk("pine", "gangwon", N("솔숲 초크", "Pine Chalk", "Tiza pino", "Phấn rừng thông", "Çam Tebeşiri"), { k: "people", n: 10 }),
    chalk("field", "chungcheong", N("들판 초크", "Field Chalk", "Tiza campo", "Phấn cánh đồng", "Tarla Tebeşiri"), { k: "people", n: 20 }),
    chalk("bamboo", "jeolla", N("대나무 초크", "Bamboo Chalk", "Tiza bambú", "Phấn tre", "Bambu Tebeşiri"), { k: "people", n: 30 }),
    chalk("ridge", "gyeongsang", N("산마루 초크", "Ridge Chalk", "Tiza cresta", "Phấn đỉnh núi", "Sırt Tebeşiri"), { k: "people", n: 50 }),
    chalk("gull", "busan", N("갈매기 초크", "Gull Chalk", "Tiza gaviota", "Phấn hải âu", "Martı Tebeşiri"), { k: "people", n: 100 }),
    chalk("stonewall", "jeju", N("돌담 초크", "Stone Wall Chalk", "Tiza muro de piedra", "Phấn tường đá", "Taş Duvar Tebeşiri"), { k: "people", n: 200 }),
    chalk("spring", "spring", N("봄 초크", "Spring Chalk", "Tiza primavera", "Phấn mùa xuân", "Bahar Tebeşiri"), { k: "seasonPeople", s: "spring", n: 3 }),
    chalk("summer", "summer", N("여름 초크", "Summer Chalk", "Tiza verano", "Phấn mùa hạ", "Yaz Tebeşiri"), { k: "seasonPeople", s: "summer", n: 3 }),
    chalk("autumn", "autumn", N("가을 초크", "Autumn Chalk", "Tiza otoño", "Phấn mùa thu", "Sonbahar Tebeşiri"), { k: "seasonPeople", s: "autumn", n: 3 }),
    chalk("winter", "winter", N("겨울 초크", "Winter Chalk", "Tiza invierno", "Phấn mùa đông", "Kış Tebeşiri"), { k: "seasonPeople", s: "winter", n: 3 }),
    chalk("world", "first-trip", N("세계 원정 초크", "World Tour Chalk", "Tiza gira mundial", "Phấn chinh phục thế giới", "Dünya Turu Tebeşiri"), { k: "world" }, { online: true }),
    chalk("gold", "regular-gold", N("금 초크", "Gold Chalk", "Tiza de oro", "Phấn vàng", "Altın Tebeşir"), { k: "sameOpp", n: 100 }),
    chalk("crew", "crew", N("크루 초크", "Crew Chalk", "Tiza de crew", "Phấn nhóm", "Ekip Tebeşiri"), { k: "crewBattle" }),
    // 친구 초대 — 첫 초대 · 초대받은 사람의 환영 초크
    chalk("invite", "invite-1", N("안녕 초크", "Hello Chalk", "Tiza Hola", "Phấn Xin chào", "Merhaba Tebeşiri"), { k: "invite", n: INVITE_STEPS[0] }),
    chalk("welcome", "welcome", N("환영 초크", "Welcome Chalk", "Tiza de bienvenida", "Phấn chào mừng", "Hoş Geldin Tebeşiri"), { k: "invited" }),
];

const MONTH_NAMES: readonly Names[] = [
    N("눈꽃", "Snowflake", "Copo de nieve", "Bông tuyết", "Kar Tanesi"), N("동백", "Camellia", "Camelia", "Hoa trà", "Kamelya"),
    N("매화", "Plum Blossom", "Flor de ciruelo", "Hoa mơ", "Erik Çiçeği"), N("벚꽃", "Cherry Blossom", "Flor de cerezo", "Hoa anh đào", "Kiraz Çiçeği"),
    N("새잎", "New Leaves", "Hojas nuevas", "Lá non", "Taze Yapraklar"), N("수국", "Hydrangea", "Hortensia", "Cẩm tú cầu", "Ortanca"),
    N("파도", "Waves", "Olas", "Sóng biển", "Dalgalar"), N("해바라기", "Sunflower", "Girasol", "Hướng dương", "Ayçiçeği"),
    N("보름달", "Full Moon", "Luna llena", "Trăng rằm", "Dolunay"), N("코스모스", "Cosmos", "Cosmos", "Cúc vạn thọ tây", "Kozmos"),
    N("은행잎", "Ginkgo", "Ginkgo", "Lá bạch quả", "Ginkgo"), N("겨울 별", "Winter Star", "Estrella de invierno", "Sao mùa đông", "Kış Yıldızı"),
];
const glove = (id: string, img: string, name: Names, rule: Rule, extra: Partial<CaseItem> = {}): CaseItem => ({ id: `glove-${id}`, kind: "glove", img, name, rule, ...extra });
export const GLOVES: readonly CaseItem[] = [
    ...MONTH_NAMES.map((n, i) => glove(`m${String(i + 1).padStart(2, "0")}`, `m${String(i + 1).padStart(2, "0")}`, n, { k: "glove", m: i + 1 })),
    glove("first", "first", N("첫 장갑", "First Glove", "Primer guante", "Găng tay đầu tiên", "İlk Eldiven"), { k: "gloveFirst" }),
    glove("year-gold", "year-gold", N("연간 개근 금장갑", "Golden Glove of the Year", "Guante de oro del año", "Găng vàng chuyên cần", "Yılın Altın Eldiveni"), { k: "gloveYear" }),
    glove("crew", "crew", N("크루 장갑", "Crew Glove", "Guante de crew", "Găng tay nhóm", "Ekip Eldiveni"), { k: "gloveCrew", n: 10 }),
    glove("cup-entry", "cup-entry", N("월대회 출전 장갑", "Cup Entry Glove", "Guante de copa", "Găng dự cúp", "Kupa Katılım Eldiveni"), { k: "gloveCup" }, { online: true }),
    glove("invite", "invite-3", N("셋이 장갑", "Trio Glove", "Guante trío", "Găng bộ ba", "Üçlü Eldiven"), { k: "invite", n: INVITE_STEPS[1] }),
];

const pennant = (id: string, s: Extract<Rule, { k: "pennant" }>["s"], name: Names): CaseItem => ({ id: `pennant-${id}`, kind: "pennant", img: id, name, rule: { k: "pennant", s } });
export const PENNANTS: readonly CaseItem[] = [
    pennant("games-100", "games100", N("크루 안 100판", "100 Crew Games", "100 partidas", "100 trận nhóm", "100 Ekip Maçı")),
    pennant("games-500", "games500", N("크루 안 500판", "500 Crew Games", "500 partidas", "500 trận nhóm", "500 Ekip Maçı")),
    pennant("cup-5", "cup5", N("크루 대회 5회", "5 Crew Cups", "5 copas", "5 giải nhóm", "5 Ekip Kupası")),
    pennant("cup-20", "cup20", N("크루 대회 20회", "20 Crew Cups", "20 copas", "20 giải nhóm", "20 Ekip Kupası")),
    pennant("battle-10", "battle10", N("대항전 10승", "10 Crew Battle Wins", "10 duelos ganados", "10 trận đối kháng thắng", "10 Ekip Savaşı Galibiyeti")),
    pennant("regular", "regular", N("정모 개근", "Meetup Regulars", "Quedadas fijas", "Chuyên cần gặp mặt", "Buluşma Müdavimleri")),
    pennant("crew-of-month", "crewOfMonth", N("이달의 크루", "Crew of the Month", "Crew del mes", "Nhóm của tháng", "Ayın Ekibi")),
    pennant("store-trips", "stores5", N("매장 원정 5곳", "Five Hall Tour", "Gira de 5 salas", "Chinh phục 5 quán", "Beş Salon Turu")),
];

export type Stars = 1 | 2 | 3 | 4 | 5;
/**
 * 난이도 별(2026-10-16 오너: "팝업에 달성하기 어려운 거 별 다는 거 어때? 소유욕 더 생기고") — 조건이 얼마나 어려운가. 가진 사람 수(희귀함)와는 따로다.
 * 기준: ★1 첫 판이면 · ★2 몇 주 · ★3 한두 달 꾸준히 · ★4 실력이나 오래 · ★5 손꼽히는 몇 사람.
 */
export function difficulty(x: Pick<CaseItem, "rule">): Stars {
    const r = x.rule;
    const by = (n: number, steps: readonly (readonly [number, Stars])[]): Stars => { let v: Stars = 1; for (const [min, st] of steps) if (n >= min) v = st; return v; };
    switch (r.k) {
        case "realGames": return by(r.n, [[1, 1], [50, 2], [100, 2], [300, 3], [500, 4], [1000, 5]]);
        case "realRun": return by(r.n, [[5, 2], [10, 3], [15, 4], [20, 5]]);
        case "realScene": return r.s === "overTarget" || r.s === "damaUp" || r.s === "finisher" ? 2 : 3;
        case "realRegular": return 3;
        case "realNewFace": return 2;
        case "hidden": return r.s === "triple3" ? 4 : r.s === "dawn" ? 3 : 2;
        case "onTier": return ({ iron: 1, bronze: 1, silver: 2, gold: 3, platinum: 4, diamond: 5, master: 5 } as const)[r.tier];
        case "onCup": return r.place === 1 ? 5 : r.place === 2 ? 4 : 3;
        case "onMonthTop": return 4;
        case "onWins": return by(r.n, [[1, 1], [100, 4]]);
        case "onGames": return by(r.n, [[1, 1], [50, 2], [300, 4]]);
        case "onRun": return by(r.n, [[5, 2], [10, 4], [15, 5]]);
        case "bank": return by(r.n, [[1, 1], [50, 3]]);
        case "fiveCushion": case "streak": case "onComeback": case "rival": return 3;
        case "season": return 2;
        case "sagunja": return 4;
        case "people": return by(r.n, [[1, 1], [5, 2], [20, 3], [50, 4], [100, 5]]);
        case "both": return r.s === "firstWins" ? 2 : r.s === "sameMonth" ? 3 : r.s === "games100" || r.s === "gloves12" ? 5 : 4;
        case "crew": return r.s === "founder" ? 1 : r.s === "battle" ? 2 : r.s === "cupWin" || r.s === "hundred" ? 4 : 3;
        case "stores": return 3;
        case "seasonPeople": case "world": case "crewBattle": return 2;
        case "sameOpp": return 4;
        case "glove": return 2;
        case "gloveFirst": return 1;
        case "gloveYear": return 5;
        case "gloveCrew": return 3;
        case "gloveCup": return 2;
        case "pennant": return r.s === "games500" || r.s === "cup20" || r.s === "crewOfMonth" ? 5 : r.s === "battle10" || r.s === "regular" ? 4 : 3;
        case "limited": return 5;
        case "invite": return by(r.n, [[1, 1], [3, 2], [10, 3], [30, 5]]);
        case "invitePick": return 5;
        case "invited": return 1;
    }
}

export const CASE_ITEMS: readonly CaseItem[] = [...CUES, ...CHALKS, ...GLOVES, ...PENNANTS];
const BY_ID = new Map(CASE_ITEMS.map((x) => [x.id, x]));
export const caseItem = (id: string): CaseItem | null => BY_ID.get(id) ?? null;
export const caseImage = (x: Pick<CaseItem, "kind" | "img">) => `/billiards/case/${x.kind}/${x.img}.webp`;
export const CUE_GROUPS: readonly CueGroup[] = ["limited", "real", "online", "common", "both", "crew", "stage2"];

/**
 * 아직 받는 길을 열지 않은 것 — 목록 · 그림 · 조건 글만 먼저 보이고 '곧 열려요'.
 *  - 끝내기: '남은 점수를 한 번에'의 뜻을 오너와 맞출 것(이긴 사람은 늘 마지막 이닝에 남은 점수를 친다).
 *  (다마 넘김 · 다마 오름은 2026-10-16 부터 경기를 끝내는 순간에 적는다 — server/routes/modules/game.ts. 그 전 경기는 그때의 다마를 몰라 세지 않는다.)
 *  - 사군자: '한 해의 네 철'의 뜻을 오너와 맞출 것.
 *  - 크루 · 페넌트 · 크루 초크 · 크루 장갑: 기획 6장(크루 단계). 원정: 2단계(매장 QR).
 */
export const SOON: ReadonlySet<string> = new Set([
    "cue-finisher",
    "cue-plum", "cue-orchid", "cue-chrysanthemum", "cue-bamboo",
    "cue-crew-cup-win", "cue-crew-cup-runner", "cue-crew-regular", "cue-crew-founder", "cue-crew-battle", "cue-crew-hundred",
    "cue-traveller", "chalk-crew", "glove-crew",
    ...PENNANTS.map((p) => p.id),
]);
export const isLive = (x: Pick<CaseItem, "id">) => !SOON.has(x.id);

const SEASON: Readonly<Record<Season, Names>> = {
    spring: N("봄(3~5월)", "spring (Mar–May)", "primavera (mar–may)", "mùa xuân (th3–5)", "ilkbahar (Mar–May)"),
    summer: N("여름(6~8월)", "summer (Jun–Aug)", "verano (jun–ago)", "mùa hạ (th6–8)", "yaz (Haz–Ağu)"),
    autumn: N("가을(9~11월)", "autumn (Sep–Nov)", "otoño (sep–nov)", "mùa thu (th9–11)", "sonbahar (Eyl–Kas)"),
    winter: N("겨울(12~2월)", "winter (Dec–Feb)", "invierno (dic–feb)", "mùa đông (th12–2)", "kış (Ara–Şub)"),
};
const T = (l: CaseLocale, n: Names) => n[l];

/** 조건 한 줄 — 규칙에서 만든다(다섯 언어). 숨은 큐는 받기 전에 '?' */
export function cueHow(x: CaseItem, l: CaseLocale, earned = false): string {
    if (x.hidden && !earned) return T(l, N("받는 순간 조건이 공개돼요", "Revealed when you earn it", "Se revela al conseguirlo", "Hiện khi bạn nhận được", "Kazandığında açıklanır"));
    const r = x.rule;
    const n = "n" in r ? r.n : 0;
    switch (r.k) {
        case "realGames": return T(l, N(`실전 공식 경기 ${n}판`, `${n} official real games`, `${n} partidas reales oficiales`, `${n} trận thực tế chính thức`, `${n} resmi gerçek maç`));
        case "realRun": return T(l, N(`실전 공식 경기 하이런 3쿠션 ${n} · 4구 ${n * REAL_RUN_4C}`, `Official real game high run: 3-cushion ${n} · four-ball ${n * REAL_RUN_4C}`, `Serie en partida real oficial: 3 bandas ${n} · cuatro bolas ${n * REAL_RUN_4C}`, `Chuỗi trong trận thực tế chính thức: 3 băng ${n} · 4 bi ${n * REAL_RUN_4C}`, `Resmi gerçek maçta seri: 3 bant ${n} · dört top ${n * REAL_RUN_4C}`));
        case "realScene": return T(l, ({
            finisher: N("마지막 이닝에 남은 점수를 한 번에", "Clear the rest in the final inning", "Cierra todo en la última entrada", "Ghi hết điểm còn lại ở lượt cuối", "Son ıstakada kalanı bitir"),
            shutout: N("상대를 0점으로 이기기", "Win with your opponent on zero", "Gana con el rival en cero", "Thắng khi đối thủ 0 điểm", "Rakibi sıfırda bırakarak kazan"),
            comeback: N("목표의 절반 넘게 뒤지다 이기기", "Win after trailing by over half the target", "Gana tras ir perdiendo por más de media meta", "Thắng sau khi bị dẫn hơn nửa mục tiêu", "Hedefin yarısından fazla gerideyken kazan"),
            noMiss: N("빈 이닝 없이 경기 마치기(3이닝 이상)", "Finish a game with no empty inning (3+ innings)", "Termina sin entradas vacías (3+ entradas)", "Kết thúc trận không lượt trắng (từ 3 lượt)", "Boş ıstakasız bir maç bitir (3+ ıstaka)"),
            overTarget: N("내 다마보다 높은 목표로 이기기(10월 16일 경기부터)", "Win with a target above your handicap (games from Oct 16)", "Gana con una meta sobre tu hándicap (desde el 16 oct)", "Thắng với mục tiêu cao hơn điểm chấp (từ 16/10)", "Handikabından yüksek hedefle kazan (16 Ekim'den itibaren)"),
            damaUp: N("공식 경기 뒤 실전 다마가 오르기(10월 16일 경기부터)", "Your real handicap goes up after an official game (from Oct 16)", "Tu hándicap real sube tras una partida oficial (desde el 16 oct)", "Điểm chấp thực tế tăng sau trận chính thức (từ 16/10)", "Resmi maçtan sonra gerçek handikabın yükselsin (16 Ekim'den itibaren)"),
        })[r.s]);
        case "realRegular": return T(l, N(`같은 회원과 공식 경기 ${n}판`, `${n} official games with the same member`, `${n} partidas con el mismo socio`, `${n} trận với cùng một thành viên`, `Aynı üyeyle ${n} resmi maç`));
        case "realNewFace": return T(l, N(`실전에서 처음 만난 회원 ${n}명`, `Meet ${n} new members in real games`, `Conoce ${n} socios nuevos en partidas reales`, `Gặp ${n} thành viên mới ở trận thực tế`, `Gerçek maçlarda ${n} yeni üyeyle tanış`));
        case "hidden": return T(l, ({
            jjajang: N("12시 반 · 6시 반을 넘기며 친 실전 경기", "A real game played through 12:30 or 6:30", "Una partida real que cruza las 12:30 o las 18:30", "Một trận thực tế kéo qua 12:30 hoặc 18:30", "12.30 ya da 18.30'u aşan gerçek bir maç"),
            dawn: N("새벽 2시~5시에 끝낸 실전 경기", "A real game finished between 2 and 5 a.m.", "Una partida real terminada entre las 2 y las 5 a. m.", "Một trận thực tế kết thúc từ 2 đến 5 giờ sáng", "Saat 02.00–05.00 arasında biten gerçek bir maç"),
            triple3: N("3쿠션(목표 5점 이상)을 3이닝 안에 이기기", "Win 3-cushion (target 5+) within 3 innings", "Gana a tres bandas (meta 5+) en 3 entradas", "Thắng 3 băng (mục tiêu 5+) trong 3 lượt", "3 bantı (hedef 5+) 3 ıstakada kazan"),
            anniversary: N("가입한 날로부터 1년", "One year since you joined", "Un año desde que te uniste", "Một năm kể từ ngày tham gia", "Katılımının birinci yılı"),
        })[r.s]);
        case "onTier": return T(l, N(`온라인 ${x.name.ko} 등급에 처음 오르기`, `Reach ${x.name.en} tier online`, `Alcanza el rango ${x.name.es} online`, `Lần đầu đạt hạng ${x.name.vi} online`, `Online ${x.name.tr} seviyesine ulaş`));
        case "onCup": return T(l, r.place === 1 ? N("월대회 우승", "Win the monthly cup", "Gana la copa mensual", "Vô địch cúp tháng", "Aylık kupayı kazan")
            : r.place === 2 ? N("월대회 준우승", "Runner-up in the monthly cup", "Subcampeón de la copa mensual", "Á quân cúp tháng", "Aylık kupada ikinci ol")
                : N("월대회 4강", "Reach the cup semi-finals", "Llega a semifinales de copa", "Vào bán kết cúp tháng", "Kupada yarı finale çık"));
        case "onMonthTop": return T(l, N("이달의 랭킹 1위(그 달에 점수를 올렸을 때)", "Finish a month at No. 1 (with points gained)", "Termina un mes en el n.º 1 (sumando puntos)", "Kết thúc tháng ở hạng 1 (có tăng điểm)", "Bir ayı 1. bitir (puan kazanarak)"));
        case "onWins": return T(l, N(`온라인 대전 ${n}승`, `${n} online win${n > 1 ? "s" : ""}`, `${n} victoria${n > 1 ? "s" : ""} online`, `${n} trận thắng online`, `${n} online galibiyet`));
        case "onGames": return T(l, N(`온라인 대전 ${n}판`, `${n} online matches`, `${n} partidas online`, `${n} trận online`, `${n} online maç`));
        case "onRun": return T(l, N(`온라인 한 판 하이런 ${n}(3쿠션)`, `High run of ${n} in one online match (3-cushion)`, `Serie de ${n} en una partida online (3 bandas)`, `Chuỗi ${n} trong một trận online (3 băng)`, `Bir online maçta ${n} seri (3 bant)`));
        case "bank": return T(l, n === 1 ? N("온라인에서 뱅크샷으로 첫 득점", "Score your first online bank shot", "Anota tu primer tiro de banda online", "Ghi điểm cú băng đầu tiên online", "İlk online bant vuruşu sayını al")
            : N(`온라인 뱅크샷 득점 ${n}번`, `Score ${n} online bank shots`, `Anota ${n} tiros de banda online`, `Ghi ${n} cú băng online`, `${n} online bant vuruşu sayısı`));
        case "fiveCushion": return T(l, N("쿠션 다섯 번을 밟고 득점(온라인)", "Score after five cushions (online)", "Anota tras cinco bandas (online)", "Ghi điểm sau năm băng (online)", "Beş banttan sonra sayı (online)"));
        case "streak": return T(l, N(`온라인 ${n}연승`, `${n} online wins in a row`, `${n} victorias online seguidas`, `${n} trận thắng online liên tiếp`, `Üst üste ${n} online galibiyet`));
        case "onComeback": return T(l, N("온라인에서 목표의 절반 넘게 뒤지다 이기기", "Win online after trailing by over half the target", "Gana online tras ir perdiendo por más de media meta", "Thắng online sau khi bị dẫn hơn nửa mục tiêu", "Online'da hedefin yarısından fazla gerideyken kazan"));
        case "rival": return T(l, N(`같은 상대와 '한 판 더' ${n}번`, `${n} rematches with the same opponent`, `${n} revanchas con el mismo rival`, `${n} lần tái đấu cùng đối thủ`, `Aynı rakiple ${n} rövanş`));
        case "season": return T(l, N(`${SEASON[r.s].ko}에 실전 4판 또는 온라인 12판`, `4 real or 12 online games in ${SEASON[r.s].en}`, `4 reales u 12 online en ${SEASON[r.s].es}`, `4 trận thực tế hoặc 12 online vào ${SEASON[r.s].vi}`, `${SEASON[r.s].tr} boyunca 4 gerçek ya da 12 online maç`));
        case "sagunja": return T(l, N("한 해의 네 철 큐를 다 모으기", "Collect all four season cues in one year", "Reúne los cuatro tacos de estación en un año", "Gom đủ bốn cơ mùa trong một năm", "Bir yılda dört mevsim ıstakasını topla"));
        case "people": return T(l, N(`서로 다른 상대 ${n}명과 치기(실전 + 온라인)`, `Play ${n} different opponent${n > 1 ? "s" : ""} (real + online)`, `Juega con ${n} rival${n > 1 ? "es" : ""} distinto${n > 1 ? "s" : ""} (real + online)`, `Chơi với ${n} đối thủ khác nhau (thực tế + online)`, `${n} farklı rakiple oyna (gerçek + online)`));
        case "both": return T(l, ({
            firstWins: N("실전 첫 승 + 온라인 첫 승", "First real win + first online win", "Primera victoria real + online", "Thắng đầu thực tế + online", "İlk gerçek + ilk online galibiyet"),
            sameMonth: N("같은 달에 실전 10판 + 온라인 10판", "10 real + 10 online games in one month", "10 reales + 10 online en un mes", "10 trận thực tế + 10 online trong một tháng", "Bir ayda 10 gerçek + 10 online maç"),
            run10: N(`실전 하이런 10(4구 ${10 * REAL_RUN_4C}) + 온라인 하이런 10`, `High run 10 in real (four-ball ${10 * REAL_RUN_4C}) + online`, `Serie 10 real (cuatro bolas ${10 * REAL_RUN_4C}) + online`, `Chuỗi 10 thực tế (4 bi ${10 * REAL_RUN_4C}) + online`, `Gerçek 10 seri (dört top ${10 * REAL_RUN_4C}) + online 10`),
            people30: N("실전 · 온라인 모두 서로 다른 상대 30명", "30 different opponents in both real and online", "30 rivales distintos en real y online", "30 đối thủ khác nhau ở cả thực tế và online", "Gerçek ve online'da 30'ar farklı rakip"),
            games100: N("실전 공식 100판 + 온라인 100승", "100 official real games + 100 online wins", "100 partidas reales + 100 victorias online", "100 trận thực tế + 100 trận thắng online", "100 resmi gerçek maç + 100 online galibiyet"),
            gloves12: N("열두 달 장갑을 다 모으기(그 달들의 칸 절반 이상이 실전)", "All twelve month gloves (half the slots from real games)", "Los doce guantes (la mitad de casillas en real)", "Đủ 12 găng tháng (nửa số ô từ thực tế)", "On iki ay eldiveni (kutuların yarısı gerçek)"),
            gold: N("실전 골드 이상 + 온라인 골드 이상", "Real gold or above + online gold or above", "Oro real o más + oro online o más", "Vàng thực tế trở lên + vàng online trở lên", "Gerçekte altın ve üstü + online altın ve üstü"),
        })[r.s]);
        case "crew": return T(l, ({
            cupWin: N("크루 대회 우승", "Win a crew cup", "Gana una copa de crew", "Vô địch giải nhóm", "Bir ekip kupası kazan"),
            cupRunner: N("크루 대회 준우승", "Runner-up in a crew cup", "Subcampeón de copa de crew", "Á quân giải nhóm", "Ekip kupasında ikinci ol"),
            regular: N("석 달 내리 정모 날 공식 경기", "Official games on meetup days three months running", "Partidas en días de quedada tres meses seguidos", "Thi đấu ngày gặp mặt ba tháng liền", "Üç ay üst üste buluşma günü resmi maç"),
            founder: N("크루를 만든 첫 멤버", "One of the crew's first members", "Entre los primeros miembros del crew", "Thành viên đầu tiên của nhóm", "Ekibin ilk üyelerinden"),
            battle: N("다른 크루 회원과 공식 경기", "Official game against another crew", "Partida contra otro crew", "Thi đấu với thành viên nhóm khác", "Başka ekiple resmi maç"),
            hundred: N("크루원과 공식 경기 100판", "100 official games with crewmates", "100 partidas con tu crew", "100 trận với thành viên nhóm", "Ekip arkadaşlarıyla 100 resmi maç"),
        })[r.s]);
        case "stores": return T(l, N(`서로 다른 제휴 매장 ${n}곳에서 QR 경기`, `QR games at ${n} different partner halls`, `Partidas QR en ${n} salas asociadas`, `Trận QR tại ${n} quán đối tác`, `${n} farklı ortak salonda QR maçı`));
        case "seasonPeople": return T(l, N(`${SEASON[r.s].ko}에 처음 만난 상대 ${n}명`, `Meet ${n} new opponents in ${SEASON[r.s].en}`, `Conoce ${n} rivales nuevos en ${SEASON[r.s].es}`, `Gặp ${n} đối thủ mới vào ${SEASON[r.s].vi}`, `${SEASON[r.s].tr} boyunca ${n} yeni rakip`));
        case "world": return T(l, N("다른 나라 회원과 온라인 대전", "Play an online match against another country", "Juega online contra otro país", "Đấu online với thành viên nước khác", "Başka ülkeden biriyle online maç"));
        case "sameOpp": return T(l, N(`같은 상대와 ${n}판(실전 1판 = 온라인 3판)`, `${n} games with the same opponent (1 real = 3 online)`, `${n} partidas con el mismo rival (1 real = 3 online)`, `${n} trận với cùng đối thủ (1 thực tế = 3 online)`, `Aynı rakiple ${n} maç (1 gerçek = 3 online)`));
        case "crewBattle": return T(l, N("크루 대항전에 나가기", "Take part in a crew battle", "Participa en un duelo de crews", "Tham gia đối kháng nhóm", "Bir ekip savaşına katıl"));
        case "glove": return T(l, N(`${r.m}월에 12칸 채우기(실전 1판 = 3칸, 온라인 1판 = 1칸)`, `Fill 12 slots in month ${r.m} (real = 3, online = 1)`, `Llena 12 casillas en el mes ${r.m} (real = 3, online = 1)`, `Điền 12 ô trong tháng ${r.m} (thực tế = 3, online = 1)`, `${r.m}. ayda 12 kutu doldur (gerçek = 3, online = 1)`));
        case "gloveFirst": return T(l, N("가입하면 받아요", "Yours when you join", "Tuyo al unirte", "Nhận khi tham gia", "Katılınca senin"));
        case "gloveYear": return T(l, N("열두 달 장갑을 한 해에 다 받기", "Earn all twelve month gloves in one year", "Consigue los doce guantes en un año", "Nhận đủ 12 găng trong một năm", "Bir yılda on iki eldiveni de kazan"));
        case "gloveCrew": return T(l, N(`크루와 함께 정모 날 ${n}번`, `${n} meetup days with your crew`, `${n} quedadas con tu crew`, `${n} ngày gặp mặt cùng nhóm`, `Ekibinle ${n} buluşma günü`));
        case "gloveCup": return T(l, N("월대회에 나가기", "Enter a monthly cup", "Participa en una copa mensual", "Tham gia cúp tháng", "Aylık kupaya katıl"));
        case "limited": return T(l, ({
            doubleMaster: N("실전 마스터 등급 + 온라인 마스터 등급", "Master tier in real games + master tier online", "Rango maestro real + rango maestro online", "Hạng bậc thầy thực tế + hạng bậc thầy online", "Gerçekte usta seviyesi + online usta seviyesi"),
            thousand: N("실전 공식 경기 1,000판 + 온라인 대전 300판", "1,000 official real games + 300 online matches", "1.000 partidas reales oficiales + 300 online", "1.000 trận thực tế chính thức + 300 trận online", "1.000 resmi gerçek maç + 300 online maç"),
            tripleCup: N("월대회 우승 3번", "Win the monthly cup three times", "Gana la copa mensual tres veces", "Vô địch cúp tháng ba lần", "Aylık kupayı üç kez kazan"),
            legendRun: N(`실전 하이런 3쿠션 15 · 4구 ${15 * REAL_RUN_4C} + 온라인 하이런 15`, `Real high run 15 (four-ball ${15 * REAL_RUN_4C}) + online high run 15`, `Serie real 15 (cuatro bolas ${15 * REAL_RUN_4C}) + serie online 15`, `Chuỗi thực tế 15 (4 bi ${15 * REAL_RUN_4C}) + chuỗi online 15`, `Gerçek 15 seri (dört top ${15 * REAL_RUN_4C}) + online 15 seri`),
            fiveNations: N("서로 다른 다섯 나라의 회원과 레이팅 대전", "Rated matches against members from five different countries", "Partidas con rating contra socios de cinco países", "Trận tính điểm với thành viên từ năm quốc gia", "Beş farklı ülkeden üyelerle puanlı maç"),
        })[r.s]);
        case "invite": return T(l, n === 1
            ? N("친구 한 명이 내 초대 링크로 가입", "A friend joins with your invite link", "Un amigo se une con tu enlace", "Một người bạn tham gia qua link mời của bạn", "Bir arkadaşın davet bağlantınla katılsın")
            : N(`친구 ${n}명이 내 초대 링크로 가입`, `${n} friends join with your invite link`, `${n} amigos se unen con tu enlace`, `${n} người bạn tham gia qua link mời của bạn`, `${n} arkadaşın davet bağlantınla katılsın`));
        case "invitePick": return T(l, N(`친구 ${INVITE_PICK_EVERY}명을 초대할 때마다 열두 디자인 가운데 하나를 골라요(디자인마다 ${INVITE_PICK_LIMIT}자루)`, `Every ${INVITE_PICK_EVERY} friends you invite, pick one of twelve designs (${INVITE_PICK_LIMIT} of each)`, `Cada ${INVITE_PICK_EVERY} amigos invitados, elige uno de doce diseños (${INVITE_PICK_LIMIT} de cada uno)`, `Cứ mời ${INVITE_PICK_EVERY} người bạn, chọn một trong mười hai mẫu (mỗi mẫu ${INVITE_PICK_LIMIT} cây)`, `Davet ettiğin her ${INVITE_PICK_EVERY} arkadaşta on iki tasarımdan birini seç (her birinden ${INVITE_PICK_LIMIT})`));
        case "invited": return T(l, N("친구의 초대 링크로 가입", "Join with a friend's invite link", "Únete con el enlace de un amigo", "Tham gia qua link mời của bạn bè", "Bir arkadaşının davet bağlantısıyla katıl"));
        case "pennant": return T(l, ({
            games100: N("크루 안 경기 100판", "100 games among crewmates", "100 partidas entre miembros", "100 trận nội bộ nhóm", "Ekip içi 100 maç"),
            games500: N("크루 안 경기 500판", "500 games among crewmates", "500 partidas entre miembros", "500 trận nội bộ nhóm", "Ekip içi 500 maç"),
            cup5: N("크루 대회 5회 열기", "Hold 5 crew cups", "Organiza 5 copas", "Tổ chức 5 giải nhóm", "5 ekip kupası düzenle"),
            cup20: N("크루 대회 20회 열기", "Hold 20 crew cups", "Organiza 20 copas", "Tổ chức 20 giải nhóm", "20 ekip kupası düzenle"),
            battle10: N("크루 대항전 10승", "10 crew battle wins", "10 duelos de crew ganados", "10 trận đối kháng thắng", "10 ekip savaşı galibiyeti"),
            regular: N("석 달 내리 정모 날 둘 이상 공식 경기", "Two or more on meetup days, three months running", "Dos o más en quedadas, tres meses seguidos", "Từ hai người trở lên ngày gặp mặt, ba tháng liền", "Üç ay üst üste buluşma gününde iki ve üzeri"),
            crewOfMonth: N("이달의 크루 1위", "Crew of the month", "Crew del mes", "Nhóm của tháng", "Ayın ekibi"),
            stores5: N("제휴 매장 5곳 원정", "Visit five partner halls", "Visita cinco salas asociadas", "Chinh phục năm quán đối tác", "Beş ortak salonu ziyaret et"),
        })[r.s]);
    }
}
