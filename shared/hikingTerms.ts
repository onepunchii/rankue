/**
 * 등산 — 용어 사전과 준비물(2026-10-13 오너: "여러 가지 콘텐츠 추가로"). 검색으로 들어온 사람이 읽는 글이다 —
 * "들머리 뜻" · "알바 뜻 등산" · "등산 준비물"처럼 묻는 말에 한 화면으로 답한다(골프의 용어 사전 · 준비물과 같은 자리).
 *
 * 싣는 기준:
 *   · 산에 다니는 사람이 실제로 쓰는 말, 그리고 랭큐 등산 화면에 나오는 말(들머리 · 능선 · 하늘금 · 국가지점번호 …).
 *   · 틀리기 쉬운 숫자 · 날짜는 적지 않거나 "가기 전에 확인"이라고 적는다(통제 기간 · 예약 구간은 지역 · 해마다 다르다).
 *   · 상표 이름은 쓰지 않는다(겉옷의 소재 이름 따위). 술 이야기, 빨리 · 밤에 오르기를 부추기는 말도 싣지 않는다.
 * 화면(client/src/hiking)과 검색용 화면(server/seo/hiking)이 같은 글을 쓴다. 순수 값만.
 * ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'.
 */
const BRAND = " | 랭큐 등산";

export type HikingTermGroupId = "trail" | "walk" | "gear" | "safety";
export const HIKING_TERM_GROUPS: readonly { id: HikingTermGroupId; name: string }[] = [
    { id: "trail", name: "길과 지형" },
    { id: "walk", name: "산행 방식" },
    { id: "gear", name: "장비와 옷" },
    { id: "safety", name: "안전과 제도" },
];
export interface HikingTerm {
    /** 주소(/hiking/terms/<id>) — 로마자 */
    id: string;
    term: string;
    /** 같이 쓰는 말 */
    also?: readonly string[];
    group: HikingTermGroupId;
    /** 한 줄 뜻 */
    short: string;
    /** 풀어 쓴 설명 */
    body: string;
    /** 함께 보면 좋은 말(id) */
    see?: readonly string[];
}

