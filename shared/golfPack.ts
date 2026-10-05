/**
 * 라운드 준비물 체크리스트(2026-10-05 오너: "사진이 아니더라도 이모지 및 아이콘을 활용하자 … 우리만의 콘텐츠" → 제안 → "순서대로"의 2번).
 *
 * 왜: '골프 준비물' 검색은 4월과 10월이 정점이다(네이버 검색어 트렌드 2025-10~2026-09, '골프장 날씨'=100 일 때 29).
 * 그리고 라운드 브리핑이 이미 날씨로 '챙길 것'을 고른다(shared/golfRoundBrief gearOf) — 그 옆에 늘 챙기는 것을 붙이면 체크리스트가 된다.
 *
 * 화면(골프장 상세의 날씨 카드 · /golf/checklist)과 검색엔진용 화면(server/seo/golfGuide.ts)이 **같은 글**을 쓴다.
 *   · 확실한 것만 쓴다 — 금액·시간 같은 숫자는 골프장마다 달라 적지 않는다(도착 시간만 '한 시간 전쯤'이라는 흔한 권고로).
 *   · 날씨별 줄(PACK_WEATHER)은 gearOf 의 규칙을 말로 옮긴 것이다. 규칙을 바꾸면 여기도 고친다 — golfPack.test.ts 가 둘을 맞대 본다.
 *   · 이모지는 2017년 이전 것만(오래된 안드로이드에서 빈 네모가 안 나오게): 🧊·🧴·🟠 대신 🥤·☀️·🔴.
 * ⚠️ shared 상대 임포트는 반드시 ./x.js(서버리스 규칙). 이 파일은 임포트가 없다.
 */
export interface PackItem { key: string; emoji: string; label: string; note?: string }

/** 늘 챙기는 것 — 체크 표시가 붙는 아홉 가지. key 는 저장되는 값이라 바꾸지 않는다 */
export const PACK_BASE: readonly PackItem[] = [
    { key: "clubs", emoji: "⛳", label: "골프 클럽", note: "연습장에 두고 온 채가 없는지 캐디백을 한 번 열어 봐요" },
    { key: "balls", emoji: "⚪", label: "골프공", note: "넉넉하게. 처음 가는 코스라면 더" },
    { key: "shoes", emoji: "👟", label: "골프화", note: "신발 가방째로 챙기면 양말도 같이 가요" },
    { key: "glove", emoji: "🧤", label: "골프 장갑", note: "낡았으면 새것 하나 더" },
    { key: "cap", emoji: "🧢", label: "모자", note: "모자를 꼭 쓰게 하는 골프장도 있어요" },
    { key: "tee", emoji: "📍", label: "티 · 볼마커", note: "긴 티와 짧은 티 둘 다" },
    { key: "clothes", emoji: "👕", label: "갈아입을 옷", note: "끝나고 씻으니까 속옷과 양말까지" },
    { key: "cash", emoji: "💵", label: "캐디피 현금", note: "캐디가 있는 날. 보통 팀이 나눠서 내요" },
    { key: "sun", emoji: "☀️", label: "선크림", note: "흐린 날에도" },
];
export const PACK_KEYS: readonly string[] = PACK_BASE.map((p) => p.key);

/** 라운드 브리핑이 고르는 준비물(gearOf 의 낱말) → 그림 */
export const GEAR_EMOJI: Record<string, string> = {
    "방한 장갑": "🧤", "우산·비옷": "☔", "여벌 장갑": "🧤", "우산": "☔", "핫팩": "🔥", "바람막이": "🧥",
    "겹쳐 입기": "👕", "얼음물": "🥤", "선크림·모자": "🧢", "라이트 코스 확인": "🔦",
};
export const gearEmoji = (gear: string): string => GEAR_EMOJI[gear] ?? "";

