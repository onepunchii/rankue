/**
 * 크루 도장깨기의 조각(2026-10-12) — 규칙은 shared/golfCrewStamps.
 *
 *   useCrewStamps    크루의 도장 · 깃발(GET /api/hiq/crews/:id/golf-stamps — 누구에게나 열려 있다. 사람 이름은 없다)
 *   CrewFlagPiece    깃발 하나 — 가운데 흰 패치에 크루 엠블럼(그림 · 이모지 · 이름 첫 글자)을 얹는다
 *   CrewStampEntry   크루 홈에 놓는 한 칸(골프 크루만) → 크루 도장첩(/crew/:id/stamps)으로
 *   CourseCrews      골프장 페이지의 '이 골프장을 깬 크루'
 *
 * 크루 홈은 당구 · 골프가 같이 쓰는 화면이라 테마가 어느 쪽일지 모른다 — 이 칸은 **제 바탕(짙은 초록)을 갖고** 그 안에서만 리터럴 색을 쓴다.
 * 깃발 그림에는 글자 · 로고가 없다(패치의 자리는 그림에서 찾은 값).
 * ⚠️ 리터럴 색만. 글자는 12px 이상, 굵기는 semibold 까지.
 */
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { LucideChevronRight } from "@/lib/icons";
import { STAMP_OPEN_TOTAL } from "@shared/golfStampBooks";
import { crewImageSrc } from "@shared/crewManage";
import {
    CREW_STAMP_FULL, CREW_STAMP_MIN, crewBookStates, crewFlagLook, crewFlagName, crewStampSummary, type CrewFlagKind, type CrewFlagLook, type CrewStamp,
} from "@shared/golfCrewStamps";
import { stampDate } from "./stampDate";

export const crewStampsPath = (crewId: string) => `/crew/${crewId}/stamps`;
export const crewStampsKey = (crewId: string) => [`/api/hiq/crews/${crewId}/golf-stamps`] as const;

export interface CrewFlag { id: string; kind: CrewFlagKind; key: string; serial: number; earnedAt: string }
export interface CrewStampsData { stamps: CrewStamp[]; flags: CrewFlag[] }

export function useCrewStamps(crewId: string | undefined) {
    return useQuery<CrewStampsData>({
        queryKey: crewStampsKey(crewId ?? ""),
        queryFn: () => apiRequest(`/api/hiq/crews/${crewId}/golf-stamps`),
        enabled: !!crewId,
    });
}

/** 크루 도장의 규칙 한 줄 — 크루 홈 · 크루 도장첩이 같이 쓴다 */
export const CREW_STAMP_RULE = `같은 라운드에서 크루원 ${CREW_STAMP_MIN}명 이상이 골프장에서 18홀을 끝내면 크루 도장이 찍혀요. ${CREW_STAMP_FULL}명이 한 조를 채우면 금테예요.`;
export const CREW_STAMP_RULE_JOIN = "크루에 들어온 뒤의 라운드만 세요.";

/** 깃발 그림과 흰 패치의 자리(그림 한 변에 대한 비율) */
const FLAG_ART: Readonly<Record<CrewFlagLook, { src: string; x: number; y: number; w: number; h: number }>> = {
    green: { src: "/golf/stamp-art/flag-green.webp", x: 0.118, y: 0.2426, w: 0.2754, h: 0.2744 },
    crimson: { src: "/golf/stamp-art/flag-crimson.webp", x: 0.1203, y: 0.2222, w: 0.2712, h: 0.2681 },
    navy: { src: "/golf/stamp-art/flag-navy.webp", x: 0.0982, y: 0.2169, w: 0.2836, h: 0.2836 },
    purple: { src: "/golf/stamp-art/flag-purple.webp", x: 0.1226, y: 0.2303, w: 0.2738, h: 0.2707 },
    gold: { src: "/golf/stamp-art/flag-gold.webp", x: 0.1113, y: 0.2336, w: 0.2629, h: 0.2578 },
};
export const crewFlagSrc = (look: CrewFlagLook) => FLAG_ART[look].src;

