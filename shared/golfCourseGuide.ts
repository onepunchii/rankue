/**
 * 골프장 코스 가이드(2026-10-12 오너: "README_반영안내.md 읽고 반영하면 도움이 많이 되는지 확인하고 우리 누락된 거 정보랑 골프장 부가 정보 가지고 온 거
 * 넣으면 좋지 않아?") — 골프장 490곳의 개요 · 코스 구성 · 코스 특징 · 대표 홀 · 시설 · 오는 길 · 라운드 팁 · 자주 묻는 것.
 *
 * 받은 자료(오너의 콘텐츠 작업 폴더, 웹의 공개 자료를 근거로 정리한 글)를 **그대로 싣지 않는다.** 여기의 규칙으로 걸러서 `golf_course_pages.guide` 에 담는다:
 *
 *  싣는 골프장(guideHoldReason) — 믿을 만한 것만
 *   · 확신이 high · medium 인 곳. low(공식 사이트를 못 열었거나 블로그 한 곳에 기댄 곳)는 싣지 않는다.
 *   · 가이드가 말하는 홀 수가 우리 자료의 홀 수와 같은 곳. 다르면 둘 중 하나가 틀린 것이라, 고칠 때까지 싣지 않는다.
 *
 *  싣는 문장(cleanGuide) — 문장 단위로 뺀다
 *   · 우리 자료를 가리키는 말('데이터베이스상 …') — 글을 쓴 쪽의 메모가 본문에 샌 것이다.
 *   · 남의 예약 · 기록 플랫폼 이름, 요금 · 전화번호 · 평점 — 우리가 책임질 수 없고 금방 낡는다(요금은 그린피 구역이 따로 있다).
 *   · 술 이야기 · 내기 이야기 — 골프 글의 규칙.
 *   · '확인하지 못했습니다' 같은, 아무것도 알려 주지 않는 문장.
 *  내부 메모(notes)는 받지 않는다. 출처(sources)는 따라가 볼 수 있게 담아 두되 화면에는 내지 않는다.
 *
 * 화면(골프장 상세의 '가이드' 구역)과 검색용 화면(프리렌더)이 같은 값을 쓴다.
 * ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트를 쓰게 되면 './x.js'.
 */

export interface GuideCourse { name: string; holes: number | null; desc: string | null }
export interface GuideHole { hole: string; desc: string }
export interface GuideFaq { q: string; a: string }
export interface CourseGuide {
    /** 모양의 판 번호 */
    v: 1;
    /** 정리한 날(YYYY-MM-DD) */
    at: string;
    confidence: "high" | "medium";
    overview: string | null;
    courses: GuideCourse[];
    /** 코스 특징(지형 · 잔디 · 난도) */
    layout: string | null;
    signature: GuideHole[];
    facilities: string | null;
    access: string | null;
    tips: string[];
    faq: GuideFaq[];
    /** 근거로 본 곳 — 화면에 내지 않는다(따라가 볼 때 쓴다) */
    sources: { url: string; title: string }[];
}

/** 화면의 구역 이름 — 화면과 검색용 화면이 같이 쓴다 */
export const GUIDE_LABEL = {
    section: "코스 가이드",
    courses: "코스 구성",
    layout: "코스 특징",
    signature: "대표 홀",
    facilities: "시설",
    access: "오는 길",
    tips: "라운드 팁",
    faq: "자주 묻는 것",
    note: "공식 홈페이지와 언론 보도 같은 공개 자료를 참고해 정리했어요. 바뀐 내용이 있을 수 있으니 가기 전에 골프장에 확인해 주세요.",
} as const;

// ── 거르는 규칙 ─────────────────────────────────────────────────────
/** 이 가운데 하나라도 걸리는 문장은 뺀다. [이름, 정규식] — 이름은 점검 표에 쓴다 */
export const GUIDE_BLOCK: readonly [string, RegExp][] = [
    ["우리 자료를 가리키는 말", /데이터베이스|앱\s*DB|DB\s*(상|기준|에는)/],
    ["남의 플랫폼", /김캐디|티스캐너|카카오\s*골프|스마트스코어|XGOLF|엑스골프|골팡|골프몬|골프존(?!\s*카운티)|네이버\s*(예약|플레이스|지도|블로그)|블로그/i],
    ["요금", /\d[\d,]*\s*(만\s*)?원(?![가-힣])|그린피|카트비|캐디피|이용\s*요금|요금표|회원권\s*(가격|시세|분양)/],
    ["전화번호", /\d{2,4}-\d{3,4}-\d{4}/],
    // '차별점'은 별점이 아니다
    ["평점", /평점|(?<!차)별점/],
    ["술", /와인|맥주|막걸리|위스키|칵테일|주류|소주(?!고개)|술집|음주/],
    ["내기", /내기\s*(골프|를|로|에)|스킨스|도박|베팅/],
    ["알려 주지 않는 문장", /확인(하지|되지)\s*(못|않)|확인한\s*자료(에서|에)|찾지\s*못했|나오지\s*않습니다|기재하지\s*않|알\s*수\s*없습니다|열어\s*보지\s*못|단정하지\s*않|(적|쓰|넣|싣)지\s*않았습니다/],
];
/** 요금을 묻는 문답은 통째로 뺀다(답의 문장만 빼면 빈 답이 남는다) */
const FAQ_DROP_Q = /그린피|요금|가격|카트비|캐디피|회원권|예약은\s*어디|어디서\s*예약/;

