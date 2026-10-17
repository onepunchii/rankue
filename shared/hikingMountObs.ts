/**
 * 산 위 관측 · 지금(2026-10-17 — 오너가 신청해 준 산림청 국립산림과학원 '산악기상정보'를 산 화면에).
 * 산악기상관측소 513곳의 실측(10분마다)을 한 번에 받아, **이름과 시군이 둘 다 맞는** 산에만 붙인다.
 * 관측소 좌표는 API 에 없다 — 그래서 '가까운 관측소'를 어림하지 않는다(엉뚱한 봉우리의 값을 그 산의 값처럼 보이지 않게).
 * 예: "서울 관악산" → 관악산(서울특별시) ○ · "평창 매봉" → 같은 이름이 스물여덟이라 시군까지 맞아야 붙는다.
 * 잰 값이므로 어림(shared/hikingSummitWx)과 섞지 않는다. 화면에는 관측소 이름 · 잰 때를 그대로 적는다.
 */
export interface MountObs {
    obsId: number;
    /** 관측소 이름 그대로("서울 관악산") */
    station: string;
    /** 잰 때 — ISO(UTC) */
    at: string;
    /** 2m 기온(없으면 10m) */
    temp: number | null;
    /** 10m 풍속(m/s) · 풍향(16방위 영문) */
    wind: number | null;
    windDir: string | null;
    humidity: number | null;
    /** 전도식 강우량(mm) — 관측소가 주는 값 그대로 */
    rain: number | null;
}

/** 이보다 오래된 값은 '지금'이 아니다 */
export const OBS_FRESH_MS = 90 * 60_000;

const num = (v: unknown): number | null => {
    if (v == null || v === "-" || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
};

/** "2026-10-17 15:40"(한국 시각) → ISO */
export function obsTimeIso(tm: unknown): string | null {
    const s = typeof tm === "string" ? tm.trim() : "";
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(s);
    if (!m) return null;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 9, +m[5])).toISOString();
}

/** API 한 줄 → 관측. 기온도 바람도 없으면 null(관측소가 쉬는 중) */
export function parseObs(x: Record<string, unknown>): MountObs | null {
    const at = obsTimeIso(x.tm);
    const temp = num(x.tm2m) ?? num(x.tm10m);
    const wind = num(x.ws10m) ?? num(x.ws2m);
    if (!at || (temp == null && wind == null)) return null;
    const dir = typeof x.wd10mstr === "string" && /^[NESW]{1,3}$/.test(x.wd10mstr) ? x.wd10mstr : typeof x.wd2mstr === "string" && /^[NESW]{1,3}$/.test(x.wd2mstr) ? x.wd2mstr : null;
    return { obsId: Number(x.obsid), station: String(x.obsname ?? "").trim(), at, temp, wind, windDir: dir, humidity: num(x.hm2m) ?? num(x.hm10m), rain: num(x.rn) };
}

const squash = (s: string) => s.replace(/\s+/g, "");

/**
 * 그 산의 관측소 — 관측소 이름의 첫 낱말(시군)이 산의 시도 · 시군구에 들어 있고, 나머지가 산 이름(또는 다른 이름)과 같을 때만.
 * 맞는 관측소가 둘 이상이면(같은 시군에 같은 이름) 붙이지 않는다.
 */
export function stationFor<T extends { station: string }>(
    list: readonly T[],
    m: { name: string; aliases?: readonly string[] | null; sido?: string | null; sigungu?: string | null },
): T | null {
    const names = new Set([m.name, ...(m.aliases ?? [])].map(squash).filter(Boolean));
    const place = `${m.sido ?? ""} ${m.sigungu ?? ""}`;
    const hits = list.filter((o) => {
        const parts = o.station.trim().split(/\s+/);
        if (parts.length < 2) return false;
        return names.has(squash(parts.slice(1).join(""))) && place.includes(parts[0]);
    });
    return hits.length === 1 ? hits[0] : null;
}

const DIR_KO: Readonly<Record<string, string>> = {
    N: "북", NNE: "북북동", NE: "북동", ENE: "동북동", E: "동", ESE: "동남동", SE: "남동", SSE: "남남동",
    S: "남", SSW: "남남서", SW: "남서", WSW: "서남서", W: "서", WNW: "서북서", NW: "북서", NNW: "북북서",
};
/** 바람이 불어오는 쪽 — "북서풍" */
export const windDirKo = (d: string | null): string | null => (d && DIR_KO[d] ? `${DIR_KO[d]}풍` : null);
/** 화살표를 돌릴 각도(바람이 불어 가는 쪽, 북=0°) */
export function windArrowDeg(d: string | null): number | null {
    const order = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    const i = d ? order.indexOf(d) : -1;
    return i < 0 ? null : (i * 22.5 + 180) % 360;
}

/** 체감온도(기상청 겨울철 식 — 10°C 이하 · 풍속 1.3m/s 이상에서만) */
export function windChill(t: number | null, ms: number | null): number | null {
    if (t == null || ms == null || t > 10 || ms < 1.3) return null;
    const v = Math.pow(ms * 3.6, 0.16);
    return Math.round((13.12 + 0.6215 * t - 11.37 * v + 0.3965 * t * v) * 10) / 10;
}

/** 한 줄 — 잰 값으로만 말한다(예보를 지어 쓰지 않는다) */
export function obsAdvice(o: Pick<MountObs, "temp" | "wind" | "rain">): string | null {
    if (o.rain != null && o.rain > 0) return "산 위에 비가 내리고 있어요 — 미끄러운 바위 길은 피하세요.";
    if (o.wind != null && o.wind >= 14) return "산 위 바람이 아주 거셉니다 — 능선 산행은 미루세요.";
    if (o.wind != null && o.wind >= 9) return "산 위 바람이 셉니다 — 바람막이와 모자 끈을 챙기세요.";
    if (o.temp != null && o.temp <= 0) return "산 위가 영하예요 — 장갑 · 방한모를 챙기세요.";
    if (o.temp != null && o.temp >= 30) return "산 위도 무더워요 — 물을 넉넉히 챙기세요.";
    return null;
}

/** 지금 보일 만한가 */
export const obsFresh = (o: Pick<MountObs, "at">, nowMs: number) => nowMs - Date.parse(o.at) <= OBS_FRESH_MS;
