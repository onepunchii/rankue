/**
 * 골프 부킹 지역 구분 — 화면의 필터 칩과 서버의 조회 조건이 **같은 정의**를 쓰도록 여기 하나에 둔다.
 *
 * 왜 필요했나: golf_bookings.region 은 골프장 마스터에서 그대로 복사해 온 자유 문자열이다.
 * '경기', '경기도 용인시', '용인' 이 뒤섞여 들어온다. 예전 필터는 그 문자열에 LIKE 를 걸었는데
 *
 *     kyunggi_south: ['경기', '서울', '남부']
 *     kyunggi_north: '경기'
 *     kyunggi_east:  '경기'
 *
 * 셋 다 '경기' 를 훑었다. 즉 경기 남부·북부·동부를 아무거나 눌러도 결과가 똑같았고, 남부는 거기에
 * 서울까지 얹었다(2026-09-09 검토). 지역을 나눠 놓고 안 나뉘는 필터였다.
 *
 * 이제 글을 넣을 때 서버가 이 파일의 규칙으로 코드를 굳혀 region_code 에 저장하고, 조회는 그 코드로 한다.
 * region 문자열은 화면에 그대로 보여 주는 표시용으로만 남는다.
 *
 * 못 가르는 경우를 숨기지 않는다: '경기' 라고만 적혀 시·군을 알 수 없으면 KYUNGGI_ANY 로 굳히고,
 * 경기 세 칩 중 무엇을 눌러도 함께 나온다. 필터가 매물을 사라지게 하는 쪽보다 낫다.
 */

/** 필터 칩 id = region_code 에 저장되는 값. */
export type GolfRegionCode =
    | "kyunggi_south"
    | "kyunggi_north"
    | "kyunggi_east"
    | "incheon_west"
    | "gangwon"
    | "chungcheong"
    | "jeolla"
    | "gyeongsang"
    | "jeju";

/** 시·군을 몰라 경기 안에서 더 못 가른 매물. 경기 칩 셋 중 무엇을 눌러도 함께 나온다. */
export const KYUNGGI_ANY = "kyunggi";

export interface GolfRegionBucket {
    id: GolfRegionCode;
    label: string;
    /** 이 권역으로 판정하는 시·군·구 이름. 광역 이름(도·광역시)은 provinces 가 따로 본다. */
    cities: readonly string[];
}

/** 경기를 남/북/동/서로 가르는 칩들. 이 넷은 '경기' 만 적힌 매물을 함께 보여 준다. */
export const KYUNGGI_CODES: readonly GolfRegionCode[] = [
    "kyunggi_south",
    "kyunggi_north",
    "kyunggi_east",
    "incheon_west",
];

export const GOLF_REGION_BUCKETS: readonly GolfRegionBucket[] = [
    {
        id: "kyunggi_south",
        label: "경기 남부 (한강 이남)",
        cities: [
            "수원", "용인", "성남", "안양", "군포", "의왕", "과천", "안성",
            "평택", "오산", "화성", "이천", "여주", "광주시", "경기광주",
        ],
    },
    {
        id: "kyunggi_north",
        label: "경기 북부 (한강 이북)",
        cities: ["고양", "파주", "양주", "의정부", "동두천", "연천", "포천"],
    },
    {
        id: "kyunggi_east",
        label: "경기 동부 (남양주/가평)",
        cities: ["남양주", "가평", "양평", "하남", "구리"],
    },
    {
        id: "incheon_west",
        label: "인천 / 경기 서부",
        cities: ["인천", "강화", "영종", "김포", "부천", "시흥", "안산", "광명"],
    },
    {
        id: "gangwon",
        label: "강원권",
        cities: [
            "춘천", "원주", "강릉", "속초", "동해", "삼척", "태백", "홍천", "횡성",
            "영월", "평창", "정선", "철원", "화천", "양구", "인제", "양양", "고성",
        ],
    },
    {
        id: "chungcheong",
        label: "충청권",
        cities: [
            "천안", "아산", "청주", "충주", "제천", "공주", "논산", "계룡", "보령",
            "서산", "당진", "태안", "예산", "홍성", "청양", "부여", "서천", "금산",
            "음성", "진천", "괴산", "증평", "옥천", "영동", "단양", "보은",
        ],
    },
    {
        id: "jeolla",
        label: "전라권",
        cities: [
            "전주", "군산", "익산", "정읍", "남원", "김제", "완주", "진안", "무주",
            "장수", "임실", "순창", "고창", "부안", "목포", "여수", "순천", "나주",
            "광양", "담양", "곡성", "구례", "고흥", "보성", "화순", "장흥", "강진",
            "해남", "영암", "무안", "함평", "영광", "장성", "완도", "진도", "신안",
        ],
    },
    {
        id: "gyeongsang",
        label: "경상권",
        cities: [
            "포항", "경주", "김천", "안동", "구미", "영주", "영천", "상주", "문경",
            "경산", "의성", "청송", "영양", "영덕", "청도", "고령", "성주", "칠곡",
            "예천", "봉화", "울진", "울릉", "군위",
            "창원", "진주", "통영", "사천", "김해", "밀양", "거제", "양산", "의령",
            "함안", "창녕", "남해", "하동", "산청", "함양", "거창", "합천",
            "울주", "기장", "달성",
        ],
    },
    { id: "jeju", label: "제주", cities: ["제주", "서귀포"] },
];

