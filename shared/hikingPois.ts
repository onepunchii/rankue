/**
 * 등산 — 길 위의 지점(2026-10-13). 한국등산트레킹지원센터의 전국 주요 봉우리 지점(갈림길 · 문화자원 · 위험 · 동식물 · 대피소)을
 * 걷는 사람에게 쓸모 있게 다시 가른다.
 *
 * 받은 자료는 유형이 다섯인데 이름을 보면 섞여 있다 — '위험' · '대피소' 유형 안에 국가지점번호 · 산불감시초소 · 위치표지판 · 헬기장이 들어 있다.
 * 그것은 위험이 아니라 **구조를 부를 때 쓰는 자리**다. 그래서 따로 꺼낸다(GRID · MARK).
 *
 *   SIGN      갈림길              산행 중 미리 알린다(진동 · 한마디)
 *   DANGER    위험 구간           산행 중 미리 알린다
 *   SHELTER   대피소
 *   WILD      이 길에서 만나는 것   도감이 아니다 — 받은 설명이 있는 만큼만 보여 준다
 *   CULTURAL  문화자원            사찰 · 보호수 · 봉수대 · 돌탑
 *   GRID      국가지점번호         구조 요청용 위치("다마 9902 3171")
 *   MARK      표지 · 초소 · 헬기장  길을 확인하는 자리
 *
 * 산림청 100대 명산 코스 파일(2026-10-13 — 한국등산트레킹지원센터 · 산림청 100대명산, 지점 2만 3천)에는 걷는 사람이 먼저 찾는 것이 따로 있다:
 *
 *   ENTRY     들머리              등산로 입구 · 날머리
 *   PARK      주차장
 *   BUS       대중교통            버스 정류장 · 지하철역
 *   TOILET    화장실
 *   WATER     약수터              샘터 · 음수대 — 마실 수 있는지는 현장의 안내를 따른다
 *   VIEW      조망점              전망대 · 포토존
 *   PEAK      봉우리
 *   REST      쉼터                벤치 · 정자
 *
 * 그 파일의 식당 · 매점 · 야영장(가게 이름 — 2022년 조사라 지금과 다를 수 있다)과 이름뿐인 자연경관은 싣지 않는다(hikingPoiKindOfGpx 가 null).
 *
 * 순수 값과 함수만. ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'.
 */

export type HikingPoiKind = "SIGN" | "DANGER" | "SHELTER" | "WILD" | "CULTURAL" | "GRID" | "MARK" | "ENTRY" | "PARK" | "BUS" | "TOILET" | "WATER" | "VIEW" | "PEAK" | "REST";
export const HIKING_POI_KINDS: readonly HikingPoiKind[] = ["SIGN", "DANGER", "SHELTER", "WILD", "CULTURAL", "GRID", "MARK", "ENTRY", "PARK", "BUS", "TOILET", "WATER", "VIEW", "PEAK", "REST"];
export const HIKING_POI_NAME: Readonly<Record<HikingPoiKind, string>> = {
    SIGN: "갈림길", DANGER: "위험 구간", SHELTER: "대피소", WILD: "만나는 것", CULTURAL: "문화자원", GRID: "국가지점번호", MARK: "표지 · 초소",
    ENTRY: "들머리", PARK: "주차장", BUS: "대중교통", TOILET: "화장실", WATER: "약수터", VIEW: "조망점", PEAK: "봉우리", REST: "쉼터",
};
/** 화면에 놓는 차례 — 조심할 곳, 가는 길과 채비(들머리 · 주차 · 교통 · 화장실 · 물), 쉬고 보는 곳, 그 밖. 갈림길은 수가 많아 맨 뒤 */
export const HIKING_POI_ORDER: readonly HikingPoiKind[] = ["DANGER", "ENTRY", "PARK", "BUS", "TOILET", "WATER", "SHELTER", "REST", "VIEW", "PEAK", "WILD", "CULTURAL", "GRID", "MARK", "SIGN"];
/** 산행 중 앞에서 미리 알리는 종류 — 나머지는 조용히 카드로만 */
export const HIKING_POI_ALERT: readonly HikingPoiKind[] = ["SIGN", "DANGER"];

const GRID_NAME = /국가\s*지점\s*번호/;
const MARK_NAME = /산불\s*감시\s*초소|위치\s*표지판|헬기장|구조|구급|파출소|초소/;
/** 받은 유형 · 이름 → 우리 종류 */
export function hikingPoiKind(type: string, name: string): HikingPoiKind {
    if (GRID_NAME.test(name)) return "GRID";
    // 진짜 대피소는 이름에 '대피소' · '산장'이 있다 — 그 밖의 대피소 유형(초소 · 헬기장 …)은 표지로
    if (type === "SHELTER") return /대피소|산장|쉼터/.test(name) ? "SHELTER" : MARK_NAME.test(name) ? "MARK" : "SHELTER";
    if (type === "DANGER" && MARK_NAME.test(name)) return "MARK";
    if (type === "SIGN" || type === "DANGER" || type === "WILD" || type === "CULTURAL") return type;
    return "MARK";
}