/** 문장으로 나눈다 — 마침표 · 물음표 · 느낌표 뒤의 공백에서. 소수점(2.8m)이나 약어(A.M.) 안에서는 나누지 않는다 */
export function guideSentences(text: string): string[] {
    return text.replace(/\s+/g, " ").trim().split(/(?<=[.?!])\s+(?=[^\s])/).map((s) => s.trim()).filter(Boolean);
}
const blocked = (s: string) => GUIDE_BLOCK.some(([, re]) => re.test(s));
/** 걸리는 문장을 빼고 남은 글. 남는 것이 없으면 null */
export function cleanGuideText(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const kept = guideSentences(v).filter((s) => !blocked(s));
    const out = kept.join(" ").trim();
    // 짧은 답('18홀입니다.' · '한국잔디입니다.')도 답이다 — 남은 것이 부스러기(서너 글자)일 때만 버린다
    return out.length >= 5 ? out : null;
}

const str = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

/** 받은 가이드 한 곳 → 실을 값. 확신이 낮거나 실을 것이 남지 않으면 null */
export function cleanGuide(raw: any, at: string): CourseGuide | null {
    if (!raw || typeof raw !== "object") return null;
    const confidence = raw.confidence === "high" || raw.confidence === "medium" ? raw.confidence : null;
    if (!confidence) return null;
    const overview = cleanGuideText(raw.overview);
    const courses: GuideCourse[] = arr(raw.courses).map((c) => ({
        name: str(c?.name).slice(0, 40),
        holes: Number.isInteger(c?.holes) && c.holes > 0 && c.holes <= 36 ? c.holes : null,
        desc: cleanGuideText(c?.description),
    })).filter((c) => c.name && !blocked(c.name)).slice(0, 8);
    const signature: GuideHole[] = arr(raw.signatureHoles).map((h) => ({ hole: str(h?.hole).slice(0, 60), desc: cleanGuideText(h?.description) ?? "" }))
        .filter((h) => h.hole && h.desc && !blocked(h.hole)).slice(0, 5);
    const tips = arr(raw.tips).map((t) => cleanGuideText(t)).filter((t): t is string => !!t).slice(0, 5);
    const faq: GuideFaq[] = arr(raw.faq).map((f) => ({ q: str(f?.q).slice(0, 120), a: cleanGuideText(f?.a) ?? "" }))
        .filter((f) => f.q && f.a && !FAQ_DROP_Q.test(f.q) && !blocked(f.q)).slice(0, 6);
    const sources = arr(raw.sources).map((s) => ({ url: str(s?.url).slice(0, 400), title: str(s?.title).slice(0, 160) })).filter((s) => /^https?:\/\//.test(s.url)).slice(0, 12);
    const guide: CourseGuide = {
        v: 1, at, confidence, overview, courses,
        layout: cleanGuideText(raw.layoutNotes), signature,
        facilities: cleanGuideText(raw.facilities), access: cleanGuideText(raw.access),
        tips, faq, sources,
    };
    // 개요가 없으면 가이드라고 부를 것이 없다
    return guide.overview ? guide : null;
}

/** 가이드가 말하는 홀 수(코스들의 합) — 홀 수를 적지 않은 코스가 있으면 모른다(null) */
export function guideHoles(raw: any): number | null {
    const cs = arr(raw?.courses);
    if (!cs.length || cs.some((c) => !Number.isInteger(c?.holes))) return null;
    return cs.reduce((a, c) => a + c.holes, 0);
}

/**
 * 싣지 않는 까닭 — 없으면(null) 싣는다.
 * pageHoles 는 우리 자료의 홀 수. 가이드의 홀 수를 모르면 견주지 않는다.
 */
export function guideHoldReason(raw: any, pageHoles: number | null | undefined): string | null {
    if (!raw || typeof raw !== "object") return "가이드 없음";
    if (raw.confidence !== "high" && raw.confidence !== "medium") return "확신 낮음";
    const gh = guideHoles(raw);
    if (gh != null && pageHoles != null && pageHoles > 0 && gh !== pageHoles) return `홀 수가 다름(가이드 ${gh} · 우리 ${pageHoles})`;
    return null;
}

/** 화면에 그릴 것이 있는가 — 옛 응답 · 빈 값 · 모양이 다른 값은 그리지 않는다 */
export function hasGuide(g: unknown): g is CourseGuide {
    return !!g && typeof g === "object" && (g as CourseGuide).v === 1 && typeof (g as CourseGuide).overview === "string" && (g as CourseGuide).overview!.length > 0;
}
