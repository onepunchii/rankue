/**
 * 산불 위험(2026-10-17 — 오너가 신청해 준 산림청 국립산림과학원 '산불위험예보정보', apis.data.go.kr/1400377/forestPointV2).
 * 시군구마다 3시간마다 분석한 산불위험지수(평균 · 최댓값)와 등급별 면적 비율(d1 낮음 · d2 보통 · d3 높음 · d4 매우높음, 합 100).
 * 산 화면 날씨 칸에 그 산의 시군구 값을 한 줄로 — 등급은 **면적 비율로 가장 넓은 것**(지수 구간을 따로 정하지 않는다 — 기관이 나눈 그대로).
 * 높음 이상이 조금이라도 있으면 그 비율을 같이 적는다. 출처 · 분석 시각을 적고, 입산 통제 여부는 말하지 않는다(그 자료가 아니다).
 * ⚠️ 서버가 부른다 — 상대 임포트는 ./x.js.
 */
export type FireGrade = "low" | "mid" | "high" | "very";
export const FIRE_GRADE_LABEL: Readonly<Record<FireGrade, string>> = { low: "낮음", mid: "보통", high: "높음", very: "매우 높음" };
export const FIRE_SOURCE = "산림청 국립산림과학원 산불위험예보";

export interface FireRisk {
    sido: string;
    sigun: string;
    /** 분석 시각 ISO(UTC) */
    at: string;
    mean: number | null;
    max: number | null;
    /** 등급별 면적 비율(%) */
    shares: Record<FireGrade, number>;
    grade: FireGrade;
}

const num = (v: unknown): number | null => {
    const n = Number(String(v ?? "").replace(/[, ]/g, ""));
    return v == null || v === "" || !Number.isFinite(n) ? null : n;
};

/** "2026-10-17 15"(한국 시각) → ISO */
export function fireTimeIso(s: unknown): string | null {
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2})/.exec(String(s ?? "").trim());
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 9)).toISOString() : null;
}

/** 면적 비율이 가장 넓은 등급(같으면 센 쪽) */
export function fireGradeOf(shares: Record<FireGrade, number>): FireGrade {
    const order: FireGrade[] = ["very", "high", "mid", "low"];
    let best: FireGrade = "low";
    for (const g of order) if (shares[g] > shares[best]) best = g;
    return best;
}

export function parseFire(x: Record<string, unknown>): FireRisk | null {
    const at = fireTimeIso(x.analdate);
    const sigun = String(x.sigun ?? "").trim(), sido = String(x.doname ?? "").trim();
    if (!at || !sigun) return null;
    const shares: Record<FireGrade, number> = { low: num(x.d1) ?? 0, mid: num(x.d2) ?? 0, high: num(x.d3) ?? 0, very: num(x.d4) ?? 0 };
    if (shares.low + shares.mid + shares.high + shares.very <= 0) return null;
    return { sido, sigun, at, mean: num(x.meanavg), max: num(x.maxi), shares, grade: fireGradeOf(shares) };
}

const squash = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "");

/** 그 산의 시군구 값 — 시도가 같고 시군구 이름이 같을 때(띄어쓰기 무시). 시군구가 '청주시 상당구'처럼 둘이면 앞의 시도 같이 본다 */
export function fireFor<T extends Pick<FireRisk, "sido" | "sigun">>(list: readonly T[], m: { sido?: string | null; sigungu?: string | null }): T | null {
    const sg = squash(m.sigungu), sd = squash(m.sido);
    if (!sg) return null;
    const same = list.filter((f) => squash(f.sido) === sd || !sd);
    return same.find((f) => squash(f.sigun) === sg) ?? same.find((f) => sg.startsWith(squash(f.sigun)) && squash(f.sigun).length >= 2) ?? null;
}

/** 높음 이상의 면적 비율 */
export const fireHighShare = (f: Pick<FireRisk, "shares">) => Math.round(f.shares.high + f.shares.very);
