/**
 * "내 방이 열려 있어요" 줄(2026-09-21 오너 제보: "방을 만들고 나갔는데 멀티방 목록에선 안 보인다").
 *
 * 멀티방 목록은 **내가 연 방을 일부러 뺀다** — 내 방엔 내가 참가할 수 없어서다. 그런데 그 바람에 방을 열고 나온 사람은
 * 홈에서도 목록에서도 "열린 방이 없어요"만 보게 됐다. 자기 방이 24시간 동안 떠 있는데도. 그래서 참가 줄과 다른 모양의
 * 줄을 하나 둔다: **들어가기(대기 화면으로 돌아가기) · 닫기(방 취소)**.
 *
 * 방은 한 번에 하나뿐이라(새 방을 만들면 옛 방은 서버가 접는다) 이 줄도 하나만 나온다.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { matchApi as defaultApi, type MatchApi, type MatchPublic } from "../matchApi";
import { gameLabel } from "./matchView";
import { MATCH_LIST_QUERY_KEY } from "./queryKeys";
import { ROOMS_QUERY_KEY } from "./RoomList";

/** 내가 열어 둔 대기 방(호스트). 없으면 null. */
export function useMyOpenRoom(api: MatchApi = defaultApi, enabled = true) {
    const q = useQuery({
        queryKey: MATCH_LIST_QUERY_KEY,
        queryFn: () => api.listMatches(),
        enabled,
        staleTime: 10_000,
    });
    const room = (q.data ?? []).find((m) => m.status === "waiting" && m.myIndex === 0) ?? null;
    return { room, isPending: q.isPending };
}

export function MyRoomRow({ room, onEnter, api = defaultApi, className }: {
    room: MatchPublic;
    /** 대기 화면으로 돌아간다(로비가 내 방을 다시 띄운다) */
    onEnter: () => void;
    api?: MatchApi;
    className?: string;
}) {
    const { t } = useT();
    const qc = useQueryClient();
    const close = useMutation({
        // 대기 방의 기권 = 방 취소(서버 라우트가 같은 자리에서 갈라진다)
        mutationFn: async () => api.resign(room.id),
        onSettled: () => {
            void qc.invalidateQueries({ queryKey: MATCH_LIST_QUERY_KEY });
            void qc.invalidateQueries({ queryKey: ROOMS_QUERY_KEY });
        },
    });
    return (
        <div className={cn("px-4 py-2.5 flex items-center gap-2", className)}>
            <span className="flex-1 min-w-0">
                <span className="block text-[13.5px] font-bold text-ink-1 truncate">{t("sim.rooms.mineOpen")}</span>
                <span className="block text-[12px] font-medium text-ink-3 truncate mt-0.5">
                    {gameLabel(room, t)}
                    {room.handicap === true
                        ? <> · <span className="text-brand font-bold">{t("sim.match.handicapRoom")}</span></>
                        : <> · {t("sim.rooms.target").replace("{n}", String(room.hostTarget))}</>}
                    {room.isPublic ? null : <> · {t("sim.rooms.minePrivate")}</>}
                </span>
            </span>
            <button
                type="button" onClick={onEnter}
                className="h-9 px-3.5 shrink-0 rounded-pill bg-brand/10 text-brand text-[13px] font-bold"
            >
                {t("sim.rooms.mineEnter")}
            </button>
            <button
                type="button" onClick={() => close.mutate()} disabled={close.isPending}
                className="h-9 px-3 shrink-0 rounded-pill border border-surface-line text-[13px] font-semibold text-ink-3 disabled:opacity-50"
            >
                {t("sim.rooms.mineClose")}
            </button>
        </div>
    );
}