/** 화면 필터 칩 목록. constants/booking.ts 의 REGION_OPTIONS 가 이걸 그대로 쓴다. */
export const GOLF_REGION_OPTIONS = GOLF_REGION_BUCKETS.map((b) => ({ id: b.id, label: b.label }));

/**
 * 광역 이름 → 권역. 시·군보다 **먼저** 본다.
 * 광주가 둘이라(경기 광주시 / 광주광역시) 순서가 중요하다 — '경기' 가 적혀 있으면 전라로 새지 않는다.
 */
const PROVINCE_RULES: readonly { tokens: readonly string[]; code: GolfRegionCode | typeof KYUNGGI_ANY }[] = [
    { tokens: ["제주"], code: "jeju" },
    { tokens: ["강원"], code: "gangwon" },
    { tokens: ["인천"], code: "incheon_west" },
    { tokens: ["대전", "세종", "충북", "충남", "충청"], code: "chungcheong" },
    { tokens: ["대구", "부산", "울산", "경북", "경남", "경상"], code: "gyeongsang" },
    { tokens: ["전북", "전남", "전라", "광주광역"], code: "jeolla" },
];

/** 문자열에서 공백·하이픈을 지운다 — '경기 용인' 과 '경기용인' 을 같게 본다. */
function squash(v: string): string {
    return v.replace(/[\s\-·,]/g, "");
}

/**
 * 시·군 이름을 **긴 것부터** 훑는 색인. 짧은 이름이 긴 이름 안에 들어 있는 경우가 있어서
 * 순서를 안 정하면 엉뚱하게 잡힌다 — '남양주'(동부) 가 '양주'(북부) 로 잡히던 것이 그 예다.
 *
 * 아직 남은 겹침: 고성(강원 고성군 / 경남 고성군). 광역 이름 없이 '고성' 만 오면 강원으로 본다 —
 * 실제 자료(golf/golf.csv 525곳)는 광역을 늘 함께 적어서 이 경우가 안 생기고, 적혀 있으면 광역 규칙이 먼저 잡는다.
 */
const CITY_INDEX: readonly { city: string; code: GolfRegionCode }[] = GOLF_REGION_BUCKETS
    .flatMap((b) => b.cities.map((city) => ({ city, code: b.id })))
    .sort((a, b) => b.city.length - a.city.length);

const KYUNGGI_CITY_INDEX = CITY_INDEX.filter((e) => (KYUNGGI_CODES as readonly string[]).includes(e.code));

/**
 * 골프장의 지역 문자열(그리고 있으면 주소)에서 필터 코드를 뽑는다.
 *
 * 판정 순서
 *  1) 경기·서울이면 시·군으로 남/북/동/서를 가른다. 못 가르면 KYUNGGI_ANY.
 *  2) 그 밖의 광역 이름(제주·강원·인천·충청·경상·전라)이 있으면 그 권역.
 *  3) 광역 이름이 없으면 시·군 이름만으로 찾는다.
 *  4) 아무것도 못 찾으면 null — 지역 필터를 걸면 안 나온다(억지로 아무 데나 넣지 않는다).
 */
