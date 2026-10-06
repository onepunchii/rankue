import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    MutationObserver, QueryClient, QueryObserver, dehydrate, focusManager, hydrate, onlineManager,
} from "@tanstack/query-core";
import {
    DISCARD_TIMEOUT_MS, MAX_QUEUED_SAVES, SAVE_TIMEOUT_MS, canQueueSave, gameDiscardKey, gameFinishKey, gameSaveScope,
    isGameGone, isNoAnswer, neverPersistMutations,
} from "./gameMutationQueue.js";

/**
 * 점수판 '종료하기'가 안 눌리던 것(2026-10-06 오너 제보: "경기 시작하고 종료하기 버튼이 안 눌러지고, 홈의 이어서 버튼으로 다시
 * 들어가서 종료하기를 눌러도 에러가 있는 듯").
 *
 * 원인은 둘이었다(로컬 하니스로 재현).
 *   1) 점수 저장·FINISH·종료(버리기)가 같은 줄(scope)에 섰다. TanStack Query v5 는 같은 scope 의 요청을 한 줄로 세운다 —
 *      저장 하나가 응답 없이 매달리거나(타임아웃 60초) 오프라인으로 멈추면, 종료를 눌러도 DELETE 가 나가지 않았다.
 *   2) 멈춘 요청이 기기 저장소(localStorage)에 남았다. 앱을 다시 켜면 보낼 함수도 없이 되살아나 그 경기의 줄 맨 앞을 막았다 —
 *      다시 들어가도 저장조차 나가지 않았다.
 *
 * 검토에서 더 나온 것(같은 날)
 *   3) 세로로 든 폰에서는 확인창·실패 토스트가 점수판 밑에 깔렸다 — 점수판은 화면 전체를 덮는 맨 위 상자(LandscapeGuard · zIndex 9999)이고
 *      확인창(z-1000)·토스트(z-100)는 body 쪽에 뜬다. 눌러도 화면에 아무 변화가 없었다. 둘 다 점수판 안에 그린다.
 *   4) 웹의 서비스워커는 네트워크 실패를 본문 없는 404 로 돌려준다 — '이미 없는 경기(404)'로 읽으면 못 지운 경기를 지웠다고 한다.
 *   5) 서로 막기(종료↔FINISH)는 화면이 보낸 요청만 봤다 — 뒤로 나갔다 다시 들어온 화면은 앞 화면이 남긴 요청을 못 봤다. 캐시에서 센다.
 *   6) 같은 세션에서 다시 들어오면 메모리에 남은 옛 행으로 되살려 그 점수를 다시 저장했다 — 떠나면 행을 캐시에서 뺀다(gcTime 0).
 *   7) 10초에 놓은 저장이 늦게 닿으면 뒤의 저장을 덮는다 — 답 없이 끝난 저장 뒤의 첫 성공은 한 번 더 확인 저장을 보낸다.
 *   8) 실패 알림이 가리키는 '이어서 하기'가 홈에 없었다(방금 만든 경기) — 못 지운 경기를 배너의 답으로 넣어 둔다.
 *
 * 지키는 것
 *  (가) 논리 — 실제 QueryClient(@tanstack/query-core)로 돌린다. 화면이 쓰는 것과 같은 줄·같은 옵션(shared/gameMutationQueue).
 *  (나) 소스 — 훅·화면·저장 설정이 그 규칙대로 적혀 있는지. 화면 코드의 시험이지만 shared 에 둔다(vitest 는 client 의 sim·golf 만 읽는다).
 */

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
/** 앱과 같은 기본값(client/src/lib/queryClient.ts — mutations.retry: false) */
const newClient = () => new QueryClient({ defaultOptions: { mutations: { retry: false } } });
/** 응답 없이 매달린 요청 — 밖에서 끝낼 수 있다 */
function hanging<T = unknown>() {
    let ok!: (v: T) => void;
    let fail!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => { ok = res; fail = rej; });
    return { promise, ok, fail };
}
const quiet = (p: Promise<unknown>) => { p.catch(() => {}); };

afterEach(() => {
    onlineManager.setOnline(true);
    focusManager.setFocused(undefined);
});

