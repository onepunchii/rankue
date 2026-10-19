/**
 * 항구(조위관측소) 쉰한 곳(2026-10-14) — 낚시의 '내 항구'. 출조 브리핑이 이 목록의 코드로 조석 · 수온 · 기온을 묻는다.
 *
 * 출처: 국립해양조사원 조위관측소(공공데이터포털, 공공누리 1유형). 관측소 목록 API 가 없어 코드 범위를 훑어 얻은 것이다(2026-10-14) —
 * 일시 중단된 관측소(19곳)와 먼바다의 해양과학기지(이어도 · 가거초 · 소청초)는 뺐다.
 * area 는 바다 일곱 곳(shared/fishingSea) 가운데 그 항구가 닿는 곳 — 좌표로 가른 어림이다(전남 여수 · 광양은 남해서부, 경남은 남해동부).
 * buoy · fog · index 는 가장 가까운 해양관측부이(60km 안) · 해무관측소(40km 안) · 바다낚시지수 지점(60km 안) — 없으면 그 항구의 브리핑에서 그 칸이 빠진다.
 * main 은 고르기 줄의 앞에 놓는 큰 항구.
 * ⚠️ 서버가 부른다 — 상대 임포트는 ./x.js(지금은 임포트가 없다).
 */
export interface FishingPort {
    code: string; name: string; lat: number; lng: number; area: string; main?: boolean;
    buoy?: { code: string; name: string; km: number };
    fog?: { code: string; name: string; km: number };
    index?: { name: string; km: number };
}