/** 날씨에 따라 — 라운드 브리핑이 고르는 규칙 그대로(위에서부터 본다, 많아도 셋) */
export const PACK_WEATHER: readonly { when: string; gear: readonly string[] }[] = [
    { when: "눈이나 진눈깨비 예보가 있는 날", gear: ["방한 장갑"] },
    { when: "비가 오거나 비 올 확률이 60% 이상인 날", gear: ["우산·비옷", "여벌 장갑"] },
    { when: "비 올 확률이 30% 이상인 날", gear: ["우산"] },
    { when: "라운드 중에 3° 아래로 내려가는 날", gear: ["핫팩"] },
    { when: "10° 이하에서 티오프하는 날", gear: ["바람막이"] },
    { when: "11~14°에서 시작해 9° 넘게 오르는 날", gear: ["겹쳐 입기"] },
    { when: "28° 이상 오르는 날", gear: ["얼음물"] },
    { when: "22° 이상이고 비 소식이 없는 낮 라운드", gear: ["선크림·모자"] },
    { when: "해가 진 뒤까지 치는 티타임", gear: ["라이트 코스 확인"] },
];

export interface PackSeason { key: "rain" | "winter" | "summer" | "between"; emoji: string; title: string; lead: string; items: readonly PackItem[] }
/** 상황별로 더 챙기는 것 — 늘 챙기는 아홉 가지에 얹는다 */
export const PACK_SEASONS: readonly PackSeason[] = [
    {
        key: "rain", emoji: "☔", title: "비 오는 날", lead: "젖은 장갑과 양말이 스코어를 제일 많이 깎아요.",
        items: [
            { key: "rain-umbrella", emoji: "☔", label: "우산" },
            { key: "rain-wear", emoji: "🧥", label: "비옷", note: "위아래 다" },
            { key: "rain-glove", emoji: "🧤", label: "여벌 장갑", note: "두세 켤레" },
            { key: "rain-socks", emoji: "🧦", label: "여벌 양말" },
            { key: "rain-towel", emoji: "💧", label: "수건", note: "그립 닦을 것까지 여러 장" },
        ],
    },
    {
        key: "winter", emoji: "⛄", title: "겨울", lead: "몸이 굳으면 스윙이 작아져요. 손과 목부터 덥혀요.",
        items: [
            { key: "winter-glove", emoji: "🧤", label: "방한 장갑", note: "양손 다 끼는 것" },
            { key: "winter-heat", emoji: "🔥", label: "핫팩", note: "주머니에 하나씩" },
            { key: "winter-neck", emoji: "🧣", label: "넥워머 · 귀마개" },
            { key: "winter-inner", emoji: "👕", label: "기모 이너", note: "두꺼운 한 벌보다 얇게 여러 겹" },
            { key: "winter-ball", emoji: "🔴", label: "컬러볼", note: "서리나 눈 위에서는 흰 공이 안 보여요" },
        ],
    },
    {
        key: "summer", emoji: "🌞", title: "여름", lead: "다섯 시간을 볕에서 걸어요. 물과 그늘을 챙겨요.",
        items: [
            { key: "summer-water", emoji: "🥤", label: "얼음물", note: "얼린 것 하나, 마실 것 하나" },
            { key: "summer-cap", emoji: "🧢", label: "챙 넓은 모자" },
            { key: "summer-sun", emoji: "☀️", label: "선크림", note: "전반 끝나고 한 번 더" },
            { key: "summer-glove", emoji: "🧤", label: "여벌 장갑", note: "땀에 젖으면 바로 바꿔요" },
            { key: "summer-towel", emoji: "💧", label: "수건" },
        ],
    },
    {
        key: "between", emoji: "🌸", title: "봄 · 가을", lead: "새벽과 한낮의 기온 차가 커요. 벗을 수 있게 입어요.",
        items: [
            { key: "between-wind", emoji: "🧥", label: "바람막이", note: "벗어서 카트에 둘 수 있는 겉옷" },
            { key: "between-layer", emoji: "👕", label: "겹쳐 입기", note: "조끼나 얇은 니트" },
            { key: "between-sun", emoji: "☀️", label: "선크림", note: "봄볕도 타요" },
        ],
    },
];

