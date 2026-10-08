/**
 * 관리자 콘솔의 '뒤로'(2026-10-08 오너: "어드민에서 모바일 시 뒤로가기 시 자꾸 랭큐 페이지로 넘어가서 관리자 콘솔 버튼을 자주 클릭하는데
 * 뒤로가기 적용 잘해주고, 어드민 나갈 때 어드민 나가겠냐고 창 띄워주면 어때?").
 *
 * 예전: 메뉴(탭)는 화면 안의 상태일 뿐이라 브라우저는 관리자 콘솔을 '한 장'으로 알았다 — 어느 메뉴에서든, 회원 상세 창이 떠 있어도
 * '뒤로' 한 번이면 랭큐 화면으로 나갔다.
 *
 * 지금 — 주소는 그대로 두고(/admin/dashboard) 히스토리에 칸을 쌓는다:
 *     [앞 화면] [밑바닥] [첫 화면 d=0] [고른 메뉴 d=1] [그다음 메뉴 d=2] …
 *  · 메뉴를 고르면 한 칸 쌓는다 → '뒤로'는 **앞에 보던 메뉴**로.
 *  · 첫 화면의 메뉴(보통 대시보드 — '홈')를 다시 고르면 쌓지 않고 **첫 화면 칸으로 돌아간다** → 홈에서 '뒤로'는 늘 '나갈까요?'다.
 *  · 창(회원 상세·메뉴 서랍·확인 창)이 떠 있으면 '뒤로'는 **그 창을 닫는다** — 창마다 손대지 않고 여기서 한 번에(Radix 의 열린 창에 Esc 를 보낸다).
 *  · 첫 화면에서 '뒤로' → 밑바닥에 닿는다(주소가 같아 화면은 그대로다) → **나갈지 묻는다.** 계속 보면 첫 화면 칸을 다시 쌓고, 나가면 한 번 더 뒤로.
 *    밑바닥이 없으면 물을 틈이 없다 — '뒤로'가 곧바로 앞 화면의 주소로 바꿔 버린다.
 *  · 새로고침해도 칸에 적어 둔 것(history.state)이 남는다 — 그 자리에서 이어 간다.
 *  · 안드로이드의 하드웨어 뒤로가기도 같은 길이다(nativeBridge 가 history.back 을 부른다).
 *
 * ⚠️ wouter 의 setLocation(…, { replace: true })은 지금 칸의 state 를 비운다. 주소에서 ?tab= 을 지운 뒤에는 adopt 로 다시 적을 것.
 */
import { useCallback, useEffect, useRef } from "react";

export const ADMIN_PATH = "/admin/dashboard";
const KEY = "rkAdmin";
const BASE = "rkAdminBase";
/** 나가기를 눌렀는데 뒤로 갈 곳이 없을 때(관리자 콘솔이 그 탭의 첫 화면) 대신 갈 곳으로 보내기까지 기다리는 시간 */
const LEAVE_WAIT_MS = 600;

/** d = 첫 화면에서 몇 칸 위인가 · tab = 그 칸의 메뉴 · r = 첫 화면(d=0)의 메뉴 */
export interface AdminEntry { d: number; tab: string; r: string }

/** 히스토리 한 칸에 적어 둔 관리자 화면. 관리자 칸이 아니면 null */
export function adminEntryOf(state: unknown): AdminEntry | null {
    const e = (state as Record<string, unknown> | null | undefined)?.[KEY] as Partial<AdminEntry> | undefined;
    if (!e || typeof e !== "object") return null;
    if (!Number.isInteger(e.d) || (e.d as number) < 0 || typeof e.tab !== "string" || !e.tab) return null;
    return { d: e.d as number, tab: e.tab, r: typeof e.r === "string" && e.r ? e.r : e.tab };
}
export const adminState = (e: AdminEntry) => ({ [KEY]: { d: e.d, tab: e.tab, r: e.r } });

/**
 * 메뉴를 골랐을 때 히스토리를 어떻게 할까(셈만 — 시험용으로 떼어 둔다).
 *  stay  같은 메뉴다 · home  첫 화면의 메뉴다 → 그 칸으로 돌아간다(쌓지 않는다) · push  한 칸 쌓는다
 */
export function nextMove(cur: AdminEntry, tab: string): { kind: "stay" } | { kind: "home"; back: number } | { kind: "push"; entry: AdminEntry } {
    if (tab === cur.tab) return { kind: "stay" };
    if (tab === cur.r && cur.d > 0) return { kind: "home", back: cur.d };
    return { kind: "push", entry: { d: cur.d + 1, tab, r: cur.r } };
}

