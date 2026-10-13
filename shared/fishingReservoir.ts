/**
 * 민물 — 저수지의 물높이(2026-10-14). 붕어 낚시꾼이 나가기 전에 보는 것: 저수율이 얼마인가, 지난 이레 동안 오르는가 빠지는가.
 *
 * 자료: 한국농어촌공사 농촌용수 저수지 수위정보(공공데이터포털 · XML 만 준다). 하루 한 줄(저수율 % · 수위 m).
 * 저수지 이름으로 찾기는 그쪽 서비스가 고장이라(2026-10-14 실측) **시군 이름으로 목록을 받아** 고르게 한다.
 * 처음 보이는 여섯 곳은 그 목록에 실제로 있는 것을 확인한 이름이다(낚시꾼에게 알려진 큰 저수지).
 * ⚠️ 저수율은 물의 양이지 조황이 아니다 — 잘 낚인다는 말은 하지 않는다.
 * ⚠️ 서버가 부른다 — 상대 임포트는 ./x.js(지금은 임포트가 없다).
 */

export interface ReservoirRef { code: string; name: string; county: string }
export interface ReservoirDay { day: string; rate: number; levelM: number | null }
export interface ReservoirView extends ReservoirRef { days: ReservoirDay[]; /** 가장 최근의 저수율(%) */ rate: number; /** 이레 전(없으면 가장 오래된 날)과의 차이(%p) */ delta: number; asOf: string }

export const isReservoirCode = (v: unknown): v is string => typeof v === "string" && /^\d{10}$/.test(v);
export const RESERVOIR_MAX = 6;
export const RESERVOIR_SOURCE = "한국농어촌공사";

/** 처음 보이는 여섯 곳 — 목록에 있는 것을 확인한 코드(2026-10-14) */
export const RESERVOIR_STARTERS: readonly ReservoirRef[] = [
    { code: "4423010045", name: "탑정", county: "충남 논산" }, { code: "4155010068", name: "고삼", county: "경기 안성" }, { code: "4149010037", name: "이동", county: "경기 용인" },
    { code: "4375010009", name: "백곡", county: "충북 진천" }, { code: "4418010052", name: "청천", county: "충남 보령" }, { code: "4571010192", name: "경천", county: "전북 완주" },
];

/** XML 의 <item>…</item> 들을 열쇠-값으로(농어촌공사 응답은 한 겹짜리 항목뿐이다) */
export function xmlItems(xml: string): Record<string, string>[] {
    return [...String(xml ?? "").matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => Object.fromEntries([...m[1].matchAll(/<(\w+)>([^<]*)<\/\1>/g)].map((x) => [x[1], x[2].trim()])));
}

const SIDO: readonly [RegExp, string][] = [
    [/^충청남도/, "충남"], [/^충청북도/, "충북"], [/^경상남도/, "경남"], [/^경상북도/, "경북"], [/^전라남도|^전남광주통합특별시/, "전남"], [/^전북특별자치도|^전라북도/, "전북"],
    [/^강원특별자치도|^강원도/, "강원"], [/^경기도/, "경기"], [/^제주특별자치도/, "제주"], [/^(\S+?)(특별시|광역시|특별자치시)/, "$1"],
];
/** "충청남도 논산시 " → "충남 논산" */
export function shortCounty(raw: string | null | undefined): string {
    let s = String(raw ?? "").replace(/\s+/g, " ").trim();
    for (const [re, to] of SIDO) if (re.test(s)) { s = s.replace(re, to); break; }
    return s.split(" ").slice(0, 2).map((w, i) => (i === 1 ? w.replace(/(시|군|구)$/, "") || w : w)).join(" ");
}

/** 시군 찾기에 넣는 글 — 두 글자 이상의 한글만(주소의 한 조각으로 부분 일치한다) */
export function cleanCountyQuery(raw: unknown): string | null {
    const s = String(raw ?? "").replace(/[^가-힣]/g, "").slice(0, 10);
    return s.length >= 2 ? s : null;
}

/** 받은 줄(날 · 저수율 · 수위) → 한 저수지의 모습. 쓸 줄이 없으면 null */
export function reservoirView(ref: ReservoirRef, rows: readonly Record<string, string>[]): ReservoirView | null {
    const days: ReservoirDay[] = [];
    for (const r of rows) {
        const d = String(r.check_date ?? ""), rate = Number(r.rate), lv = Number(r.water_level);
        if (!/^\d{8}$/.test(d) || !Number.isFinite(rate) || rate < 0 || rate > 150) continue;
        days.push({ day: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`, rate: Math.round(rate * 10) / 10, levelM: Number.isFinite(lv) ? Math.round(lv * 100) / 100 : null });
    }
    days.sort((a, b) => a.day.localeCompare(b.day));
    if (!days.length) return null;
    const last = days[days.length - 1], first = days[0];
    return { ...ref, days, rate: last.rate, delta: Math.round((last.rate - first.rate) * 10) / 10, asOf: last.day };
}

/** 이레의 움직임을 말로 — 0.5%p 안쪽은 '그대로' */
export function reservoirTrend(delta: number): "오르는 중" | "빠지는 중" | "그대로" {
    return delta >= 0.5 ? "오르는 중" : delta <= -0.5 ? "빠지는 중" : "그대로";
}
