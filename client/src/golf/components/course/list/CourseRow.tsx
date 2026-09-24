/**
 * 골프장 목록 한 줄(2026-09-24) — 이름·시군·종류·홀 · 지금 글 배지 · 대표 시세 · 거리 · 관심 별.
 *
 * 줄 전체가 <a>(wouter Link)다 — 검색엔진이 목록에서 골프장 페이지로 가는 길을 따라가야 한다.
 * 관심 별은 링크 **밖**에 둔다(a 안에 button 은 잘못된 HTML 이고, 별을 누르다 페이지가 넘어간다).
 *
 * 색은 리터럴만 — 비로그인(당구 테마)에서도 열린다(CourseShell 주석).
 */
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { coursePath, cityShort, manwonText, wonShort } from "@shared/golfCourse";
import { formatDistance } from "@shared/golfJoin";
import type { CourseCounts, CourseListItem, WatchFilters } from "../../../lib/courseApi";
import { WatchButton } from "../WatchSheet";
import { CourseLogo, PLAY_LABEL } from "../CourseLogo";

/** 지금 글 배지 — 0 은 숨긴다. 긴급은 조인의 한 갈래라 조인 수에 이미 들어 있다(긴급 1 · 조인 1 이면 같은 글일 수 있다). */
export function LiveBadges({ counts, className }: { counts: CourseCounts; className?: string }) {
    const items = [
        { n: counts.urgent, label: "긴급", cls: "bg-[#FF3B3024] text-[#FF6B63]" },
        { n: counts.booking, label: "부킹", cls: "bg-[#64DD171F] text-[#8BE84A]" },
        { n: counts.join, label: "조인", cls: "bg-[#FF6B001F] text-[#FF8A33]" },
    ].filter((x) => x.n > 0);
    if (!items.length) return null;
    return (
        <span className={cn("inline-flex items-center gap-1", className)}>
            {items.map((x) => (
                <span key={x.label} className={cn("h-5 px-1.5 rounded-md text-[12px] font-semibold leading-5 tabular-nums whitespace-nowrap", x.cls)}>
                    {x.label} {x.n}
                </span>
            ))}
        </span>
    );
}

/** 시세 등락(만원). 한국 관례: 오름 빨강 · 내림 파랑. 0·없음은 그리지 않는다. */
export function PriceChange({ change, className }: { change: number | null | undefined; className?: string }) {
    if (!change) return null;
    const up = change > 0;
    return (
        <span className={cn("tabular-nums whitespace-nowrap", up ? "text-[#FF4D4F]" : "text-[#3B82F6]", className)}>
            {up ? "▲" : "▼"}{manwonText(Math.abs(change)).replace(/원$/, "")}
        </span>
    );
}

export function CourseRow({ c, km, myWatch }: { c: CourseListItem; km: number | null; myWatch: { filters: WatchFilters } | null }) {
    // 더블이글 줄처럼 "지역 · 그린피" 가 먼저 — 그린피 표가 없는 곳은 대표 그린피(자료)로.
    const meta = [cityShort(c.city) || c.region, c.feeFrom ? `${wonShort(c.feeFrom)}~` : null, c.holes ? `${c.holes}홀` : null, km != null ? formatDistance(km) : null].filter(Boolean);
    const tags = (c.play ?? []).map((p) => PLAY_LABEL[p] ?? p);
    const live = c.counts.booking + c.counts.join > 0;
    return (
        <li className="flex items-stretch border-b border-[#FFFFFF0F] last:border-b-0">
            <Link
                href={coursePath(c.slug)}
                className="flex-1 min-w-0 flex items-center gap-3 pl-4 pr-1 py-3.5 active:bg-[#FFFFFF08] transition-colors"
            >
                <CourseLogo logo={c.logo} name={c.name} size="sm" />
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 min-w-0">
                        {live && <span className="w-1.5 h-1.5 rounded-full bg-[#64DD17] shrink-0" aria-hidden="true" />}
                        <span className="text-[15px] font-semibold text-[#FFFFFF] truncate">{c.name}</span>
                    </span>
                    <span className="mt-0.5 block text-[13px] text-[#FFFFFF73] truncate">{meta.join(" · ")}</span>
                    {(live || c.watchers > 0 || tags.length > 0) && (
                        <span className="mt-1.5 flex items-center gap-1.5 min-w-0 overflow-hidden">
                            <LiveBadges counts={c.counts} />
                            {tags.map((t) => <span key={t} className="h-5 px-1.5 rounded-md bg-[#FFFFFF0F] text-[12px] leading-5 text-[#FFFFFF99] whitespace-nowrap">{t}</span>)}
                            {c.watchers > 0 && <span className="text-[12px] text-[#FFFFFF66] whitespace-nowrap">관심 {c.watchers}</span>}
                        </span>
                    )}
                </span>
                {c.price && (
                    <span className="shrink-0 text-right">
                        <span className="block text-[14px] font-semibold text-[#FFFFFF] tabular-nums whitespace-nowrap">{manwonText(c.price.price)}</span>
                        <span className="mt-0.5 flex items-center justify-end gap-1 text-[12px] text-[#FFFFFF66]">
                            <span className="whitespace-nowrap">회원권 {c.price.label}</span>
                            <PriceChange change={c.price.change} />
                        </span>
                    </span>
                )}
            </Link>
            {/* 글이 붙을 수 없는 골프장(자료로만 만든 새 페이지)엔 별이 없다 — 알림을 약속할 수 없다 */}
            <div className="shrink-0 flex items-center pr-2 w-12 justify-center">
                {c.bookable !== false && <WatchButton slug={c.slug} name={c.name} myWatch={myWatch} watchers={c.watchers} size="sm" />}
            </div>
        </li>
    );
}

export function CourseRowSkeleton() {
    return (
        <li className="flex items-center gap-3 px-4 py-4 border-b border-[#FFFFFF0F]">
            <span className="w-12 h-12 rounded-xl bg-[#FFFFFF0A] animate-pulse shrink-0" />
            <span className="flex-1 space-y-2">
                <span className="block h-4 w-2/5 rounded bg-[#FFFFFF0F] animate-pulse" />
                <span className="block h-3 w-3/5 rounded bg-[#FFFFFF0A] animate-pulse" />
            </span>
            <span className="h-4 w-16 rounded bg-[#FFFFFF0A] animate-pulse" />
        </li>
    );
}

/**
 * 이름 검색 — "안양cc" 로 쳐도 "안양컨트리클럽" 이 나와야 한다. 흔한 꼬리(컨트리클럽·CC·골프클럽…)와 띄어쓰기를 떼고 비교한다.
 * 꼬리만 친 경우("cc")는 뗀 게 빈 문자열이라 원래 글자로 찾는다.
 */
const TAIL = /(컨트리클럽|컨트리|countryclub|골프앤리조트|골프리조트|골프클럽|골프장|golfclub|골프|클럽|리조트|cc|gc)/g;
const squash = (s: string) => s.toLowerCase().replace(/\s+/g, "");
export function matchesCourseQuery(c: { name: string; city: string | null; aliases?: string[] }, q: string): boolean {
    const raw = squash(q);
    if (!raw) return true;
    const city = squash(c.city ?? "");
    if (city.includes(raw)) return true;
    const core = raw.replace(TAIL, "");
    // 옛 이름·다른 이름으로도 찾는다("큐로" → 로제비앙GC, "인터불고" → 해내다CC)
    return [c.name, ...(c.aliases ?? [])].some((n) => {
        const name = squash(n);
        return name.includes(raw) || (!!core && name.replace(TAIL, "").includes(core));
    });
}