/** 날씨별 줄 아래의 안내 — 골프장 상세의 날씨 카드로 보낸다 */
export const PACK_WEATHER_NOTE = "가는 골프장의 날씨에서 티오프 시각을 고르면, 그 라운드에 맞는 것만 골라 드려요.";

/** 처음 가는 날이라면 — 골프장마다 다른 것은 '확인해요'로만 */
export const PACK_FIRST: readonly string[] = [
    "티오프 한 시간 전쯤 도착하면 옷을 갈아입고 연습 그린까지 다녀올 여유가 있어요.",
    "복장 규정은 골프장마다 달라요. 깃 있는 셔츠가 기본이고, 반바지나 라운드 티가 안 되는 곳도 있으니 홈페이지에서 확인해요.",
    "그린피 말고도 카트비와 캐디피가 따로 들어요. 보통 한 팀이 나눠서 내요.",
    "공은 넉넉히 가져가요. 잃어버리는 게 정상이에요.",
];

// ── 공개 페이지(/golf/checklist) ──────────────────────────────────
export const PACK_PATH = "/golf/checklist";
/** 글을 고친 날 — 사이트맵 lastmod */
export const PACK_UPDATED = "2026-10-05";
export const PACK_NAV_LABEL = "골프 준비물";
export const PACK_TITLE = "골프 라운딩 준비물 체크리스트 — 날씨별 · 계절별 | 랭큐 골프";
export const PACK_H1 = "골프 라운딩 준비물 체크리스트";
export const PACK_INTRO = "라운드 전날 가방을 쌀 때 하나씩 눌러 지워 가는 준비물 목록이에요. 늘 챙기는 것 아홉 가지에, 날씨와 계절에 따라 더 챙길 것을 붙였어요.";
const labels = (items: readonly PackItem[]) => items.map((i) => i.label.replace(/ · /g, "·")).join(", ");
export const PACK_DESC = `골프 라운딩 준비물 ${PACK_BASE.length}가지(${labels(PACK_BASE.slice(0, 5))} 등)와 비 오는 날 · 겨울 · 여름에 더 챙길 것. 눌러서 지워 가는 체크리스트예요.`;

/** 자주 묻는 것 — 답은 위 목록에서 만든다(목록을 고치면 같이 바뀐다) */
export const PACK_FAQ: readonly { q: string; a: string }[] = [
    { q: "골프 라운딩에 꼭 챙겨야 하는 준비물은 뭔가요?", a: `${labels(PACK_BASE)}이에요. 캐디피 현금은 캐디가 있는 날에만 필요해요.` },
    ...PACK_SEASONS.filter((s) => s.key !== "between").map((s) => ({
        q: s.key === "rain" ? "비 오는 날 라운딩에는 뭘 더 챙기나요?" : s.key === "winter" ? "겨울 라운딩 준비물은 뭔가요?" : "여름 라운딩에는 뭘 더 챙기나요?",
        a: `늘 챙기는 것에 더해 ${labels(s.items)}을 챙겨요. ${s.lead}`,
    })),
];

/** 구조화 데이터 — 화면에 보이는 질문·답과 같은 글 */
export function packJsonLd(origin: string): object {
    return {
        "@context": "https://schema.org", "@type": "FAQPage", url: `${origin}${PACK_PATH}`, inLanguage: "ko",
        mainEntity: PACK_FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    };
}

// ── 체크 표시(브라우저에만 둔다) ──────────────────────────────────
export const PACK_STORE_KEY = "rankue_golf_pack";
/** 저장된 글 → 체크된 key 들. 모르는 key·깨진 값은 버린다 */
export function parsePackChecked(raw: string | null | undefined): string[] {
    if (!raw) return [];
    try {
        const v = JSON.parse(raw);
        return Array.isArray(v) ? PACK_KEYS.filter((k) => v.includes(k)) : [];
    } catch {
        return [];
    }
}
