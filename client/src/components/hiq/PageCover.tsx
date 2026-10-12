/**
 * 공개 페이지 맨 위의 표지 그림(2026-10-12) — 어느 페이지에 어느 그림인지는 shared/pageCovers 가 정한다.
 *
 * 그림은 화면의 양 끝까지 가고(bleed 로 바깥 여백을 되돌린다), 아래 끝은 페이지 바탕색으로 녹는다 — 그 위에 본문 카드가 겹쳐 올라온다.
 * children 은 그림 위에 놓이는 머리줄(뒤로 단추 · 화면 이름)이다. 그림 위의 글씨가 읽히게 위쪽에 어둠을 한 겹 깐다.
 *
 * **장식이다** — 그 선수 · 그 매장의 사진이 아니다. 그래서 alt 는 비우고 읽어 주지 않는다.
 * 바탕색은 종목 테마의 변수(surface-0)를 그대로 쓴다 — 당구의 밝은 바탕에서도 골프의 어두운 바탕에서도 같은 부품이다.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageCover({ src, children, className, height = 208, overlap = 56, fadeFrom = 52 }: {
    src: string;
    children?: ReactNode;
    /** 바깥 여백을 되돌리는 클래스(-mx-5 -mt-6 같은) */
    className?: string;
    /** 그림의 높이(px) */
    height?: number;
    /** 아래 카드가 그림 위로 올라오는 높이(px) */
    overlap?: number;
    /** 바탕색으로 녹기 시작하는 곳(%) */
    fadeFrom?: number;
}) {
    return (
        <div className={cn("relative overflow-hidden", className)} style={{ height, marginBottom: -overlap }} data-testid="page-cover">
            <img src={src} alt="" aria-hidden width={880} height={440} draggable={false} decoding="async" className="absolute inset-0 h-full w-full select-none object-cover" />
            {/* 위쪽 — 머리줄의 글씨가 읽히게. 아래쪽 — 페이지 바탕으로 녹는다 */}
            <div aria-hidden className="absolute inset-x-0 top-0 h-24" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0) 100%)" }} />
            <div aria-hidden className="absolute inset-x-0 bottom-0" style={{ top: `${fadeFrom}%`, background: "linear-gradient(180deg, transparent 0%, var(--surface-0) 92%)" }} />
            {children && <div className="relative z-10">{children}</div>}
        </div>
    );
}

export default PageCover;
