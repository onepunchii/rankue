/**
 * 전국 낚시터 공개 페이지(2026-10-18 오너: "낚시 전체를 공개" · "골프장 페이지 · 산 페이지처럼 퀄리티를") — 화면 · 검색용 화면(server/seo/fishing) · 사이트맵이 같은 글을 쓴다.
 *
 * 주소
 *   /fishing/spots                       전국 낚시터(허브) — 종류 · 지역 · 어종으로
 *   /fishing/spots/region/<시도 약칭>     지역(경기 · 충북 …)
 *   /fishing/spots/type/<종류>            저수지 · 바다 · 평지 · 기타 · 계곡
 *   /fishing/spot/<id>                    낚시터 한 곳
 *
 * 자료는 행정안전부 낚시터정보(fishing_places 1,151줄 → 같은 곳을 하나로 묶으면 861곳) — 받은 칸(이름 · 종류 · 주소 · 대상 어종 · 요금 · 연락처)만 적는다. 지어 넣지 않는다.
 * ⚠️ 받은 자료는 같은 낚시터를 해마다 새 번호로 다시 올린다(음성 생극낚시터가 12줄 — 2026-10-19 확인). dedupePlaces 로 한 곳 한 페이지, 옛 번호는 새 번호로 301.
 * 한 곳 페이지가 얇아지지 않게 우리 자료를 잇는다: 대상 어종 한 장 · 금어기(수산자원관리법) · 가까운 항구의 물때(국립해양조사원) · 같은 시군 · 가까운 낚시터.
 * ⚠️ 서버가 부른다 — 상대 임포트는 ./x.js.
 */
import { fishingSidoShort, type FishingPlace } from "./fishing.js";
import { fishByName } from "./fishingFish.js";

export const FISHING_SPOTS_PATH = "/fishing/spots";
export const FISHING_SPOTS_LABEL = "전국 낚시터";
/** 같은 곳을 묶은 낚시터 수(2026-10-19 · 1,151줄 → 861곳) — 화면 문구용. 자료를 다시 적재하면 함께 고친다(server/scripts/fishing-load-places) */
export const FISHING_PLACE_COUNT = 861;
export interface PublicPlace extends FishingPlace { lat: number | null; lng: number | null }

/** 종류 — 받은 자료의 칸(저수지 · 바다 · 평지 · 기타 · 계곡)을 그대로, 주소용 이름만 붙인다('기타'를 실내 등으로 짐작해 바꾸지 않는다) */
export const PLACE_KINDS = [
    { id: "reservoir", raw: "저수지", label: "저수지 낚시터", short: "저수지", art: "/fishing/art/band-reservoir.webp" },
    { id: "sea", raw: "바다", label: "바다 낚시터", short: "바다", art: "/fishing/art/sea-south-west.webp" },
    { id: "flat", raw: "평지", label: "평지 낚시터", short: "평지", art: "/fishing/art/cover-fresh.webp" },
    { id: "etc", raw: "기타", label: "기타 낚시터", short: "기타", art: "/fishing/art/band-market.webp" },
    { id: "valley", raw: "계곡", label: "계곡 낚시터", short: "계곡", art: "/fishing/art/cover-trip.webp" },
] as const;
export type PlaceKindId = (typeof PLACE_KINDS)[number]["id"];
export const placeKind = (raw: string | null | undefined) => PLACE_KINDS.find((k) => k.raw === raw) ?? PLACE_KINDS[3];
export const placeKindById = (id: string) => PLACE_KINDS.find((k) => k.id === id) ?? null;

export const fishingSpotPath = (id: string) => `/fishing/spot/${encodeURIComponent(id)}`;
export const fishingRegionPath = (sidoShort: string) => `${FISHING_SPOTS_PATH}/region/${encodeURIComponent(sidoShort)}`;
export const fishingTypePath = (kind: PlaceKindId) => `${FISHING_SPOTS_PATH}/type/${kind}`;
export const isPlaceId = (v: string) => /^\d{6,24}$/.test(v);

