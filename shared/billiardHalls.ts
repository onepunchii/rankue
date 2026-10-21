/**
 * 전국 당구장 — 행정안전부 「생활_당구장업 조회서비스」(공공데이터포털 15155011 · 이용허락 제한 없음)를 우리 매장 디렉토리에 잇는다(2026-10-19 오너 "1만 곳 다 연결하면").
 * 영업 중 15,191곳(같은 날 실측) — 우리 1,199곳 대부분이 그 안에 있다. 받은 칸만 싣는다(이름 · 주소 · 인허가일 · 영업상태 · 좌표). 지어 넣지 않는다.
 *
 * 여기에는 셈만(시험이 붙는다): 받은 한 줄 → 우리 꼴(시도 짧게 · 주소 · 좌표), 우리 매장과 같은 곳인가, 새 매장의 주소(코드).
 * - 좌표는 EPSG:5174 → WGS84(shared/tmToWgs84 — 건물 번지까지 맞는 OSM 주소와 견줘 중앙 7m)
 * - 같은 곳: 시도 · 시군구가 같고 (이름이 같거나 · 도로명 + 건물번호가 같으면). 시군구 이름은 시도 안에서만 견준다(부산 남구 ≠ 울산 남구)
 * - 열쇠: 개방자치단체코드 + 관리번호(관리번호만으로는 겹친다 — 실측)
 * ⚠️ 서버가 부른다 — 상대 임포트는 ./x.js.
 */
import { tm5174ToWgs84 } from "./tmToWgs84.js";

export const BILLIARD_HALL_SOURCE = "행정안전부 생활_당구장업 인허가 정보";
export const BILLIARD_HALLS_API = "https://apis.data.go.kr/1741000/billiard_halls/info";

/** 받은 한 줄(필요한 칸만) */
export interface GovHallRow {
    OPN_ATMY_GRP_CD?: string; MNG_NO?: string; BPLC_NM?: string; ROAD_NM_ADDR?: string; LOTNO_ADDR?: string; TELNO?: string;
    CRD_INFO_X?: string; CRD_INFO_Y?: string; LCPMT_YMD?: string; SALS_STTS_CD?: string; SALS_STTS_NM?: string; DTL_SALS_STTS_NM?: string; CLSBIZ_YMD?: string;
    DAT_UPDT_PNT?: string;
}
export interface GovHall {
    key: string; name: string; region: string; address: string; roadAddress: string | null; lotAddress: string | null;
    lat: number | null; lng: number | null; licenseDate: string | null; status: "open" | "paused" | "closed"; closedDate: string | null;
    /** 매장 전화(2026-10-21) — 지역번호 · 070 · 050 만(hallPhone). 없거나 꼴이 모르는 것이면 null */
    phone: string | null;
}

/**
 * 인허가 자료의 전화(TELNO) → 매장 페이지의 전화(2026-10-21 디자인 리뷰: 인허가 자료로만 들어온 매장은 '전화' 단추가 늘 꺼져 있었다).
 * 지역번호(02 · 0xx) · 070 · 050x 만 받는다 — 휴대전화(01x)는 사람의 번호일 수 있어 받지 않는다(실측 15,187곳 중 0곳이었지만 막아 둔다).
 * 지역번호 없는 7~8자리(157곳)는 어느 지역인지 몰라 받지 않는다. 대시를 넣어 돌려준다.
 */
export function hallPhone(raw: unknown): string | null {
    const d = String(raw ?? "").replace(/[^0-9]/g, "");
    if (/^02\d{7,8}$/.test(d)) return d.length === 9 ? `02-${d.slice(2, 5)}-${d.slice(5)}` : `02-${d.slice(2, 6)}-${d.slice(6)}`;
    if (/^0[3-6][1-5]\d{7,8}$/.test(d)) return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
    if (/^070\d{8}$/.test(d)) return `070-${d.slice(3, 7)}-${d.slice(7)}`;
    if (/^050\d{9}$/.test(d)) return `${d.slice(0, 4)}-${d.slice(4, 8)}-${d.slice(8)}`;
    return null;
}

