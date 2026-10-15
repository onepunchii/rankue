/**
 * 등산 — 해외 명산 투어판(2026-10-16 오너: "한국인이 잘 가는 등산 코스 먼저 테스트"). 읽는 콘텐츠만 — 도장 · 정상 인증 대상이 아니다.
 *
 * 첫판(시험) 8곳: 한국 여행사 상품 수 · 월간산 설문(2019) · 직항 접근성으로 고른 코스.
 * 싣는 기준:
 *   · 높이 · 좌표는 Wikipedia, 허가 · 입산료 · 개방 기간은 공식 기관 페이지에서 읽은 것만 그대로 적는다.
 *   · 공식 출처로 확인하지 못한 줄은 check: true — 화면에 "확인 필요"를 붙인다. 지우지 말고 사람이 확인한 뒤 내린다.
 *   · 상품 가격은 싣지 않는다(환율 · 유류할증료로 매달 바뀐다). 요금은 현지 공식 요금만, 현지 통화로.
 *   · 빨리 · 밤새 오르기를 부추기는 말은 싣지 않는다.
 * 화면(client/src/hiking)과 검색용 화면(server/seo/hiking)이 같은 글을 쓴다. 순수 값만.
 * ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'.
 */
const BRAND = " | 랭큐 등산";

/** 이 판의 사실을 확인한 날 */
export const HIKING_ABROAD_CHECKED_ON = "2026-10-16";

export type AbroadRegionId = "japan" | "china" | "sea" | "himalaya" | "alps";
export const ABROAD_REGIONS: readonly { id: AbroadRegionId; name: string }[] = [
    { id: "japan", name: "일본" },
    { id: "china", name: "중국 · 대만" },
    { id: "sea", name: "동남아시아" },
    { id: "himalaya", name: "히말라야" },
    { id: "alps", name: "알프스" },
];

/** 한 줄 사실. check = 공식 출처로 아직 확인하지 못함(화면에 "확인 필요") */
export interface AbroadFact { text: string; check?: boolean }
export interface AbroadSource { label: string; url: string }
/** 1 가벼움 · 2 보통 · 3 힘듦(고산 · 여러 날) */
export type AbroadLevel = 1 | 2 | 3;
export const ABROAD_LEVEL_NAME: Record<AbroadLevel, string> = { 1: "가벼움", 2: "보통", 3: "힘듦" };
export type AbroadAltitude = "low" | "mid" | "high";
export const ABROAD_ALTITUDE_NAME: Record<AbroadAltitude, string> = { low: "낮음", mid: "중간", high: "높음" };

export interface AbroadCourse {
    /** 주소(/hiking/abroad/<id>) — 로마자 */
    id: string;
    name: string;
    local: string;
    country: string;
    region: AbroadRegionId;
    /** 산(최고봉)의 높이 m — Wikipedia */
    peakM: number;
    /** 이 코스가 닿는 가장 높은 곳 */
    top: { m: number; where: string; check?: boolean };
    /** 정상(또는 목적지) 좌표 — Wikipedia */
    lat: number;
    lng: number;
    short: string;
    course: string;
    days: string;
    level: AbroadLevel;
    levelNote: string;
    altitude: AbroadAltitude;
    altitudeNote: string;
    season: readonly AbroadFact[];
    permits: readonly AbroadFact[];
    guide: AbroadFact;
    access: readonly AbroadFact[];
    highlights: readonly string[];
    cautions: readonly string[];
    sources: readonly AbroadSource[];
}

const WIKI = (title: string, label = "Wikipedia"): AbroadSource => ({ label, url: `https://en.wikipedia.org/wiki/${title}` });