describe("점수판 요청 줄 — 논리(@tanstack/query-core)", () => {
    it("[고치기 전] 같은 줄에 선 종료는 앞의 저장이 끝나기 전에는 나가지도 않는다", async () => {
        const client = newClient();
        const stuck = hanging();
        const save = new MutationObserver(client, { scope: gameSaveScope("g1"), networkMode: "always", mutationFn: () => stuck.promise });
        quiet(save.mutate());

        const del = vi.fn(async () => ({ discarded: true }));
        const oldDiscard = new MutationObserver(client, { scope: gameSaveScope("g1"), mutationFn: del });
        quiet(oldDiscard.mutate());
        await tick();

        // 눌러도 아무 일이 없다 — 요청이 나가지 않았고, 상태는 '진행 중'이라 두 번째 누름은 isPending 가드에 걸렸다
        expect(del).not.toHaveBeenCalled();
        expect(oldDiscard.getCurrentResult()).toMatchObject({ status: "pending", isPending: true, isPaused: true });

        // 앞의 저장이 끝나야 나간다
        stuck.ok(null);
        await tick();
        expect(del).toHaveBeenCalledTimes(1);
    });

    it("줄 밖의 종료(버리기)는 저장이 매달려 있어도 곧바로 나간다 — 다른 경기의 줄과도 무관하다", async () => {
        const client = newClient();
        const stuck = hanging();
        const save = new MutationObserver(client, { scope: gameSaveScope("g1"), networkMode: "always", mutationFn: () => stuck.promise });
        quiet(save.mutate());
        // 그 뒤에 선 저장은 여전히 기다린다(저장끼리의 순서는 그대로)
        const patch = vi.fn(async () => null);
        const nextSave = new MutationObserver(client, { scope: gameSaveScope("g1"), networkMode: "always", mutationFn: patch });
        quiet(nextSave.mutate());

        const del = vi.fn(async () => ({ discarded: true }));
        const onSuccess = vi.fn();
        const discard = new MutationObserver(client, { networkMode: "always", mutationFn: del, onSuccess });
        quiet(discard.mutate());
        await tick();

        expect(del).toHaveBeenCalledTimes(1);
        expect(onSuccess).toHaveBeenCalledTimes(1);
        expect(discard.getCurrentResult()).toMatchObject({ status: "success", isPaused: false });
        expect(patch).not.toHaveBeenCalled();
        expect(save.getCurrentResult().status).toBe("pending");
    });

    it("저장과 FINISH 는 같은 줄 — FINISH 는 앞의 저장이 끝난 뒤에 나간다(순서가 뒤집히지 않는다)", async () => {
        const client = newClient();
        const order: string[] = [];
        const first = hanging();
        const save = new MutationObserver(client, {
            scope: gameSaveScope("g1"), networkMode: "always",
            mutationFn: async () => { order.push("save:start"); await first.promise; order.push("save:end"); return null; },
        });
        const finish = new MutationObserver(client, {
            scope: gameSaveScope("g1"), networkMode: "always",
            mutationFn: async () => { order.push("finish:start"); return null; },
        });
        quiet(save.mutate());
        quiet(finish.mutate());
        await tick();
        expect(order).toEqual(["save:start"]);
        first.ok(null);
        await tick();
        expect(order).toEqual(["save:start", "save:end", "finish:start"]);
        // 줄은 경기마다 따로다
        expect(gameSaveScope("g1")).toEqual({ id: "hiq-game-g1" });
        expect(gameSaveScope("g2").id).not.toBe(gameSaveScope("g1").id);
    });

    it("networkMode \"always\" — 오프라인이어도 멈추지 않고 곧바로 시도한다(기본값은 멈춘다)", async () => {
        onlineManager.setOnline(false);
        const client = newClient();

        // 기본값("online"): 요청이 나가지 않고 멈춘 채 남는다 — 실패도 성공도 아니라 화면에는 아무 일이 없다
        const idle = vi.fn(async () => null);
        const byDefault = new MutationObserver(client, { mutationFn: idle });
        quiet(byDefault.mutate());
        await tick();
        expect(idle).not.toHaveBeenCalled();
        expect(byDefault.getCurrentResult()).toMatchObject({ status: "pending", isPaused: true });

        // "always": 곧바로 불리고, 실패하면 실패로 끝난다(알릴 수 있다)
        const tried = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
        const onError = vi.fn();
        const always = new MutationObserver(client, { networkMode: "always", mutationFn: tried, onError });
        quiet(always.mutate());
        await tick();
        expect(tried).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledTimes(1);
        expect(always.getCurrentResult()).toMatchObject({ status: "error", isPaused: false });

        // 줄에 선 것도 같다 — 저장이 실패로 끝나면 뒤의 FINISH 가 이어서 나간다
        const finish = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
        const s = new MutationObserver(client, { scope: gameSaveScope("g1"), networkMode: "always", mutationFn: tried });
        const f = new MutationObserver(client, { scope: gameSaveScope("g1"), networkMode: "always", mutationFn: finish });
        quiet(s.mutate());
        quiet(f.mutate());
        await tick();
        expect(finish).toHaveBeenCalledTimes(1);
        expect(f.getCurrentResult().status).toBe("error");
    });

    it("기기 저장소 — 우리 옵션으로는 멈춘 요청이 있어도 남는 것이 없다(기본값은 남긴다)", async () => {
        onlineManager.setOnline(false);
        const client = newClient();
        // 예전 점수판: 오프라인에서 점수 한 번 + 종료 한 번 → 둘 다 멈춘다
        const save = new MutationObserver(client, { scope: gameSaveScope("demo"), mutationFn: async () => null });
        const discard = new MutationObserver(client, { scope: gameSaveScope("demo"), mutationFn: async () => null });
        quiet(save.mutate());
        quiet(discard.mutate());
        await tick();

        // 기본값: 멈춘 것이 저장된다 — 하니스에서 localStorage 에 남아 있던 꼴 그대로
        const before = JSON.parse(JSON.stringify(dehydrate(client)));
        expect(before.mutations).toHaveLength(2);
        for (const m of before.mutations) {
            expect(m).toMatchObject({ scope: { id: "hiq-game-demo" }, state: { status: "pending", isPaused: true } });
        }

        const after = JSON.parse(JSON.stringify(dehydrate(client, { shouldDehydrateMutation: neverPersistMutations })));
        expect(after.mutations).toEqual([]);
        expect(neverPersistMutations()).toBe(false);
    });

    it("[고치기 전] 되살아난 요청이 줄 맨 앞을 막는다 — 다시 들어가도 저장조차 안 나간다. 남기지 않으면 막을 것이 없다", async () => {
        onlineManager.setOnline(false);
        const offline = newClient();
        quiet(new MutationObserver(offline, { scope: gameSaveScope("demo"), mutationFn: async () => null }).mutate());
        quiet(new MutationObserver(offline, { scope: gameSaveScope("demo"), mutationFn: async () => null }).mutate());
        await tick();
        const poisoned = JSON.parse(JSON.stringify(dehydrate(offline)));
        const clean = JSON.parse(JSON.stringify(dehydrate(offline, { shouldDehydrateMutation: neverPersistMutations })));

        // 앱을 다시 켰다(온라인)
        onlineManager.setOnline(true);

        const revived = newClient();
        hydrate(revived, poisoned);
        // hydrate 는 들어 있는 요청을 조건 없이 되살린다 — 보낼 함수(mutationFn)는 없다
        expect(revived.getMutationCache().getAll()).toHaveLength(2);
        expect(revived.getMutationCache().getAll().every((m) => m.options.mutationFn === undefined)).toBe(true);
        const blocked = vi.fn(async () => null);
        const saveAgain = new MutationObserver(revived, { scope: gameSaveScope("demo"), networkMode: "always", mutationFn: blocked });
        quiet(saveAgain.mutate());
        await tick();
        expect(blocked).not.toHaveBeenCalled();
        expect(saveAgain.getCurrentResult().isPaused).toBe(true);

        const fresh = newClient();
        hydrate(fresh, clean);
        expect(fresh.getMutationCache().getAll()).toHaveLength(0);
        const sent = vi.fn(async () => null);
        quiet(new MutationObserver(fresh, { scope: gameSaveScope("demo"), networkMode: "always", mutationFn: sent }).mutate());
        await tick();
        expect(sent).toHaveBeenCalledTimes(1);
    });

    // 화면이 가려진 동안 앞의 요청이 끝나면 뒤에 선 요청은 깨어나지 않는다(retryer.canContinue 가 focusManager.isFocused() 를 본다).
    // 라이브러리는 화면이 돌아올 때 깨우지만 온라인일 때만이다(QueryClient.resumePausedMutations) — 오프라인으로 돌아오면 FINISH 가
    // 실패도 못 하고 멈춰 있다. 그래서 점수판은 화면이 다시 보일 때 캐시의 resumePausedMutations 를 직접 부른다.
    it("화면이 가려진 사이 앞의 저장이 끝났고 오프라인으로 돌아왔을 때 — 점수판이 깨우면 뒤의 요청이 나간다", async () => {
        const client = newClient();
        const first = hanging();
        const save = new MutationObserver(client, { scope: gameSaveScope("g1"), networkMode: "always", mutationFn: () => first.promise });
        const finish = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
        const fin = new MutationObserver(client, { scope: gameSaveScope("g1"), networkMode: "always", mutationFn: finish });
        quiet(save.mutate());
        quiet(fin.mutate());
        await tick();

        focusManager.setFocused(false);
        first.fail(new Error("timeout"));
        await tick();
        expect(save.getCurrentResult().status).toBe("error");
        expect(finish).not.toHaveBeenCalled();
        expect(fin.getCurrentResult()).toMatchObject({ status: "pending", isPaused: true });

        // 오프라인으로 화면에 돌아왔다 — 다른 화면의 요청(기본값 "online")도 하나 멈춰 있다
        onlineManager.setOnline(false);
        const elsewhere = vi.fn(async () => null);
        quiet(new MutationObserver(client, { mutationFn: elsewhere }).mutate());
        focusManager.setFocused(true);
        await client.resumePausedMutations(); // 라이브러리가 화면 복귀 때 하는 일 — 오프라인이면 아무것도 깨우지 않는다
        await tick();
        expect(finish).not.toHaveBeenCalled();

        // 점수판이 화면 복귀 때 하는 일
        void client.getMutationCache().resumePausedMutations();
        await tick();
        expect(finish).toHaveBeenCalledTimes(1);
        expect(fin.getCurrentResult()).toMatchObject({ status: "error", isPaused: false });
        // 오프라인이라 멈춘 다른 화면의 요청은 깨어나지 않는다
        expect(elsewhere).not.toHaveBeenCalled();
    });

    // 훅의 requestSave 와 같은 꼴: 세는 값을 올리고 mutate, onSettled 에서 내린다. 보내는 것은 나가는 순간의 최신 상태.
    it("저장은 '가는 중 하나 + 줄 선 것 하나'까지 — 줄 선 저장이 나가는 순간의 최신 상태를 보낸다", async () => {
        expect(MAX_QUEUED_SAVES).toBe(2);
        expect([0, 1, 2, 3].map(canQueueSave)).toEqual([true, true, false, false]);

        const client = newClient();
        let latest = 0;
        let saving = 0;
        const sent: number[] = [];
        const gates: Array<ReturnType<typeof hanging>> = [];
        const save = new MutationObserver(client, {
            scope: gameSaveScope("g1"), networkMode: "always",
            mutationFn: () => { sent.push(latest); const g = hanging(); gates.push(g); return g.promise; },
            onSettled: () => { saving = Math.max(0, saving - 1); },
        });
        const requestSave = () => {
            if (!canQueueSave(saving)) return;
            saving += 1;
            quiet(save.mutate());
        };
        const pending = () => client.getMutationCache().getAll().filter((m) => m.state.status === "pending").length;

        latest = 1; requestSave(); await tick(); // 나간다
        latest = 2; requestSave(); await tick(); // 줄 선다
        latest = 3; requestSave(); await tick(); // 더 세우지 않는다
        latest = 4; requestSave(); await tick();
        expect(sent).toEqual([1]);
        expect(pending()).toBe(2);

        // 앞의 것이 (실패로) 끝나면 줄 선 저장이 나간다 — 줄 설 때의 2 가 아니라 지금의 4 를 보낸다
        gates[0].fail(new Error("timeout"));
        await tick();
        expect(sent).toEqual([1, 4]);
        expect(saving).toBe(1);

        latest = 5; requestSave(); await tick(); // 다시 하나 세울 수 있다
        expect(pending()).toBe(2);
        gates[1].ok(null);
        await tick();
        expect(sent).toEqual([1, 4, 5]);
        gates[2].ok(null);
        await tick();
        expect(saving).toBe(0);
        expect(pending()).toBe(0);
    });

    it("종료 뒤 홈 — '이어서' 배너의 답은 낡은 것으로 표시되어, 30초가 안 지났어도 홈이 붙을 때 새로 받는다", async () => {
        const client = new QueryClient();
        let calls = 0;
        const banner = {
            queryKey: ["/api/hiq/game/ongoing/mine"],
            queryFn: async () => { calls += 1; return calls === 1 ? { id: "g1" } : null; },
            staleTime: 30_000, // OngoingGameBanner 와 같다
        };
        // 홈에서 한 번 받고 점수판으로 들어갔다
        let off = new QueryObserver(client, banner).subscribe(() => {});
        await tick();
        off();
        expect(calls).toBe(1);
        // (대조) 표시하지 않으면 다시 붙어도 새로 받지 않는다 — 지운 경기의 배너가 그대로 뜬다
        off = new QueryObserver(client, banner).subscribe(() => {});
        await tick();
        off();
        expect(calls).toBe(1);

        // 종료하기가 끝났다(성공이든 실패든 부른다). 배너가 화면에 없으니 지금 받지는 않는다
        await client.invalidateQueries({ queryKey: ["/api/hiq/game/ongoing/mine"] });
        expect(calls).toBe(1);

        const home = new QueryObserver(client, banner);
        off = home.subscribe(() => {});
        await tick();
        off();
        expect(calls).toBe(2);
        expect(home.getCurrentResult().data).toBeNull();
    });

    // 화면의 isPending 은 그 화면이 보낸 요청만 본다 — 옵저버는 화면이 뜰 때마다 새로 생기고, 요청은 화면을 떠나도 캐시에서 계속 간다.
    it("앞 화면이 남긴 FINISH — 새 화면의 isPending 에는 안 보이고 캐시(isMutating)에는 보인다. 막지 않으면 줄 밖의 버리기가 함께 나간다", async () => {
        const client = newClient();
        const stuck = hanging();
        const opts = { mutationKey: gameFinishKey("g1"), scope: gameSaveScope("g1"), networkMode: "always" as const, mutationFn: () => stuck.promise };
        const before = new MutationObserver(client, opts);
        const off = before.subscribe(() => {});
        quiet(before.mutate());
        await tick();
        off(); // 뒤로 나갔다 — 요청은 캐시에서 계속 간다

        // 홈의 '이어서'로 다시 들어온 화면
        const after = new MutationObserver(client, opts);
        expect(after.getCurrentResult().isPending).toBe(false);
        expect(client.isMutating({ mutationKey: gameFinishKey("g1") })).toBe(1);
        // 다른 경기·다른 요청은 세지 않는다
        expect(client.isMutating({ mutationKey: gameFinishKey("g2") })).toBe(0);
        expect(client.isMutating({ mutationKey: gameDiscardKey("g1") })).toBe(0);
        expect(gameFinishKey("g1")).toEqual(["hiq-game-finish", "g1"]);
        expect(gameDiscardKey("g1")).toEqual(["hiq-game-discard", "g1"]);

        // (대조) 막지 않으면 줄 밖의 버리기는 FINISH 가 가는 중에도 곧바로 나간다 — 서버에 함께 닿는다
        const del = vi.fn(async () => ({ discarded: true }));
        quiet(new MutationObserver(client, { mutationKey: gameDiscardKey("g1"), networkMode: "always", mutationFn: del }).mutate());
        await tick();
        expect(del).toHaveBeenCalledTimes(1);

        stuck.ok(null);
        await tick();
        expect(client.isMutating({ mutationKey: gameFinishKey("g1") })).toBe(0);
    });

    it("앞 화면이 남긴 멈춘 저장 — 들어올 때 깨우지 않으면 새 화면의 FINISH 가 그 뒤에서 말없이 멈춘다", async () => {
        const client = newClient();
        const first = hanging();
        // 앞 화면: 저장 A 가 가는 중에 화면을 떠나며 저장 B 를 세웠다
        quiet(new MutationObserver(client, { scope: gameSaveScope("g1"), networkMode: "always", mutationFn: () => first.promise }).mutate());
        const late = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
        quiet(new MutationObserver(client, { scope: gameSaveScope("g1"), networkMode: "always", mutationFn: late }).mutate());
        await tick();
        // 화면이 가려진 사이 A 가 끝났다 — B 는 깨어나지 못한다
        focusManager.setFocused(false);
        first.fail(new Error("timeout"));
        await tick();
        expect(late).not.toHaveBeenCalled();
        // 오프라인으로 돌아왔다 — 라이브러리는 깨우지 않고, 점수판의 리스너는 앞 화면이 떠날 때 떼어졌다
        onlineManager.setOnline(false);
        focusManager.setFocused(true);
        await client.resumePausedMutations();
        await tick();
        expect(late).not.toHaveBeenCalled();

        // 다시 들어온 화면의 FINISH — 그대로면 B 뒤에서 멈춘다(요청도 실패도 없다)
        const finish = vi.fn(async () => { throw new TypeError("Failed to fetch"); });
        const onError = vi.fn();
        const fin = new MutationObserver(client, {
            mutationKey: gameFinishKey("g1"), scope: gameSaveScope("g1"), networkMode: "always", mutationFn: finish, onError,
        });
        quiet(fin.mutate());
        await tick();
        expect(finish).not.toHaveBeenCalled();
        expect(fin.getCurrentResult()).toMatchObject({ isPending: true, isPaused: true });

        // 점수판이 들어올 때 하는 일 — B → FINISH 순으로 풀린다
        void client.getMutationCache().resumePausedMutations();
        await tick();
        await tick();
        expect(late).toHaveBeenCalledTimes(1);
        expect(finish).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledTimes(1);
        expect(fin.getCurrentResult()).toMatchObject({ status: "error", isPending: false, isPaused: false });
    });

    it("답을 받았는가 — 끊김·시간 초과·서비스워커의 가짜 404 는 서버의 답이 아니다. '이미 없는 경기'는 서버가 그렇게 답한 404 뿐이다", () => {
        const api = (status: number, data?: unknown) => Object.assign(new Error("x"), { status, data });
        // 서버가 만든 오류 답 — { success: false, message, code? }(server/utils/response.ts 의 sendError)
        const gone = api(404, { success: false, message: "경기를 찾을 수 없어요", code: "GAME_NOT_FOUND" });
        const finished = api(409, { success: false, message: "끝난 경기는 지울 수 없어요" });
        const crashed = api(500, { message: "Internal Server Error" });
        // 웹 서비스워커(client/public/sw.js)가 네트워크 실패를 바꿔 준 것 — 본문이 없어 apiRequest 는 statusText 를 message 로 쓴다
        const stub = api(404, { message: "Network Unavailable" });
        const abort = Object.assign(new Error("The operation was aborted."), { name: "AbortError" });

        expect([gone, finished, crashed].map(isNoAnswer)).toEqual([false, false, false]);
        expect([stub, api(404), abort, new TypeError("Failed to fetch"), undefined, null].map(isNoAnswer)).toEqual([true, true, true, true, true, true]);

        expect(isGameGone(gone)).toBe(true);
        expect([stub, api(404), api(404, { success: false, message: "없음" }), finished, crashed, abort, null].map(isGameGone))
            .toEqual([false, false, false, false, false, false, false]);

        // 이 구분이 기대는 서버의 약속 — 오류 답에는 늘 success: false 가 있고, 없는 경기는 GAME_NOT_FOUND 로 답한다
        const server = (p: string) => readFileSync(resolve(__dirname, "../server", p), "utf8");
        const sendError = server("utils/response.ts").slice(server("utils/response.ts").indexOf("export function sendError("));
        expect(sendError).toMatch(/success:\s*false/);
        expect(server("routes/modules/game.ts")).toMatch(/sendError\(res, 404, "err\.game\.notFound", "GAME_NOT_FOUND"\)/);
    });

    it("경기 행 — 떠나면 캐시에서 뺀다(gcTime 0). 남겨 두면 다시 들어온 화면이 옛 행을 받고, 새로 받지도 않는다", async () => {
        let server = { player1Score: 0 };
        let calls = 0;
        const row = (gcTime: number) => ({
            queryKey: ["/api/hiq/game/g1"],
            queryFn: async () => { calls += 1; return server; },
            staleTime: 5 * 60_000, // 앱 기본값(client/src/lib/queryClient.ts)
            gcTime,
        });

        // (고치기 전) 5분 남는다 — 0:0 으로 들어와 12점까지 치고 나갔다가 같은 세션에서 다시 들어온다
        const kept = new QueryClient();
        let off = new QueryObserver(kept, row(5 * 60_000)).subscribe(() => {});
        await tick();
        off();
        server = { player1Score: 12 };
        await tick();
        const again = new QueryObserver(kept, row(5 * 60_000));
        off = again.subscribe(() => {});
        // 점수판은 이 값으로 되살아나(되살리기는 한 번뿐이다) 400ms 뒤 그대로 저장했다 — 서버의 12점이 0점으로 덮였다
        expect(again.getCurrentResult().data).toEqual({ player1Score: 0 });
        await tick();
        expect(again.getCurrentResult().data).toEqual({ player1Score: 0 });
        expect(calls).toBe(1);
        off();
        kept.clear();

        // gcTime 0 — 떠나는 즉시 캐시에서 빠지고, 다시 들어오면 서버의 새 행을 받는다
        calls = 0;
        server = { player1Score: 0 };
        const fresh = new QueryClient();
        off = new QueryObserver(fresh, row(0)).subscribe(() => {});
        await tick();
        off();
        await tick();
        expect(fresh.getQueryCache().getAll()).toHaveLength(0);
        server = { player1Score: 12 };
        const back = new QueryObserver(fresh, row(0));
        off = back.subscribe(() => {});
        expect(back.getCurrentResult().data).toBeUndefined();
        await tick();
        expect(back.getCurrentResult().data).toEqual({ player1Score: 12 });
        expect(calls).toBe(2);
        off();
    });

    it("못 지운 경기 — 배너의 답으로 넣고 낡은 것으로 표시한다(이 순서로). 방금 만든 경기도 홈에 '이어서'가 바로 보이고, 새 답도 받는다", async () => {
        const KEY = ["/api/hiq/game/ongoing/mine"];
        const client = new QueryClient();
        let calls = 0;
        const gate = hanging<unknown>();
        const banner = {
            queryKey: KEY,
            queryFn: () => { calls += 1; return calls === 1 ? Promise.resolve(null) : gate.promise; },
            staleTime: 30_000, // OngoingGameBanner 와 같다
        };
        // 홈에서 '진행 중 없음'을 받고 새 경기를 만들어 점수판으로 갔다(경기 만들기는 이 답을 고치지 않는다)
        let off = new QueryObserver(client, banner).subscribe(() => {});
        await tick();
        off();
        expect(client.getQueryData(KEY)).toBeNull();

        // 종료가 답 없이 실패했다 — 점수판이 하는 일
        client.setQueryData(KEY, { id: "g1" });
        await client.invalidateQueries({ queryKey: KEY });

        // 홈 — 새 답은 같은 네트워크에서 매달려 있지만, 알림이 가리키는 '이어서 하기'는 바로 보인다
        const home = new QueryObserver(client, banner);
        off = home.subscribe(() => {});
        await tick();
        expect(home.getCurrentResult().data).toEqual({ id: "g1" });
        expect(calls).toBe(2);
        // 답이 오면 그대로 따른다(서버가 실제로는 지웠다면 배너가 사라진다)
        gate.ok(null);
        await tick();
        expect(home.getCurrentResult().data).toBeNull();
        off();

        // (대조) 순서를 바꾸면 넣는 일이 표시를 지운다 — 30초 동안 새로 받지 않아, 서버가 지운 경기의 배너가 남는다
        const wrong = new QueryClient();
        wrong.setQueryData(KEY, null);
        await wrong.invalidateQueries({ queryKey: KEY });
        expect(wrong.getQueryState(KEY)?.isInvalidated).toBe(true);
        wrong.setQueryData(KEY, { id: "g1" });
        expect(wrong.getQueryState(KEY)?.isInvalidated).toBe(false);
    });
});