/** 떠 있는 창(Radix Dialog·Sheet·AlertDialog)이 있으면 맨 위 것을 닫는다. 닫을 것이 있었으면 true */
export function closeTopLayer(doc: Document = document): boolean {
    if (!doc.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return false;
    doc.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    return true;
}

export function useAdminBack<T extends string>({ tab, isTab, show, askLeave, fallback }: {
    /** 지금 보이는 메뉴 */
    tab: T;
    isTab: (v: string) => v is T;
    /** 메뉴를 화면에 띄운다(히스토리는 건드리지 않는다) */
    show: (t: T) => void;
    /** 나갈지 묻는다 — 나가면 true */
    askLeave: () => Promise<boolean>;
    /** 뒤로 갈 곳이 없을 때 나가는 길 */
    fallback: () => void;
}) {
    const cur = useRef<AdminEntry>({ d: 0, tab, r: tab });
    const ready = useRef(false);
    const leaving = useRef(false);
    const asking = useRef(false);
    /** 우리가 일부러 여러 칸을 건너뛰는 중('홈') — 이때는 떠 있는 창을 닫는 길로 새지 않는다 */
    const jumping = useRef(false);
    // 최신 것을 쓴다 — 리스너는 한 번만 건다
    const fx = useRef({ isTab, show, askLeave, fallback });
    fx.current = { isTab, show, askLeave, fallback };

    useEffect(() => {
        if (window.location.pathname !== ADMIN_PATH) return;
        const here = () => window.location.pathname === ADMIN_PATH;
        const st = adminEntryOf(window.history.state);
        if (st && fx.current.isTab(st.tab)) {
            // 새로고침·앞으로 가기로 돌아왔다 — 쌓인 자리 그대로
            cur.current = st;
            if (st.tab !== tab) fx.current.show(st.tab);
        } else {
            window.history.replaceState({ ...(window.history.state ?? {}), [BASE]: true }, "");
            cur.current = { d: 0, tab, r: tab };
            window.history.pushState(adminState(cur.current), "");
        }
        ready.current = true;

        const onPop = () => {
            if (leaving.current) return;
            if (!here()) return;   // 주소가 바뀌었다 = 관리자 콘솔을 떠났다(라우터가 화면을 바꾼다)
            const jumped = jumping.current;
            jumping.current = false;
            // 떠 있는 창이 먼저 '뒤로'를 받는다 — 창을 닫고 방금 떠난 칸을 다시 쌓아 제자리로
            if (!jumped && !asking.current && closeTopLayer()) { window.history.pushState(adminState(cur.current), ""); return; }
            const to = adminEntryOf(window.history.state);
            if (to && fx.current.isTab(to.tab)) { cur.current = to; fx.current.show(to.tab); return; }
            // 밑바닥 — 첫 화면에서 '뒤로'를 눌렀다. 나갈지 묻는다
            if (asking.current) return;
            asking.current = true;
            void fx.current.askLeave().then((ok) => {
                asking.current = false;
                if (!here() || leaving.current) return;   // 묻는 사이 이미 떠났다
                if (ok) {
                    leaving.current = true;
                    window.history.back();
                    window.setTimeout(() => { if (here()) fx.current.fallback(); }, LEAVE_WAIT_MS);
                    return;
                }
                cur.current = { d: 0, tab: cur.current.tab, r: cur.current.d === 0 ? cur.current.r : cur.current.tab };
                window.history.pushState(adminState(cur.current), "");
            });
        };
        window.addEventListener("popstate", onPop);
        return () => {
            window.removeEventListener("popstate", onPop);
            ready.current = false;
            // 묻는 창이 뜬 채로 콘솔을 떠났다(또 '뒤로') — 창이 다음 화면에 남지 않게 닫는다.
            // 위 onPop 에서는 못 닫는다: 라우터가 같은 popstate 안에서 이 화면을 먼저 내리고, 그때 떼인 리스너는 불리지 않는다(하니스에서 확인)
            if (asking.current) closeTopLayer();
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps -- 들어올 때 한 번. 그 뒤의 값은 fx 로 읽는다

    /** 메뉴를 고른다 — 한 칸 쌓는다. 첫 화면의 메뉴면 그 칸으로 돌아가고, 같은 메뉴면 그대로 */
    const go = useCallback((t: T) => {
        if (!ready.current) { fx.current.show(t); return; }
        const move = nextMove(cur.current, t);
        if (move.kind === "home") {
            // 화면은 popstate 가 바꾼다(첫 화면 칸에 닿으면)
            jumping.current = true;
            window.history.go(-move.back);
            return;
        }
        if (move.kind === "push") {
            cur.current = move.entry;
            window.history.pushState(adminState(cur.current), "");
        }
        fx.current.show(t);
    }, []);

    /**
     * 지금 칸을 관리자 화면으로 적는다 — 알림을 눌러 ?tab= 으로 들어온 칸(라우터가 쌓은 것이라 적힌 게 없다).
     * 처음 들어올 때는 아무것도 하지 않는다(위 effect 가 밑바닥부터 쌓는다).
     */
    const adopt = useCallback((t: T) => {
        if (!ready.current || window.location.pathname !== ADMIN_PATH) return;
        cur.current = { d: cur.current.d + 1, tab: t, r: cur.current.r };
        window.history.replaceState(adminState(cur.current), "");
    }, []);

    /** 묻지 않고 나간다('랭큐로 돌아가기' 단추) — 관리자 콘솔에 들어오기 전 화면으로 */
    const leave = useCallback(() => {
        if (!ready.current) { fx.current.fallback(); return; }
        leaving.current = true;
        window.history.go(-(cur.current.d + 2));
        window.setTimeout(() => { if (window.location.pathname === ADMIN_PATH) fx.current.fallback(); }, LEAVE_WAIT_MS);
    }, []);

    return { go, adopt, leave };
}
