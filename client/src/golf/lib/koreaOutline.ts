/**
 * 경계선 지도(시도 17개의 윤곽선)를 **점 지도와 같은 좌표**에 겹치는 규칙
 * (2026-10-05 오너: "4번 이미지를 너무 잘 만들어서 해당 점과 합치는 건 어때?" → 시안 → "응 순서대로").
 *
 * 윤곽선 자료(data/koreaMapData — viewBox 450×650 의 그림 좌표)와 점 지도(shared/golfDotMap — 위경도 일차식)는 좌표가 다르다.
 * 재 보니 윤곽선 그림도 위경도에 대해 일차식이다:
 *     그림 x = 93.94 · 경도 − 11775.31        그림 y = −116.4 · 위도 + 4500.20
 * (가로/세로 눈금 비가 0.807 — 점 지도가 쓰는 위도 36° 코사인 0.81 과 같다. 그래서 늘이고 옮기기만 하면 겹친다.)
 * 맞춘 법: 제주 본섬의 너비·높이와 강원 북단·동쪽 끝을 기준점으로 처음 값을 잡고, 골프장이 자기 지역 경계 안에 가장 많이
 * 들어가게 다듬었다 — 좌표 있는 462곳 중 437곳. 밖의 25곳은 좌표가 틀린 골프장·매립지·섬·지역 묶음이 주소와 다른 곳이다.
 * ⚠️ '안에 든 수'만 최대화하면 엉뚱한 값(가로 72.6)에서 멈춘다 — 다시 잴 일이 있으면 기준점부터.
 *
 * 윤곽선 자료의 출처 기록이 없다(2026-02-04 커밋 — 오너에게 물어 둠). 그래서 **화면에만** 쓴다(허브·여권) —
 * 서버가 그려 밖으로 내보내는 그림(공유 카드·og 이미지)에는 싣지 않는다. 거기는 점만 쓴다.
 * 시험: koreaOutline.test.ts 가 윤곽선의 경계 상자를 위경도로 되돌려 실제 지리와 맞는지 본다.
 */
import { mapX, mapY } from "@shared/golfDotMap";

/** 윤곽선 그림 좌표 = A·경도 + B / C·위도 + D */
export const OUTLINE_FIT = { ax: 93.9408, bx: -11775.3092, ay: -116.4, by: 4500.204 } as const;

// 점 지도: X = (경도 − 125.5)·81, Y = (38.8 − 위도)·100 → 그림 좌표에서 바로 가는 일차식
const sx = 81 / OUTLINE_FIT.ax, tx = 81 * (-OUTLINE_FIT.bx / OUTLINE_FIT.ax - 125.5);
const sy = -100 / OUTLINE_FIT.ay, ty = 100 * (38.8 + OUTLINE_FIT.by / OUTLINE_FIT.ay);
/** 윤곽선 path 묶음에 거는 변환 — 걸면 점 지도의 viewBox 안에서 점과 겹친다 */
export const OUTLINE_TO_DOT = `matrix(${sx.toFixed(5)} 0 0 ${sy.toFixed(5)} ${tx.toFixed(3)} ${ty.toFixed(3)})`;
/** 그림 좌표 한 점 → 점 지도 좌표(시험·계산용) */
export const outlineToDot = (x: number, y: number): [number, number] => [sx * x + tx, sy * y + ty];
/** 그림 좌표 한 점 → 위경도 */
export const outlineToLatLng = (x: number, y: number): { lat: number; lng: number } => ({ lng: (x - OUTLINE_FIT.bx) / OUTLINE_FIT.ax, lat: (y - OUTLINE_FIT.by) / OUTLINE_FIT.ay });
/** 위경도 → 그림 좌표(점 지도 좌표를 거치지 않고) */
export const latLngToOutline = (lat: number, lng: number): [number, number] => [OUTLINE_FIT.ax * lng + OUTLINE_FIT.bx, OUTLINE_FIT.ay * lat + OUTLINE_FIT.by];
export { mapX, mapY };

/** 윤곽선 path 의 영문 시도 id → 우리 지역 묶음(여섯). 서울·인천은 경기와 한 묶음이다. */
export const OUTLINE_GROUP: Readonly<Record<string, string>> = {
    Seoul: "경기", Gyeonggi: "경기", Incheon: "경기",
    Gangwon: "강원",
    "North Chungcheong": "충청", "South Chungcheong": "충청", Daejeon: "충청", Sejong: "충청",
    "North Jeolla": "전라", "South Jeolla": "전라", Gwangju: "전라",
    "North Gyeongsang": "경상", "South Gyeongsang": "경상", Busan: "경상", Daegu: "경상", Ulsan: "경상",
    Jeju: "제주",
};