export const FISHING_PORTS: readonly FishingPort[] = [
    { code: "DT_0001", name: "인천", lat: 37.4519, lng: 126.5922, area: "west-mid", main: true, buoy: { code: "TW_0076", name: "인천항", km: 9 }, fog: { code: "SF_0003", name: "인천항", km: 8 }, index: { name: "인천항서측(24km)", km: 22 } },
    { code: "DT_0050", name: "태안", lat: 36.9130, lng: 126.2389, area: "west-mid", main: true, buoy: { code: "TW_0082", name: "태안항", km: 11 }, fog: { code: "SF_0006", name: "대산항", km: 9 }, index: { name: "안흥항북측(30km)", km: 11 } },
    { code: "DT_0067", name: "안흥", lat: 36.6746, lng: 126.1295, area: "west-mid", main: true, buoy: { code: "TW_0082", name: "태안항", km: 39 }, fog: { code: "SF_0006", name: "대산항", km: 37 }, index: { name: "모항항", km: 12 } },
    { code: "DT_0025", name: "보령", lat: 36.4064, lng: 126.4861, area: "west-mid", main: true, buoy: { code: "TW_0069", name: "대천해수욕장", km: 15 }, index: { name: "방포항", km: 20 } },
    { code: "DT_0032", name: "강화대교", lat: 37.7319, lng: 126.5222, area: "west-mid", buoy: { code: "TW_0076", name: "인천항", km: 38 }, index: { name: "인천항서측(24km)", km: 44 } },
    { code: "DT_0044", name: "영종대교", lat: 37.5455, lng: 126.5844, area: "west-mid", buoy: { code: "TW_0076", name: "인천항", km: 18 }, fog: { code: "SF_0003", name: "인천항", km: 19 }, index: { name: "인천항서측(24km)", km: 28 } },
    { code: "DT_0093", name: "소무의도", lat: 37.3731, lng: 126.4401, area: "west-mid", buoy: { code: "TW_0076", name: "인천항", km: 8 }, fog: { code: "SF_0003", name: "인천항", km: 16 }, index: { name: "인천항서측(24km)", km: 6 } },
    { code: "DT_0052", name: "인천송도", lat: 37.3381, lng: 126.5861, area: "west-mid", buoy: { code: "TW_0076", name: "인천항", km: 7 }, fog: { code: "SF_0003", name: "인천항", km: 5 }, index: { name: "영흥도", km: 16 } },
    { code: "DT_0043", name: "영흥도", lat: 37.2386, lng: 126.4286, area: "west-mid", buoy: { code: "TW_0070", name: "평택당진항", km: 15 }, fog: { code: "SF_0004", name: "평택·당진항", km: 14 }, index: { name: "영흥도", km: 3 } },
    { code: "DT_0065", name: "덕적도", lat: 37.2263, lng: 126.1565, area: "west-mid", buoy: { code: "TW_0082", name: "태안항", km: 26 }, fog: { code: "SF_0004", name: "평택·당진항", km: 24 }, index: { name: "인천항서측(24km)", km: 24 } },
    { code: "DT_0008", name: "안산", lat: 37.1922, lng: 126.6472, area: "west-mid", buoy: { code: "TW_0070", name: "평택당진항", km: 11 }, fog: { code: "SF_0003", name: "인천항", km: 21 }, index: { name: "국화도", km: 17 } },
    { code: "DT_0017", name: "대산", lat: 37.0075, lng: 126.3528, area: "west-mid", buoy: { code: "TW_0082", name: "태안항", km: 7 }, fog: { code: "SF_0006", name: "대산항", km: 5 }, index: { name: "국화도", km: 19 } },
    { code: "DT_0002", name: "평택", lat: 36.9669, lng: 126.8228, area: "west-mid", buoy: { code: "TW_0070", name: "평택당진항", km: 31 }, index: { name: "국화도", km: 26 } },
    { code: "DT_0051", name: "서천마량", lat: 36.1289, lng: 126.4953, area: "west-mid", buoy: { code: "TW_0072", name: "군산항", km: 16 }, fog: { code: "SF_0005", name: "군산항", km: 19 }, index: { name: "신시도", km: 36 } },
    { code: "DT_0037", name: "어청도", lat: 36.1172, lng: 125.9847, area: "west-mid", buoy: { code: "TW_0069", name: "대천해수욕장", km: 46 }, index: { name: "어청도", km: 2 } },
    { code: "DT_0024", name: "장항", lat: 36.0069, lng: 126.6875, area: "west-mid", buoy: { code: "TW_0072", name: "군산항", km: 16 }, fog: { code: "SF_0005", name: "군산항", km: 10 }, index: { name: "신시도", km: 31 } },
    { code: "DT_0018", name: "군산", lat: 35.9755, lng: 126.5631, area: "west-south", main: true, buoy: { code: "TW_0072", name: "군산항", km: 5 }, fog: { code: "SF_0005", name: "군산항", km: 2 }, index: { name: "신시도", km: 21 } },
    { code: "DT_0007", name: "목포", lat: 34.7797, lng: 126.3756, area: "west-south", main: true, buoy: { code: "TW_0080", name: "우이도", km: 59 }, fog: { code: "SF_0007", name: "목포항", km: 7 }, index: { name: "비금도", km: 43 } },
    { code: "DT_0035", name: "흑산도", lat: 34.6842, lng: 125.4356, area: "west-south", main: true, buoy: { code: "TW_0080", name: "우이도", km: 37 }, index: { name: "목포북항서측(53km)", km: 30 } },
    { code: "DT_0028", name: "진도", lat: 34.3778, lng: 126.3086, area: "west-south", main: true, buoy: { code: "TW_0078", name: "완도항", km: 42 }, index: { name: "하조도", km: 23 } },
    { code: "DT_0068", name: "위도", lat: 35.6181, lng: 126.3018, area: "west-south", buoy: { code: "TW_0079", name: "상왕등도", km: 10 }, index: { name: "상왕등도", km: 18 } },
    { code: "DT_0003", name: "영광", lat: 35.4261, lng: 126.4206, area: "west-south", buoy: { code: "TW_0079", name: "상왕등도", km: 32 }, index: { name: "계마항", km: 4 } },
    { code: "DT_0066", name: "향화도", lat: 35.1677, lng: 126.3595, area: "west-south", buoy: { code: "TW_0079", name: "상왕등도", km: 56 }, index: { name: "계마항", km: 25 } },
    { code: "DT_0094", name: "서거차도", lat: 34.2514, lng: 125.9154, area: "west-south", buoy: { code: "TW_0080", name: "우이도", km: 34 }, index: { name: "하조도", km: 17 } },
    { code: "DT_0016", name: "여수", lat: 34.7472, lng: 127.7656, area: "south-west", main: true, buoy: { code: "TW_0083", name: "여수항", km: 7 }, fog: { code: "SF_0008", name: "여수항", km: 1 }, index: { name: "연도", km: 37 } },
    { code: "DT_0027", name: "완도", lat: 34.3156, lng: 126.7597, area: "south-west", main: true, buoy: { code: "TW_0078", name: "완도항", km: 1 }, index: { name: "신지도", km: 9 } },
    { code: "DT_0031", name: "거문도", lat: 34.0283, lng: 127.3089, area: "south-west", main: true, buoy: { code: "TW_0081", name: "생일도", km: 41 }, index: { name: "거문도", km: 3 } },
    { code: "DT_0049", name: "광양", lat: 34.9037, lng: 127.7548, area: "south-west", buoy: { code: "TW_0074", name: "광양항", km: 6 }, fog: { code: "SF_0008", name: "여수항", km: 17 }, index: { name: "연도", km: 55 } },
    { code: "DT_0092", name: "여호항", lat: 34.6619, lng: 127.4692, area: "south-west", buoy: { code: "TW_0083", name: "여수항", km: 34 }, fog: { code: "SF_0008", name: "여수항", km: 28 }, index: { name: "연도", km: 40 } },
    { code: "DT_0026", name: "고흥발포", lat: 34.4811, lng: 127.3428, area: "south-west", buoy: { code: "TW_0081", name: "생일도", km: 43 }, index: { name: "연도", km: 42 } },
    { code: "DT_0005", name: "부산", lat: 35.0964, lng: 129.0353, area: "south-east", main: true, buoy: { code: "TW_0087", name: "부산항", km: 5 }, fog: { code: "SF_0001", name: "부산항(북항)", km: 6 }, index: { name: "부산남부", km: 7 } },
    { code: "DT_0014", name: "통영", lat: 34.8278, lng: 128.4347, area: "south-east", main: true, buoy: { code: "TW_0084", name: "통영항", km: 6 }, index: { name: "욕지도", km: 28 } },
    { code: "DT_0029", name: "거제도", lat: 34.8014, lng: 128.6992, area: "south-east", main: true, buoy: { code: "TW_0084", name: "통영항", km: 22 }, fog: { code: "SF_0012", name: "부산항(신항 서측)", km: 32 }, index: { name: "거제도", km: 11 } },
    { code: "DT_0062", name: "마산", lat: 35.1975, lng: 128.5764, area: "south-east", buoy: { code: "TW_0085", name: "마산항", km: 12 }, fog: { code: "SF_0012", name: "부산항(신항 서측)", km: 23 }, index: { name: "부산서부", km: 37 } },
    { code: "DT_0056", name: "부산항신항", lat: 35.0775, lng: 128.7847, area: "south-east", buoy: { code: "TW_0086", name: "부산항신항", km: 4 }, fog: { code: "SF_0012", name: "부산항(신항 서측)", km: 0 }, index: { name: "부산서부", km: 14 } },
    { code: "DT_0063", name: "가덕도", lat: 35.0242, lng: 128.8109, area: "south-east", buoy: { code: "TW_0086", name: "부산항신항", km: 5 }, fog: { code: "SF_0002", name: "부산항(신항 동측)", km: 6 }, index: { name: "부산서부", km: 9 } },
    { code: "DT_0061", name: "삼천포", lat: 34.9242, lng: 128.0697, area: "south-east", buoy: { code: "TW_0074", name: "광양항", km: 26 }, fog: { code: "SF_0008", name: "여수항", km: 35 }, index: { name: "욕지도", km: 38 } },
    { code: "DT_0042", name: "교본초", lat: 34.7047, lng: 128.3064, area: "south-east", buoy: { code: "TW_0084", name: "통영항", km: 16 }, index: { name: "욕지도", km: 10 } },
    { code: "DT_0004", name: "제주", lat: 33.5275, lng: 126.5430, area: "jeju", main: true, buoy: { code: "KG_0028", name: "제주해협", km: 20 }, index: { name: "도두항북서(2km)", km: 8 } },
    { code: "DT_0010", name: "서귀포", lat: 33.2400, lng: 126.5617, area: "jeju", main: true, buoy: { code: "TW_0075", name: "중문해수욕장", km: 14 }, index: { name: "서귀포", km: 4 } },
    { code: "DT_0022", name: "성산포", lat: 33.4747, lng: 126.9278, area: "jeju", main: true, buoy: { code: "KG_0028", name: "제주해협", km: 40 }, index: { name: "성산포", km: 0 } },
    { code: "DT_0021", name: "추자도", lat: 33.9619, lng: 126.3003, area: "jeju", main: true, buoy: { code: "KG_0028", name: "제주해협", km: 40 }, index: { name: "추자도", km: 0 } },
    { code: "DT_0023", name: "모슬포", lat: 33.2144, lng: 126.2511, area: "jeju", buoy: { code: "TW_0075", name: "중문해수욕장", km: 15 }, index: { name: "비양도", km: 21 } },
    { code: "DT_0012", name: "속초", lat: 38.2072, lng: 128.5942, area: "east-mid", main: true, buoy: { code: "TW_0093", name: "속초해수욕장", km: 3 }, index: { name: "외옹치항", km: 3 } },
    { code: "DT_0006", name: "묵호", lat: 37.5503, lng: 129.1164, area: "east-mid", main: true, buoy: { code: "TW_0094", name: "망상해수욕장", km: 7 }, index: { name: "대진항", km: 26 } },
    { code: "DT_0013", name: "울릉도", lat: 37.4914, lng: 130.9136, area: "east-mid", main: true, buoy: { code: "KG_0102", name: "울릉도북서", km: 39 }, index: { name: "울릉도", km: 0 } },
    { code: "DT_0057", name: "동해항", lat: 37.4947, lng: 129.1439, area: "east-mid", buoy: { code: "TW_0094", name: "망상해수욕장", km: 14 }, index: { name: "대진항", km: 20 } },
    { code: "DT_0091", name: "포항", lat: 36.0518, lng: 129.3763, area: "east-south", main: true, buoy: { code: "TW_0095", name: "고래불해수욕장", km: 59 }, fog: { code: "SF_0011", name: "포항항", km: 0 }, index: { name: "포항", km: 9 } },
    { code: "DT_0011", name: "후포", lat: 36.6775, lng: 129.4530, area: "east-south", main: true, buoy: { code: "TW_0095", name: "고래불해수욕장", km: 11 }, index: { name: "후포", km: 1 } },
    { code: "DT_0020", name: "울산", lat: 35.5019, lng: 129.3872, area: "east-south", main: true, buoy: { code: "HB_0003", name: "한수원_진하", km: 13 }, fog: { code: "SF_0010", name: "울산항", km: 0 }, index: { name: "울산", km: 4 } },
    { code: "DT_0039", name: "왕돌초", lat: 36.7192, lng: 129.7325, area: "east-south", buoy: { code: "TW_0095", name: "고래불해수욕장", km: 29 }, index: { name: "후포", km: 25 } },
];

export const fishingPort = (code: string | null | undefined): FishingPort | null => FISHING_PORTS.find((p) => p.code === code) ?? null;
export const portsOfArea = (area: string | null | undefined): FishingPort[] => FISHING_PORTS.filter((p) => p.area === area);
export const FISHING_PORT_SOURCE = "국립해양조사원";

/**
 * 바다낚시지수 지점 이름을 읽히게(2026-10-19) — 해양조사원 이름은 "인천항서측(24km)"(항에서 서쪽 24km 바다)라
 * 우리 거리를 붙이면 "인천항서측(24km)(22km)"가 됐다. → "인천항 서쪽 24km". 방향 · 거리가 없는 이름은 그대로.
 */
const DIR: Record<string, string> = { 서측: "서쪽", 동측: "동쪽", 남측: "남쪽", 북측: "북쪽", 북서: "북서쪽", 북동: "북동쪽", 남서: "남서쪽", 남동: "남동쪽" };
export function indexPointLabel(name: string): string {
    const m = /^(.+?)(서측|동측|남측|북측|북서|북동|남서|남동)\((\d+(?:\.\d+)?)km\)$/.exec(name.trim());
    return m ? `${m[1]} ${DIR[m[2]]} ${m[3]}km` : name.trim();
}