export const HIKING_TERMS: readonly HikingTerm[] = [
    // ── 길과 지형 ──
    { id: "deulmeori", term: "들머리", also: ["등산로 입구", "기점"], group: "trail", short: "산행을 시작하는 곳.", body: "산으로 들어서는 첫 자리, 곧 등산로 입구를 이른다. 같은 산이라도 들머리에 따라 거리와 오르막이 크게 달라지므로 코스를 고를 때 들머리부터 정한다. 내려오는 곳은 날머리라고 한다.", see: ["nalmeori", "wonjeom", "jongju"] },
    { id: "nalmeori", term: "날머리", also: ["하산 지점"], group: "trail", short: "산행을 마치고 내려오는 곳.", body: "산에서 나오는 자리다. 들머리와 날머리가 같으면 원점 회귀, 다르면 종주나 횡단 산행이 된다. 날머리가 다르면 돌아오는 교통편을 미리 알아 둔다.", see: ["deulmeori", "wonjeom", "jongju"] },
    { id: "neungseon", term: "능선", also: ["산등성이"], group: "trail", short: "봉우리와 봉우리를 잇는 산등성이.", body: "산의 등줄기를 따라 이어지는 높은 선이다. 능선에 올라서면 가파른 오르막이 줄고 사방이 트인다. 바람을 그대로 맞는 자리라 여름에도 겉옷이 필요할 때가 있다.", see: ["anbu", "haneulgeum", "amneung"] },
    { id: "anbu", term: "안부", also: ["말안장"], group: "trail", short: "능선에서 봉우리 사이 낮게 꺼진 곳.", body: "두 봉우리 사이가 말안장처럼 낮아진 자리다. 예부터 고개가 난 곳이 많고, 여러 길이 만나는 갈림길이 되기 쉽다. 쉬어 가기 좋지만 바람이 모이는 자리이기도 하다.", see: ["neungseon", "gogae", "gallimgil"] },
    { id: "haneulgeum", term: "하늘금", also: ["스카이라인"], group: "trail", short: "능선이 하늘과 맞닿아 보이는 선.", body: "멀리서 볼 때 산줄기와 하늘이 만나 그리는 선을 이르는 우리말이다. 겹겹이 이어진 하늘금은 큰 산줄기를 걷는 사람들이 가장 아끼는 풍경이다. 랭큐 등산에서는 산 100곳을 오른 사람의 등급 이름이기도 하다.", see: ["neungseon", "baekdudaegan"] },
    { id: "gogae", term: "고개", also: ["재", "령", "치"], group: "trail", short: "산줄기를 넘어가는 낮은 목.", body: "산줄기에서 낮아진 곳으로 난 길이다. 이름 끝의 재 · 령 · 치 · 현은 모두 고개를 뜻한다. 차도가 넘는 고개는 능선 산행의 들머리로 많이 쓰인다 — 높은 데서 시작하니 오르막이 줄어든다.", see: ["anbu", "deulmeori"] },
    { id: "gallimgil", term: "갈림길", also: ["삼거리", "분기점"], group: "trail", short: "길이 둘 이상으로 갈리는 곳.", body: "산에서 길을 잃는 일은 대개 갈림길에서 시작된다. 이정표의 방향과 남은 거리를 확인하고, 이정표가 없으면 지나온 길을 돌아보아 기억해 둔다. 랭큐의 산행 화면은 앞에 있는 갈림길까지의 거리를 알려 준다.", see: ["ijeongpyo", "alba"] },
    { id: "ijeongpyo", term: "이정표", also: ["방향 표지"], group: "trail", short: "방향과 남은 거리를 알려 주는 표지.", body: "갈림길과 주요 지점에 서 있다. 적힌 거리는 걷는 길의 거리이고, 시간은 적혀 있지 않은 경우가 많다. 표지가 가리키는 이름이 내가 가려는 곳인지 지도와 맞춰 본다.", see: ["gallimgil", "gukgajijeom"] },
    { id: "neodeol", term: "너덜", also: ["너덜지대", "너덜겅"], group: "trail", short: "크고 작은 바위가 깔린 비탈.", body: "바위가 부서져 흘러내려 쌓인 곳이다. 돌이 흔들리고 틈이 깊어 발목을 다치기 쉽다. 스틱은 짧게 잡거나 접고, 돌의 한가운데를 밟으며 천천히 지난다. 비가 오거나 얼면 더 미끄럽다.", see: ["amneung", "slab"] },
    { id: "doenbial", term: "된비알", also: ["급경사"], group: "trail", short: "몹시 가파른 비탈.", body: "'된'은 심하다는 뜻이고 '비알'은 비탈의 옛말이다. 된비알에서는 보폭을 줄이고 숨이 차기 전에 쉬어 간다. 내려올 때 무릎에 힘이 많이 실리므로 스틱이 도움이 된다.", see: ["stick", "pace"] },
    { id: "amneung", term: "암릉", also: ["바위 능선", "릿지"], group: "trail", short: "바위로 이루어진 능선.", body: "흙길이 아니라 바위를 타고 넘는 능선이다. 손을 써야 하는 구간이 있고, 젖으면 미끄럽다. 난간과 계단이 놓인 탐방로를 벗어나 바위를 타는 것은 장비와 경험이 있어야 한다.", see: ["slab", "neungseon", "neodeol"] },
    { id: "slab", term: "슬랩", also: ["바위 비탈"], group: "trail", short: "넓고 매끈하게 기운 바위.", body: "판처럼 넓게 누운 바위 비탈이다. 마르면 신발 바닥이 잘 붙지만 비 · 이슬 · 얼음이 있으면 크게 미끄럽다. 젖은 날에는 슬랩이 많은 길을 피하는 편이 낫다.", see: ["amneung"] },
    { id: "jeongsangseok", term: "정상석", also: ["표지석"], group: "trail", short: "정상에 세운 표지 돌.", body: "산 이름과 높이를 새긴 돌이다. 정상에 오른 사람들이 그 앞에서 사진을 남긴다. 봉우리가 여럿인 산은 정상석이 가장 높은 곳이 아닌 자리에 서 있기도 하다.", see: ["injeung", "samgakjeom"] },
    { id: "samgakjeom", term: "삼각점", group: "trail", short: "측량의 기준이 되는 표지 돌.", body: "땅의 위치를 재는 기준점으로, 정상 가까이에 네모난 돌로 묻혀 있다. 정상석과는 다른 것이다. 훼손하면 안 되는 국가 시설이다.", see: ["jeongsangseok"] },
    { id: "baekdudaegan", term: "백두대간", group: "trail", short: "백두산에서 지리산까지 이어지는 큰 산줄기.", body: "물줄기에 끊기지 않고 이어지는 우리 땅의 등뼈다. 옛 지리서는 산줄기를 대간 하나와 정간 하나, 정맥 열셋으로 갈랐다. 남쪽 구간을 여러 번에 나누어 걷는 것이 대간 종주다.", see: ["jeongmaek", "jongju", "haneulgeum"] },
    { id: "jeongmaek", term: "정맥", group: "trail", short: "백두대간에서 갈라져 나온 산줄기.", body: "대간에서 뻗어 큰 강의 유역을 가르는 산줄기다. 낙동정맥 · 호남정맥처럼 이름이 붙어 있다. 높지 않지만 길고, 마을과 가까운 구간이 많다.", see: ["baekdudaegan"] },
    // ── 산행 방식 ──
    { id: "wonjeom", term: "원점 회귀", group: "walk", short: "출발한 곳으로 돌아오는 산행.", body: "들머리와 날머리가 같은 산행이다. 차를 두고 다녀오기 좋다. 올라간 길로 내려오는 왕복과, 다른 길로 돌아 내려오는 고리 모양이 있다.", see: ["deulmeori", "jongju"] },
    { id: "jongju", term: "종주", group: "walk", short: "능선을 따라 여러 봉우리를 이어 걷는 산행.", body: "한 산줄기의 끝에서 끝까지 걷는 것이다. 거리가 길고 중간에 내려설 길이 적어서 시간과 물을 넉넉히 잡는다. 하루에 끝나지 않는 종주는 대피소를 예약해 나누어 걷는다.", see: ["baekdudaegan", "daepiso", "nalmeori"] },
    { id: "alba", term: "알바", group: "walk", short: "길을 잘못 들어 헤매는 일.", body: "산꾼들이 쓰는 말로, 길을 잘못 들어 쓸데없이 더 걷는 것을 이른다. 이상하다 싶으면 더 가지 말고 마지막으로 확실했던 갈림길까지 되돌아가는 것이 가장 빠르다. 계곡으로 질러 내려가는 것은 위험하다.", see: ["gallimgil", "ijeongpyo", "gukgajijeom"] },
    { id: "pace", term: "페이스", also: ["걷는 빠르기"], group: "walk", short: "숨과 걸음의 빠르기.", body: "옆 사람과 말을 나눌 수 있을 만큼이 오래 걷는 빠르기다. 처음 삼십 분을 천천히 가면 뒤가 편하다. 여럿이 갈 때는 가장 느린 사람에게 맞춘다.", see: ["doenbial", "haengdongsik"] },
    { id: "hasan", term: "하산", group: "walk", short: "산에서 내려오는 일.", body: "다리에 힘이 빠진 채 내려오는 길에서 미끄러지고 삐는 일이 많다. 해가 지기 전에 내려설 수 있게 돌아설 시각을 미리 정해 두고, 정상에 못 미쳤더라도 그 시각이 되면 내려온다.", see: ["nalmeori", "headlamp"] },
    { id: "bibak", term: "비박", group: "walk", short: "텐트 없이 한데서 밤을 나는 일.", body: "침낭과 덮개만으로 밤을 보내는 것으로, 본래는 어쩔 수 없을 때의 한뎃잠을 뜻한다. 국립공원을 비롯한 많은 산에서는 정해진 곳 밖의 야영과 비박을 금지하니 가기 전에 확인한다.", see: ["backpacking", "daepiso"] },
    { id: "backpacking", term: "백패킹", group: "walk", short: "야영 짐을 지고 걷는 여행.", body: "잠자리와 먹을 것을 배낭에 지고 걷다가 야영하는 것이다. 허가된 야영지에서만 하고, 불을 피우지 않으며, 가져간 것은 모두 되가져온다.", see: ["bibak", "lnt"] },
    { id: "injeung", term: "정상 인증", group: "walk", short: "정상에 올랐음을 남기는 일.", body: "정상석 앞에서 사진을 찍어 남기는 것이 흔한 방법이다. 랭큐 등산에서는 정상 가까이에서 위치로 확인해 그 산의 도장을 찍는다 — 위치는 거리를 재는 데만 쓰고 저장하지 않는다.", see: ["jeongsangseok", "myeongsan100"] },
    // ── 장비와 옷 ──
    { id: "stick", term: "등산 스틱", also: ["트레킹 폴"], group: "gear", short: "걸을 때 짚는 지팡이 한 쌍.", body: "오르막에서는 팔로 밀어 올리고, 내리막에서는 무릎에 실리는 힘을 덜어 준다. 팔꿈치가 직각이 되는 길이가 기본이고, 내리막에서는 조금 길게 쓴다. 바위 구간에서는 접어 넣는다.", see: ["doenbial", "neodeol"] },
    { id: "eisen", term: "아이젠", group: "gear", short: "눈 · 얼음길에서 신발에 덧신는 쇠 발톱.", body: "겨울 산에서는 눈이 없어 보여도 그늘진 길이 얼어 있다. 미끄러지기 전에 미리 찬다. 겨울에는 배낭에 늘 넣어 두는 장비다.", see: ["spats", "layering"] },
    { id: "spats", term: "스패츠", also: ["게이터"], group: "gear", short: "발목에서 종아리까지 두르는 덮개.", body: "눈이나 흙, 물이 신발 속으로 들어오지 않게 막는다. 눈이 쌓인 겨울 산과 비 온 뒤의 진 길에서 쓴다.", see: ["eisen"] },
    { id: "headlamp", term: "헤드랜턴", group: "gear", short: "머리에 쓰는 등.", body: "해 지기 전에 내려올 계획이어도 챙긴다. 길이 생각보다 길어지거나 누가 다치면 어둠 속에서 내려와야 하기 때문이다. 손이 자유로워야 하므로 손전등보다 머리에 쓰는 것이 낫다. 여분 건전지도 같이.", see: ["hasan"] },
    { id: "layering", term: "레이어링", also: ["겹쳐 입기"], group: "gear", short: "얇은 옷을 겹쳐 입는 방식.", body: "땀을 내보내는 속옷, 따뜻함을 붙잡는 보온 옷, 바람과 비를 막는 겉옷을 겹쳐 입고 더우면 벗고 추우면 입는다. 오를 때는 조금 서늘하게, 쉴 때는 바로 걸쳐 입는다. 면 옷은 젖으면 마르지 않아 산에서는 피한다.", see: ["jeochaeon", "eisen"] },
    { id: "deungsanhwa", term: "등산화", group: "gear", short: "산길에 맞춘 신발.", body: "바닥이 단단하고 무늬가 깊어 흙과 바위에서 덜 미끄러진다. 발목이 낮은 것은 가벼운 길에, 발목을 감싸는 것은 돌이 많거나 짐이 무거운 길에 맞는다. 새 신발은 긴 산행 전에 미리 신어 길들인다.", see: ["neodeol", "stick"] },
    { id: "haengdongsik", term: "행동식", group: "gear", short: "걸으면서 조금씩 먹는 간식.", body: "배가 고프기 전에 조금씩 자주 먹는 것이 요령이다. 견과 · 초콜릿 · 말린 과일처럼 가볍고 열량이 높은 것이 좋다. 물도 목마르기 전에 나누어 마신다.", see: ["pace"] },
    { id: "baenang", term: "배낭 용량", also: ["리터"], group: "gear", short: "배낭의 크기를 리터로 이른 것.", body: "당일 산행은 20~30리터면 물 · 간식 · 겉옷 · 비옷이 들어간다. 대피소에서 하루 묵는 산행은 그보다 크게 잡는다. 무거운 것은 등에 가깝고 위쪽에 넣는다.", see: ["haengdongsik", "layering"] },
    // ── 안전과 제도 ──
    { id: "gukgajijeom", term: "국가지점번호", group: "safety", short: "산에서 내 위치를 알리는 번호.", body: "온 국토를 격자로 나누어 붙인 번호로, 한글 두 자와 숫자 여덟 자리다. 등산로의 노란 표지판에 적혀 있다. 119에 도움을 청할 때 이 번호를 알려 주면 위치를 바로 찾는다. 랭큐의 산행 화면은 가까운 번호를 보여 준다.", see: ["alba", "ijeongpyo"] },
    { id: "ipsantongje", term: "입산 통제", also: ["산불조심기간"], group: "safety", short: "산불을 막으려고 등산로를 닫는 것.", body: "봄 · 가을의 건조한 철에는 산불조심기간을 두고 일부 등산로를 막는다. 닫는 길과 기간은 지역과 해에 따라 다르니 가기 전에 그 산을 맡은 기관의 안내를 확인한다. 통제된 길에 들어가면 과태료를 물 수 있다.", see: ["yeyakje", "ipsansigan"] },
    { id: "yeyakje", term: "탐방로 예약제", group: "safety", short: "하루에 들어갈 사람 수를 정해 예약받는 길.", body: "자연을 지키려고 일부 탐방로는 하루 인원을 정해 두고 미리 예약한 사람만 들인다. 구간과 기간은 공원마다 다르므로 국립공원의 예약 안내에서 확인한다.", see: ["ipsantongje", "daepiso"] },
    { id: "ipsansigan", term: "입산 시간 지정제", group: "safety", short: "산에 들어갈 수 있는 시각을 정해 둔 것.", body: "국립공원은 철에 따라 탐방로에 들어설 수 있는 시각을 정해 둔다. 해가 진 뒤의 사고를 막기 위해서다. 긴 코스는 그 시각 안에 내려설 수 있는지부터 따져 본다.", see: ["hasan", "ipsantongje"] },
    { id: "daepiso", term: "대피소", group: "safety", short: "높은 능선에 있는 숙박 · 대피 시설.", body: "큰 산의 능선에 있는 건물로, 날씨가 나빠지면 몸을 피하고 예약한 사람은 묵어 갈 수 있다. 묵으려면 미리 예약해야 한다. 물과 먹을 것을 살 수 있는지는 대피소마다 다르다.", see: ["jongju", "yeyakje"] },
    { id: "jeochaeon", term: "저체온증", group: "safety", short: "몸의 온도가 떨어지는 것.", body: "땀이나 비에 젖은 옷에 바람을 맞으면 여름 산에서도 생긴다. 몸이 떨리고 말이 어눌해지면 젖은 옷을 벗기고 마른 옷과 겉옷으로 감싼 뒤 따뜻한 것을 먹인다. 여벌 옷과 비옷이 가장 좋은 대비다.", see: ["layering"] },
    { id: "myeongsan100", term: "100대 명산", group: "safety", short: "산림청이 뽑은 우리나라의 명산 100곳.", body: "산림청이 2002년 '세계 산의 해'를 맞아 역사 · 문화 · 경관 · 생태를 따져 뽑은 산이다. 차례로 올라 다 채우는 것을 목표로 삼는 사람이 많다. 랭큐 등산에서는 권역별 도장첩 여덟 권으로 모은다.", see: ["injeung", "baekdudaegan"] },
    { id: "lnt", term: "흔적 남기지 않기", also: ["LNT"], group: "safety", short: "다녀간 자리를 그대로 두는 약속.", body: "가져간 것은 모두 되가져오고, 정해진 길로만 걷고, 꽃과 돌을 가져오지 않는다. 과일 껍질도 산에서는 오래 남는다. 야생동물에게 먹이를 주지 않는다.", see: ["backpacking"] },
];
export const hikingTerm = (id: string | null | undefined): HikingTerm | undefined => HIKING_TERMS.find((t) => t.id === id);
export const HIKING_TERMS_PATH = "/hiking/terms";
export const hikingTermPath = (id: string) => `${HIKING_TERMS_PATH}/${id}`;
export const HIKING_TERMS_H1 = "등산 용어 사전";
export const HIKING_TERMS_LEAD = "들머리 · 능선 · 안부 · 알바 — 산에서 듣는 말을 쉬운 말로 풀었어요.";
export const HIKING_TERMS_SEO = { path: HIKING_TERMS_PATH, title: `등산 용어 사전 — 들머리 · 능선 · 안부 · 알바 뜻${BRAND}`, desc: `들머리 · 날머리 · 능선 · 안부 · 하늘금 · 너덜 · 알바 · 종주 · 국가지점번호 … 산에서 쓰는 말 ${HIKING_TERMS.length}가지의 뜻을 쉬운 말로.` } as const;
export const hikingTermSeo = (t: HikingTerm) => ({ path: hikingTermPath(t.id), title: `${t.term} 뜻 — 등산 용어${BRAND}`, desc: `${t.term}${t.also?.length ? `(${t.also.join(" · ")})` : ""} — ${t.short} ${t.body}`.slice(0, 150) });

