/**
 * 가고 싶은 산(2026-10-13) — 골프장 상세의 '관심 등록'을 등산으로 옮긴 것(shared/hikingWish).
 * 산 화면의 단추(WishButton)로 담고, 등산 홈의 줄(WishShelf)에 모인다. 오르면 '다녀온 산'으로 바뀐다. 알림은 없다.
 * 등산을 쓸 수 있는 회원만 담는다 — 방문자에게는 가입 안내, 등산이 아직 안 열린 회원에게는 단추를 그리지 않는다.
 * 방문자가 누르면 그 산을 기기에 적어 두고 가입 팝업을 연다 — 가입하고 그 산 화면에 있으면 바로 담긴다(2026-11-04, useWishAfterLogin).
 * ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상, 굵기는 semibold 까지.
 */
import { useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useHikingAccess } from "@/hooks/useHikingAccess";
import { goLoginPage } from "@/components/hiq/LoginGate";
import { openLoginSheet } from "@/components/hiq/LoginSheet";
import { hikingMountainPath } from "@shared/hikingMountains";
import { HIKING_WISH_LABEL, WISH_AFTER_LOGIN_KEY, orderWishes, wishAddedAfterLogin, wishAfterLoginRead, wishAfterLoginRecord, wishLoginAsk } from "@shared/hikingWish";
import { HkSection } from "../components/HikingShell";
import { MountainPatch } from "../stamps/MountainPatch";
import { hikingCover } from "../theme";

export const MY_WISHES_KEY = ["/api/hiq/hiking/me/wishes"] as const;

/** 내가 담은 산 — 등산을 쓸 수 있는 회원만 묻는다 */
export interface WishItem { id: string; slug: string; name: string; heightM: number | null; region: string | null; kfs: boolean }
interface WishData { ids: string[]; items?: WishItem[] }
export function useWishes() {
    const mine = useHikingAccess();
    const q = useQuery<WishData>({ queryKey: MY_WISHES_KEY, enabled: mine, staleTime: 60_000 });
    const ids = mine ? q.data?.ids ?? [] : [];
    return { mine, ids, items: mine ? q.data?.items ?? [] : [], has: (id: string) => ids.includes(id), isLoading: mine && q.isLoading };
}

/** 깃발 — '가고 싶은 산'의 표시(산 화면 방문자 줄도 같은 그림) */
export const WishFlag = ({ on }: { on: boolean }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
        <path d="M6 21V4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
        <path d="M6 4.5h11l-2.4 3.5 2.4 3.5H6Z" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
);

/**
 * 방문자가 '가고 싶은 산'을 눌렀다 — 그 산을 기기에 적어 두고, "○○산을 가고 싶은 산에 담아요" 가입 팝업을 연다.
 * 팝업을 못 열면(호스트가 아직 없다) 예전처럼 로그인하러 보낸다 — 돌아오는 곳은 이 산 화면이라, 적어 둔 것이 그대로 쓰인다.
 */
export function wishAfterLogin(slug: string, name: string, setLocation: (to: string) => void): void {
    try { localStorage.setItem(WISH_AFTER_LOGIN_KEY, wishAfterLoginRecord(slug, name, Date.now())); } catch { /* 적지 못해도 가입은 이어진다 */ }
    if (!openLoginSheet(wishLoginAsk(name))) goLoginPage(setLocation);
}

/**
 * 가입하고 돌아온 등산 화면에서 — 방문자 때 눌러 둔 '가고 싶은 산'을 담는다(한 번만). 등산의 공개 틀(HikingShell)이 부른다.
 * 적어 둔 것이 없으면 아무것도 묻지 않는다(회원의 화면마다 요청이 늘지 않게). 오래됐거나 꼴이 틀리면 지우기만 한다.
 */
export function useWishAfterLogin(): void {
    const mine = useHikingAccess();
    const qc = useQueryClient();
    const { toast } = useToast();
    const done = useRef(false);
    useEffect(() => {
        if (!mine || done.current) return;
        let raw: string | null = null;
        try { raw = localStorage.getItem(WISH_AFTER_LOGIN_KEY); } catch { return; }
        if (!raw) return;
        done.current = true;
        try { localStorage.removeItem(WISH_AFTER_LOGIN_KEY); } catch { /* 지우지 못해도 오래되면 버려진다 */ }
        const w = wishAfterLoginRead(raw, Date.now());
        if (!w) return;
        apiRequest(`/api/hiq/hiking/mountains/${encodeURIComponent(w.slug)}/wish`, { method: "PUT" })
            .then(() => { toast({ title: wishAddedAfterLogin(w.name) }); void qc.invalidateQueries({ queryKey: MY_WISHES_KEY }); })
            .catch(() => { /* 담지 못했으면 단추가 그대로 '가고 싶은 산에 담기'다 — 다시 누르면 된다 */ });
    }, [mine, qc, toast]);
}