/** 같은 곳의 열쇠 — 이름(띄어쓰기 무시) + 주소(띄어쓰기 무시), 주소가 없으면 좌표(소수 넷째 자리) */
export const placeDupKey = (p: Pick<PublicPlace, "name" | "address" | "lat" | "lng" | "sido" | "sigungu">): string => {
    const name = p.name.replace(/\s+/g, "");
    const addr = String(p.address ?? "").replace(/\s+/g, "");
    return addr ? `${name}|${addr}` : p.lat != null && p.lng != null ? `${name}|@${p.lat.toFixed(4)},${p.lng.toFixed(4)}` : `${name}|#${p.sido ?? ""}${p.sigungu ?? ""}`;
};

/**
 * 같은 낚시터 묶기 — 가장 새 자료(자료 기준일 → 번호 큰 것)를 대표로, 대표에 빈 칸만 옛 줄에서 채운다(받은 값 그대로 · 섞어 만들지 않는다).
 * alias: 옛 번호 → 대표 번호(페이지 301 · 옛 주소로 온 사람도 같은 곳으로).
 */
export function dedupePlaces<T extends PublicPlace>(rows: readonly T[]): { list: T[]; alias: Map<string, string> } {
    const groups = new Map<string, T[]>();
    for (const r of rows) {
        const k = placeDupKey(r);
        const g = groups.get(k);
        if (g) g.push(r); else groups.set(k, [r]);
    }
    const newer = (a: T, b: T) => (b.dataDate ?? "").localeCompare(a.dataDate ?? "") || (b.id.length - a.id.length) || b.id.localeCompare(a.id);
    const alias = new Map<string, string>();
    const keep = new Set<T>();
    const filled = new Map<T, T>();
    for (const g of groups.values()) {
        const sorted = [...g].sort(newer);
        const head = sorted[0];
        const pick = <K extends keyof T>(k: K): T[K] => {
            const empty = (v: unknown) => v == null || v === "" || (Array.isArray(v) && v.length === 0);
            return (sorted.find((x) => !empty(x[k]))?.[k] ?? head[k]) as T[K];
        };
        const one = { ...head, kind: pick("kind"), address: pick("address"), lat: pick("lat"), lng: pick("lng"), species: pick("species"), fee: pick("fee"), tel: pick("tel") } as T;
        keep.add(head); filled.set(head, one);
        for (const x of sorted.slice(1)) alias.set(x.id, head.id);
    }
    // 차례는 받은 차례(시도 · 시군 · 이름) 그대로
    return { list: rows.filter((r) => keep.has(r)).map((r) => filled.get(r)!), alias };
}

/** 시군구 짧게 — "고양시덕양구" → "고양" · "이천시" → "이천" · "북구" 는 그대로 */
export const sigunguShort = (s: string | null | undefined): string => {
    const v = String(s ?? "").trim();
    if (!v) return "";
    const city = /^(.{2,}?)시/.exec(v);
    if (city) return city[1];
    return v.length > 2 ? v.replace(/(군|구)$/, "") : v;
};
export const placeWhere = (p: Pick<FishingPlace, "sido" | "sigungu">) => [fishingSidoShort(p.sido), sigunguShort(p.sigungu)].filter(Boolean).join(" ");