// ── 준비물 ─────────────────────────────────────────────────────────
export interface PackItem { id: string; name: string; why: string }
export interface PackGroup { id: string; name: string; note: string; items: readonly PackItem[] }
export const HIKING_CHECKLIST: readonly PackGroup[] = [
    { id: "basic", name: "언제나 챙기는 것", note: "짧은 당일 산행에도 넣는 것", items: [
        { id: "water", name: "물", why: "목마르기 전에 나누어 마셔요. 여름과 긴 코스는 더 넉넉히." },
        { id: "snack", name: "간식(행동식)", why: "배고프기 전에 조금씩. 가볍고 열량 높은 것으로." },
        { id: "shoes", name: "등산화", why: "바닥이 단단하고 덜 미끄러지는 신발." },
        { id: "shell", name: "바람막이 · 비옷", why: "능선의 바람과 갑작스러운 비에. 맑은 날에도 넣어요." },
        { id: "spare", name: "여벌 옷 · 양말", why: "땀에 젖은 채 쉬면 몸이 식어요." },
        { id: "lamp", name: "헤드랜턴", why: "해 지기 전에 내려올 계획이어도. 여분 건전지도." },
        { id: "phone", name: "휴대전화 · 보조 배터리", why: "산에서는 배터리가 빨리 닳아요." },
        { id: "aid", name: "구급약 · 밴드", why: "물집과 긁힌 자리에." },
        { id: "bag", name: "쓰레기 봉투", why: "가져간 것은 모두 되가져와요." },
    ] },
    { id: "more", name: "있으면 편한 것", note: "길고 가파른 길일수록", items: [
        { id: "stick", name: "등산 스틱", why: "내리막에서 무릎에 실리는 힘을 덜어 줘요." },
        { id: "gloves", name: "장갑", why: "바위와 난간을 잡을 때, 넘어질 때 손을 지켜요." },
        { id: "hat", name: "모자 · 선크림", why: "능선은 그늘이 없어요." },
        { id: "mat", name: "방석", why: "젖은 바위에 앉아 쉴 때." },
    ] },
    { id: "spring", name: "봄", note: "3~5월", items: [
        { id: "sp-layer", name: "얇은 보온 옷", why: "아침저녁과 능선은 아직 겨울 같아요." },
        { id: "sp-mud", name: "진 길에 대비", why: "눈 녹은 길이 질어요. 스패츠가 있으면 좋아요." },
        { id: "sp-fire", name: "입산 통제 확인", why: "산불조심기간에는 닫힌 길이 있어요. 가기 전에 확인해요." },
    ] },
    { id: "summer", name: "여름", note: "6~8월", items: [
        { id: "su-water", name: "물을 평소의 두 배", why: "땀으로 잃는 물이 많아요. 소금기 있는 간식도 같이." },
        { id: "su-rain", name: "비옷 · 방수 덮개", why: "소나기와 계곡물이 금방 불어요. 비가 오면 계곡 길을 피해요." },
        { id: "su-bug", name: "긴 옷 · 벌레 기피제", why: "풀이 우거진 길에서 살갗을 가려요." },
    ] },
    { id: "autumn", name: "가을", note: "9~11월", items: [
        { id: "au-lamp", name: "헤드랜턴은 꼭", why: "해가 빨리 져요. 돌아설 시각을 앞당겨요." },
        { id: "au-warm", name: "보온 옷 · 장갑", why: "능선의 바람이 차요. 쉴 때 바로 걸쳐 입어요." },
        { id: "au-leaf", name: "낙엽 길 조심", why: "낙엽 밑의 돌과 뿌리가 안 보여요." },
    ] },
    { id: "winter", name: "겨울", note: "12~2월", items: [
        { id: "wi-eisen", name: "아이젠", why: "눈이 없어 보여도 그늘은 얼어 있어요." },
        { id: "wi-spats", name: "스패츠", why: "눈이 신발 속으로 들어오지 않게." },
        { id: "wi-warm", name: "모자 · 장갑 · 목 가리개", why: "머리와 손끝에서 열이 먼저 빠져요." },
        { id: "wi-hot", name: "따뜻한 물", why: "보온병에 담아 가요. 몸을 안에서 데워 줘요." },
    ] },
];
export const HIKING_CHECKLIST_PATH = "/hiking/checklist";
export const HIKING_CHECKLIST_H1 = "등산 준비물";
export const HIKING_CHECKLIST_LEAD = "당일 산행의 배낭에 넣을 것을 철마다 정리했어요. 챙긴 것은 눌러서 지워 가세요.";
export const HIKING_CHECKLIST_NOTE = "산과 날씨, 코스의 길이에 따라 달라요. 높은 산은 아래보다 훨씬 춥고 바람이 세요 — 그날의 예보를 보고 더하거나 빼 주세요.";
export const HIKING_CHECKLIST_SEO = { path: HIKING_CHECKLIST_PATH, title: `등산 준비물 체크리스트 — 당일 산행 · 봄 여름 가을 겨울${BRAND}`, desc: "당일 산행에 언제나 챙기는 것 아홉 가지와 있으면 편한 것, 봄 · 여름 · 가을 · 겨울에 더 넣을 것을 까닭과 함께 정리했어요." } as const;
/** 그 달(1~12)의 철 묶음 id */
export const checklistSeasonOf = (month: number): string => (month >= 3 && month <= 5 ? "spring" : month >= 6 && month <= 8 ? "summer" : month >= 9 && month <= 11 ? "autumn" : "winter");