// ── 산림청 100대 명산 코스 파일의 지점 ─────────────────────────────────
/** 표지로 실을 만한 이름 — 안내 · 정보 유형에는 '등산로 모습' · 산 이름 같은 것이 섞여 있어 이것만 고른다 */
const GPX_MARK_NAME = /이정표|이정목|표지|안내|구조|구급|헬기장|위치\s*번호|지점|초소|표시목/;
/** 받은 분류 그대로 옮기는 것 */
const GPX_KIND: Readonly<Record<string, HikingPoiKind>> = {
    SIGN: "SIGN", WILD: "WILD", CULTURAL: "CULTURAL", ENTRY: "ENTRY", PARK: "PARK", TRANS: "BUS", TOILET: "TOILET", SPRING: "WATER", VIEW: "VIEW", PHOTO: "VIEW", PEAK: "PEAK", REST: "REST",
};
/**
 * 코스 파일(GPX)의 지점 분류(category) · 이름 → 우리 종류. 싣지 않을 것은 null:
 * 가게(FOOD · STORE · CAMP — 조사 뒤 바뀌었을 수 있는 상호), 이름뿐인 자연경관(SCENERY), 분류 없는 메모, 표지가 아닌 안내 유형.
 */
export function hikingPoiKindOfGpx(category: string, name: string): HikingPoiKind | null {
    const n = name.trim();
    if (!n) return null;
    if (GRID_NAME.test(n)) return "GRID";
    if (category === "DANGER") return MARK_NAME.test(n) || /철탑/.test(n) ? "MARK" : "DANGER";
    if (category === "SHELTER") return /대피소|산장/.test(n) ? "SHELTER" : "MARK";
    if (GPX_KIND[category]) return GPX_KIND[category];
    if (category === "INFO" || category === "NONE") return GPX_MARK_NAME.test(n) ? "MARK" : null;
    return null;
}
/** 갈림길의 이정표가 가리키는 곳 → 설명 한 줄("구병산 · 마을 방향"). 없으면 null. 방향(왼쪽 · 오른쪽)은 걷는 쪽에 따라 뒤집히므로 싣지 않는다 */
export function signpostNote(names: readonly (string | null | undefined)[]): string | null {
    const seen = new Set<string>();
    for (const raw of names) {
        const n = String(raw ?? "").trim();
        if (!n || /^(NA|null|none|-)$/i.test(n) || n.length > 14) continue;
        seen.add(n);
        if (seen.size === 3) break;
    }
    if (seen.size === 0) return null;
    const out = `${[...seen].join(" · ")} 방향`;
    return out.length <= 30 ? out : `${[...seen].slice(0, 2).join(" · ")} 방향`.slice(0, 30);
}

/** 국가지점번호의 글자("다마 9902 3171") — 설명 칸에 들어 있다. 아니면 null */
export function gridNumber(note: string | null | undefined): string | null {
    const m = /([가-힣]{2})\s*(\d{4})\s*(\d{4})/.exec(note ?? "");
    return m ? `${m[1]} ${m[2]} ${m[3]}` : null;
}

/**
 * 지점에 보여 줄 한 줄 — 이름이 유형 이름 그대로면('갈림길' · '위험지역') 설명을 앞세운다.
 * 예: 갈림길/돌탑삼거리 → "돌탑삼거리", 위험지역/급경사 → "급경사", 야생화/담배풀 → "야생화 · 담배풀"
 */
export function hikingPoiTitle(p: { kind: HikingPoiKind; name: string; note?: string | null }): string {
    const name = p.name.trim(), note = (p.note ?? "").trim();
    if (p.kind === "GRID") return gridNumber(note) ?? "국가지점번호";
    const generic = /^(갈림길|위험지역|위험구간|관광자원|대피소)$/.test(name);
    if (generic) return note && note !== name && note.length <= 30 ? note : name === "위험지역" || name === "위험구간" ? "위험 구간" : name;
    return note && note !== name && note.length <= 24 && p.kind === "WILD" ? `${name} · ${note}` : name;
}

/**
 * 같은 자리의 같은 지점을 하나로(2026-10-17 리뷰 — 설악산 코스 1에 '대청봉'이 5.1km 에 두 줄, 칩은 '봉우리 2').
 * 받은 파일에 겹쳐 실린 점이다: 종류와 보여 줄 이름이 같고 거리가 150m 안이면 앞의 것만 둔다. 거리 순으로 받은 목록을 그 차례 그대로 돌려준다.
 */
export function dedupeCoursePois<T extends { kind: HikingPoiKind; name: string; note?: string | null; km?: number | null }>(list: readonly T[]): T[] {
    const out: T[] = [];
    for (const p of list) {
        const t = hikingPoiTitle(p);
        if (out.some((q) => q.kind === p.kind && hikingPoiTitle(q) === t && q.km != null && p.km != null && Math.abs(q.km - p.km) <= 0.15)) continue;
        out.push(p);
    }
    return out;
}
