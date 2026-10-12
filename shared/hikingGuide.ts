/**
 * 등산 — 산의 소개 글(2026-10-13). 받은 글(오너의 콘텐츠 작업 폴더 — 산림청 100대 명산 공식 설명 · 위키백과를 근거로 정리한 것)을
 * **그대로 싣지 않는다.** 사람이 읽고 확인한 글이 아니라서, 여기의 규칙으로 문장마다 걸러 `hiking_mountains.guide` 에 담는다.
 *
 * 빼는 문장:
 *   · 전화번호 · 돈(요금 · 입장료 · 주차비) — 금방 낡고 우리가 책임질 수 없다
 *   · 교통편의 횟수 · 간격 · 첫차 막차 — 받은 원문이 오래됐다(산림청 원문의 교통편은 지금과 다를 수 있다)
 *   · 글쓴이의 메모가 샌 문장('확인하지 못했다' · 'source' …)
 *   · 술 이야기(등산 글에도 넣지 않는다)
 * 고치는 낱말: 기계가 남긴 영어('summit 높이' → '정상 높이').
 *
 * 코스의 소요 시간은 산림청 원문의 값이다 — 화면이 "산림청 안내"라고 출처를 같이 적는다(GUIDE_COURSE_SOURCE).
 * 화면(산 화면)과 검색용 화면(프리렌더)이 같은 값을 쓴다.
 * ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'.
 */

export interface GuideSection { heading: string; body: string }
export interface GuideHighlight { name: string; note: string | null }
export interface GuideFaq { q: string; a: string }
export interface GuideCourse { route: string; waypoints: string[]; duration: string | null }
export interface MountainGuide {
    v: 1;
    /** 정리한 날(YYYY-MM-DD) */
    at: string;
    /** 산림청의 한 줄("섬세한 비경 두루 갖춘 팔방미인") — 100대 명산만 */
    subtitle: string | null;
    intro: string | null;
    sections: GuideSection[];
    highlights: GuideHighlight[];
    faq: GuideFaq[];
    /** 100대 명산으로 뽑힌 까닭 */
    selectionReason: string | null;
    /** 들머리 · 기점 */
    access: string | null;
    /** 산림청이 안내한 코스(경유지 · 소요 시간) — 선(지도)은 없다 */
    officialCourses: GuideCourse[];
    /** 자료가 짧아 쓸 것이 적은 산 */
    thin: boolean;
    /** 근거로 본 곳 — 화면 아래 '참고한 곳'으로 낸다 */
    sources: { url: string; title: string }[];
}

export const GUIDE_LABEL = {
    why: "100대 명산으로 뽑힌 까닭",
    highlights: "이 산에서 볼 것",
    access: "들머리",
    officialCourses: "산림청이 안내한 코스",
    faq: "자주 묻는 것",
    sources: "참고한 곳",
} as const;
/** 산림청 코스 안내의 출처 줄 */
export const GUIDE_COURSE_SOURCE = "산림청 100대 명산 안내의 값이에요. 오래된 자료라 지금과 다를 수 있어요.";
/** 글 아래의 한 줄 */
export const GUIDE_NOTE = "산림청 안내와 공개 자료를 참고해 정리했어요. 바뀐 내용이 있을 수 있으니 가기 전에 현장 안내를 확인해 주세요.";

/** 이 가운데 하나라도 걸리는 문장은 뺀다. [이름, 정규식] */
export const HIKING_GUIDE_BLOCK: readonly [string, RegExp][] = [
    ["전화번호", /\d{2,4}[-)]\s?\d{3,4}-\d{4}/],
    ["돈", /\d[\d,]*\s*(만\s*)?원(?![가-힣])|입장료|주차비|요금|이용료|관람료/],
    ["교통편 횟수", /하루\s*\d+\s*회|\d+\s*회\s*운행|\d+\s*분\s*간격|배차|첫차|막차|시간표/],
    ["글쓴이의 메모", /source|확인(하지|되지)\s*(못|않)|찾지\s*못했|알\s*수\s*없(다|습니다)|기재(하지|되지)\s*않|자료에\s*(나오지|없)/i],
    ["술", /막걸리|소주|맥주|와인|주점|술집|음주/],
];
const FIXES: readonly [RegExp, string][] = [[/\bsummit\s*/gi, "정상 "]];

/** 문장으로 나눈다 — 마침표 · 물음표 · 느낌표 뒤의 공백에서(소수점 안에서는 나누지 않는다) */
export function hikingSentences(text: string): string[] {
    return text.replace(/\s+/g, " ").trim().split(/(?<=[.?!])\s+(?=[^\s])/).map((s) => s.trim()).filter(Boolean);
}
const blocked = (s: string) => HIKING_GUIDE_BLOCK.some(([, re]) => re.test(s));
const fix = (s: string) => FIXES.reduce((t, [re, to]) => t.replace(re, to), s).replace(/\s+/g, " ").trim();
/** 걸리는 문장을 빼고 남은 글. 남는 것이 없으면 null */
export function cleanHikingText(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const out = hikingSentences(fix(v)).filter((s) => !blocked(s)).join(" ").trim();
    return out.length >= 5 ? out : null;
}

const str = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

/** 받은 글 한 편 → 실을 값. 소개(intro)가 남지 않으면 null */
export function cleanMountainGuide(raw: any, at: string): MountainGuide | null {
    if (!raw || typeof raw !== "object") return null;
    const intro = cleanHikingText(raw.intro);
    if (!intro) return null;
    const sections: GuideSection[] = arr(raw.sections).map((s) => ({ heading: str(s?.heading).slice(0, 40), body: cleanHikingText(s?.body) ?? "" }))
        .filter((s) => s.heading && s.body).slice(0, 8);
    const highlights: GuideHighlight[] = arr(raw.highlights).map((h) => ({ name: str(h?.name).slice(0, 40), note: cleanHikingText(h?.note) }))
        .filter((h) => h.name && !blocked(h.name)).slice(0, 10);
    const faq: GuideFaq[] = arr(raw.faq).map((f) => ({ q: str(f?.q).slice(0, 120), a: cleanHikingText(f?.a) ?? "" })).filter((f) => f.q && f.a && !blocked(f.q)).slice(0, 5);
    const officialCourses: GuideCourse[] = arr(raw.courses).map((c) => ({
        route: str(c?.route).slice(0, 200),
        waypoints: arr(c?.waypoints).map(str).filter(Boolean).slice(0, 16),
        duration: str(c?.duration).slice(0, 30) || null,
    })).filter((c) => c.waypoints.length >= 2 && !blocked(c.route)).slice(0, 8);
    const sources = arr(raw.sources).map((s) => (typeof s === "string" ? { url: s, title: "" } : { url: str(s?.url).slice(0, 400), title: str(s?.title).slice(0, 160) }))
        .filter((s) => /^https?:\/\//.test(s.url)).slice(0, 8);
    return {
        v: 1, at, subtitle: str(raw.subtitle).slice(0, 80) || null, intro, sections, highlights, faq,
        selectionReason: cleanHikingText(raw.selectionReason), access: cleanHikingText(raw.access), officialCourses, thin: raw.thin === true, sources,
    };
}

/** 화면에 그릴 것이 있는가 */
export function hasMountainGuide(g: unknown): g is MountainGuide {
    return !!g && typeof g === "object" && (g as MountainGuide).v === 1 && typeof (g as MountainGuide).intro === "string" && (g as MountainGuide).intro!.length > 0;
}