const SIDO_SHORT: readonly [RegExp, string][] = [
    [/^서울특별시/, "서울"], [/^부산광역시/, "부산"], [/^대구광역시/, "대구"], [/^인천광역시/, "인천"], [/^광주광역시/, "광주"], [/^대전광역시/, "대전"],
    [/^울산광역시/, "울산"], [/^세종특별자치시/, "세종"], [/^경기도/, "경기"], [/^강원(특별자치)?도/, "강원"], [/^충청북도/, "충북"], [/^충청남도/, "충남"],
    [/^전북특별자치도|^전라북도/, "전북"], [/^전라남도/, "전남"], [/^경상북도/, "경북"], [/^경상남도/, "경남"], [/^제주특별자치도/, "제주"],
];
/** 2026 전남 · 광주 통합 — 광주의 다섯 구는 광주, 나머지는 전남(우리 디렉토리의 나눔 그대로) */
const GWANGJU_GU = new Set(["동구", "서구", "남구", "북구", "광산구"]);

/** "경기도 평택시 …" → { region: "경기", address: "경기 평택시 …" }. 모르는 시도면 null */
export function shortenAddress(raw: string | null | undefined): { region: string; address: string } | null {
    const a = String(raw ?? "").replace(/\s+/g, " ").trim();
    if (!a) return null;
    const m = /^전남광주통합특별시\s+(\S+)/.exec(a);
    if (m) { const region = GWANGJU_GU.has(m[1]) ? "광주" : "전남"; return { region, address: a.replace(/^전남광주통합특별시/, region) }; }
    for (const [re, short] of SIDO_SHORT) if (re.test(a)) return { region: short, address: a.replace(re, short) };
    return null;
}

const ymd = (v: string | null | undefined): string | null => { const s = String(v ?? "").replace(/\D/g, ""); return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null; };

/** 받은 한 줄 → 우리 꼴. 이름 · 주소가 없거나 시도를 모르면 null */
export function govHallOf(r: GovHallRow): GovHall | null {
    const key = `${String(r.OPN_ATMY_GRP_CD ?? "").trim()}-${String(r.MNG_NO ?? "").trim()}`;
    const name = String(r.BPLC_NM ?? "").replace(/\s+/g, " ").trim();
    const road = String(r.ROAD_NM_ADDR ?? "").trim() || null, lot = String(r.LOTNO_ADDR ?? "").trim() || null;
    const short = shortenAddress(road ?? lot);
    if (!name || key.length < 5 || !short) return null;
    const p = tm5174ToWgs84(Number(r.CRD_INFO_X), Number(r.CRD_INFO_Y));
    const code = String(r.SALS_STTS_CD ?? "");
    return {
        key, name, region: short.region, address: short.address,
        roadAddress: road ? shortenAddress(road)?.address ?? road : null, lotAddress: lot ? shortenAddress(lot)?.address ?? lot : null,
        lat: p?.lat ?? null, lng: p?.lng ?? null, licenseDate: ymd(r.LCPMT_YMD),
        status: code === "01" ? "open" : code === "02" ? "paused" : "closed", closedDate: ymd(r.CLSBIZ_YMD),
        phone: hallPhone(r.TELNO),
    };
}

/** 새 매장의 코드(주소) — 'G' + 열쇠의 해시 36진수 10자(코드 규칙 /^[A-Za-z0-9_-]{1,20}$/ · 다시 받아도 같은 값) */
export function govHallCode(key: string): string {
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < key.length; i++) { const c = key.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 + c, 2246822519) >>> 0; }
    return `G${(h1.toString(36) + h2.toString(36)).padEnd(10, "0").slice(0, 10)}`;
}

