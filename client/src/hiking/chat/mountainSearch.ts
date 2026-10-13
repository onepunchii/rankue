/**
 * 산 찾기(2026-10-13) — 채팅의 '산 보내기'(MountainCardPicker)와 투표의 '산으로 보기 채우기'(PollMountainFill)가 같이 쓴다.
 *
 * 공개 목록(GET /api/hiq/hiking/mountains?q=)에 그때그때 묻는다. **조회 훅을 쓰지 않는다** — 앱의 조회 캐시는 기기에 일주일 남는데
 * (lib/queryClient 의 저장), 한 글자 검색의 답은 산 천 곳이라 몇 번만 쳐도 기기 저장소가 찬다. 받은 답에서 쓸 것만 추려
 * 이 훅이 떠 있는 동안의 메모리에만 둔다(일정 만들기의 산 고르기 ActivityMountainPicker 와 같은 길).
 * 무엇을 추리고 어떻게 좁히는지는 shared/hikingChat 이 정한다.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { MOUNTAIN_SEARCH_WAIT_MS, rankMountainHits, readMountainHits, splitMountainSearch, type MountainHit } from "@shared/hikingChat";
import { mountainsKey } from "../lib/api";

type Answer = { list: MountainHit[]; capped: boolean };
type Found = Answer & { q: string; state: "loading" | "done" | "error" };
/** 받아 둔 답을 몇 가지 검색어까지 들고 있을까 — 지웠다 다시 칠 때 다시 묻지 않을 만큼 */
const HOLD_MAX = 12;

/** 이름으로 한 번 묻는다 — 답은 추려서 돌려준다(캐시에 넣지 않는다) */
export async function fetchMountainHits(q: string, signal?: AbortSignal): Promise<Answer> {
    return readMountainHits(await apiRequest(mountainsKey({ q })[0], { signal }));
}

export interface MountainSearch {
    /** 서버에 묻는 이름 — 비어 있으면 아직 찾지 않는다 */
    q: string;
    /** 고를 수 있는 산(좁힌 뒤, 순서대로) */
    options: MountainHit[];
    state: "idle" | "loading" | "done" | "error";
    /** 서버가 다 주지 못했다(이름을 더 적어야 한다) */
    capped: boolean;
}

/** 친 글(text)로 산을 찾는다. 글자를 멈추면 묻고, 기다리는 동안에는 앞서 받은 답을 지금의 글로 걸러 보여 준다(목록이 깜박이지 않게). */
export function useMountainSearch(text: string): MountainSearch {
    const { q, rest } = useMemo(() => splitMountainSearch(text), [text]);
    const [found, setFound] = useState<Found | null>(null);
    const held = useRef(new Map<string, Answer>());

    useEffect(() => {
        if (!q) return;
        const hit = held.current.get(q);
        if (hit) { setFound({ q, state: "done", ...hit }); return; }
        const ctl = new AbortController();
        const timer = setTimeout(() => {
            setFound((f) => ({ q, state: "loading", list: f?.list ?? [], capped: false }));
            fetchMountainHits(q, ctl.signal)
                .then((answer) => {
                    if (ctl.signal.aborted) return;
                    if (held.current.size >= HOLD_MAX) { const oldest = held.current.keys().next().value; if (oldest !== undefined) held.current.delete(oldest); }
                    held.current.set(q, answer);
                    setFound({ q, state: "done", ...answer });
                })
                .catch(() => { if (!ctl.signal.aborted) setFound({ q, state: "error", list: [], capped: false }); });
        }, MOUNTAIN_SEARCH_WAIT_MS);
        return () => { clearTimeout(timer); ctl.abort(); };
    }, [q]);

    // rest 는 친 글이 바뀔 때만 새로 만들어진다(위의 useMemo) — 그대로 의존값으로 쓴다
    const options = useMemo(() => (q && found ? rankMountainHits(found.list, q, rest) : []), [found, q, rest]);
    const waiting = !!q && (!found || found.q !== q || found.state === "loading");
    const state: MountainSearch["state"] = !q ? "idle" : waiting ? "loading" : found?.state === "error" ? "error" : "done";
    return { q, options, state, capped: state === "done" && !!found?.capped };
}
