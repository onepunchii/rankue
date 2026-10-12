/**
 * 도장첩 화면들이 같이 쓰는 조각(2026-10-12) — 표지 · 종이 · 볼마커 수집함 · 트로피 선반 · 예시 안내.
 *
 * ⚠️ 리터럴 색만. 이 화면들은 로그인 없이도 열린다(예시 도장첩) — 방문자는 당구 테마라 토큰(ink · surface)이 밝게 풀리고,
 *    골프 테마에서는 `.bg-white` · `.text-black/NN` 이 어둡게/밝게 뒤집힌다(CourseShell 머리말과 같은 까닭).
 *    종이처럼 밝은 면 위의 글자도 전부 hex 로 적는다. 글자 12px 이상, 굵기는 semibold 까지.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { GuestJoinCta, SampleBadge } from "@/components/hiq/GuestGate";
import { STAMP_ALL_OPEN, STAMP_BOOKS, STAMP_OPEN_TOTAL, type BookState, type StampBook, type StampSummary } from "@shared/golfStampBooks";
import { MARKER_TIER_NAME, type MarkerTier } from "@shared/golfStampDepth";
import { BOOK_ART, TROPHIES, coverSrc, markerSrc } from "./bookArt";
import type { StampCollection } from "./useStampCollection";

export const STAMPS_PATH = "/golf/stamps";
export const SHELF_PATH = "/golf/shelf";
export const bookPath = (bookId: string) => `${STAMPS_PATH}/${bookId}`;

export const GOLD = "#E9B949";
export const LIME = "#64DD17";

/** 가는 진행 막대 — 다 차면 금색 */
export function StampBar({ got, total, className }: { got: number; total: number; className?: string }) {
    const done = total > 0 && got >= total;
    return (
        <div className={cn("h-1.5 rounded-full bg-[#FFFFFF1F] overflow-hidden", className)} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={got}>
            <div className="h-full rounded-full" style={{ width: `${total ? Math.min(100, (got / total) * 100) : 0}%`, background: done ? GOLD : LIME }} />
        </div>
    );
}

/** 도장첩 속지 — 도장은 늘 이 위에 찍힌다 */
export function StampPaper({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div className={cn("relative rounded-[18px] bg-[#F4EFE3] text-[#22201B]", className)}>
            <div className="pointer-events-none absolute inset-[7px] rounded-[12px] border border-dashed border-[#3C321E33]" aria-hidden />
            <div className="relative">{children}</div>
        </div>
    );
}

/** 볼마커 한 개 — 못 받은 것은 윤곽만(회색 · 옅게) */
export function MarkerArt({ bookId, size, earned, className, tier, preview }: {
    bookId: string; size: number; earned: boolean; className?: string; tier?: MarkerTier | null;
    /** 아직 못 받은 등급을 미리 보여 줄 때 — 제 색을 살리고 흐리게만(회색으로 만들면 블랙과 자개가 구별되지 않는다) */
    preview?: boolean;
}) {
    return (
        <img
            src={markerSrc(bookId, earned || preview ? tier : null)} width={size} height={size} alt="" draggable={false} decoding="async" loading="lazy"
            data-marker={bookId} data-earned={earned ? "1" : "0"} data-tier={earned && tier ? tier : undefined}
            className={cn("block shrink-0", className)}
            style={{ width: size, height: size, filter: earned ? "drop-shadow(0 3px 5px rgba(0,0,0,0.5))" : preview ? "saturate(0.75)" : "grayscale(1) brightness(0.7)", opacity: earned ? 1 : preview ? 0.5 : 0.42 }}
        />
    );
}

/** 표지의 제목 — 하늘이 밝으면 짙은 글자, 어두우면 흰 글자. 뒤에 옅은 막을 깔아 어느 표지에서도 읽히게 */
function CoverTitle({ book, size = 17, sub }: { book: StampBook; size?: number; sub?: string }) {
    const dark = !!BOOK_ART[book.id]?.darkSky;
    return (
        <>
            <div className="absolute inset-x-0 top-0 h-[46%]" style={{ background: dark ? "linear-gradient(180deg,#00000080,#00000000)" : "linear-gradient(180deg,#FFF6DEB8,#FFF6DE00)" }} aria-hidden />
            <div className="absolute left-2.5 top-2.5 right-1.5 font-semibold leading-tight tracking-tight break-keep" style={{ fontSize: size, color: dark ? "#FFFFFF" : "#17324A" }}>
                {book.name}
                {sub && <span className="block mt-0.5 text-[12px] font-normal opacity-80">{sub}</span>}
            </div>
        </>
    );
}