export interface CrewBrand { name: string; emblem?: string | null }

/** 깃발 하나 — 패치에 크루 엠블럼. earned 가 아니면 흐린 윤곽 */
export function CrewFlagPiece({ look, size, crew, earned = true }: { look: CrewFlagLook; size: number; crew: CrewBrand; earned?: boolean }) {
    const art = FLAG_ART[look];
    const photo = crewImageSrc(crew.emblem);
    // 엠블럼이 그림 주소가 아니면 이모지(짧은 글자)로 본다. 그것도 없으면 이름 첫 글자
    const glyph = !photo && crew.emblem && [...crew.emblem.trim()].length <= 2 ? crew.emblem.trim() : [...(crew.name || "크").trim()][0];
    const d = art.w * size;
    return (
        <span className="relative block shrink-0" style={{ width: size, height: size }} data-flag={look} data-earned={earned ? "1" : "0"}>
            <img
                src={art.src} alt="" width={size} height={size} draggable={false} decoding="async" loading="lazy" className="block h-full w-full"
                style={earned ? { filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.5))" } : { filter: "grayscale(1) brightness(0.7)", opacity: 0.4 }}
            />
            {earned && (
                <span className="absolute flex items-center justify-center overflow-hidden rounded-full" style={{ left: art.x * size, top: art.y * size, width: d, height: art.h * size }}>
                    {photo
                        ? <img src={photo} alt="" className="h-[86%] w-[86%] rounded-full object-cover" draggable={false} decoding="async" loading="lazy" />
                        : <span className="font-semibold leading-none text-[#3A2C12]" style={{ fontSize: Math.max(12, Math.round(d * 0.52)) }}>{glyph}</span>}
                </span>
            )}
        </span>
    );
}

/** 깃발의 이름 — "강원 깃발" · "강원 풀조 깃발" · 1호면 뒤에 "· 1호" */
export const flagLabel = (f: Pick<CrewFlag, "kind" | "key" | "serial">) => `${crewFlagName(f.kind, f.key, STAMP_OPEN_TOTAL)}${f.kind === "flag" && f.serial === 1 ? " · 1호" : ""}`;
export const flagLook = (f: Pick<CrewFlag, "kind" | "key" | "serial">) => crewFlagLook(f.kind, f.key, f.serial);

/**
 * 크루 홈의 한 칸 — 골프 크루에만 놓는다. 도장 수 · 깃발 · 가장 가까운 권을 보여 주고 크루 도장첩으로 간다.
 * 도장이 없어도 그린다(규칙을 알려야 같이 가자고 한다).
 */
