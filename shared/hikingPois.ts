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
 * 순수 값과 함수만. ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'.
 */

export type HikingPoiKind = "SIGN" | "DANGER" | "SHELTER" | "WILD" | "CULTURAL" | "GRID" | "MARK";
export const HIKING_POI_KINDS: readonly HikingPoiKind[] = ["SIGN", "DANGER", "SHELTER", "WILD", "CULTURAL", "GRID", "MARK"];
export const HIKING_POI_NAME: Readonly<Record<HikingPoiKind, string>> = {
    SIGN: "갈림길", DANGER: "위험 구간", SHELTER: "대피소", WILD: "만나는 것", CULTURAL: "문화자원", GRID: "국가지점번호", MARK: "표지 · 초소",
};
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
