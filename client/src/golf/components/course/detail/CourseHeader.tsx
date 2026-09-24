/**
 * 골프장 상세의 머리(2026-09-24 두 번째 판 — 오너: "아이디어는 좋은데 디자인이 아쉬워. 전문 디자이너가 작업한 것처럼").
 *
 * 무엇을 바꿨나(첫 판 → 둘째 판):
 *  - **큰 흰 로고판을 없앴다.** 어두운 화면에 흰 사각형이 떠서 시선을 다 가져갔다. 로고는 상단 바(뒤로 옆, 이름 앞)로 옮겼다.
 *  - **칩을 글 한 줄로.** 테두리 칩·채운 칩이 섞여 여섯 개씩 두 줄이던 것 → "경기 · 용인" 한 줄(누르면 지역 목록) +
 *    "회원제+대중제 · 54홀 · 한국잔디 · 3인 가능" 한 줄. 상자는 줄이고 글자 크기·색으로 순서를 만든다.
 *  - **한눈 숫자 세 칸을 한 띠로.** 상자 셋 → 얇은 세로선으로 나눈 한 줄. 누르면 그 섹션으로 간다.
 *  - 관심 단추는 하나 — 이 화면의 주 행동이다.
 *
 * 목록에서 들어오면 목록 캐시로 이름·줄이 먼저 뜨고(prefill), 상세가 오면 숫자가 채워진다.
 */
import { Link } from "wouter";
import { LucideLocateFixed } from "@/lib/icons";
import { cityShort, distinctAliases, listPath, manwonText, weekdayFee, wonShort, REGION_LABEL, type Fees } from "@shared/golfCourse";
import type { CourseCounts, CoursePrice } from "@/golf/lib/courseApi";
import { WatchButton } from "../WatchSheet";
import { PLAY_LABEL } from "../CourseLogo";
import { Skel, trendColor, type SectionId } from "./ui";

export interface HeaderData {
    slug: string; name: string; region: string; city: string | null; kind: string | null; holes: number | null;
    watchers: number;
    logo?: string | null;
    /** 옛 이름·다른 이름 — 정말 다른 이름만 보인다(distinctAliases) */
    aliases?: string[];
    grass?: string[];
    play?: string[];
    /** 그린피 표가 없는 곳의 대표 그린피(원) */
    feeFrom?: number | null;
    /** 부킹·조인 글이 붙을 수 있는가 — 아니면 관심(알림) 단추를 두지 않는다. 등록해도 알림이 절대 오지 않는다. */
    bookable?: boolean;
}
interface Props {
    base: HeaderData;
    /** 상세가 왔을 때만 */
    fees?: Fees | null;
    top?: CoursePrice | null;
    counts?: CourseCounts;
    listingCount?: number;
    myWatch?: { filters: any } | null;
    loaded: boolean;
    distance: { text: string } | { ask: () => void } | null;
    onJump: (id: SectionId) => void;
}

/** 칸이 좁다 — 5억 7,000만 → 5.7억, 3,700만 그대로. 정확한 값은 시세 섹션에 있다. */
function compactManwon(n: number): string {
    if (n >= 10000) { const e = n / 10000; return `${Number.isInteger(e) ? e : e.toFixed(1).replace(/\.0$/, "")}억`; }
    return manwonText(n).replace(/원$/, "");
}

type Stat = { key: SectionId; label: string; value: string; sub?: string; subColor?: string; live?: boolean };