export function CrewStampEntry({ crewId, crew, className }: { crewId: string; crew: CrewBrand; className?: string }) {
    const { data } = useCrewStamps(crewId);
    const stamps = data?.stamps ?? [];
    const flags = data?.flags ?? [];
    const sum = crewStampSummary(stamps);
    // 가장 가까운 권 — 덜 채운 '누구나' 권 가운데 남은 칸이 가장 적은 것(도장이 하나라도 있는 권만)
    const near = crewBookStates(stamps).filter((s) => s.book.kind === "open" && !s.done && s.got > 0).sort((a, b) => (a.total - a.got) - (b.total - b.got))[0];
    return (
        <Link
            href={crewStampsPath(crewId)} data-testid="crew-stamp-entry" data-track-as="crew-stamps"
            className={`block rounded-2xl px-4 py-4 active:opacity-80 ${className ?? ""}`}
            style={{ background: "radial-gradient(120% 100% at 0% 0%,#17573A,#0C3524 70%,#092A1C)", boxShadow: "inset 0 0 0 1px #FFFFFF14" }}
        >
            <div className="flex items-center gap-1">
                <p className="flex-1 text-[16px] font-semibold text-[#FFFFFF]">크루 도장깨기</p>
                <span className="text-[13px] text-[#FFFFFFB3]">크루 도장첩</span>
                <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 text-[#FFFFFF80]" aria-hidden />
            </div>
            {sum.total > 0 ? (
                <div className="mt-3 flex items-center gap-3">
                    <div className="flex flex-1 divide-x divide-[#FFFFFF1F] rounded-xl bg-[#00000033] py-2.5">
                        {([[sum.total, "크루 도장"], [sum.full, "금테"], [flags.length, "깃발"]] as const).map(([n, label]) => (
                            <div key={label} className="flex-1 text-center">
                                <div className="text-[20px] font-semibold tabular-nums leading-none text-[#FFFFFF]">{n}</div>
                                <div className="mt-1 text-[12px] text-[#FFFFFF99]">{label}</div>
                            </div>
                        ))}
                    </div>
                    {flags[0] && <CrewFlagPiece look={flagLook(flags[flags.length - 1])} size={64} crew={crew} />}
                </div>
            ) : (
                <div className="mt-2.5 flex items-center gap-3">
                    <p className="flex-1 text-[14px] leading-snug text-[#FFFFFFCC] break-keep">{CREW_STAMP_RULE}</p>
                    <CrewFlagPiece look="green" size={64} crew={crew} />
                </div>
            )}
            <p className="mt-2.5 text-[13px] leading-snug text-[#D7F5B8] break-keep" data-testid="crew-stamp-next">
                {near ? `${near.book.name} 도장첩 ${near.total - near.got}곳 남았어요 — 다 채우면 깃발을 받아요` : sum.total > 0 ? "도장첩 한 권을 다 채우면 크루 깃발을 받아요" : "첫 크루 도장을 찍으러 가 볼까요?"}
            </p>
        </Link>
    );
}

export interface CourseCrew { crewId: string; name: string; emblem: string | null; firstAt: string; full: boolean; rounds: number }

/** 골프장 페이지의 '이 골프장을 깬 크루' — 먼저 깬 순서. 없으면 그리지 않는다 */
export function CourseCrews({ crews, className }: { crews: readonly CourseCrew[] | null | undefined; className?: string }) {
    if (!crews?.length) return null;
    return (
        <section className={className} data-testid="course-crews" aria-label="이 골프장을 깬 크루">
            <div className="rounded-2xl border border-[#FFFFFF14] bg-[#FFFFFF08] px-3.5 py-3.5">
                <div className="flex items-baseline justify-between">
                    <h2 className="text-[15px] font-semibold text-[#FFFFFF]">이 골프장을 깬 크루</h2>
                    <span className="text-[12.5px] text-[#FFFFFF8C]">크루원 {CREW_STAMP_MIN}명 이상이 같이</span>
                </div>
                <ul className="mt-2.5">
                    {crews.map((c, i) => {
                        const photo = crewImageSrc(c.emblem);
                        const glyph = !photo && c.emblem && [...c.emblem.trim()].length <= 2 ? c.emblem.trim() : [...c.name.trim()][0];
                        return (
                            <li key={c.crewId} className={i ? "border-t border-[#FFFFFF0F]" : ""}>
                                <Link href={`/crew/${c.crewId}`} className="flex min-h-12 items-center gap-3 py-2 active:opacity-70" data-track-as="course-crew">
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#F4EFE3] text-[15px] font-semibold text-[#3A2C12]">
                                        {photo ? <img src={photo} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" draggable={false} /> : glyph}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[14.5px] font-medium text-[#FFFFFF]">{c.name}</span>
                                        <span className="block text-[12.5px] tabular-nums text-[#FFFFFF8C]">{stampDate(c.firstAt)}{c.rounds > 1 ? ` · ${c.rounds}번` : ""}</span>
                                    </span>
                                    {c.full && <span className="shrink-0 rounded-full bg-[#E9B94924] px-2 py-1 text-[12px] font-medium text-[#FFD36B]" style={{ boxShadow: "inset 0 0 0 1px #E9B94959" }}>금테</span>}
                                    <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 text-[#FFFFFF66]" aria-hidden />
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </section>
    );
}
