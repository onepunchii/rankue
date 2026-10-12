import type { TierId } from "@shared/sim/rank";

/**
 * 등급 배지 그림과 순위 메달(2026-10-12 오너: "티어 배지를 만들어 달라는 얘기가 많은데" · "B 로 가고 이미지 제작 잘해서 게임 느낌도 나고
 * 진짜 소유욕이 들게끔").
 *
 * 그림은 client/public/sim/rank/ 에 있다(tier-<등급>.webp 320px · medal-<1~3>.webp 192px — 모두 합쳐 300KB).
 * 이미지 모델로 만들어 바탕을 따내고 한 틀로 잘랐다: 일곱 등급의 방패 크기가 같고, 등급이 오를수록 장식(보석·월계수·날개·왕관)이 밖으로 는다.
 * 만든 방법·프롬프트는 docs/01-plan/features/online-game-monthly-tournament-badges.md.
 *
 * **숫자와 글자는 그림에 넣지 않는다** — 메달 가운데는 빈 판이고 등수는 여기서 얹는다.
 * 빛(후광)도 그림에 굽지 않고 CSS 로 준다(등급 색) — 바탕을 따낼 때 깨끗하게 떨어지고, 어두운 화면에서 낮은 등급도 묻히지 않는다.
 * 다른 화면(대시보드·방 목록·장식장)에서도 이 컴포넌트를 쓴다 — 주소를 따로 적지 말 것.
 */
const BASE = "/sim/rank";
export const tierEmblemSrc = (id: TierId): string => `${BASE}/tier-${id}.webp`;
export const rankMedalSrc = (rank: 1 | 2 | 3): string => `${BASE}/medal-${rank}.webp`;
export const RANK_TROPHY_SRC = `${BASE}/trophy.webp`;

/** 등급의 빛깔 — 후광과 강조에 쓴다 */
export const TIER_GLOW: Record<TierId, string> = {
    iron: "#9AA3AD",
    bronze: "#E08A3C",
    silver: "#B9C7D8",
    gold: "#F5C443",
    platinum: "#5FD6CF",
    diamond: "#5AA9FF",
    master: "#B37BFF",
};

export interface TierEmblemProps {
    tier: TierId;
    /** 한 변(px) */
    size: number;
    /** 아직 얻지 못한 등급 — 어둡게(실루엣). 모양은 알아볼 수 있을 만큼만 남긴다(무엇이 기다리는지 보여야 갖고 싶다) */
    locked?: boolean;
    /** 바로 다음에 얻을 등급 — 잠긴 것보다 덜 어둡고 색이 조금 비친다 */
    next?: boolean;
    /** 등급 색 후광 */
    glow?: boolean;
    /** 읽어 줄 이름(등급 이름). 옆에 글자가 있으면 비워 둔다 */
    label?: string;
    className?: string;
}

export function TierEmblem({ tier, size, locked = false, next = false, glow = false, label, className }: TierEmblemProps) {
    const c = TIER_GLOW[tier];
    return (
        <img
            src={tierEmblemSrc(tier)} width={size} height={size} alt={label ?? ""} aria-hidden={label ? undefined : true}
            decoding="async" draggable={false}
            className={className}
            style={{
                width: size, height: size, flex: "none", objectFit: "contain",
                filter: next
                    ? "grayscale(0.55) brightness(0.78)"
                    : locked
                    ? "grayscale(1) brightness(0.6)"
                    : glow ? `drop-shadow(0 0 ${Math.round(size * 0.12)}px ${c}66) drop-shadow(0 ${Math.round(size * 0.04)}px ${Math.round(size * 0.06)}px rgba(0,0,0,0.55))`
                        : "drop-shadow(0 2px 3px rgba(0,0,0,0.5))",
            }}
        />
    );
}

/** 메달 가운데 빈 판에 얹는 숫자의 색(금·은·동 판 위에서 새긴 것처럼 보이게) */
const MEDAL_INK: Record<1 | 2 | 3, string> = { 1: "#5B3D0C", 2: "#3D434C", 3: "#4A240D" };

/** 1~3등 메달 — 그 아래 등수는 숫자만 쓴다(RankBoard) */
export function RankMedal({ rank, size }: { rank: 1 | 2 | 3; size: number }) {
    return (
        <span className="relative inline-block" style={{ width: size, height: size, flex: "none" }}>
            <img src={rankMedalSrc(rank)} width={size} height={size} alt="" aria-hidden="true" decoding="async" draggable={false}
                style={{ width: size, height: size, objectFit: "contain", filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.5))" }} />
            {/* 메달은 위에 리본이 있어 판의 중심이 아래쪽(63%)에 있다 */}
            <span className="rk-num absolute left-0 right-0 text-center font-black" style={{ top: "63%", transform: "translateY(-50%)", fontSize: Math.round(size * 0.27), color: MEDAL_INK[rank], lineHeight: 1 }}>
                {rank}
            </span>
        </span>
    );
}