export function resolveGolfRegionCode(
    region: string | null | undefined,
    address?: string | null,
): GolfRegionCode | typeof KYUNGGI_ANY | null {
    const text = squash(`${region ?? ""} ${address ?? ""}`);
    if (!text) return null;

    const kyunggi = (): GolfRegionCode | typeof KYUNGGI_ANY => {
        // 서울은 골프장이 몇 곳뿐이고 한강 남북이 갈려서, 시·군 규칙으로 못 가르면 KYUNGGI_ANY 로 둔다
        // (경기 칩 어느 것을 눌러도 나온다). 없는 근거로 남부라고 우기지 않는다.
        const hit = KYUNGGI_CITY_INDEX.find((e) => text.includes(e.city));
        return hit ? hit.code : KYUNGGI_ANY;
    };

    // 1) **맨 앞의** 광역 이름. 실제 자료는 '경기 고양시 …' 처럼 광역이 앞에 온다.
    //    앞자리만 보는 이유: 도로명에 다른 지역 이름이 들어가는 일이 흔해서다
    //    ('포항시 … 대전길' 을 '대전' 때문에 충청으로 보내면 안 된다).
    if (text.startsWith("경기") || text.startsWith("서울")) return kyunggi();
    for (const rule of PROVINCE_RULES) {
        if (rule.tokens.some((t) => text.startsWith(t))) return rule.code;
    }

    // 2) 시·군 이름 (긴 이름부터)
    const byCity = CITY_INDEX.find((e) => text.includes(e.city));
    if (byCity) return byCity.code;

    // 3) 마지막으로 광역 이름이 문장 어디에든 있으면 그것으로 본다.
    if (text.includes("경기") || text.includes("서울")) return kyunggi();
    for (const rule of PROVINCE_RULES) {
        if (rule.tokens.some((t) => text.includes(t))) return rule.code;
    }

    return null;
}

/**
 * 고른 칩들이 실제로 훑을 코드 목록. 경기 칩이 하나라도 있으면 KYUNGGI_ANY 를 함께 넣는다 —
 * 시·군을 못 적은 경기 매물이 필터 때문에 사라지지 않게.
 */
export function expandRegionCodes(selected: readonly string[]): string[] {
    const valid = selected.filter((id) => GOLF_REGION_BUCKETS.some((b) => b.id === id));
    if (valid.length === 0) return [];
    const needsAny = valid.some((id) => (KYUNGGI_CODES as readonly string[]).includes(id));
    return needsAny ? [...valid, KYUNGGI_ANY] : valid;
}

/**
 * region_code 가 비어 있는 **옛 행**을 위한 되짚기 낱말. 코드는 2026-09-10 부터 넣기 시작했으니
 * 그 전에 다른 경로로 들어간 행이 있다면 지역 필터에서 통째로 사라진다 — 그건 필터가 아니라 삭제다.
 * 그래서 코드가 없는 행만 예전처럼 문자열로 훑는다(느슨하지만 안 숨긴다).
 */
const PROVINCE_KEYWORDS: Record<GolfRegionCode, readonly string[]> = {
    kyunggi_south: ["경기", "서울"],
    kyunggi_north: ["경기", "서울"],
    kyunggi_east: ["경기", "서울"],
    incheon_west: ["경기", "인천"],
    gangwon: ["강원"],
    chungcheong: ["충북", "충남", "충청", "대전", "세종"],
    jeolla: ["전북", "전남", "전라", "광주"],
    gyeongsang: ["경북", "경남", "경상", "대구", "부산", "울산"],
    jeju: ["제주"],
};

export function legacyRegionKeywords(selected: readonly string[]): string[] {
    const out = new Set<string>();
    for (const b of GOLF_REGION_BUCKETS) {
        if (!selected.includes(b.id)) continue;
        b.cities.forEach((c) => out.add(c));
        PROVINCE_KEYWORDS[b.id].forEach((p) => out.add(p));
    }
    return [...out];
}

/** 골프 여권(도장깨기) 지도의 여섯 묶음. 지도 그림이 이 단위로 칠해진다. */
export const PASSPORT_REGION_GROUPS = ["경기", "강원", "충청", "전라", "경상", "제주"] as const;
export type PassportRegionGroup = (typeof PASSPORT_REGION_GROUPS)[number];

/**
 * 필터용 권역 코드 → 여권 지도 묶음. 서울·인천은 경기로 묶는다(지도에서도 한 색으로 칠한다).
 * 예전 여권은 이 표를 안 쓰고 자체 매핑을 두 파일에 복붙했고, 지도는 영문 키로 한글 합계를 찾아
 * 17개 지역 중 하나도 칠해지지 않았다(2026-09-11).
 */
export function passportRegionGroup(code: string | null | undefined): PassportRegionGroup | null {
    if (!code) return null;
    if (code === KYUNGGI_ANY || code.startsWith("kyunggi_") || code === "incheon_west") return "경기";
    const map: Record<string, PassportRegionGroup> = { gangwon: "강원", chungcheong: "충청", jeolla: "전라", gyeongsang: "경상", jeju: "제주" };
    return map[code] ?? null;
}
