/**
 * 축제 화면의 작은 조각(2026-10-21) — 알약 · 목록 한 줄 · 사진 카드.
 * 사진은 공공누리 제3유형(변경 금지) — **자르지 않는다**: 높이만 정하고 가로는 사진 비율 그대로(w-auto · max-w-none) — 꽉 채워 자르는 클래스를 쓰지 않는다.
 * ⚠️ 리터럴 색만(등산의 색). 글자는 12px 이상.
 */
import { Link } from "wouter";
import { festivalBadge, festivalPath, festivalPeriod, festivalState, type FestivalRow } from "@shared/festivals";

/** 알약 — 지금(산호) · 곧(크림 테) · 끝남(흐림) */
export function FestivalBadge({ f, today, className, accent = "#F28C6A" }: { f: Pick<FestivalRow, "start" | "end">; today: string; className?: string; accent?: string }) {
    const { state } = festivalState(f, today);
    const style = state === "now" ? { background: accent, color: "#2A1208" } : state === "soon" ? { background: "transparent", color: "#F6D9A8", boxShadow: "inset 0 0 0 1px #F6D9A880" } : { background: "#FFFFFF14", color: "#F4EFE399" };
    return (
        <span className={`inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full px-2 text-[12px] font-semibold tabular-nums ${className ?? ""}`} style={style}>
            {state === "now" && <span className="h-1.5 w-1.5 rounded-full bg-[#2A1208]" aria-hidden />}{festivalBadge(f, today)}
        </span>
    );
}

/**
 * 사진 한 장 — 높이만 정한다(가로는 사진 그대로). frame 을 주면 정한 칸 안에 사진 전체를 담는다(남는 곳은 판 색 — 자르지 않는다).
 * 목록은 칸을 고정해야 글줄의 왼쪽이 가지런하다(2026-10-21 화면 확인: 사진마다 너비가 달라 글이 들쭉날쭉했다).
 * 없으면 등불 하나를 그린 빈칸.
 */
export function FestivalThumb({ f, h, frame, eager = false, className }: { f: Pick<FestivalRow, "image" | "title">; h: number; frame?: number; eager?: boolean; className?: string }) {
    if (!f.image) {
        return (
            <span className={`flex shrink-0 items-center justify-center rounded-xl ${className ?? ""}`} style={{ height: h, width: frame ?? Math.round(h * 1.33), background: "radial-gradient(circle at 50% 45%, #F28C6A55 0%, #13363F 60%)" }} aria-hidden>
                <span className="h-2.5 w-2.5 rounded-full bg-[#FFE1CF]" style={{ boxShadow: "0 0 14px #F28C6A" }} />
            </span>
        );
    }
    return (
        <span className={`block shrink-0 overflow-hidden rounded-xl ${className ?? ""}`} style={{ background: "#FFFFFF0A", boxShadow: "inset 0 0 0 1px #F4EFE31A", ...(frame ? { width: frame, height: h } : {}) }}>
            <img src={f.image} alt={`${f.title} 사진`} loading={eager ? "eager" : "lazy"} decoding="async" draggable={false} referrerPolicy="no-referrer"
                className={frame ? "block h-full w-full select-none object-contain" : "block w-auto max-w-none select-none"} style={frame ? undefined : { height: h }} />
        </span>
    );
}

/** 목록 한 줄 — 사진 · 알약 · 이름 · 기간 · 지역 */
export function FestivalItem({ f, today, extra, testId = "festival-row" }: { f: FestivalRow; today: string; extra?: string | null; testId?: string }) {
    const where = [f.region, f.addr?.split(" ")[1], extra].filter(Boolean).join(" · ");
    return (
        <li>
            <Link href={festivalPath(f.id)} className="flex items-center gap-3 py-3 active:opacity-80" data-testid={testId}>
                <FestivalThumb f={f} h={72} frame={96} />
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5"><FestivalBadge f={f} today={today} /></span>
                    <span className="mt-1 block text-[15.5px] font-semibold leading-snug text-[#F4EFE3] break-keep line-clamp-2">{f.title}</span>
                    <span className="mt-0.5 block text-[13px] tabular-nums text-[#F4EFE3B3]">{festivalPeriod(f)}</span>
                    {where && <span className="block truncate text-[12.5px] text-[#F4EFE380]">{where}</span>}
                </span>
            </Link>
        </li>
    );
}

/** 사진 카드(가로로 넘기는 줄) — 높이만 같고 가로는 사진마다 다르다 */
export function FestivalCard({ f, today, eager = false, note, accent }: { f: FestivalRow; today: string; eager?: boolean; note?: string | null; accent?: string }) {
    return (
        // 글 너비는 사진 너비를 따른다(width 0 · min-width 100% — 사진이 카드 너비를 정한다)
        <Link href={festivalPath(f.id)} className="block w-min shrink-0 active:opacity-80" data-testid="festival-card">
            {/* 알약을 사진 위에 얹지 않는다(제3유형 — 사진을 가리지 않게 아래에) */}
            <FestivalThumb f={f} h={132} eager={eager} />
            <span className="mt-2 flex items-center gap-1.5"><FestivalBadge f={f} today={today} accent={accent} /></span>
            <span className="mt-1 block truncate text-[15px] font-semibold text-[#F4EFE3]" style={{ width: 0, minWidth: "100%" }}>{f.title}</span>
            <span className="block truncate text-[12.5px] tabular-nums text-[#F4EFE399]" style={{ width: 0, minWidth: "100%" }}>{[festivalPeriod(f), f.region].filter(Boolean).join(" · ")}</span>
            {/* 붙는 한 줄(등산: '불암산에서 1.2km') — 기간 줄 끝에 붙이면 잘렸다(2026-10-21 화면 확인) */}
            {note && <span className="block truncate text-[12.5px] font-medium text-[#F6D9A8]" style={{ width: 0, minWidth: "100%" }}>{note}</span>}
        </Link>
    );
}
