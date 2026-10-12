/**
 * 골프 홈 카드의 그림(2026-10-12 오너: "이미지 써도 되니 홈에 긴급티 배너랑 랭큐매치 골프코스 카드 등등 변경이 필요하고 더 완벽하게").
 *
 * 도장첩 표지와 **같은 화풍**(스크린 인쇄 포스터 — 납작한 면 · 적은 색 · 종이 결)으로 네 장을 그렸다.
 * 홈이 한 사람의 손으로 그린 것처럼 보이게: 도장깨기 카드(표지)와 위아래의 카드들이 같은 그림체다.
 *
 *   MatchTileArt   RANKUE MATCH — 아침 티샷. 앞 언덕(MatchTileHill, 타일의 라임 면)이 그림 아래를 덮고 제목은 그 언덕 위에 놓인다
 *   JoinTileArt    ENTER CODE — 밤의 티 박스에 공 네 개(핀 번호 네 자리 · 네 사람의 자리). 마지막 하나가 라임이다
 *   UrgentArt      긴급티 — 해가 넘어가는 언덕의 깃발. 급한 것은 '해 지기 전'이다. 카드의 구분선이 곧 땅 선이다
 *   CoursesArt     전국 골프장 — 해 질 녘의 구불구불한 페어웨이. 왼쪽 절반만 쓰고 지도 쪽으로는 사라진다
 *
 * 전부 **장식**이다(alt 없음 · 누르지 못한다) — 실제 골프장도 사람도 아니다. 글자 · 숫자는 그림에 없다(코드가 얹는다).
 * 예전 RANKUE MATCH 의 골퍼는 바깥 서버(lottie.host)에서 받아 오는 움직이는 그림이었다 — 홈을 열 때마다 남의 서버를 불렀다.
 * 지금은 우리 파일 다섯 개(합쳐 70KB 안팎)다 — 다섯째(scan)는 타일을 누르면 뜨는 라운드 고르기 시트의 것.
 *
 * ⚠️ 리터럴 색만(골프 테마가 bg-white 같은 유틸을 바꿔 끼운다).
 */
import type { CSSProperties } from "react";

export const HOME_ART = {
    match: "/golf/home-art/match.webp",
    join: "/golf/home-art/join.webp",
    urgent: "/golf/home-art/urgent.webp",
    courses: "/golf/home-art/courses.webp",
    /** 라운드 고르기 시트(GameModeSheet)의 '스코어카드 스캔' — 사진기 틀 안의 종이 스코어카드(칸만 있고 글자는 없다) */
    scan: "/golf/home-art/scan.webp",
} as const;

/** 가려서 사라지게 — 표준 속성과 사파리의 접두어를 같이 준다 */
const fade = (mask: string): CSSProperties => ({ maskImage: mask, WebkitMaskImage: mask });

/**
 * RANKUE MATCH 타일의 그림 — 위쪽 68%. 아래는 MatchTileHill 이 덮는다.
 * 세로 자리는 위쪽으로 붙인다(30%): 폭 360 기기에서는 타일이 195 로 낮아져 그림이 보이는 높이가 80 남짓이다 — 그 안에 골퍼의 윗몸과 깃발이 들어와야 한다.
 */
export function MatchTileArt() {
    return (
        <img
            aria-hidden data-testid="match-tile-art"
            src={HOME_ART.match} alt="" draggable={false} decoding="async"
            className="pointer-events-none absolute inset-x-0 top-0 h-[68%] w-full select-none object-cover"
            style={{ objectPosition: "50% 30%" }}
        />
    );
}

/**
 * RANKUE MATCH 의 **앞 언덕** — 포스터가 원경 · 중경 · 근경을 겹치는 방식 그대로, 그림의 아래를 타일의 라임 면으로 덮는다.
 * 그림을 흐리게 지우지 않은 이유: 골퍼의 다리가 안개에 녹는 것처럼 보였다.
 *
 * 제목 상자 **안에** 놓는다(상자의 24px 위에서 타일 바닥까지, 타일의 안쪽 여백 24px 만큼 양옆으로 넘친다) —
 * 타일 높이의 몇 % 로 잡으면 좁은 기기에서 제목이 언덕 위로 올라가 그림(골퍼의 다리)과 겹친다. 제목이 언덕을 데리고 다닌다.
 */
export function MatchTileHill() {
    return (
        <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute -inset-x-6 -top-6 -bottom-6 -z-10 h-[calc(100%+3rem)] w-[calc(100%+3rem)]" data-testid="match-tile-hill">
            <defs>
                <linearGradient id="rk-home-match-hill" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#6BE01B" />
                    <stop offset="1" stopColor="#3A9237" />
                </linearGradient>
            </defs>
            <path d="M0 10 C 20 3, 42 14, 66 7 S 90 0, 100 4 L 100 100 L 0 100 Z" fill="url(#rk-home-match-hill)" />
        </svg>
    );
}

