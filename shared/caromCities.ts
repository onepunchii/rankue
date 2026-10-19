/**
 * 캐롬(3쿠션) 대회가 열리는 도시의 좌표 · 한글 이름(2026-10-19) — 세계랭킹 페이지의 '이번 랭킹에 들어간 대회' 지도가 쓴다.
 * UMB 레전드의 도시 글자(대문자 영문, 예: "HO CHI MINH CITY")를 그대로 열쇠로. 좌표는 도시 중심(대회장 위치가 아니다 — 세계 지도 한 장의 점이라 충분하다).
 * 한글 이름은 shared/tournamentMeta 의 cityKo 와 같게(호치민 · 베겔 — shared/tourBoard.test 가 본다).
 * 모르는 도시는 지도에 찍지 않는다(목록에는 남는다) — shared/caromCities.test 가 지금 레전드의 도시가 다 있는지 본다.
 * ⚠️ 서버가 부를 수도 있다 — 상대 임포트는 ./x.js(지금은 없다).
 */
export interface CaromCity { ko: string; en: string; lat: number; lng: number }

export const CAROM_CITIES: Readonly<Record<string, CaromCity>> = {
    ANTWERP: { ko: "앤트워프", en: "Antwerp", lat: 51.2194, lng: 4.4025 },
    LIER: { ko: "리르", en: "Lier", lat: 51.1315, lng: 4.5704 },
    BLOIS: { ko: "블루아", en: "Blois", lat: 47.5861, lng: 1.3359 },
    GRADIGNAN: { ko: "그라디냥", en: "Gradignan", lat: 44.7725, lng: -0.6156 },
    BORDEAUX: { ko: "보르도", en: "Bordeaux", lat: 44.8378, lng: -0.5792 },
    PORTO: { ko: "포르투", en: "Porto", lat: 41.1579, lng: -8.6291 },
    VEGHEL: { ko: "베겔", en: "Veghel", lat: 51.6167, lng: 5.5486 },
    VIERSEN: { ko: "피어젠", en: "Viersen", lat: 51.2556, lng: 6.3917 },
    BERLIN: { ko: "베를린", en: "Berlin", lat: 52.52, lng: 13.405 },
    ANKARA: { ko: "앙카라", en: "Ankara", lat: 39.9334, lng: 32.8597 },
    ISTANBUL: { ko: "이스탄불", en: "Istanbul", lat: 41.0082, lng: 28.9784 },
    IZMIR: { ko: "이즈미르", en: "Izmir", lat: 38.4237, lng: 27.1428 },
    ANTALYA: { ko: "안탈리아", en: "Antalya", lat: 36.8969, lng: 30.7133 },
    "SHARM EL SHEIKH": { ko: "샤름엘셰이크", en: "Sharm El Sheikh", lat: 27.9158, lng: 34.3299 },
    HURGHADA: { ko: "후르가다", en: "Hurghada", lat: 27.2579, lng: 33.8116 },
    LUXOR: { ko: "룩소르", en: "Luxor", lat: 25.6872, lng: 32.6396 },
    CAIRO: { ko: "카이로", en: "Cairo", lat: 30.0444, lng: 31.2357 },
    GWANGJU: { ko: "광주", en: "Gwangju", lat: 35.1595, lng: 126.8526 },
    YANGGU: { ko: "양구", en: "Yanggu", lat: 38.1099, lng: 127.9895 },
    SEOUL: { ko: "서울", en: "Seoul", lat: 37.5665, lng: 126.978 },
    "HO CHI MINH CITY": { ko: "호치민", en: "Ho Chi Minh City", lat: 10.8231, lng: 106.6297 },
    HANOI: { ko: "하노이", en: "Hanoi", lat: 21.0278, lng: 105.8342 },
    TOKYO: { ko: "도쿄", en: "Tokyo", lat: 35.6762, lng: 139.6503 },
    BOGOTA: { ko: "보고타", en: "Bogotá", lat: 4.711, lng: -74.0721 },
    MEDELLIN: { ko: "메데인", en: "Medellín", lat: 6.2442, lng: -75.5812 },
    LIMA: { ko: "리마", en: "Lima", lat: -12.0464, lng: -77.0428 },
    GUAYAQUIL: { ko: "과야킬", en: "Guayaquil", lat: -2.17, lng: -79.9224 },
};

/** 레전드의 도시 글자 → 도시(모르면 null) */
export const caromCity = (raw: string | null | undefined): CaromCity | null => (raw ? CAROM_CITIES[raw.trim().toUpperCase()] ?? null : null);
