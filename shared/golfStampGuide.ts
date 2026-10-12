/**
 * 도장깨기 화면의 글과 검색용 제목 · 설명(2026-10-12) — 화면(client/src/golf/stamps · pages)과 검색엔진용 화면(server/seo/golfStamps.ts)이
 * **같은 글**을 쓴다. 봇에게만 있는 문장을 만들지 않는다.
 *
 * 왜: 도장깨기는 골프 콘텐츠의 중심인데 /golf/stamps · /golf/stamps/<권> · /golf/shelf 가 검색 로봇에게는 제목도 본문도 없는 껍데기로 나갔다
 * (공용 제목 + 공용 그림). 권마다 '어느 골프장이 들어 있는가'가 곧 찾는 말이다("강원 골프장 도장깨기" · "엘리트 골프장").
 *
 * ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'.
 */
import { STAMP_BOOKS, STAMP_INVITE_TOTAL, STAMP_OPEN_TOTAL, STAMP_TOTAL, STAMP_TROPHY_STEPS, type StampBook } from "./golfStampBooks.js";
import { GOLF_PINS } from "./golfPins.js";

export const STAMPS_HUB_PATH = "/golf/stamps";
export const STAMP_SHELF_PATH = "/golf/shelf";
export const stampBookPath = (id: string) => `${STAMPS_HUB_PATH}/${id}`;

/** 글을 고친 날 — 사이트맵의 lastmod */
export const STAMP_GUIDE_UPDATED = "2026-10-12";

/** 화면의 이름 */
export const STAMPS_H1 = "도장깨기";
export const SHELF_H1 = "골프 장식장";
export const STAMPS_NAV_LABEL = "골프 도장깨기";

/** '도장은 이렇게 찍혀요' 세 단계 — 책장 화면 · '?' 안내 시트 · 검색용 화면이 같이 쓴다 */
export const STAMP_GUIDE_STEPS: readonly { title: string; body: string }[] = [
    { title: "도장첩을 고른다", body: "가고 싶은 권역의 도장첩을 열어 보세요. 빈 칸이 앞으로 갈 곳이에요." },
    { title: "골프장에서 18홀을 끝낸다", body: "랭큐매치로 라운드를 적고 그 골프장에서 끝내면 현장 인증이 되고, 그 칸에 도장이 찍혀요." },
    { title: "한 권을 다 채우면 볼마커", body: `볼마커는 장식장에 놓여요. 찍은 골프장이 ${STAMP_TROPHY_STEPS.slice(0, 3).join(" · ")}곳이 되면 트로피도 받아요.` },
];

/** 책장의 두 구역 */
export const STAMP_OPEN_TITLE = "누구나 도장첩";
export const STAMP_OPEN_ASIDE = `대중제 코스가 있는 ${STAMP_OPEN_TOTAL}곳`;
export const STAMP_INVITE_TITLE = "초대장 도장첩";
export const STAMP_INVITE_ASIDE = `회원제 ${STAMP_INVITE_TOTAL}곳`;
export const STAMP_INVITE_NOTE = "회원제 골프장이라 회원과 함께 가야 하는 곳이에요. 다녀오면 금빛 도장이 찍혀요.";

const BRAND = " | 랭큐 골프";
const names = (b: StampBook, n = 4) => b.slots.slice(0, n).map((s) => s.name).join(" · ");

export interface StampSeo { title: string; desc: string; path: string }

/** 책장(/golf/stamps) */
export function stampsHubSeo(): StampSeo {
    return {
        path: STAMPS_HUB_PATH,
        title: `골프 도장깨기 — 엘리트 골프장 ${STAMP_TOTAL}곳 도장첩${BRAND}`,
        desc: `엘리트 골프장 ${STAMP_TOTAL}곳을 권역별 도장첩 ${STAMP_BOOKS.length}권으로 모았어요. 골프장에서 18홀을 끝내면 도장이 찍히고, 한 권을 다 채우면 볼마커를 받아요.`,
    };
}

/** 도장첩 한 권(/golf/stamps/<권>) */
export function stampBookSeo(b: StampBook): StampSeo {
    const invite = b.kind === "invite";
    return {
        path: stampBookPath(b.id),
        title: `${b.name} 도장첩 — ${invite ? "회원제 " : ""}골프장 ${b.slots.length}곳${BRAND} 도장깨기`,
        desc: `${b.name} 도장첩의 골프장 ${b.slots.length}곳: ${names(b)}${b.slots.length > 4 ? " 등" : ""}. 골프장에서 18홀을 끝내면 도장이 찍히고, 다 채우면 ${b.name} 볼마커를 받아요.`,
    };
}

/** 장식장(/golf/shelf) */
export function stampShelfSeo(): StampSeo {
    return {
        path: STAMP_SHELF_PATH,
        title: `골프 장식장 — 볼마커 ${STAMP_BOOKS.length + 1}개 · 트로피 ${STAMP_TROPHY_STEPS.length}개 · 업적 핀 ${GOLF_PINS.length}개${BRAND}`,
        desc: `도장첩을 다 채우면 받는 볼마커, 찍은 엘리트 골프장 수로 받는 트로피, 라운드를 쌓으면 붙는 업적 핀(${GOLF_PINS.slice(0, 3).map((p) => p.name).join(" · ")} 등)을 모으는 곳이에요.`,
    };
}

/** 장식장의 세 구역 이름 */
export const SHELF_MARKER_TITLE = "볼마커 수집함";
export const SHELF_TROPHY_TITLE = "엘리트 트로피";
export const SHELF_PIN_TITLE = "업적 핀";
