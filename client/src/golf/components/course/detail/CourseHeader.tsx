/**
 * 골프장 상세의 머리(2026-09-24) — 이름, 지역·종류 칩, 내 위치에서 거리, 한눈 숫자 셋, 그리고 **관심 단추**(주 행동).
 *
 * 한눈 숫자는 데이터가 있는 것만 그린다(주중 그린피 · 회원권 시세 · 지금 티타임). 셋 다 없으면 줄째로 없다.
 * 목록에서 들어오면 목록 캐시로 이름·칩이 먼저 뜨고(prefill), 상세가 오면 나머지가 채워진다.
 */
import { Link } from "wouter";
import { LucideLocateFixed, LucideNavigation, LucideStar } from "@/lib/icons";
import { cityShort, distinctAliases, listPath, manwonText, weekdayFee, wonShort, type Fees } from "@shared/golfCourse";
import type { CourseCounts, CoursePrice } from "@/golf/lib/courseApi";
import { WatchButton } from "../WatchSheet";
import { CourseLogo, PLAY_LABEL } from "../CourseLogo";
import { Skel, trendColor, type SectionId } from "./ui";

export interface HeaderData {
    slug: string; name: string; region: string; city: string | null; kind: string | null; holes: number | null;
    watchers: number;
    logo?: string | null;
    /** 옛 이름·다른 이름 — "구 큐로CC" 처럼 한 줄로. 옛 이름으로 검색해 들어온 사람이 "여기 맞나" 를 바로 안다. */
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

const chip = "h-7 px-2.5 rounded-full text-[12.5px] font-medium inline-flex items-center border";

export function CourseHeader({ base, fees, top, counts, listingCount = 0, myWatch, loaded, distance, onJump }: Props) {
    const fee = weekdayFee(fees);
    const city = cityShort(base.city);
    const tiles: { key: SectionId; label: string; value: string; sub?: string; subColor?: string; live?: boolean }[] = [];
    if (loaded && listingCount > 0) {
        const bits = [counts?.booking ? `부킹 ${counts.booking}` : "", counts?.join ? `조인 ${counts.join}` : ""].filter(Boolean).join(" · ");
        tiles.push({ key: "tee", label: "지금 티타임", value: `${listingCount}건`, sub: counts?.urgent ? `긴급 ${counts.urgent}` : bits, subColor: counts?.urgent ? "#FF3B30" : undefined, live: true });
    }
    if (fee) tiles.push({ key: "fee", label: "주중 그린피", value: wonShort(fee), sub: "비회원" });
    else if (base.feeFrom) tiles.push({ key: "map", label: "그린피", value: `${wonShort(base.feeFrom)}~`, sub: "대표 요금" });
    if (top) {
        tiles.push({
            key: "price", label: "회원권", value: compactManwon(top.price),
            sub: top.change ? `${top.change > 0 ? "▲" : "▼"} ${Math.abs(top.change).toLocaleString("ko-KR")}만` : top.label,
            subColor: top.change ? trendColor(top.change) : undefined,
        });
    }

    return (
        <header className="px-4 pt-5">
            {base.logo !== undefined && (
                <div className="mb-4"><CourseLogo logo={base.logo} name={base.name} size="lg" /></div>
            )}
            <div className="flex flex-wrap gap-1.5">
                <Link href={listPath({ region: base.region })} className={`${chip} border-[#FFFFFF1F] text-[#FFFFFFCC] active:bg-[#FFFFFF14]`}>{base.region}</Link>
                {city && <Link href={listPath({ region: base.region, city: base.city })} className={`${chip} border-[#FFFFFF1F] text-[#FFFFFFCC] active:bg-[#FFFFFF14]`}>{city}</Link>}
                {base.kind && <span className={`${chip} border-transparent bg-[#FFFFFF0F] text-[#FFFFFFB3]`}>{base.kind}</span>}
                {base.holes ? <span className={`${chip} border-transparent bg-[#FFFFFF0F] text-[#FFFFFFB3]`}>{base.holes}홀</span> : null}
                {(base.grass ?? []).map((g) => <span key={g} className={`${chip} border-transparent bg-[#64DD1714] text-[#8BE84A]`}>{g}</span>)}
                {(base.play ?? []).map((x) => <span key={x} className={`${chip} border-transparent bg-[#FFFFFF0F] text-[#FFFFFFB3]`}>{PLAY_LABEL[x] ?? x}</span>)}
            </div>

            <h1 className="mt-3 text-[28px] leading-[1.2] font-semibold tracking-tight text-white break-keep">{base.name}</h1>
            {distinctAliases(base.name, base.aliases).length > 0 && (
                <p className="mt-1 text-[13px] text-[#FFFFFF73] break-keep">{distinctAliases(base.name, base.aliases).slice(0, 3).join(" · ")}</p>
            )}

            {(distance || base.watchers > 0) && (
                <div className="mt-2 flex items-center gap-3 text-[13px] text-[#FFFFFF99]">
                    {distance && ("text" in distance ? (
                        <span className="inline-flex items-center gap-1"><LucideNavigation className="w-4 h-4 text-[#64DD17]" />내 위치에서 {distance.text}</span>
                    ) : (
                        <button type="button" onClick={distance.ask} className="inline-flex items-center gap-1 h-7 -my-1 px-2 -mx-2 rounded-full active:bg-[#FFFFFF14]">
                            <LucideLocateFixed className="w-4 h-4" />내 위치에서 거리
                        </button>
                    ))}
                    {base.watchers > 0 && (
                        <span className="inline-flex items-center gap-1"><LucideStar weight="fill" className="w-4 h-4 text-[#64DD17]" />관심 {base.watchers.toLocaleString("ko-KR")}명</span>
                    )}
                </div>
            )}

            {!loaded ? (
                <div className="mt-5 grid grid-cols-3 gap-2"><Skel className="h-[74px] rounded-2xl" /><Skel className="h-[74px] rounded-2xl" /><Skel className="h-[74px] rounded-2xl" /></div>
            ) : tiles.length > 0 && (
                <div className={`mt-5 grid gap-2 ${tiles.length === 1 ? "grid-cols-1" : tiles.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                    {tiles.map((t) => (
                        <button
                            key={t.key} type="button" onClick={() => onJump(t.key)}
                            className="min-w-0 text-left rounded-2xl bg-[#FFFFFF08] border border-[#FFFFFF14] px-3 py-2.5 active:bg-[#FFFFFF0F]"
                        >
                            <span className="flex items-center gap-1.5 text-[12px] text-[#FFFFFF80]">
                                {t.live && <span className="relative flex w-1.5 h-1.5"><span className="absolute inset-0 rounded-full bg-[#64DD17] animate-ping opacity-60" /><span className="relative w-1.5 h-1.5 rounded-full bg-[#64DD17]" /></span>}
                                {t.label}
                            </span>
                            <span className="block mt-0.5 text-[18px] font-semibold text-white tabular-nums truncate">{t.value}</span>
                            {t.sub && <span className="block text-[12px] truncate" style={{ color: t.subColor ?? "#FFFFFF66" }}>{t.sub}</span>}
                        </button>
                    ))}
                </div>
            )}

            {base.bookable !== false && (
                <div className="mt-4">
                    {loaded ? (
                        <WatchButton slug={base.slug} name={base.name} myWatch={myWatch ?? null} watchers={base.watchers} size="lg" />
                    ) : <Skel className="h-[52px] rounded-2xl" />}
                </div>
            )}
        </header>
    );
}