export const HIKING_ABROAD: readonly AbroadCourse[] = [
    {
        id: "baekdu", name: "백두산 서파 · 북파", local: "长白山 Changbai Shan", country: "중국 지린성", region: "china",
        peakM: 2744, top: { m: 2670, where: "북파 천문봉 부근", check: true }, lat: 41.99333, lng: 128.0775,
        short: "중국 쪽에서 천지를 보는 길. 서파는 계단, 북파는 차로 오른다.",
        course: "서파는 셔틀에서 내려 1,442계단을 올라 천지 전망대에 선다. 북파는 셔틀로 천문봉 아래까지 오르고, 장백폭포 쪽은 따로 걷는다.",
        days: "경구마다 하루. 한국 여행사 일정은 보통 3박 4일, 산 아래 이도백하 같은 마을에서 잔다.",
        level: 1, levelNote: "걷는 거리는 짧다. 서파의 계단이 가장 힘든 구간이다.",
        altitude: "mid", altitudeNote: "천지 둘레는 2,000m가 넘는다. 계단을 천천히 오른다.",
        season: [
            { text: "한국 여행사 상품은 6~9월에 몰린다." },
            { text: "천지는 날씨가 나쁘면 그날 닫히기도 한다. 안개가 끼면 호수가 보이지 않는다." },
            { text: "남파는 5월 중순~10월만 연다.", check: true },
        ],
        permits: [
            { text: "실명으로 시간대를 골라 예약한다. 북파 · 서파 · 남파는 경구마다 따로 예약한다." },
            { text: "여러 날 쓰던 통합권은 2023년 7월에 없어졌고, 입장권은 그날 한 번만 쓴다." },
            { text: "입장권 105위안, 경구 안 셔틀은 따로 낸다.", check: true },
        ],
        guide: { text: "가이드 의무는 없다. 대부분 여행사 일정으로 간다." },
        access: [
            { text: "인천에서 옌지(연길)로 가는 직항이 있다.", check: true },
            { text: "옌지에서 북파 입구까지 차로 3시간 안팎.", check: true },
        ],
        highlights: ["맑은 날의 천지", "서파의 1,442계단과 금강대협곡", "북파의 장백폭포"],
        cautions: ["천지 둘레는 한여름에도 바람이 차다. 겉옷과 비옷을 챙긴다.", "국경 표지가 있는 곳은 정해진 구역 밖으로 나가지 않는다."],
        sources: [
            { label: "창바이산 관리위원회", url: "https://www.changbaishan.gov.cn" },
            { label: "지린성 관광 안내(창바이산)", url: "https://www.gojilin.gov.cn/changbaishan/2021/08/19/c_7089.htm" },
            WIKI("Paektu_Mountain"),
        ],
    },
    {
        id: "fuji", name: "후지산 요시다 루트", local: "富士山 Mount Fuji", country: "일본 야마나시현 · 시즈오카현", region: "japan",
        peakM: 3776, top: { m: 3776, where: "정상(겐가미네)" }, lat: 35.36083, lng: 138.7275,
        short: "일본 최고봉. 여름 두 달만 열리고, 산장에서 하룻밤 묵고 정상에 선다.",
        course: "요시다 루트 5합목(해발 약 2,300m)에서 출발해 산장에서 묵고 다음 날 정상에 오른다. 내려오는 길은 따로 나 있다.",
        days: "1박 2일, 8~9합목 산장에서 잔다. 한국 여행사 일정은 보통 2박 3일.",
        level: 2, levelNote: "기술 구간은 없지만 오르막이 길고 3,000m 위에서는 숨이 찬다.",
        altitude: "mid", altitudeNote: "정상은 3,776m. 산장에서 하룻밤 묵으며 몸을 적응시킨다.",
        season: [
            { text: "공식 등산 기간은 7월 1일~9월 10일. 그 밖의 기간에 5합목 위로 오르는 것은 금지다." },
            { text: "시즈오카현 쪽 루트(후지노미야 · 고텐바 · 스바시리)는 열리는 날이 다를 수 있다.", check: true },
        ],
        permits: [
            { text: "통행료 1인 4,000엔. 요시다 루트는 야마나시현 예약 시스템으로 낸다." },
            { text: "시즈오카현 쪽 루트는 사전 등록을 한다." },
            { text: "요시다 루트 5합목 게이트는 14시부터 다음 날 3시까지 닫히고, 산장을 예약한 사람만 지난다. 하루 4,000명이 넘으면 닫힌다." },
        ],
        guide: { text: "가이드 의무는 없다." },
        access: [
            { text: "도쿄(나리타 · 하네다)로 가서 가와구치코를 거쳐 5합목행 버스를 탄다.", check: true },
            { text: "시즈오카 공항으로 가는 직항도 있다.", check: true },
        ],
        highlights: ["정상에서 맞는 일출", "분화구를 한 바퀴 도는 길", "구름 위 산장의 하룻밤"],
        cautions: ["정상은 한여름에도 쌀쌀하고 바람이 세다. 보온 옷과 장갑을 챙긴다.", "산장 예약 없이 쉬지 않고 밤새 오르는 것은 공식적으로 말린다."],
        sources: [
            { label: "후지산 등산 공식 사이트", url: "https://www.fujisan-climb.jp/faq/" },
            { label: "요시다 루트 운영 기간", url: "https://www.fujisan-climb.jp/en/trails/yoshida-trail-service-period.html" },
            { label: "후지요시다시", url: "https://www.city.fujiyoshida.yamanashi.jp/site/english/1292.html" },
            WIKI("Mount_Fuji"),
        ],
    },
    {
        id: "kinabalu", name: "키나발루", local: "Gunung Kinabalu", country: "말레이시아 사바", region: "sea",
        peakM: 4095, top: { m: 4095, where: "로우스 피크" }, lat: 6.075, lng: 116.55861,
        short: "동남아 최고봉. 인천에서 직항으로 가고, 산장에서 하룻밤 묵는다.",
        course: "팀포혼 게이트에서 출발해 라반라타 산장 지대에서 묵고, 둘째 날 새벽에 로우스 피크에 오른 뒤 내려온다.",
        days: "1박 2일, 레마잉 · 파날라반 산장에서 자고 라반라타에서 먹는다. 한국 여행사 일정은 보통 4박 5일.",
        level: 2, levelNote: "기술 구간은 없지만 이틀에 걸쳐 2,000m 넘게 오르내린다.",
        altitude: "mid", altitudeNote: "정상은 4,095m. 산장에서 하룻밤 묵으며 적응한다.",
        season: [
            { text: "1년 내내 오른다. 산장 자리가 정해져 있어 일찍 예약한다." },
            { text: "비가 많은 날은 정상 구간이 막힐 수 있다.", check: true },
        ],
        permits: [
            { text: "등반 허가 외국인 성인 RM400, 17세 이하 RM200. 보험 RM10, 외국인 보전료 성인 RM50." },
            { text: "산장과 식사는 묶음 상품으로 예약한다. 가이드 · 교통 · 포터는 현장에서 따로 낸다." },
        ],
        guide: { text: "등록된 산악 가이드 의무. 가이드 한 명이 성인 다섯 명(15세 이하는 두 명)까지, 가이드비 RM350." },
        access: [
            { text: "인천에서 코타키나발루로 가는 직항이 있다(약 5시간)." },
            { text: "공항에서 키나발루 공원까지 차로 2시간 안팎.", check: true },
        ],
        highlights: ["로우스 피크의 일출", "화강암으로 된 넓은 정상부", "열대 숲에서 고산까지 바뀌는 숲"],
        cautions: ["정상부는 바람과 추위가 세다. 장갑과 보온 옷을 챙긴다.", "가이드 없이 오를 수 없다. 산장 예약이 먼저다."],
        sources: [
            { label: "사바 공원(키나발루)", url: "https://www.sabahparks.org.my/kinabalu-park/mount-kinabalu" },
            { label: "사바 공원 등반 안내", url: "https://www.sabahparks.org.my/services/mount-kinabalu-climbing" },
            WIKI("Mount_Kinabalu"),
        ],
    },
    {
        id: "tateyama", name: "다테야마 · 가미코치", local: "立山 Tateyama · 上高地 Kamikochi", country: "일본 도야마현 · 나가노현", region: "japan",
        peakM: 3015, top: { m: 3003, where: "오야마(雄山)", check: true }, lat: 36.57583, lng: 137.61972,
        short: "북알프스. 알펜루트로 높이 올라 설벽과 능선을 걷고, 가미코치 계곡을 함께 본다.",
        course: "다테야마 알펜루트의 케이블카 · 버스로 무로도까지 올라, 이치노코시를 지나 오야마 정상까지 걷는다. 같은 일정에 가미코치 계곡 산책을 붙이는 경우가 많다.",
        days: "알펜루트는 하루에 지난다. 오야마까지 걸으려면 무로도 둘레에서 하룻밤 묵는 편이 낫다. 한국 여행사 일정은 4~5일.",
        level: 2, levelNote: "무로도 둘레 산책은 가볍다. 오야마까지는 돌길 오르막이다.",
        altitude: "mid", altitudeNote: "탈것으로 한 번에 2,000m 넘게 오른다. 두통이 오면 쉬어 간다.",
        season: [
            { text: "2026년 알펜루트 운행은 4월 15일~11월 30일. 겨울에는 운행하지 않는다." },
            { text: "5~6월에는 길 양옆에 높은 눈벽(유키노오타니)이 선다. 단풍은 9~10월." },
        ],
        permits: [
            { text: "입산 허가는 필요 없다." },
            { text: "알펜루트 요금은 구간마다 다르다(다테야마역 ⇔ 무로도 왕복 7,380엔).", check: true },
        ],
        guide: { text: "가이드 의무는 없다." },
        access: [
            { text: "도야마 공항, 또는 도쿄 · 나고야를 거쳐 도야마로 간다.", check: true },
            { text: "가미코치는 자가용이 들어가지 못해 버스로 들어간다." },
        ],
        highlights: ["봄의 설벽 길", "구로베 댐", "가미코치 계곡과 갓파바시"],
        cautions: ["연휴와 개통 무렵에는 표가 일찍 매진된다.", "능선은 날씨가 빨리 바뀐다. 비옷과 보온 옷을 챙긴다."],
        sources: [
            { label: "다테야마 구로베 알펜루트 공식", url: "https://www.alpen-route.com/en/tateyama-kurobe-alpine-route-will-open-on-april-15th-2026" },
            { label: "알펜루트 요금", url: "https://www.alpen-route.com/en/fare/" },
            WIKI("Mount_Tate"),
            WIKI("Tateyama_Kurobe_Alpine_Route", "Wikipedia(알펜루트)"),
        ],
    },
    {
        id: "yushan", name: "옥산 주봉", local: "玉山 Yushan", country: "대만 옥산국가공원", region: "china",
        peakM: 3952, top: { m: 3952, where: "주봉" }, lat: 23.47, lng: 120.95722,
        short: "동북아 최고봉. 산장 자리를 추첨으로 얻어 하룻밤 묵고 오른다.",
        course: "타타가 등산로 입구에서 파이윈 산장까지 걷고, 다음 날 주봉에 올랐다가 내려온다.",
        days: "1박 2일, 파이윈 산장에서 잔다. 산장을 못 얻으면 하루에 다녀오는 긴 일정이 된다.",
        level: 3, levelNote: "3,000m 위가 길고, 정상 아래는 바위 · 쇠사슬 구간이다.",
        altitude: "high", altitudeNote: "정상은 3,952m. 산장에서 묵으며 적응하는 편이 안전하다.",
        season: [
            { text: "봄(3~4월)과 가을(10~12월)이 좋다. 여름은 태풍이 잦다.", check: true },
            { text: "큰 눈이 온 뒤에는 하루 왕복 입산이 막힌다." },
        ],
        permits: [
            { text: "국가공원 입원 허가를 받는다(입원 예정일 5일 전~2개월 전)." },
            { text: "파이윈 산장은 숙박일 1개월 전에 추첨한다. 외국인 우선 신청은 입원 35일 전~4개월 전, 일~목요일 하루 24자리." },
            { text: "경찰 입산 신고(입산증)도 따로 한다.", check: true },
        ],
        guide: { text: "가이드 의무는 없다고 알려져 있다.", check: true },
        access: [
            { text: "인천에서 타이베이로 가는 직항이 있다." },
            { text: "고속철로 자이(嘉義)까지 가서 차로 타타가에 간다.", check: true },
        ],
        highlights: ["대만 최고봉 정상의 일출", "파이윈 산장의 하룻밤", "타타가의 고산 숲"],
        cautions: ["정상 아래 바위 구간은 바람이 세다. 장갑을 낀다.", "산장 추첨에 떨어질 수 있다. 일정을 넉넉히 잡는다."],
        sources: [
            { label: "대만 국가공원 입원 안내", url: "https://hike.taiwan.gov.tw/en/notice_a1.aspx" },
            { label: "파이윈 산장 외국인 신청", url: "https://hike.taiwan.gov.tw/news_7_1.aspx?ID=1026" },
            WIKI("Yushan_(mountain)"),
        ],
    },
    {
        id: "abc", name: "안나푸르나 베이스캠프 · 푼힐", local: "Annapurna Base Camp · Poon Hill", country: "네팔 안나푸르나 보전지역", region: "himalaya",
        peakM: 8091, top: { m: 4130, where: "안나푸르나 베이스캠프", check: true }, lat: 28.53, lng: 83.878,
        short: "히말라야 입문. 거대한 봉우리에 둘러싸인 분지까지 롯지에서 묵으며 걷는다.",
        course: "포카라에서 차로 들머리에 가서 촘롱 · 데우랄리 · 마차푸차레 베이스캠프를 지나 안나푸르나 베이스캠프에 닿는다. 고레파니를 거쳐 푼힐 전망대(3,210m)를 붙이기도 한다.",
        days: "7~10일, 길가 롯지(티하우스)에서 잔다. 푼힐만 다녀오면 4~5일.",
        level: 3, levelNote: "기술 구간은 없지만 계단이 끝없이 이어지고, 여러 날 4,000m 가까이 오른다.",
        altitude: "high", altitudeNote: "베이스캠프는 4,000m가 넘는다. 하루에 오르는 높이를 줄인다.",
        season: [
            { text: "봄(3~5월)과 가을(10~11월)이 좋다. 6~8월은 우기다.", check: true },
        ],
        permits: [
            { text: "2023년 4월부터 지정 보호구역은 면허 가이드와 트레킹 회사가 발급한 TIMS 카드가 있어야 한다. 푼힐 · ABC가 해당된다." },
            { text: "안나푸르나 보전지역 입장료 외국인 NPR 3,000. TIMS 카드 외국인 NPR 2,000." },
        ],
        guide: { text: "면허 가이드 동행 의무(지정 보호구역)." },
        access: [
            { text: "인천에서 카트만두로 간다. 직항 운항 여부는 시기마다 다르다.", check: true },
            { text: "카트만두에서 포카라까지 국내선이나 버스로 간다." },
        ],
        highlights: ["봉우리에 둘러싸인 베이스캠프", "물고기 꼬리 모양의 마차푸차레", "푼힐에서 보는 일출"],
        cautions: ["두통 · 구역이 오면 더 오르지 말고 내려간다.", "눈사태 위험 구간은 현지 통제를 따른다."],
        sources: [
            { label: "네팔관광청 TIMS 카드", url: "https://ntb.gov.np/en/plan-your-trip/before-you-come/tims-card" },
            { label: "네팔관광청 입장료", url: "https://ntb.gov.np/en/plan-your-trip/before-you-come/park-entry-fees" },
            WIKI("Poon_Hill", "Wikipedia(푼힐)"),
        ],
    },
    {
        id: "ebc", name: "에베레스트 베이스캠프", local: "Everest Base Camp", country: "네팔 사가르마타 국립공원", region: "himalaya",
        peakM: 8849, top: { m: 5364, where: "남쪽 베이스캠프" }, lat: 28.0026, lng: 86.8528,
        short: "세계 최고봉 아래까지. 셰르파 마을을 지나며 2주 가까이 걷는다.",
        course: "카트만두에서 경비행기로 루클라에 내려 남체 바자르 · 텡보체 · 딩보체 · 고락셉을 지나 베이스캠프에 닿는다. 칼라파타르에 올라 에베레스트를 본다.",
        days: "12~14일, 롯지(티하우스)에서 잔다. 몸을 적응시키는 쉬는 날이 들어간다.",
        level: 3, levelNote: "5,000m 위에서 여러 날 걷는다. 높이가 가장 큰 어려움이다.",
        altitude: "high", altitudeNote: "베이스캠프는 5,364m. 적응일을 거르지 않는다.",
        season: [
            { text: "봄(3~5월)과 가을(9~11월)이 좋다.", check: true },
            { text: "루클라 비행은 날씨 때문에 자주 미뤄진다. 앞뒤로 하루 이틀 여유를 둔다." },
        ],
        permits: [
            { text: "사가르마타 국립공원 입장료 외국인 NPR 3,000." },
            { text: "쿰부 파상라무 지자체 입장료를 따로 낸다.", check: true },
            { text: "TIMS 카드와 가이드 의무가 이 지역에도 같게 적용되는지는 현지 규정이 따로 있다.", check: true },
        ],
        guide: { text: "가이드 의무 여부는 지역 규정에 따라 다르다.", check: true },
        access: [
            { text: "인천에서 카트만두로 간다. 직항 운항 여부는 시기마다 다르다.", check: true },
            { text: "카트만두(또는 라메찹)에서 루클라까지 경비행기로 간다." },
        ],
        highlights: ["칼라파타르에서 보는 에베레스트", "남체 바자르의 셰르파 마을", "텡보체 사원"],
        cautions: ["높이에 몸이 적응하는 날을 반드시 둔다. 증상이 오면 내려간다.", "비행 결항에 대비해 일정을 넉넉히 잡는다."],
        sources: [
            { label: "네팔관광청 입장료", url: "https://ntb.gov.np/en/plan-your-trip/before-you-come/park-entry-fees" },
            { label: "네팔 이민국 트레킹 허가", url: "https://www.immigration.gov.np/en/page/trekking-permit" },
            WIKI("Everest_base_camps"),
        ],
    },
    {
        id: "tmb", name: "몽블랑 둘레길(TMB)", local: "Tour du Mont Blanc", country: "프랑스 · 이탈리아 · 스위스", region: "alps",
        peakM: 4806, top: { m: 2537, where: "그랑 콜 페레", check: true }, lat: 45.83278, lng: 6.865,
        short: "알프스의 대표 장거리 길. 몽블랑을 한 바퀴 돌며 세 나라 산장에서 묵는다.",
        course: "샤모니 둘레에서 출발해 몽블랑 산군을 한 바퀴 돈다. 고개를 여럿 넘으며 프랑스 · 이탈리아 · 스위스를 지난다.",
        days: "보통 7~11일, 산장과 마을 숙소에서 잔다. 한국 여행사는 일부 구간만 걷는 9~12일 일정이 많다.",
        level: 3, levelNote: "높이보다 거리가 어렵다. 약 170km를 걸으며 매일 큰 고개를 넘는다.",
        altitude: "low", altitudeNote: "길의 가장 높은 곳도 3,000m가 안 된다.",
        season: [
            { text: "6월 중순~9월 중순. 7~8월이 가장 붐빈다." },
            { text: "6월과 9월에는 문을 열지 않은 산장이 있다." },
        ],
        permits: [
            { text: "입산 허가는 필요 없다. 산장은 공식 예약 사이트에서 미리 잡는다." },
            { text: "낙석으로 막힌 구간은 우회로가 공지된다. 떠나기 전에 확인한다.", check: true },
        ],
        guide: { text: "가이드 의무는 없다." },
        access: [
            { text: "인천에서 제네바로 가서(경유) 버스로 샤모니에 간다.", check: true },
        ],
        highlights: ["몽블랑의 빙하와 만년설", "세 나라 산장의 하룻밤", "고개마다 바뀌는 알프스 풍경"],
        cautions: ["여름 7~8월 산장은 몇 달 전에 찬다.", "고개 위는 날씨가 빨리 바뀐다. 비옷과 보온 옷을 챙긴다."],
        sources: [
            { label: "Mon Tour du Mont-Blanc(산장 예약)", url: "https://www.montourdumontblanc.com/en/" },
            WIKI("Mont_Blanc"),
            WIKI("Tour_du_Mont_Blanc", "Wikipedia(TMB)"),
        ],
    },
];

