/**
 * 크루 자동 커버·엠블럼(2026-09-26 크루 디자인 A안, 오너 승인 시안). 사진이 있으면 사진, 없으면 크루 id 로 정한 그림.
 *  - CrewCover: 당구 = 라사 초록 + 크루마다 다른 공 세 개와 쿠션 경로 점선, 골프 = 잔디 줄무늬 + 그린·깃발·공 궤적.
 *  - CrewEmblem: 크루 색 그라데이션 동그라미 + 첫 글자, 오른쪽 아래 작은 공으로 종목 표시.
 * 공·잔디 색은 실제 물건 색이라 테마 토큰을 쓰지 않는다(어두운 골프 테마에서도 라사는 라사다).
 * 순수 계산(색·배치)은 shared/crewBrand.ts.
 */
import { memo, useId } from "react";
import { cn } from "@/lib/utils";
import { crewImageSrc } from "@shared/crewManage";
import { coverBalls, crewColors, crewInitial } from "@shared/crewBrand";

type Sport = "BILLIARDS" | "GOLF" | string | null | undefined;
interface BrandCrew {
    id: string;
    name: string;
    sportCategory?: Sport;
    emblem?: string | null;
    coverImage?: string | null;
}

const BALL_FILL = { red: "#C8442E", yellow: "#E8B325", white: "#F7F4ED" } as const;

/** 커버 — 사진이 있으면 사진, 없으면 자동 그림. 아래쪽은 살짝 어둡게(위에 얹는 버튼·글자 대비). */
export const CrewCover = memo(function CrewCover({ crew, height, className, alt }: { crew: BrandCrew; height: number; className?: string; alt?: string }) {
    const uid = useId().replace(/:/g, "");
    const photo = crewImageSrc(crew.coverImage);
    if (photo) {
        return <img src={photo} alt={alt ?? ""} className={cn("w-full object-cover block", className)} style={{ height }} />;
    }
    const W = 390, H = height;
    const golf = crew.sportCategory === "GOLF";
    const r = Math.max(9, Math.round(H * 0.066));
    return (
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className={cn("w-full block", className)} style={{ height }} aria-hidden="true">
            <defs>
                <radialGradient id={`felt${uid}`} cx="30%" cy="30%" r="90%"><stop offset="0" stopColor="#127a4f" /><stop offset="1" stopColor="#094a2f" /></radialGradient>
                <pattern id={`dots${uid}`} width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="rgba(255,255,255,.07)" /></pattern>
                <pattern id={`fair${uid}`} width="60" height={H} patternUnits="userSpaceOnUse"><rect width="30" height={H} fill="#2f7d32" /><rect x="30" width="30" height={H} fill="#347f36" /></pattern>
                <radialGradient id={`shine${uid}`} cx="35%" cy="30%" r="70%"><stop offset="0" stopColor="rgba(255,255,255,.55)" /><stop offset=".5" stopColor="rgba(255,255,255,0)" /></radialGradient>
                <linearGradient id={`fade${uid}`} x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stopColor="rgba(0,0,0,0)" /><stop offset="1" stopColor="rgba(0,0,0,.35)" /></linearGradient>
            </defs>
            {golf ? (
                <g>
                    <rect width={W} height={H} fill={`url(#fair${uid})`} />
                    <ellipse cx={W * 0.74} cy={H * 0.56} rx={W * 0.31} ry={H * 0.31} fill="#3f9142" />
                    <line x1={W * 0.77} y1={H * 0.3} x2={W * 0.77} y2={H * 0.57} stroke="#fff" strokeWidth="2" />
                    <path d={`M${W * 0.77} ${H * 0.3} L${W * 0.77 + 26} ${H * 0.3 + 8} L${W * 0.77} ${H * 0.3 + 16} Z`} fill="#e53935" />
                    <circle cx={W * 0.77} cy={H * 0.57} r="5" fill="#1b3d1c" />
                    <path d={`M${W * 0.31} ${H * 0.76} Q${W * 0.54} ${H * 0.2} ${W * 0.76} ${H * 0.55}`} stroke="rgba(255,255,255,.45)" strokeWidth="1.5" fill="none" strokeDasharray="4 5" />
                    <circle cx={W * 0.31} cy={H * 0.76} r={r * 0.7} fill="#fff" />
                    <circle cx={W * 0.31} cy={H * 0.76} r={r * 0.7} fill={`url(#shine${uid})`} />
                </g>
            ) : (
                <BilliardsCover id={crew.id} uid={uid} W={W} H={H} r={r} />
            )}
            <rect width={W} height={H} fill={`url(#fade${uid})`} />
        </svg>
    );
});

function BilliardsCover({ id, uid, W, H, r }: { id: string; uid: string; W: number; H: number; r: number }) {
    const balls = coverBalls(id);
    const cue = balls.find((b) => b.id === "white")!;
    const red = balls.find((b) => b.id === "red")!;
    // 수구에서 레일 두 번을 거쳐 빨간 공으로 — 3쿠션 느낌의 점선(위치는 공 배치를 따라간다)
    const path = `M${cue.x * W} ${cue.y * H} L${W - 22} ${H * 0.36} L${W * 0.77} ${14} L${red.x * W} ${red.y * H}`;
    return (
        <g>
            <rect width={W} height={H} fill={`url(#felt${uid})`} />
            <rect width={W} height={H} fill={`url(#dots${uid})`} />
            <g fill="rgba(255,255,255,.35)">
                {[0.125, 0.375, 0.625, 0.875].map((x) => <circle key={x} cx={x * W} cy={10} r={2} />)}
            </g>
            <path d={path} stroke="rgba(255,255,255,.35)" strokeWidth="1.5" fill="none" strokeDasharray="4 5" />
            {balls.map((b) => (
                <g key={b.id}>
                    <circle cx={b.x * W} cy={b.y * H} r={r} fill={BALL_FILL[b.id]} />
                    <circle cx={b.x * W} cy={b.y * H} r={r} fill={`url(#shine${uid})`} />
                </g>
            ))}
        </g>
    );
}

