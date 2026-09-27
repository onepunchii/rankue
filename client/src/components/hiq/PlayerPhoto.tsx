/**
 * 선수 사진(2026-09-27 오너: "UMB·PBA 선수 사진 연동, 출처만 짧게") — PBA 공식 사진을 서버 라우트(/api/hiq/pba/photo/:memCode)가
 * 공식 주소로 돌려보내 그대로 보인다(우리 서버에 저장하지 않는다). 사진이 없거나 못 불러오면 원래 이니셜 동그라미가 남는다.
 * 사진이 뜬 곳에는 부르는 쪽이 짧게 출처('사진 PBA')를 적는다 — photoShown 으로 알 수 있다.
 */
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { crewColors } from "@shared/crewBrand";

export const pbaPhotoSrc = (memCode: string) => `/api/hiq/pba/photo/${encodeURIComponent(memCode)}`;

export function PlayerPhoto({ memCode, name, size, className, textClass, onShown, children }: {
    /** PBA memCode — 없으면 이니셜만 */
    memCode?: string | null;
    name: string;
    size: number;
    className?: string;
    textClass?: string;
    onShown?: () => void;
    /** 동그라미 위에 얹을 것(리그 배지·국기) */
    children?: ReactNode;
}) {
    const [state, setState] = useState<"loading" | "ok" | "none">(memCode ? "loading" : "none");
    const [c0, c1] = crewColors(memCode ?? name);
    return (
        <span className={cn("relative inline-flex shrink-0 rounded-full", className)} style={{ width: size, height: size }}>
            <span className={cn("w-full h-full rounded-full overflow-hidden flex items-center justify-center text-white font-bold", textClass)}
                style={{ background: `linear-gradient(135deg, ${c0}, ${c1})`, fontSize: Math.round(size * 0.4) }} aria-hidden="true">
                {state !== "ok" && name.trim().charAt(0)}
                {memCode && state !== "none" && (
                    <img
                        src={pbaPhotoSrc(memCode)} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer"
                        onLoad={() => { setState("ok"); onShown?.(); }} onError={() => setState("none")}
                        className={cn("absolute inset-0 w-full h-full rounded-full object-cover object-top bg-surface-3 transition-opacity duration-300", state === "ok" ? "opacity-100" : "opacity-0")}
                    />
                )}
            </span>
            {children}
        </span>
    );
}