/** 요금 — 숫자만 온 칸은 원으로("30000" → "30,000원"), 글로 온 칸은 그대로(앞뒤 공백만) */
export function placeFeeText(fee: string | null | undefined): string | null {
    const v = String(fee ?? "").trim();
    if (!v || v === "0" || v === "-") return null;
    // 숫자만이면 원을 붙이고, 글 속의 네 자리 넘는 숫자는 쉼표만 찍는다("1일 10000원" → "1일 10,000원" — 뜻은 그대로)
    if (/^\d{3,7}$/.test(v) || /^\d{1,3}(,\d{3})+$/.test(v)) return `${Number(v.replace(/,/g, "")).toLocaleString("ko-KR")}원`;
    // 붙어 온 여러 값을 띄운다("44,000원6시간" → "44,000원 · 6시간", "20,000원,청소년" → "20,000원, 청소년") — 글자는 그대로, 띄움만(2026-10-19)
    return v.replace(/\d{4,7}/g, (d) => Number(d).toLocaleString("ko-KR")).replace(/원(?=\d)/g, "원 · ").replace(/원,(?=[^\d\s])/g, "원, ");
}

/** 어종 이름 다듬기 — 묶음 이름("돔류" · "볼락류")은 '류'를 떼어 우리 어종 · 도감 · 금어기를 찾는 데 쓴다(화면에는 받은 이름 그대로) */
export const speciesKey = (name: string) => name.replace(/\s+/g, "").replace(/(류|등)$/, "");

/** 두 점 사이(km) — 평면 어림(우리나라 안에서 충분) */
export const placeKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => Math.hypot((a.lng - b.lng) * 88.8, (a.lat - b.lat) * 111);

/** 가까운 낚시터 — 좌표가 있으면 거리순(40km 안), 없으면 같은 시군구. 자기 자신은 뺀다 */
export function nearbyPlaces<T extends PublicPlace>(all: readonly T[], p: PublicPlace, n = 6): (T & { km: number | null })[] {
    if (p.lat != null && p.lng != null) {
        const here = { lat: p.lat, lng: p.lng };
        return all.filter((x) => x.id !== p.id && x.lat != null && x.lng != null)
            .map((x) => ({ ...x, km: Math.round(placeKm(here, { lat: x.lat!, lng: x.lng! }) * 10) / 10 }))
            .filter((x) => x.km <= 40).sort((a, b) => a.km - b.km).slice(0, n);
    }
    return all.filter((x) => x.id !== p.id && x.sigungu === p.sigungu && x.sido === p.sido).slice(0, n).map((x) => ({ ...x, km: null }));
}

/** 가까운 항구(조위 관측소) — 바다 낚시터만, 40km 안 */
export function nearestPort<P extends { code: string; name: string; lat: number; lng: number }>(ports: readonly P[], p: PublicPlace): (P & { km: number }) | null {
    if (p.lat == null || p.lng == null || p.kind !== "바다") return null;
    let best: (P & { km: number }) | null = null;
    for (const x of ports) { const km = Math.round(placeKm({ lat: p.lat, lng: p.lng }, x)); if (!best || km < best.km) best = { ...x, km }; }
    return best && best.km <= 40 ? best : null;
}

