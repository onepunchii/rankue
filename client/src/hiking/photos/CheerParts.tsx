/**
 * 산행 사진 응원(2026-11-04 오너: "사진 응원 기능만 먼저 시행하자") — 규칙과 글은 shared/hikingPhotos(HIKING_CHEER_*).
 *   CheerButton  사진을 크게 본 화면의 단추 — 누르면 보내고, 다시 누르면 거둔다(바로 바뀌고, 서버의 답으로 맞춘다).
 *                방문자는 onGuest(부르는 쪽이 사진 화면을 닫고 가입 팝업을 연다 — 사진 화면이 팝업보다 위층이다).
 *   CheerCount   작은 표시 — 썸네일 · 사진 줄 카드에 받은 수(0이면 그리지 않는다).
 * 1:1 대화로 이어지는 길은 없다. ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상.
 */
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useHikingAccess } from "@/hooks/useHikingAccess";
import { LucideHandsClapping } from "@/lib/icons";
import { HIKING_CHEER_LABEL as L } from "@shared/hikingPhotos";
import { HIKING_PHOTOS_KEY, RECENT_PHOTOS_KEY, cheerHikingPhoto } from "./photoApi";

export function CheerButton({ photo, onGuest }: { photo: { id: string; cheers?: number; cheered?: boolean }; onGuest: () => void }) {
    const { member, isLoading } = useAuth();
    const hikingOk = useHikingAccess();
    const qc = useQueryClient();
    const [state, setState] = useState({ on: !!photo.cheered, n: photo.cheers ?? 0 });
    // 다른 사진으로 넘기거나 목록을 다시 받으면 서버의 값으로
    useEffect(() => { setState({ on: !!photo.cheered, n: photo.cheers ?? 0 }); }, [photo.id, photo.cheered, photo.cheers]);
    const m = useMutation({
        mutationFn: (on: boolean) => cheerHikingPhoto(photo.id, on),
        onMutate: (on: boolean) => {
            const prev = state;
            setState({ on, n: Math.max(0, prev.n + (on ? 1 : -1)) });
            return { prev };
        },
        onSuccess: (r) => {
            setState({ on: !!r.cheered, n: Number(r.count) || 0 });
            void qc.invalidateQueries({ queryKey: [HIKING_PHOTOS_KEY] });
            void qc.invalidateQueries({ queryKey: RECENT_PHOTOS_KEY });
        },
        onError: (_e, _on, ctx) => { if (ctx?.prev) setState(ctx.prev); },
    });
    if (isLoading) return null;
    // 로그인했지만 등산이 열리지 않은 회원 — 보낼 곳이 없으니 수만 보인다
    if (member && !hikingOk) return state.n > 0 ? <CheerCount n={state.n} className="mt-3" /> : null;
    return (
        <button type="button" aria-pressed={state.on} disabled={m.isPending}
            onClick={() => { if (!member) { onGuest(); return; } m.mutate(!state.on); }}
            data-track-as="hiking-photo-cheer" data-testid="hk-photo-cheer" data-on={state.on ? "1" : "0"}
            className="mt-3 flex h-11 items-center gap-2 rounded-full px-4 text-[14.5px] font-semibold active:opacity-80"
            style={state.on ? { background: "#F28C6A", color: "#2A1208" } : { background: "#FFFFFF14", color: "#F4EFE3", boxShadow: "inset 0 0 0 1px #FFFFFF2E" }}>
            <LucideHandsClapping weight={state.on ? "fill" : "regular"} className="h-5 w-5" aria-hidden />
            {state.on ? L.cheered : L.cheer}
            {state.n > 0 && <span className="tabular-nums" data-testid="hk-photo-cheer-count">{state.n}</span>}
        </button>
    );
}

/** 받은 응원 수 — 0이면 그리지 않는다 */
export function CheerCount({ n, className, overlay = false }: { n: number | undefined; className?: string; overlay?: boolean }) {
    if (!n || n <= 0) return null;
    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[12px] font-semibold leading-tight tabular-nums ${className ?? ""}`}
            style={overlay ? { background: "#0B1F26D9", color: "#F6D9A8" } : { color: "#F6D9A8" }} aria-label={L.count(n)} data-testid="hk-cheer-count">
            <LucideHandsClapping weight="fill" className="h-3.5 w-3.5" aria-hidden />{n}
        </span>
    );
}