/**
 * ENTER CODE 타일. 그림의 검정은 타일 바탕(#1A1A1A)에 맞춰 내보냈다(그보다 어두운 곳을 바탕색으로 올림) —
 * 그래서 섞기 모드 없이 그냥 놓아도 금이 보이지 않는다. 아래 끝만 살짝 지워 제목 쪽으로 사라지게 한다.
 */
export function JoinTileArt() {
    return (
        <img
            aria-hidden data-testid="join-tile-art"
            src={HOME_ART.join} alt="" draggable={false} decoding="async"
            className="pointer-events-none absolute inset-x-0 top-0 h-[68%] w-full origin-bottom scale-[1.06] select-none object-cover object-bottom"
            style={fade("linear-gradient(to bottom, #000 82%, transparent 100%)")}
        />
    );
}

/**
 * 긴급티 배너의 오른쪽. 카드는 `relative isolate overflow-hidden` 이고 그림은 그 안의 맨 뒤(-z-10)다 —
 * 글자 줄에 일일이 relative 를 붙이지 않아도 글자가 그림 위에 온다.
 *
 * 놓는 법: **그림의 땅 선을 카드의 구분선에 맞춘다.** 구분선은 세 상태(로딩 · 빈 상태 · 매물) 모두 카드 바닥에서 40px 위다(재 보니 39.8 · 41) —
 * 그림의 땅 선은 위에서 62.2%(= 아래에서 37.8%)라, 바닥에서 40px 올리고 제 높이의 37.8% 만큼 내리면 폭이 달라도 두 선이 겹친다.
 * 그러면 ① 해와 깃발은 값 줄 옆(맨 윗줄 '2시간 30분 뒤' 아래 · 구분선 위)에 서고 ② 아랫줄('티오프 · 자리')에는 짙은 땅만 깔린다.
 * 첫 그림은 깃대가 그린까지 내려와 아랫줄의 글자를 가로질렀다 — 깃발을 지평선 위에 세운 그림으로 다시 그렸다.
 * 왼쪽은 지워서 카드의 주황 면으로 이어진다(값 · 설명이 놓이는 곳).
 */
export function UrgentArt() {
    return (
        <img
            aria-hidden data-testid="urgent-art"
            src={HOME_ART.urgent} alt="" draggable={false} decoding="async"
            className="pointer-events-none absolute -z-10 right-0 bottom-[40px] aspect-square w-[59%] max-w-[250px] translate-y-[37.8%] select-none"
            style={fade("linear-gradient(to right, transparent 0%, #000 46%)")}
        />
    );
}

/**
 * 전국 골프장 카드의 왼쪽. 지도(오른쪽, 폭 = 62% · 최대 205)는 어두운 바탕이어야 점의 색이 뜻을 가진다 —
 * 그래서 그림은 **지도가 시작하는 곳에서 끝난다**: 상자의 오른쪽 끝을 지도 폭에 묶고(조금 겹쳐 16px), 그 안에서 오른쪽으로 지운다.
 *  - 그림은 44px 내려 놓는다 — 해가 제목 · 한 줄 설명 아래로 오게(흰 글씨가 밝은 해 위에 놓이면 읽히지 않는다). 위 끝은 지워서 카드의 주황 면과 이어 붙인다.
 *  - 좁은 카드에서는 그림을 왼쪽으로 당긴다(상자 폭이 219 보다 모자란 만큼의 절반) — 폭 360 기기에서 해가 지워지는 구간에 걸려 반쪽이 됐다.
 *  - ⚠️ `loading="lazy"` 를 붙이지 않는다. 받기 전의 그림은 폭이 0 이고, 왼쪽으로 당겨 놓으면 그 0 폭이 상자(overflow-hidden) 밖에 놓여
 *    '화면에 들어온 적 없는 그림'이 된다 — 끝내 받지 않았다(화면 확인에서 그림이 통째로 빠져 있었다). 크기(640×1000)도 적어 둔다.
 */
export function CoursesArt() {
    return (
        <span
            aria-hidden data-testid="courses-art"
            className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden"
            style={{ right: "calc(min(62%, 205px) - 16px)", ...fade("linear-gradient(to right, #000 0%, #000 64%, transparent 100%)") }}
        >
            <img
                src={HOME_ART.courses} alt="" width={640} height={1000} draggable={false} decoding="async"
                className="absolute top-[44px] h-[384px] w-auto max-w-none select-none"
                style={{ left: "min(0px, calc((100% - 219px) * 0.5))", ...fade("linear-gradient(to bottom, transparent 0px, #000 48px)") }}
            />
        </span>
    );
}