/** 산 화면의 단추 — 누르면 담고, 다시 누르면 뺀다 */
export function WishButton({ slug, mountainId, name, className, compact = false }: {
    slug: string; mountainId: string;
    /** 산 이름 — 방문자에게 여는 가입 팝업의 제목("○○산을 가고 싶은 산에 담아요") */
    name?: string;
    className?: string;
    /** 작은 딱지 모양 — 도장 카드의 머리띠 안에 놓일 때(짙은 바탕 위) */
    compact?: boolean;
}) {
    const { member, isLoading } = useAuth();
    const [, setLocation] = useLocation();
    const qc = useQueryClient();
    const w = useWishes();
    const on = w.has(mountainId);
    const toggle = useMutation({
        mutationFn: (next: boolean) => apiRequest(`/api/hiq/hiking/mountains/${encodeURIComponent(slug)}/wish`, { method: next ? "PUT" : "DELETE" }),
        onMutate: async (next: boolean) => {
            await qc.cancelQueries({ queryKey: MY_WISHES_KEY });
            const prev = qc.getQueryData<WishData>(MY_WISHES_KEY);
            // 단추만 먼저 바꾼다(ids) — 홈의 줄(items)은 다시 받아 온 뒤에 맞춰진다
            qc.setQueryData<WishData>(MY_WISHES_KEY, { ...(prev ?? { ids: [] }), ids: next ? [mountainId, ...(prev?.ids ?? []).filter((x) => x !== mountainId)] : (prev?.ids ?? []).filter((x) => x !== mountainId) });
            return { prev };
        },
        onError: (_e, _next, ctx) => { if (ctx?.prev) qc.setQueryData(MY_WISHES_KEY, ctx.prev); },
        onSettled: () => { void qc.invalidateQueries({ queryKey: MY_WISHES_KEY }); },
    });
    if (isLoading) return null;
    // 로그인했지만 등산이 아직 안 열린 회원 — 담을 곳이 없으니 그리지 않는다
    if (member && !w.mine) return null;
    const full = toggle.isError && /WISH_FULL|100곳/.test(String((toggle.error as { code?: string; message?: string } | null)?.code ?? "") + String((toggle.error as { message?: string } | null)?.message ?? ""));
    if (compact) {
        return (
            <button type="button" aria-pressed={on} disabled={toggle.isPending} aria-label={on ? HIKING_WISH_LABEL.added : HIKING_WISH_LABEL.add}
                onClick={() => { if (!member) { wishAfterLogin(slug, name ?? "", setLocation); return; } toggle.mutate(!on); }}
                data-track-as="hiking-wish" data-testid="hk-wish" data-on={on ? "1" : "0"}
                className={`flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12.5px] font-medium leading-none active:opacity-80 ${className ?? ""}`}
                style={on ? { background: "#F6D9A8", color: "#2A1F08" } : { background: "#FFFFFF24", color: "#F4EFE3", boxShadow: "inset 0 0 0 1px #FFFFFF4D" }}>
                <WishFlag on={on} />{on ? "담았어요" : "가고 싶은 산"}
            </button>
        );
    }
    return (
        <div className={className}>
            <button type="button" aria-pressed={on} disabled={toggle.isPending}
                onClick={() => { if (!member) { wishAfterLogin(slug, name ?? "", setLocation); return; } toggle.mutate(!on); }}
                data-track-as="hiking-wish" data-testid="hk-wish" data-on={on ? "1" : "0"}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold active:opacity-80"
                style={on ? { background: "#F6D9A824", color: "#F6D9A8", boxShadow: "inset 0 0 0 1px #F6D9A866" } : { background: "#F6D9A8", color: "#2A1F08" }}>
                <WishFlag on={on} />
                {on ? HIKING_WISH_LABEL.added : HIKING_WISH_LABEL.add}
            </button>
            {full && <p className="mt-1.5 text-[12.5px] text-[#F6D9A8] break-keep" role="status">{HIKING_WISH_LABEL.full}</p>}
        </div>
    );
}

/** 등산 홈의 줄 — 담아 둔 산을 옆으로 넘겨 본다. 아직 없으면 그리지 않는다(홈을 빈 칸으로 늘리지 않는다) */
export function WishShelf({ done }: { done: ReadonlySet<string> }) {
    const w = useWishes();
    if (!w.mine || w.items.length === 0) return null;
    const by = new Map(w.items.map((m) => [m.id, m]));
    const items = orderWishes(w.items.map((m) => m.id), done).map((id) => by.get(id)!).filter(Boolean);
    const left = items.filter((x) => !done.has(x.id)).length;
    return (
        <HkSection title={HIKING_WISH_LABEL.shelf} aside={left > 0 ? `${left}곳 남았어요` : "다 다녀왔어요"}>
            <ul className="-mx-5 flex gap-2.5 overflow-x-auto px-5 pb-1" style={{ scrollbarWidth: "none" }} data-testid="hk-wish-shelf" data-count={items.length}>
                {items.map((m) => {
                    const got = done.has(m.id);
                    return (
                        <li key={m.id} className="w-[124px] shrink-0">
                            <Link href={hikingMountainPath(m.slug)} className="block overflow-hidden rounded-2xl active:opacity-80" style={{ background: "#FFFFFF0A", boxShadow: "inset 0 0 0 1px #FFFFFF14" }} data-track-as="hiking-wish-card">
                                <span className="relative flex h-[84px] items-end justify-center overflow-hidden" style={{ background: "#0E2A33" }}>
                                    <img src={hikingCover(m.region)} alt="" loading="lazy" decoding="async" draggable={false} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 62%", opacity: got ? 0.55 : 1 }} />
                                    <span className="absolute inset-0" style={{ background: "linear-gradient(180deg,#0B1F2640,#0B1F2600 45%,#0E2A33F2)" }} aria-hidden />
                                    {m.kfs && <MountainPatch id={m.id} region={m.region} size={54} earned={got} preview className="relative mb-1" />}
                                    {got && <span className="absolute left-2 top-2 rounded-full bg-[#F28C6A] px-2 py-1 text-[12px] font-semibold leading-none text-[#2A1208]">{HIKING_WISH_LABEL.done}</span>}
                                </span>
                                <span className="block px-2.5 pb-2.5 pt-2">
                                    <span className="block truncate text-[14.5px] font-semibold text-[#F4EFE3]">{m.name}</span>
                                    <span className="mt-0.5 block truncate text-[12.5px] tabular-nums text-[#F4EFE399]">{m.heightM != null ? `${Math.round(m.heightM).toLocaleString("en-US")}m` : "산"}</span>
                                </span>
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </HkSection>
    );
}