/** 엠블럼 — 사진(emblem)이 있으면 사진, 없으면 크루 색 동그라미 + 첫 글자. sport 를 주면 오른쪽 아래 작은 공. */
export const CrewEmblem = memo(function CrewEmblem({ crew, size, ring, showSport = false, className }: {
    crew: BrandCrew;
    size: number;
    /** 바깥 테두리 색(CSS 값, 예: var(--surface-0)). 커버 위에 얹을 때 떼어 보이게. */
    ring?: string;
    showSport?: boolean;
    className?: string;
}) {
    const photo = crewImageSrc(crew.emblem);
    const [from, to] = crewColors(crew.id);
    const ringW = ring ? Math.max(2, Math.round(size / 19)) : 0;
    const badge = Math.max(14, Math.round(size * 0.29));
    return (
        <span
            className={cn("relative inline-flex shrink-0 rounded-full", className)}
            style={{ width: size, height: size, boxShadow: ring ? `0 0 0 ${ringW}px ${ring}, 0 4px 12px rgba(0,0,0,.18)` : undefined }}
        >
            {photo ? (
                <img src={photo} alt="" loading="lazy" className="w-full h-full rounded-full object-cover bg-surface-3" />
            ) : (
                <span
                    aria-hidden="true"
                    className="w-full h-full rounded-full inline-flex items-center justify-center text-white font-bold"
                    style={{ background: `linear-gradient(135deg, ${from}, ${to})`, fontSize: Math.round(size * 0.42) }}
                >
                    {crewInitial(crew.name)}
                </span>
            )}
            {showSport && (
                <svg width={badge} height={badge} viewBox="0 0 22 22" className="absolute -right-0.5 -bottom-0.5" aria-hidden="true">
                    <circle cx="11" cy="11" r="10.5" fill={ring ?? "var(--surface-1)"} />
                    {crew.sportCategory === "GOLF" ? (
                        <>
                            <circle cx="11" cy="11" r="7.5" fill="#fff" stroke="rgba(0,0,0,.18)" />
                            <circle cx="9" cy="9" r="1" fill="#bbb" /><circle cx="13" cy="10" r="1" fill="#bbb" /><circle cx="10" cy="13" r="1" fill="#bbb" />
                        </>
                    ) : (
                        <>
                            <circle cx="11" cy="11" r="7.5" fill="#F7F4ED" stroke="rgba(0,0,0,.2)" />
                            <circle cx="11" cy="11" r="3" fill="#C8442E" />
                        </>
                    )}
                </svg>
            )}
        </span>
    );
});

/**
 * 둘러보기 줄의 네모 썸네일 — 엠블럼 사진 → 커버 사진 → 자동 미니 커버(라사·잔디) 위에 첫 글자.
 * 목록에서 크루마다 그림이 달라 한눈에 구분된다(예전엔 모두 같은 연녹색 글자 타일이었다).
 */
export const CrewThumb = memo(function CrewThumb({ crew, size = 64, className }: { crew: BrandCrew; size?: number; className?: string }) {
    const photo = crewImageSrc(crew.emblem) ?? crewImageSrc(crew.coverImage);
    if (photo) {
        return <img src={photo} alt="" loading="lazy" className={cn("shrink-0 rounded-tile object-cover bg-surface-3", className)} style={{ width: size, height: size }} />;
    }
    const [from] = crewColors(crew.id);
    const golf = crew.sportCategory === "GOLF";
    const balls = coverBalls(crew.id);
    return (
        <span className={cn("relative shrink-0 rounded-tile overflow-hidden inline-flex", className)} style={{ width: size, height: size }} aria-hidden="true">
            <svg width={size} height={size} viewBox="0 0 64 64" className="absolute inset-0">
                {golf ? (
                    <>
                        <rect width="64" height="64" fill="#2f7d32" />
                        <rect x="16" width="16" height="64" fill="#347f36" /><rect x="48" width="16" height="64" fill="#347f36" />
                        <ellipse cx="44" cy="40" rx="22" ry="14" fill="#3f9142" />
                    </>
                ) : (
                    <>
                        <rect width="64" height="64" fill="#0f6a45" />
                        {balls.slice(0, 2).map((b) => (
                            <circle key={b.id} cx={(b.x - 0.3) * 80} cy={b.y * 64} r="6.5" fill={BALL_FILL[b.id]} />
                        ))}
                    </>
                )}
                <rect width="64" height="64" fill={from} opacity="0.18" />
            </svg>
            <span className="relative m-auto text-white font-bold" style={{ fontSize: Math.round(size * 0.38), textShadow: "0 1px 3px rgba(0,0,0,.45)" }}>
                {crewInitial(crew.name)}
            </span>
        </span>
    );
});