export function CourseHeader({ base, fees, top, counts, listingCount = 0, myWatch, loaded, distance, onJump }: Props) {
    const fee = weekdayFee(fees);
    const city = cityShort(base.city);
    const aliases = distinctAliases(base.name, base.aliases);
    const traits = [
        base.kind,
        base.holes ? `${base.holes}홀` : null,
        ...(base.grass ?? []),
        ...(base.play ?? []).map((p) => PLAY_LABEL[p] ?? p),
    ].filter(Boolean) as string[];

    const stats: Stat[] = [];
    if (fee) stats.push({ key: "fee", label: "주중 그린피", value: wonShort(fee), sub: "비회원" });
    else if (base.feeFrom) stats.push({ key: "map", label: "그린피", value: `${wonShort(base.feeFrom)}~`, sub: "대표 요금" });
    if (top) {
        stats.push({
            key: "price", label: "회원권", value: compactManwon(top.price),
            sub: top.change ? `${top.change > 0 ? "▲" : "▼"} ${Math.abs(top.change).toLocaleString("ko-KR")}만` : top.label,
            subColor: top.change ? trendColor(top.change) : undefined,
        });
    }
    if (base.bookable !== false && loaded) {
        const bits = [counts?.booking ? `부킹 ${counts.booking}` : "", counts?.join ? `조인 ${counts.join}` : ""].filter(Boolean).join(" · ");
        stats.push({
            key: "tee", label: "지금 티타임", value: listingCount > 0 ? `${listingCount}건` : "없음",
            sub: counts?.urgent ? `긴급 ${counts.urgent}` : bits || (listingCount ? undefined : "알림으로 받기"),
            subColor: counts?.urgent ? "#FF3B30" : undefined, live: listingCount > 0,
        });
    }

    return (
        <header className="px-5 pt-6">
            {/* 어디 · 얼마나 먼지 — 지역·시군은 목록으로 가는 링크(검색엔진도 이 길을 따라간다) */}
            <div className="flex items-center gap-1.5 text-[13px] text-[#FFFFFF8C] min-w-0">
                <Link href={listPath({ region: base.region })} className="shrink-0 active:text-white">{REGION_LABEL[base.region] ?? base.region}</Link>
                {city && (<><span className="text-[#FFFFFF33]">·</span><Link href={listPath({ region: base.region, city: base.city })} className="shrink-0 active:text-white">{city}</Link></>)}
                {distance && (
                    <>
                        <span className="text-[#FFFFFF33]">·</span>
                        {"text" in distance ? (
                            <span className="truncate">내 위치에서 <span className="text-[#FFFFFFCC] tabular-nums">{distance.text}</span></span>
                        ) : (
                            <button type="button" onClick={distance.ask} className="inline-flex items-center gap-1 -my-1 py-1 active:text-white">
                                <LucideLocateFixed className="w-3.5 h-3.5" />내 위치에서 거리
                            </button>
                        )}
                    </>
                )}
            </div>

            <h1 className="mt-2 text-[28px] leading-[1.18] font-bold tracking-tight text-white break-keep">{base.name}</h1>
            {aliases.length > 0 && <p className="mt-1 text-[13px] text-[#FFFFFF66] break-keep">{aliases.slice(0, 2).join(" · ")}</p>}
            {traits.length > 0 && (
                <p className="mt-2.5 text-[14px] leading-relaxed text-[#FFFFFFB3] break-keep">{traits.join(" · ")}</p>
            )}

            {/* 한눈 숫자 — 한 띠, 얇은 세로선. 있는 것만. */}
            {!loaded ? (
                <Skel className="mt-6 h-[76px] rounded-2xl" />
            ) : stats.length > 0 && (
                <div className="mt-6 flex rounded-2xl bg-[#FFFFFF08] divide-x divide-[#FFFFFF0F]">
                    {stats.map((t) => (
                        <button
                            key={t.key} type="button" onClick={() => onJump(t.key)}
                            className="flex-1 min-w-0 text-left px-4 py-3.5 first:rounded-l-2xl last:rounded-r-2xl active:bg-[#FFFFFF0A]"
                        >
                            <span className="flex items-center gap-1.5 text-[12px] text-[#FFFFFF73]">
                                {t.live && <span className="w-1.5 h-1.5 rounded-full bg-[#64DD17]" />}
                                {t.label}
                            </span>
                            <span className="block mt-1 text-[19px] leading-tight font-semibold text-white tabular-nums truncate">{t.value}</span>
                            {t.sub && <span className="block mt-0.5 text-[12px] truncate" style={{ color: t.subColor ?? "#FFFFFF59" }}>{t.sub}</span>}
                        </button>
                    ))}
                </div>
            )}

            {base.bookable !== false && (
                <div className="mt-4">
                    {loaded ? (
                        <WatchButton slug={base.slug} name={base.name} myWatch={myWatch ?? null} watchers={base.watchers} size="lg" />
                    ) : <Skel className="h-[52px] rounded-2xl" />}
                    {base.watchers > 0 && (
                        <p className="mt-2 text-center text-[12px] text-[#FFFFFF59] tabular-nums">{base.watchers.toLocaleString("ko-KR")}명이 이 골프장 티타임을 기다려요</p>
                    )}
                </div>
            )}
        </header>
    );
}