/* ── 우리 매장과 같은 곳인가 ── */
const tok = (a: string) => String(a ?? "").replace(/[(),]/g, " ").split(/\s+/).filter(Boolean);
/** 시도(짧게) + 시군구 — "경기 수원시 권선구 …" → "경기|수원시". 우리 주소에도 긴 시도("전북특별자치도 …")가 섞여 있어 먼저 짧게 */
export const placeKey = (address: string): string => {
    const t = tok(shortenAddress(address)?.address ?? address);
    return t[0] === "세종" ? "세종|세종" : `${t[0] ?? ""}|${t[1] ?? ""}`;
};
/** 동 · 읍 · 면 이름들 — 지번 주소의 동, 도로명 주소 끝 괄호 속 동("(용원동)" · "(대야동, 신생프라자)") */
export const dongsOf = (address: string | null | undefined): Set<string> => {
    const t = tok(address ?? "").slice(2);
    return new Set(t.filter((w) => /^[가-힣]+\d*(동|읍|면|가)$/.test(w) && !/(로|길)$/.test(w)));
};
/** 이름 비교용 — 띄어쓰기 · 괄호 · 흔한 꼬리(당구장 · 당구클럽 · 빌리어드 · 클럽 …)를 뗀다. 남는 게 없으면(그냥 '당구장') 빈 값 */
export const hallNameKey = (name: string): string =>
    String(name ?? "").replace(/\(.*?\)/g, "").replace(/\s+/g, "").toLowerCase()
        .replace(/(당구장|당구클럽|당구아카데미|빌리어드클럽|빌리어즈|빌리어드|빌리아드|캐롬클럽|캐롬|billiards?|carom|club|클럽|당구)/g, "");
/** 도로명 + 건물번호 — "… 율하6로 52, 2층" → "율하6로 52" */
export const roadNumberKey = (address: string): string | null => {
    const m = /(\S+(?:로|길))\s+(\d+(?:-\d+)?)/.exec(String(address ?? ""));
    return m ? `${m[1]} ${m[2]}` : null;
};

export interface OurListing { code: string; name: string; address: string; lat?: number | null; lng?: number | null }
const kmBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => Math.hypot((a.lng - b.lng) * 88.8, (a.lat - b.lat) * 111);
/**
 * 우리 매장 하나와 같은 곳인가 — 시도가 같아야 하고,
 *  (가) 도로명 + 건물번호가 같거나,
 *  (나) 이름이 같고 동 · 읍 · 면이 겹치거나 둘 사이가 300m 안이어야 한다.
 * 이름만으로는 안 된다 — 화성 '세븐당구장'(진안동)과 '세븐당구클럽'(동탄 영천동)은 다른 곳이다(2026-10-19 실측).
 */
export function sameHall(ours: OurListing, gov: GovHall): boolean {
    // 시도는 같아야 한다. 시군구는 보지 않는다 — 2026 인천 구 개편(중구 → 영종구 · 제물포구, 서구 → 검단구 · 서해구) · 화성 동탄구처럼 이름이 바뀌었다
    if (placeKey(ours.address).split("|")[0] !== placeKey(gov.address).split("|")[0]) return false;
    const ra = roadNumberKey(ours.address), rb = roadNumberKey(gov.roadAddress ?? gov.address);
    if (ra && rb && ra === rb) return true;
    const a = hallNameKey(ours.name), b = hallNameKey(gov.name);
    if (!a || !b || a !== b) return false;
    const mine = dongsOf(ours.address), theirs = new Set([...dongsOf(gov.lotAddress), ...dongsOf(gov.roadAddress), ...[...String(gov.roadAddress ?? "").matchAll(/\(([^)]*)\)/g)].flatMap((m) => m[1].split(/[,\s]+/))]);
    if ([...mine].some((d) => theirs.has(d))) return true;
    return ours.lat != null && ours.lng != null && gov.lat != null && gov.lng != null && kmBetween({ lat: ours.lat, lng: ours.lng }, { lat: gov.lat, lng: gov.lng }) <= 0.3;
}

/** 우리 매장 목록과 받은 목록을 짝짓는다 — 한 우리 매장에는 하나만(같은 곳이 둘이면 이름이 맞는 쪽) */
export function matchHalls(ours: readonly OurListing[], govs: readonly GovHall[]): Map<string, string> {
    const byPlace = new Map<string, GovHall[]>();
    const sidoOf = (a: string) => placeKey(a).split("|")[0];
    for (const g of govs) { const k = sidoOf(g.address); (byPlace.get(k) ?? byPlace.set(k, []).get(k)!).push(g); }
    const out = new Map<string, string>(); const taken = new Set<string>();
    for (const o of ours) {
        const cands = (byPlace.get(sidoOf(o.address)) ?? []).filter((g) => !taken.has(g.key) && sameHall(o, g));
        const pick = cands.find((g) => !!hallNameKey(o.name) && hallNameKey(g.name) === hallNameKey(o.name)) ?? cands[0];
        if (pick) { out.set(o.code, pick.key); taken.add(pick.key); }
    }
    return out;
}