export const hikingAbroad = (id: string | null | undefined): AbroadCourse | undefined => HIKING_ABROAD.find((c) => c.id === id);
export const HIKING_ABROAD_PATH = "/hiking/abroad";
export const hikingAbroadPath = (id: string) => `${HIKING_ABROAD_PATH}/${id}`;
export const HIKING_ABROAD_H1 = "해외 명산 투어판";
export const HIKING_ABROAD_LEAD = "한국 사람이 많이 가는 해외 산행 코스를 모았어요. 허가 · 개방 기간 · 가는 길을 공식 출처로 확인했어요.";
export const HIKING_ABROAD_NOTE = `${HIKING_ABROAD_CHECKED_ON.replace(/-/g, ".")}에 확인한 내용이에요. 요금 · 허가 · 개방 기간은 해마다 바뀌니 떠나기 전에 공식 출처를 다시 확인해 주세요. '확인 필요'가 붙은 줄은 아직 공식 출처로 확인하지 못한 내용이에요.`;
export const HIKING_ABROAD_SEO = {
    path: HIKING_ABROAD_PATH,
    title: `해외 명산 투어판 — 후지산 · 백두산 · 키나발루 · 옥산 · 안나푸르나${BRAND}`,
    desc: `한국 사람이 많이 가는 해외 산행 코스 ${HIKING_ABROAD.length}곳 — 높이 · 일정 · 난이도 · 허가와 입산료 · 가이드 의무 · 가는 길을 공식 출처와 함께 정리했어요.`,
} as const;
export const hikingAbroadSeo = (c: AbroadCourse) => ({
    path: hikingAbroadPath(c.id),
    title: `${c.name} 등산 — 일정 · 허가 · 가는 길${BRAND}`,
    desc: `${c.name}(${c.country}, ${c.peakM.toLocaleString("en-US")}m) — ${c.short} ${c.days}`.slice(0, 150),
});
export const abroadHeightText = (m: number) => `${m.toLocaleString("en-US")}m`;