/* ── 글 — 제목 · 설명(화면과 검색용 화면이 같은 말) ── */
const top = (xs: readonly string[], n = 3) => xs.slice(0, n).join(" · ");
export function placeSeo(p: PublicPlace): { title: string; description: string; h1: string } {
    const k = placeKind(p.kind), where = placeWhere(p), fee = placeFeeText(p.fee);
    const fish = p.species.length ? top(p.species) : "";
    return {
        h1: p.name,
        title: `${p.name} — ${where} ${k.short} 낚시터${fish ? ` · ${fish}` : ""} | 랭큐 낚시`,
        description: [`${where} ${k.label}`, fish ? `대상 어종 ${top(p.species, 5)}` : null, fee ? `요금 ${fee}` : null, p.address ? `주소 ${p.address}` : null].filter(Boolean).join(". ") + ". 가까운 낚시터 · 금어기와 같이 봐요.",
    };
}
export function spotsHubSeo(total: number): { title: string; description: string; h1: string } {
    return { h1: "전국 낚시터", title: `전국 낚시터 ${total.toLocaleString("ko-KR")}곳 — 저수지 · 바다 · 평지 낚시터 찾기 | 랭큐 낚시`, description: `지역 · 종류 · 어종으로 찾는 전국 낚시터 ${total.toLocaleString("ko-KR")}곳. 대상 어종 · 요금 · 주소를 행정안전부 낚시터정보 그대로 보여 줘요.` };
}
export function spotsRegionSeo(sidoShort: string, n: number): { title: string; description: string; h1: string } {
    return { h1: `${sidoShort} 낚시터`, title: `${sidoShort} 낚시터 ${n}곳 — 저수지 · 바다 낚시터 | 랭큐 낚시`, description: `${sidoShort}의 낚시터 ${n}곳을 시군 · 종류 · 어종으로 모았어요. 대상 어종 · 요금 · 주소와 가까운 낚시터를 같이 봐요.` };
}
export function spotsTypeSeo(kind: PlaceKindId, n: number): { title: string; description: string; h1: string } {
    const k = placeKindById(kind)!;
    return { h1: `전국 ${k.label}`, title: `전국 ${k.label} ${n}곳 — 지역별 · 어종별 | 랭큐 낚시`, description: `전국 ${k.label} ${n}곳을 지역 · 어종으로 모았어요. 대상 어종 · 요금 · 주소를 한 곳마다 보여 줘요.` };
}

/** 시도별 · 종류별 수 — 허브의 칩 */
export function placeCounts(all: readonly PublicPlace[]) {
    const bySido = new Map<string, number>(), byKind = new Map<PlaceKindId, number>(), bySpecies = new Map<string, number>();
    // 어종은 묶음 이름까지 한 칸으로(2026-10-19 — '붕어 496'과 '붕어류 50'이 따로 섰다). 곳 수는 그 어종을 하나라도 적은 낚시터 수
    const raw = new Map<string, Map<string, number>>();
    for (const p of all) {
        const s = fishingSidoShort(p.sido); if (s) bySido.set(s, (bySido.get(s) ?? 0) + 1);
        const k = placeKind(p.kind).id; byKind.set(k, (byKind.get(k) ?? 0) + 1);
        for (const key of new Set(p.species.map(speciesKey).filter(Boolean))) bySpecies.set(key, (bySpecies.get(key) ?? 0) + 1);
        for (const f of p.species) { const key = speciesKey(f); if (!key) continue; const m = raw.get(key) ?? new Map<string, number>(); m.set(f, (m.get(f) ?? 0) + 1); raw.set(key, m); }
    }
    // 칸 이름 — 묶음을 뗀 이름이 실제로 쓰였으면 그것('붕어'), 아니면 가장 많이 쓰인 이름('돔류')
    const label = (key: string) => { const m = raw.get(key); return m?.has(key) ? key : [...(m ?? [])].sort((a, b) => b[1] - a[1])[0]?.[0] ?? key; };
    const sort = <K,>(m: Map<K, number>) => [...m].sort((a, b) => b[1] - a[1]);
    return { sido: sort(bySido), kind: sort(byKind), species: sort(bySpecies).map(([k, n]) => [label(k), n] as [string, number]) };
}

/** 낚시터 카드에 싣는 글 · 그림(server/services/fishingSpotCard) — 받은 칸만. 어탁은 대상 어종 가운데 우리 어탁이 있는 첫 어종 */
export function fishingSpotCardInput(p: PublicPlace): { name: string; place: string; detail: string; kind: string; fish: string | null } {
    const k = placeKind(p.kind), fee = placeFeeText(p.fee);
    const fish = p.species.map((n) => fishByName(speciesKey(n)) ?? fishByName(n)).find(Boolean) ?? null;
    return {
        name: p.name,
        place: [placeWhere(p), k.label].filter(Boolean).join(" · "),
        detail: [p.species.slice(0, 3).join(" · "), fee && fee.length <= 16 ? fee : null].filter(Boolean).join(" · "),
        kind: k.id,
        fish: fish?.id ?? null,
    };
}