/** 책장의 한 권(세로 표지) — 누르면 그 권으로 */
export function BookCover({ state }: { state: BookState<unknown> }) {
    const { book, got, total, done } = state;
    return (
        <Link href={bookPath(book.id)} className="block active:opacity-80" data-testid={`stamp-book-${book.id}`}>
            <div className="relative aspect-[3/4] rounded-[10px] overflow-hidden bg-[#1A1A1A] shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
                <img src={coverSrc(book.id)} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" decoding="async" draggable={false} />
                <CoverTitle book={book} />
                {done && (
                    <>
                        <span className="absolute left-0 bottom-2.5 rounded-r-[9px] bg-[#E9B949] px-2 py-0.5 text-[12px] font-semibold text-[#2B1C00]">완성</span>
                        <MarkerArt bookId={book.id} size={46} earned className="absolute -right-1.5 -bottom-1.5" />
                    </>
                )}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[13px] text-[#FFFFFFB3]">
                <span className="tabular-nums"><b className="font-semibold text-[#FFFFFF]">{got}</b>/{total}</span>
                <StampBar got={got} total={total} className="flex-1" />
            </div>
        </Link>
    );
}

/** 책장의 한 권(가로 띠) — 초대장 도장첩. 금 테두리 */
export function BookWide({ state, sub }: { state: BookState<unknown>; sub: string }) {
    const { book, done } = state;
    return (
        <Link href={bookPath(book.id)} className="relative block h-24 rounded-xl overflow-hidden bg-[#1A1A1A] active:opacity-80" data-testid={`stamp-book-${book.id}`}>
            <img src={coverSrc(book.id)} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: "50% 62%" }} loading="lazy" decoding="async" draggable={false} />
            <div className="absolute inset-0" style={{ background: "linear-gradient(90deg,#000000B8,#00000026)" }} aria-hidden />
            <div className="absolute left-3 top-3 right-16 text-[15px] font-semibold text-[#FFFFFF] leading-tight break-keep">
                {book.name}
                <span className="block mt-1 text-[12px] font-normal text-[#FFFFFFBF] tabular-nums">{sub}</span>
            </div>
            <MarkerArt bookId={book.id} size={54} earned={done} className="absolute right-2 bottom-2" />
            <div className="pointer-events-none absolute inset-0 rounded-xl border-[1.5px] border-[#E7C27A]" aria-hidden />
        </Link>
    );
}

/** 볼마커 등급의 점 셋 — 일반 · 블랙 · 자개. 받은 데까지 찬다 */
export function TierDots({ done, tier, className }: { done: boolean; tier: MarkerTier | null; className?: string }) {
    const level = !done ? 0 : tier === "pearl" ? 3 : tier === "black" ? 2 : 1;
    const label = !done ? "아직 없음" : MARKER_TIER_NAME[tier ?? "base"];
    const colors = ["#E9B949", "#9AA3AD", "#DCE8F2"];
    return (
        <span className={`inline-flex items-center gap-[3px] ${className ?? ""}`} role="img" aria-label={`등급 ${label}`} data-tier-level={level}>
            {colors.map((c, i) => (
                <span key={c} className="block h-[5px] w-[5px] rounded-full" style={{ background: i < level ? c : "#FFFFFF24" }} />
            ))}
        </span>
    );
}