// ─────────────────────────────── (나) 소스 ───────────────────────────────
const src = (p: string) => readFileSync(resolve(__dirname, "../client/src", p), "utf8");
/** 주석 줄은 빼고 본다(설명에 적힌 낱말에 걸리지 않게) */
const code = (s: string) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
const count = (s: string, needle: string) => s.split(needle).length - 1;

describe("점수판 요청 줄 — 훅(useGameScore)", () => {
    const hook = code(src("hooks/useGameScore.ts"));
    const finish = hook.slice(hook.indexOf("const finishMutation = useMutation({"), hook.indexOf("const latestStateRef = useRef(gameState);"));
    const save = hook.slice(hook.indexOf("const updateScoreMutation = useMutation({"), hook.indexOf("const requestSave = () => {"));
    const discard = hook.slice(hook.indexOf("const discardMutation = useMutation({"), hook.indexOf("const finishBusy = useIsMutating("));
    /** 서로 막기 — 가는 중인지 세는 값과, 보내는 길(finishGame · discardGame) */
    const gate = hook.slice(hook.indexOf("const finishBusy = useIsMutating("), hook.indexOf("let totalPlayers = 1;"));

    it("세 요청을 찾았다", () => {
        for (const block of [finish, save, discard, gate]) expect(block.length).toBeGreaterThan(100);
        expect(count(hook, "useMutation({")).toBe(3);
    });

    it("줄은 shared 의 규칙을 쓴다 — 저장·FINISH 만 서고, 종료(버리기)는 서지 않는다", () => {
        expect(hook).toContain(
            'import { gameSaveScope, gameFinishKey, gameDiscardKey, canQueueSave, isGameGone, isNoAnswer, SAVE_TIMEOUT_MS, DISCARD_TIMEOUT_MS } from "@shared/gameMutationQueue";',
        );
        expect(finish).toContain("scope: gameSaveScope(id),");
        expect(save).toContain("scope: gameSaveScope(id),");
        expect(discard).not.toMatch(/\bscope\b/);
        expect(count(hook, "gameSaveScope(id)")).toBe(2);
        // 줄 이름을 훅에 따로 적지 않는다(시험과 화면이 같은 것을 쓴다)
        expect(hook).not.toContain("hiq-game-");
    });

    it("셋 다 networkMode \"always\" — 오프라인에서 말없이 멈추지 않는다", () => {
        for (const block of [finish, save, discard]) expect(count(block, 'networkMode: "always",')).toBe(1);
    });

    it("타임아웃 — 저장 10초 · 종료 12초 · FINISH 는 기본(60초) 그대로", () => {
        expect(SAVE_TIMEOUT_MS).toBe(10_000);
        expect(DISCARD_TIMEOUT_MS).toBe(12_000);
        expect(save).toContain("timeoutMs: SAVE_TIMEOUT_MS,");
        expect(discard).toContain('await apiRequest(`/api/hiq/game/${id}`, { method: "DELETE", timeoutMs: DISCARD_TIMEOUT_MS });');
        expect(finish).not.toContain("timeoutMs");
        expect(finish).toContain("await apiRequest(`/api/hiq/game/${id}/finish`, {");
    });

    it("FINISH — 보내는 순간부터 진행 중 저장을 막고, 실패하면 풀고 알린다(예전 그대로)", () => {
        const fn = finish.indexOf("mutationFn: async (");
        const block = finish.indexOf("finishedRef.current = true;");
        const call = finish.indexOf("await apiRequest(");
        expect(block).toBeGreaterThan(fn);
        expect(call).toBeGreaterThan(block);
        const onError = finish.slice(finish.indexOf("onError: (err: any) => {"));
        expect(onError).toContain("finishedRef.current = false;");
        expect(onError).toContain('title: t("gameScoreboard.finishFailTitle"),');
    });

    it("저장 — 나가는 순간의 최신 상태를 보내고, 실패하면 '안 보낸 변경'으로 적는다", () => {
        expect(save).toContain("const s = latestStateRef.current;");
        // 옛 클로저(gameState)를 보내지 않는다
        expect(save).not.toMatch(/\bgameState\b/);
        expect(save).toContain('status: "playing_base"');
        expect(save).toContain("onError: (e) => { console.error(e); unsentRef.current = true; if (isNoAnswer(e)) lateRef.current = true; },");
        expect(save).toContain("onSettled: () => { savingRef.current = Math.max(0, savingRef.current - 1); },");
        // 성공 — 답 없이 끝난 저장이 앞에 있었으면 확인 저장을 한 번 더 세우고(그때는 '안 보낸 변경'을 지우지 않는다), 아니면 지운다.
        // 확인 저장은 점수판이 떠 있고 끝나는 중이 아닐 때만 — 떠난 화면의 옛 점수나, 줄 선 FINISH 뒤의 진행 중 저장이 되면 안 된다
        const ok = save.slice(save.indexOf("onSuccess: () => {"), save.indexOf("onError: (e) => {"));
        const ask = ok.indexOf("const again = lateRef.current && mountedRef.current && !finishedRef.current && !endingNow();");
        const once = ok.indexOf("lateRef.current = false;");
        const resend = ok.indexOf("if (again) { requestSave(); return; }");
        const clear = ok.indexOf("unsentRef.current = false;");
        expect(ask).toBeGreaterThan(0);
        expect(once).toBeGreaterThan(ask);
        expect(resend).toBeGreaterThan(once);
        expect(clear).toBeGreaterThan(resend);
        expect(count(hook, "lateRef.current = true;")).toBe(1);
        // 최신 상태는 화면에 반영된 뒤에(효과에서) 적는다 — 하이드레이션 확인보다 앞에서
        const auto = hook.slice(hook.indexOf("const pendingSaveRef = useRef(false);"), hook.indexOf("}, [gameState]);"));
        const write = auto.indexOf("latestStateRef.current = gameState;");
        expect(write).toBeGreaterThan(0);
        expect(write).toBeLessThan(auto.indexOf("if (!hydratedRef.current || !canSaveRef.current) return;"));
        expect(count(hook, "latestStateRef.current = ")).toBe(1);
    });

    it("저장을 내보내는 길은 requestSave 하나 — 자동 저장 · 언마운트 · 다시 보내기가 모두 그 길로 간다", () => {
        const req = hook.slice(hook.indexOf("const requestSave = () => {"), hook.indexOf("hydratedRef.current || !game ||"));
        const gate = req.indexOf("if (!canQueueSave(savingRef.current)) return;");
        const inc = req.indexOf("savingRef.current += 1;");
        const go = req.indexOf("updateScoreMutation.mutate();");
        expect(gate).toBeGreaterThan(0);
        expect(inc).toBeGreaterThan(gate);
        expect(go).toBeGreaterThan(inc);
        expect(count(hook, "updateScoreMutation.mutate(")).toBe(1);
        expect(count(hook, "savingRef.current += 1;")).toBe(1);
        expect(count(hook, "requestSave();")).toBe(4); // 자동 저장 · 언마운트 · 다시 보내기 · 확인 저장
    });

    it("자동 저장 · 언마운트 — 끝났거나(버렸거나) 호스트가 아니면 보내지 않는다. 실패해 못 보낸 변경도 언마운트 때 한 번 민다", () => {
        const auto = hook.slice(hook.indexOf("const pendingSaveRef = useRef(false);"), hook.indexOf("}, [gameState]);"));
        const guard = auto.indexOf("if (finishedRef.current || !canSaveRef.current) return;");
        expect(guard).toBeGreaterThan(0);
        expect(auto.indexOf("requestSave();")).toBeGreaterThan(guard);
        expect(auto).toContain("}, 400);");

        const unmount = hook.slice(hook.indexOf("}, [gameState]);"), hook.indexOf("const resend = () => {"));
        const nothing = unmount.indexOf("if (!pendingSaveRef.current && !unsentRef.current) return;");
        const guard2 = unmount.indexOf("if (finishedRef.current || !canSaveRef.current) return;");
        expect(nothing).toBeGreaterThan(0);
        expect(guard2).toBeGreaterThan(nothing);
        expect(unmount.indexOf("requestSave();")).toBeGreaterThan(guard2);
    });

    it("다시 보내기 — online · 화면 복귀 때 한 번씩만. 타이머로 되풀이하지 않고, 리스너는 언마운트 때 뗀다", () => {
        const effect = hook.slice(hook.indexOf("const resend = () => {"), hook.indexOf("const discardMutation = useMutation({"));
        const guard = effect.indexOf("if (!unsentRef.current || finishedRef.current || !canSaveRef.current) return;");
        expect(guard).toBeGreaterThan(0);
        expect(effect.indexOf("requestSave();")).toBeGreaterThan(guard);
        expect(count(effect, "requestSave();")).toBe(1);
        // 화면이 다시 '보일 때'만 — 가려질 때는 아무것도 하지 않는다. 깨우는 일이 다시 보내기보다 먼저다
        const visible = effect.indexOf('if (document.visibilityState !== "visible") return;');
        const wake = effect.indexOf("void queryClient.getMutationCache().resumePausedMutations();");
        expect(visible).toBeGreaterThan(0);
        expect(wake).toBeGreaterThan(visible);
        expect(effect.indexOf("resend();", wake)).toBeGreaterThan(wake);
        // 들어올 때도 한 번 깨운다 — 앞 화면이 남긴 멈춘 저장이 줄 맨 앞을 막고 있을 수 있다. 리스너를 붙인 뒤, 뒷정리 함수 앞에서
        const WAKE = "void queryClient.getMutationCache().resumePausedMutations();";
        const onEnter = effect.indexOf(WAKE, wake + WAKE.length);
        expect(count(effect, WAKE)).toBe(2);
        expect(count(hook, WAKE)).toBe(2);
        expect(onEnter).toBeGreaterThan(effect.indexOf('document.addEventListener("visibilitychange", onVisible);'));
        expect(onEnter).toBeLessThan(effect.indexOf("return () => {"));
        for (const [target, name, fn] of [["window", "online", "resend"], ["document", "visibilitychange", "onVisible"]]) {
            expect(effect).toContain(`${target}.addEventListener("${name}", ${fn});`);
            expect(effect).toContain(`${target}.removeEventListener("${name}", ${fn});`);
        }
        expect(effect).toMatch(/\}, \[\]\);/);
        // 되풀이 타이머는 없다(자동 저장의 400ms 디바운스 하나뿐)
        expect(hook).not.toMatch(/setInterval\(/);
        expect(count(hook, "setTimeout(")).toBe(2); // 자동 저장 디바운스 · 경기 시작 음성
    });

    it("종료(버리기) — 보내기 전에 저장을 막고, 서버가 '없는 경기'라고 답한 것만 지워진 것으로 본다", () => {
        const fn = discard.slice(discard.indexOf("mutationFn: async () => {"), discard.indexOf("onSuccess: () => {"));
        const block = fn.indexOf("finishedRef.current = true;");
        const call = fn.indexOf("await apiRequest(");
        expect(block).toBeGreaterThan(0);
        expect(call).toBeGreaterThan(block);
        // 상태 코드(404)만 보지 않는다 — 웹의 서비스워커가 네트워크 실패를 본문 없는 404 로 돌려준다(shared 의 isGameGone)
        expect(fn).toContain("if (isGameGone(e)) return { discarded: false };");
        expect(fn).not.toContain("404");
        expect(fn.indexOf("throw e;")).toBeGreaterThan(fn.indexOf("isGameGone(e)"));
    });

    it("종료(버리기) — 성공·실패 모두 '이어서' 배너를 새로 받게 하고 홈으로. 실패는 왜 남았는지 알린다", () => {
        const ok = discard.slice(discard.indexOf("onSuccess: () => {"), discard.indexOf("onError: (err: any) => {"));
        const bad = discard.slice(discard.indexOf("onError: (err: any) => {"));
        for (const block of [ok, bad]) {
            expect(count(block, 'queryClient.invalidateQueries({ queryKey: ["/api/hiq/game/ongoing/mine"] });')).toBe(1);
            expect(count(block, 'setLocation("/dashboard");')).toBe(1);
        }
        // 성공(404 포함)에는 알림이 없다
        expect(ok).not.toContain("toast(");
        // 실패: 저장 차단을 풀고 → 알리고 → 홈으로
        const free = bad.indexOf("finishedRef.current = false;");
        const say = bad.indexOf("toast({");
        const go = bad.indexOf('setLocation("/dashboard");');
        expect(free).toBeGreaterThan(0);
        expect(say).toBeGreaterThan(free);
        expect(go).toBeGreaterThan(say);
        expect(bad).toContain('title: t("gameScoreboard.exitFailTitle"),');
        // 서버가 이유를 들어 거절한 것(4xx)은 그 이유를, 끊김·시간 초과·서비스워커의 가짜 404·서버 오류는 다시 하는 길을
        expect(bad).toContain("const refused = err instanceof ApiError && err.status < 500 && !isNoAnswer(err);");
        expect(bad).toContain('description: refused ? err.message : t("gameScoreboard.exitFailDesc"),');
        // 알림이 가리키는 '이어서 하기'가 홈에 있게 — 거절당하지 않은 경기는 배너의 답으로 넣는다. 낡음 표시보다 먼저(넣는 일이 표시를 지운다)
        const seed = bad.indexOf('if (game && !refused) queryClient.setQueryData(["/api/hiq/game/ongoing/mine"], game);');
        expect(seed).toBeGreaterThan(bad.indexOf("const refused = "));
        expect(bad.indexOf('queryClient.invalidateQueries({ queryKey: ["/api/hiq/game/ongoing/mine"] });')).toBeGreaterThan(seed);
        expect(count(hook, "queryClient.setQueryData(")).toBe(1);
        expect(bad).toContain('variant: "destructive",');
        // 브라우저 기본 창은 쓰지 않는다
        expect(hook).not.toMatch(/\balert\(|(?<![A-Za-z.])confirm\(/);
    });

    it("서로 막기 — FINISH 와 버리기는 보내는 순간의 캐시를 본다(이 화면의 요청만이 아니라 이 경기의 요청)", () => {
        // 요청에 이름을 붙인다 — 저장에는 붙이지 않는다(세는 것은 FINISH·버리기뿐이다)
        expect(finish).toContain("mutationKey: gameFinishKey(id),");
        expect(discard).toContain("mutationKey: gameDiscardKey(id),");
        expect(save).not.toContain("mutationKey");
        expect(hook).toContain(
            "queryClient.isMutating({ mutationKey: gameFinishKey(id) }) + queryClient.isMutating({ mutationKey: gameDiscardKey(id) }) > 0;",
        );
        // 보내는 길은 둘 — 둘 다 먼저 본다
        for (const [name, go] of [["finishGame", "finishMutation.mutate(variables);"], ["discardGame", "discardMutation.mutate();"]]) {
            const fn = gate.slice(gate.indexOf(`const ${name} = (`));
            const guard = fn.indexOf("if (endingNow()) return;");
            expect(guard, name).toBeGreaterThan(0);
            expect(fn.indexOf(go), name).toBeGreaterThan(guard);
        }
        expect(count(hook, "finishMutation.mutate(")).toBe(1);
        expect(count(hook, "discardMutation.mutate(")).toBe(1);
        // 화면이 단추를 잠그는 근거도 캐시에서 센다
        expect(gate).toContain("const finishBusy = useIsMutating({ mutationKey: gameFinishKey(id) }) > 0;");
        expect(gate).toContain("const discardBusy = useIsMutating({ mutationKey: gameDiscardKey(id) }) > 0;");
        // 화면의 isPending 으로 막지 않는다(그 화면이 보낸 요청만 본다)
        expect(hook).not.toMatch(/(finish|discard)Mutation\.isPending/);
    });

    it("카드의 FINISH 탭은 finishGame 으로 간다", () => {
        const tap = hook.slice(hook.indexOf("const handleCardTap = ("), hook.indexOf("const handleBankShot = ("));
        expect(tap).toContain("finishGame({ winnerId: winnerId || undefined, winnerIndex: playerIndex });");
        expect(tap).not.toContain(".mutate(");
    });

    it("FINISH 실패 — 점수판이 떠 있으면 그 안의 띠가 알린다(토스트는 세로 점수판 밑에 깔린다). 떠난 뒤의 실패만 토스트로", () => {
        const onError = finish.slice(finish.indexOf("onError: (err: any) => {"));
        const free = onError.indexOf("finishedRef.current = false;");
        const shown = onError.indexOf("if (mountedRef.current) return;");
        const say = onError.indexOf("toast({");
        expect(free).toBeGreaterThan(0);
        expect(shown).toBeGreaterThan(free);
        expect(say).toBeGreaterThan(shown);
        expect(onError).toContain("description: finishFailText(err),");
        // 띠에 쓸 까닭 — 서버가 답한 것은 그 말을, 답을 못 받은 것(서비스워커의 가짜 404 포함)은 번역된 안내를
        expect(hook).toContain('err instanceof ApiError && !isNoAnswer(err) ? err.message : t("gameScoreboard.finishFailDesc");');
        expect(gate).toContain("const finishFailure = finishMutation.isError ? finishFailText(finishMutation.error) : null;");
        expect(gate).toContain("const dismissFinishFailure = () => finishMutation.reset();");
        // 떠 있는지는 화면이 붙을 때 켜고 떠날 때 끈다
        expect(hook).toContain("return () => { mountedRef.current = false; };");
    });

    it("경기 행은 떠나면 캐시에서 뺀다 — 같은 세션에서 다시 들어온 화면이 옛 행으로 되살아나 그 점수를 다시 저장하지 않게", () => {
        const q = hook.slice(hook.indexOf("const { data: game, isLoading, error } = useQuery<HiqGame>({"), hook.indexOf("const spectating = isSpectator(game);"));
        expect(q).toContain("queryKey: [`/api/hiq/game/${id}`],");
        expect(q).toContain("gcTime: 0,");
        expect(count(hook, "gcTime")).toBe(1);
        // 되살리기는 한 번뿐이다(그래서 처음 받는 행이 새것이어야 한다)
        expect(hook).toContain("if (hydratedRef.current || !game || game.status === \"finished\") return;");
    });
});

describe("점수판 요청 줄 — 화면(종료 단추 · 확인창 · 실패 알림)", () => {
    const page = code(src("pages/hiq/game/[id].tsx"));
    const bar = code(src("components/hiq/game/ScoreboardBottomBar.tsx"));
    /** 점수판 상자 안 — LandscapeGuard 가 감싼 부분 */
    const box = page.slice(page.indexOf("<LandscapeGuard>"), page.indexOf("</LandscapeGuard>"));
    const ASK = "{exitAsking && !spectating && (";
    const NOTE = "{finishFailure !== null && (";

    it("종료와 FINISH 는 함께 나가지 않는다 — 화면은 훅의 finishGame · discardGame 으로만 보낸다(둘 다 보내는 순간의 캐시를 본다)", () => {
        expect(page).toContain("finishGame, discardGame, finishBusy, discardBusy, finishFailure, dismissFinishFailure, speak");
        // 화면이 직접 보내지 않고, 그 화면이 보낸 요청만 보는 isPending 으로 막지도 않는다
        expect(page).not.toMatch(/Mutation\.(mutate|isPending)/);
        // FINISH(차례 단추)
        const turn = page.slice(page.indexOf("onTurnClick={() => {"), page.indexOf("isSolo={totalPlayers === 1}"));
        expect(turn).toContain("finishGame({");
        expect(count(page, "finishGame(")).toBe(1);
        // 종료: 확인창의 확인 단추 하나뿐이다
        expect(count(page, "discardGame(")).toBe(1);
    });

    it("종료하기 확인창은 점수판 상자 안에 그린다 — 세로로 든 폰에서 body 쪽에 뜨는 안내창은 점수판 밑에 깔려 보이지 않았다", () => {
        // 공용 안내창(body 포털)·브라우저 기본 창을 쓰지 않는다
        expect(page).not.toContain('from "@/components/AppDialog"');
        expect(page).not.toMatch(/\bappConfirm\(|\balert\(|(?<![A-Za-z.])confirm\(/);
        // 종료 단추 → (가는 중이면 아무 일도 없다) → 확인창을 연다
        expect(page).toContain("onExit={() => { if (exitBusy) return; setExitAsking(true); }}");
        expect(page).toContain("const [exitAsking, setExitAsking] = useState(false);");
        expect(count(page, "setExitAsking(true)")).toBe(1);

        // 상자 안, 하단 바 뒤에 그린다(같은 층이면 뒤에 그린 것이 위다) — 상자를 통째로 덮고 하단 바(z-50)보다 위 층이다
        const at = box.indexOf(ASK);
        expect(at).toBeGreaterThan(box.indexOf("<ScoreboardBottomBar"));
        expect(count(page, ASK)).toBe(1);
        const ask = box.slice(at);
        expect(ask).toContain('role="alertdialog"');
        expect(ask).toContain('className="absolute inset-0 z-[60] flex items-center justify-center bg-black/55 px-5"');
        // 덮는 기준(relative)은 점수판의 뿌리 상자다
        expect(box).toContain('<div className="h-full bg-surface-0 text-[rgba(0,0,0,0.87)] font-sans overflow-hidden flex flex-col touch-none select-none relative">');
        expect(bar).toContain('<div className="h-16 bg-white border-t border-black/10 flex items-center justify-between px-8 shrink-0 z-50">');

        // 묻는 말은 예전 그대로 · 단추는 취소 → 확인 순서
        expect(ask).toContain('{t("gameScoreboard.exitConfirm")}');
        const cancel = ask.indexOf("onClick={() => setExitAsking(false)}");
        const go = ask.indexOf("onClick={() => { setExitAsking(false); discardGame(); }}");
        expect(cancel).toBeGreaterThan(0);
        expect(go).toBeGreaterThan(cancel);
        expect(ask.indexOf('{t("common.cancel")}')).toBeGreaterThan(cancel);
        expect(ask.indexOf('{t("common.ok")}')).toBeGreaterThan(go);
        // 누를 수 있는 것은 그 둘뿐이다 — 바깥(어두운 막)을 눌러도 닫히지 않는다(지우는 일이다)
        expect(count(ask, "onClick=")).toBe(2);
        // 관전자 쪽 줄에는 종료하기가 없다(나가기만 있다) — 확인창을 여는 곳은 호스트의 하단 바뿐이다
        const hostBar = box.indexOf(") : (", box.indexOf("{spectating ? ("));
        expect(hostBar).toBeGreaterThan(0);
        expect(box.indexOf("setExitAsking(true)")).toBeGreaterThan(hostBar);
    });

    it("FINISH 실패 알림도 점수판 상자 안에 그린다 — 토스트는 세로 점수판 밑에 깔린다. 누르면 닫힌다", () => {
        const at = box.indexOf(NOTE);
        expect(at).toBeGreaterThan(box.indexOf("<ScoreboardBottomBar"));
        expect(at).toBeLessThan(box.indexOf(ASK)); // 확인창이 그 위에 온다
        const note = box.slice(at, box.indexOf(ASK));
        // 하단 바(z-50)보다 위 · 확인창(z-60)보다 아래. 띠 바깥은 점수판을 그대로 누를 수 있다
        expect(note).toContain('<div role="alert" className="absolute top-3 inset-x-0 z-[55] flex justify-center px-4 pointer-events-none">');
        expect(note).toContain("pointer-events-auto");
        expect(note).toContain("onClick={dismissFinishFailure}");
        expect(note).toContain('{t("gameScoreboard.finishFailTitle")}');
        expect(note).toContain("{finishFailure}");
    });

    it("화면이 새로 쓰는 문구는 없다 — 쓰는 키가 다섯 사전에 한 번씩 있다", () => {
        for (const l of ["ko", "en", "es", "vi", "tr"]) {
            const dict = src(`lib/i18n/${l}.ts`);
            for (const key of ["gameScoreboard.exitConfirm", "gameScoreboard.finishFailTitle", "common.cancel", "common.ok"]) {
                expect(count(dict, `"${key}":`), `${l} ${key}`).toBe(1);
            }
        }
    });

    it("가는 동안 종료 단추는 잠기고 흐려진다 — 문구는 그대로", () => {
        // 가는 중인지는 이 화면의 요청이 아니라 이 경기의 요청으로 센다(훅의 finishBusy · discardBusy)
        expect(page).toContain("const exitBusy = discardBusy || finishBusy;");
        expect(page).toContain("exiting={exitBusy}");
        expect(bar).toContain("exiting?: boolean;");
        expect(bar).toContain("export function ScoreboardBottomBar({ innings, onExit, exiting, canUndo,");
        const exit = bar.slice(bar.indexOf("onClick={onExit}"), bar.indexOf('{t("scoreboardBottomBar.exit")}'));
        expect(exit.length).toBeGreaterThan(0);
        expect(exit).toContain("disabled={exiting}");
        expect(exit).toContain("disabled:opacity-40");
        // 새 문구를 만들지 않았다 — 하단 바가 쓰는 키는 예전 그대로다
        const used = Array.from(new Set(Array.from(bar.matchAll(/t\("([A-Za-z.]+)"\)/g), (m) => m[1]))).sort();
        expect(used).toEqual(["playerCard.bankShot", "scoreboardBottomBar.elapsedTime", "scoreboardBottomBar.exit", "scoreboardBottomBar.inning"]);
    });
});

describe("점수판 요청 줄 — 요청 함수 · 기기 저장소(queryClient)", () => {
    const q = src("lib/queryClient.ts");

    it("apiRequest — 타임아웃을 고를 수 있고, 안 주면 60초 그대로다", () => {
        const fn = q.slice(q.indexOf("export async function apiRequest("), q.indexOf("// 4. Query Function"));
        expect(fn).toContain("timeoutMs?: number;");
        expect(fn).toContain("const timeoutId = setTimeout(() => controller.abort(), options?.timeoutMs ?? 60000);");
        expect(count(fn, "setTimeout(")).toBe(1);
        // 쿼리(GET)는 타임아웃을 주지 않는다 — 기본값 그대로
        expect(q).toContain('return await apiRequest(url, { method: "GET", signal });');
    });

    it("짧은 타임아웃은 점수판의 저장·종료 둘뿐이다 — 값은 shared 의 상수로만 준다", () => {
        const hook = code(src("hooks/useGameScore.ts"));
        expect(Array.from(hook.matchAll(/timeoutMs: ([A-Za-z_0-9]+)/g), (m) => m[1])).toEqual(["SAVE_TIMEOUT_MS", "DISCARD_TIMEOUT_MS"]);
        // 둘 다 기본값(60초)보다 짧다 — 줄을 오래 붙잡지 않는다
        expect(SAVE_TIMEOUT_MS).toBeLessThan(60000);
        expect(DISCARD_TIMEOUT_MS).toBeLessThan(60000);
    });

    it("기기 저장소 — 요청은 남기지 않고(v2.7), 옛 캐시는 버린다", () => {
        expect(q).toContain('import { neverPersistMutations } from "@shared/gameMutationQueue";');
        const block = q.slice(q.indexOf("// 6. Persistence"));
        expect(block).toContain('buster: "RANKUE_CACHE_v2.7",');
        expect(block).not.toContain('"RANKUE_CACHE_v2.6"');
        expect(block).toMatch(/\/\/ v2\.7: .+/);
        const opts = block.slice(block.indexOf("dehydrateOptions: {"));
        expect(opts).toContain("shouldDehydrateMutation: neverPersistMutations,");
        // 쿼리 쪽 규칙은 그대로다(성공한 것만 · 진행 중 경기 행은 남기지 않는다)
        expect(opts).toContain('if (query.state.status !== "success") return false;');
        expect(opts).toContain('return !key.startsWith("/api/hiq/game/");');
        // 되살리는 길은 persistQueryClient 하나다 — 다른 곳에서 hydrate 하지 않는다
        expect(count(code(q), "persistQueryClient(")).toBe(1);
        expect(code(q)).not.toMatch(/\bhydrate\(/);
    });
});

describe("점수판 요청 줄 — 문구(다섯 언어)", () => {
    const hook = code(src("hooks/useGameScore.ts"));

    it("훅이 쓰는 gameScoreboard 키가 다섯 사전에 한 번씩 있다", () => {
        const used = Array.from(new Set(Array.from(hook.matchAll(/t\("(gameScoreboard\.[A-Za-z]+)"\)/g), (m) => m[1]))).sort();
        expect(used).toEqual([
            "gameScoreboard.exitFailDesc", "gameScoreboard.exitFailTitle",
            "gameScoreboard.finishFailDesc", "gameScoreboard.finishFailTitle",
        ]);
        for (const l of ["ko", "en", "es", "vi", "tr"]) {
            const dict = src(`lib/i18n/${l}.ts`);
            for (const key of used) {
                expect(dict, `${l} ${key}`).toMatch(new RegExp(`\\n  "${key.replace(".", "\\.")}": ".+",\\n`));
                expect(count(dict, `"${key}":`), `${l} ${key}`).toBe(1);
            }
        }
    });

    it("한국어 — 왜 남았는지와 다시 하는 길('이어서 하기' 배너 · 종료)을 말한다", () => {
        const ko = src("lib/i18n/ko.ts");
        expect(ko).toContain('"gameScoreboard.exitFailTitle": "경기를 지우지 못했어요",');
        const desc = ko.match(/"gameScoreboard\.exitFailDesc": "([^"]*)"/)?.[1] ?? "";
        expect(desc).toContain("네트워크");
        // 홈 배너의 단추 문구와 같은 말을 쓴다
        const cta = ko.match(/"dashboard\.resumeCta": "([^"]*)"/)?.[1] ?? "";
        expect(cta.length).toBeGreaterThan(0);
        expect(desc).toContain(cta);
        // 다른 언어도 그 언어의 배너 단추 문구를 그대로 가리킨다
        for (const l of ["en", "es", "vi", "tr"]) {
            const dict = src(`lib/i18n/${l}.ts`);
            const d = dict.match(/"gameScoreboard\.exitFailDesc": "([^"]*)"/)?.[1] ?? "";
            const c = dict.match(/"dashboard\.resumeCta": "([^"]*)"/)?.[1] ?? "";
            expect(c.length, l).toBeGreaterThan(0);
            expect(d, l).toContain(c);
        }
    });
});