/** 볼마커 수집함 — 펠트 깔린 나무 상자. 권마다 한 칸 + 누구나 일곱 권 전부 */
export function MarkerCase({ states, summary, tierOf }: { states: readonly BookState<unknown>[]; summary: StampSummary; tierOf?: (bookId: string) => MarkerTier | null }) {
    // 등급(일반 · 블랙 · 자개)은 '누구나' 일곱 권과 일곱 권 전부에만 있다 — 초대장 두 권은 점을 그리지 않는다
    const cells: { id: string; name: string; earned: boolean; prog: string; tiered: boolean }[] = [
        ...states.filter((s) => s.book.kind === "open").map((s) => ({ id: s.book.id, name: s.book.name, earned: s.done, prog: `${s.got}/${s.total}`, tiered: true })),
        { id: STAMP_ALL_OPEN, name: `누구나 ${STAMP_OPEN_TOTAL}`, earned: summary.allOpenDone, prog: `${summary.openStamped}/${summary.openTotal}`, tiered: true },
        ...states.filter((s) => s.book.kind === "invite").map((s) => ({ id: s.book.id, name: s.book.name.replace(" 초대장", ""), earned: s.done, prog: `${s.got}/${s.total}`, tiered: false })),
    ];
    return (
        <div className="rounded-2xl p-[9px]" style={{ background: "linear-gradient(145deg,#6B4A2B,#3A2614 60%,#55391F)", boxShadow: "inset 0 1px 0 #FFFFFF2E, 0 6px 16px #00000080" }} data-testid="marker-case">
            <div className="grid grid-cols-5 gap-x-1 gap-y-3 rounded-[9px] px-1.5 pt-3.5 pb-2.5" style={{ background: "radial-gradient(120% 90% at 50% 0%,#17573A,#0C3524 70%,#092A1C)", boxShadow: "inset 0 3px 10px #00000099" }}>
                {cells.map((c) => (
                    <div key={c.id} className="min-w-0 text-center" data-testid={`case-${c.id}`}>
                        <div className="mx-auto flex h-[54px] w-[54px] items-center justify-center rounded-full" style={{ background: "radial-gradient(circle at 50% 38%,#072417,#0A2E1E)", boxShadow: "inset 0 3px 6px #000000BF, 0 1px 0 #FFFFFF12" }}>
                            <MarkerArt bookId={c.id} size={c.earned ? 58 : 48} earned={c.earned} tier={c.tiered ? tierOf?.(c.id) : null} />
                        </div>
                        {c.tiered && tierOf && <TierDots done={c.earned} tier={tierOf(c.id)} className="mt-1.5" />}
                        <div className={cn(c.tiered && tierOf ? "mt-1" : "mt-1.5", "text-[12px] leading-tight break-keep", c.earned ? "text-[#FFFFFF]" : "text-[#FFFFFF80]")}>
                            {c.name}
                            {!c.earned && <span className="block tabular-nums">{c.prog}</span>}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/** 트로피 한 개 — 숫자는 깃발 네모 한가운데, 네모 높이에 맞춘 크기로 */
export function TrophyPiece({ index, size, earned }: { index: number; size: number; earned: boolean }) {
    const t = TROPHIES[index];
    return (
        <div className="relative shrink-0" style={{ width: size, height: size }} data-testid={`trophy-${t.at}`} data-earned={earned ? "1" : "0"}>
            <img src={t.src} alt="" width={size} height={size} draggable={false} decoding="async" loading="lazy" className="block w-full h-full" style={{ filter: earned ? undefined : "grayscale(1) brightness(0.85)", opacity: earned ? 1 : 0.5 }} />
            <span
                className="absolute flex items-center justify-center font-semibold tabular-nums leading-none"
                style={{
                    left: t.flag.x * size, top: t.flag.y * size, width: t.flag.w * size, height: t.flag.h * size,
                    fontSize: Math.max(12, t.flag.h * size * 0.7), letterSpacing: "-0.02em",
                    color: earned ? t.ink : "#FFFFFF", opacity: earned ? 1 : 0.6,
                    textShadow: earned && t.ink === "#FFFFFF" ? "0 1px 1px rgba(0,0,0,0.4)" : undefined,
                }}
            >
                {t.at}
            </span>
        </div>
    );
}

/**
 * 트로피 선반 — 다섯 개가 늘 한 줄. 선반의 너비를 재서 칸과 그림의 크기를 정한다(360 폭에서 옆으로 넘치지 않게).
 * 그림은 가장자리가 비어 있어 칸보다 크게 그리고 옆 칸과 겹친다.
 */
export function TrophyShelf({ stamped }: { stamped: number }) {
    const ref = useRef<HTMLDivElement>(null);
    const [inner, setInner] = useState(310);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        const measure = () => setInner(el.clientWidth);
        measure();
        const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
        ro?.observe(el);
        return () => ro?.disconnect();
    }, []);
    const COL = Math.max(44, Math.min(72, Math.floor(inner / TROPHIES.length)));
    const SIZE = Math.round(COL * 1.8);
    return (
        <div className="relative rounded-2xl bg-[#0C0C0C] border border-[#FFFFFF14] px-3.5 pt-2.5 pb-5 overflow-hidden" data-testid="trophy-shelf">
            <div ref={ref} className="flex justify-around">
                {TROPHIES.map((t, i) => {
                    const earned = stamped >= t.at;
                    return (
                        <div key={t.at} className="text-center" style={{ width: COL }}>
                            <div style={{ margin: `0 ${(COL - SIZE) / 2}px` }}><TrophyPiece index={i} size={SIZE} earned={earned} /></div>
                            <div className={cn("mt-0.5 text-[12px]", earned ? "text-[#FFFFFF]" : "text-[#FFFFFF99]")}>{i === TROPHIES.length - 1 ? "전부" : `${t.at}곳`}</div>
                        </div>
                    );
                })}
            </div>
            <div className="absolute inset-x-2.5 bottom-2.5 h-[7px] rounded-sm" style={{ background: "linear-gradient(#5D4126,#33210F)", boxShadow: "0 5px 9px #00000099" }} aria-hidden />
        </div>
    );
}

/**
 * 예시 안내 — 방문자에게 예시를 그리는 화면의 맨 위에 한 줄(가입으로 가는 길은 그림 아래의 SampleJoin).
 * 회원에게는 아무것도 그리지 않는다 — 회원의 화면은 늘 내 도장첩이고, 예시는 '?' 단추가 연다(StampHelp).
 */
export function SampleNotice({ col, text = "한 사람의 도장첩을 예시로 보여 드려요. 골프장에서 18홀을 끝내면 내 도장이 찍혀요." }: { col: StampCollection; text?: string }) {
    if (!col.isGuest) return null;
    return (
        <p className="flex items-start gap-2 text-[13.5px] leading-snug text-[#FFFFFFB3] break-keep" data-testid="stamp-sample-notice">
            <SampleBadge tone="dark" className="mt-px" />
            <span>{text}</span>
        </p>
    );
}

/** 방문자에게만 — 가입으로 가는 길. 예시 그림을 본 뒤에 나오게 구역 사이에 둔다 */
export function SampleJoin({ col, from, className }: { col: StampCollection; from: string; className?: string }) {
    if (!col.isGuest) return null;
    return (
        <div className={cn("px-5", className)} data-testid="stamp-sample-join">
            <GuestJoinCta tone="dark" title="가입하고 내 도장첩을 시작하세요" desc="도장첩 한 권을 다 채우면 그 권역의 볼마커를 받아요" from={from} />
        </div>
    );
}

/**
 * 모을 수 있는 볼마커 한 줄 — 예시를 보는 사람에게(방문자 · 도장이 아직 없는 회원) 무엇을 모으는지 먼저 보여 준다.
 * 누가 가진 것이 아니라 **목록**이라 전부 제 색으로 그린다(가진 것 · 못 가진 것의 구분은 장식장의 수집함이 한다).
 */
export function MarkerCatalog() {
    const items: { id: string; name: string }[] = [
        ...STAMP_BOOKS.filter((b) => b.kind === "open").map((b) => ({ id: b.id, name: b.name })),
        { id: STAMP_ALL_OPEN, name: `누구나 ${STAMP_OPEN_TOTAL}` },
        ...STAMP_BOOKS.filter((b) => b.kind === "invite").map((b) => ({ id: b.id, name: b.name })),
    ];
    return (
        <div className="-mx-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="marker-catalog">
            <ul className="flex w-max gap-3.5 px-5 pb-1">
                {items.map((m) => (
                    <li key={m.id} className="w-[72px] text-center">
                        <MarkerArt bookId={m.id} size={72} earned />
                        <span className="mt-1.5 block text-[12px] leading-tight text-[#FFFFFFCC] break-keep">{m.name}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** 구역 제목 — 왼쪽 제목, 오른쪽 작은 설명(예시면 "예시" 표시를 제목 옆에) */
export function StampSection({ title, aside, sample, children, className }: { title: string; aside?: ReactNode; sample?: boolean; children: ReactNode; className?: string }) {
    return (
        <section className={cn("px-5 pt-8", className)}>
            <div className="mb-3 flex items-end justify-between gap-3">
                <h2 className="flex items-center gap-2 text-[17px] font-semibold tracking-tight text-[#FFFFFF] leading-tight">
                    {title}
                    {sample && <SampleBadge tone="dark" />}
                </h2>
                {aside && <div className="text-[12px] text-[#FFFFFF8C] text-right break-keep">{aside}</div>}
            </div>
            {children}
        </section>
    );
}

/** 책 id → 이름(없으면 빈 글자) */
export const bookName = (bookId: string) => STAMP_BOOKS.find((b) => b.id === bookId)?.name ?? "";
