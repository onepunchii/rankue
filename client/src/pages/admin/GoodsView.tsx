/**
 * 어드민 · 굿즈 · 배지(2026-10-16 오너: "어드민에 굿즈 내역 관련 증정 가능하게 · 이쁘게 굿즈나 배지 증정 · 수정 가능하게").
 * 결정: 네 종목 전부 · 증정한 것만 회수 + 사유 기록 · 알림 + 열면 받은 화면.
 *
 *  1. 회원 고르기(이름 · 전화 끝자리) → 종목 탭(당구 · 골프 · 등산 · 낚시)
 *  2. 가진 것 — 그림 판에 자동으로 받은 것 / 증정한 것(금테 · '증정') · 몇 번째 주인
 *  3. 증정하기 — 묶음 칩 · 그림 판에서 고르고(가진 것은 흐리게 · 한정은 남은 수) → 까닭(필수) · 받는 사람에게 한마디 · 알림 → 증정
 *  4. 증정 기록 — 최근 것부터, 회수(까닭을 적어야 한다)
 * 그림의 바탕은 종목의 화면과 같은 결: 당구 벨벳 · 골프 잔디 종이 · 등산 청록 · 낚시 한지(먹 그림은 곱하기로).
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { GOODS_SPORTS, GOODS_SPORT_NAME, goodsCatalog, type GoodsGrantRow, type GoodsItem, type GoodsOwned, type GoodsSport } from "@shared/goods";
import { GOODS_SHOP_ITEMS, type GoodsShopStats } from "@shared/goodsShop";
import { ADMIN_MEMBERS_KEY, type AdminMember } from "./MemberDetailSheet";
import { EmptyState, FilterChips, MemberAvatar, Panel, Pill, SearchBox, kstDateTime } from "./adminUtils";

const TONE: Readonly<Record<GoodsSport, { bg: string; ink: string; blend?: boolean }>> = {
    billiards: { bg: "linear-gradient(160deg,#17233a,#0b1322)", ink: "#f4ead6" },
    golf: { bg: "linear-gradient(160deg,#eef3e6,#dfe9d2)", ink: "#21412a" },
    hiking: { bg: "linear-gradient(160deg,#e6f0ee,#d3e4e1)", ink: "#1f4d4a" },
    fishing: { bg: "linear-gradient(160deg,#f3ecdd,#e7dcc6)", ink: "#0f2838", blend: true },
};

function Thumb({ item, size = "md" }: { item: GoodsItem; size?: "md" | "lg" }) {
    const t = TONE[item.sport];
    const h = size === "lg" ? (item.shape === "cue" ? 56 : 120) : item.shape === "cue" ? 28 : 64;
    return (
        <span className="flex w-full items-center justify-center overflow-hidden rounded-xl px-2" style={{ background: t.bg, height: size === "lg" ? 150 : 84 }}>
            {item.image
                ? <img src={item.image} alt="" loading="lazy" draggable={false} className={item.shape === "cue" ? "w-full object-contain" : "max-w-full object-contain"} style={{ height: h, mixBlendMode: t.blend ? "multiply" : undefined }} />
                : <span className="text-center text-[13px] font-black leading-tight" style={{ color: t.ink }}>{item.name}</span>}
        </span>
    );
}

/**
 * 굿즈샵 출시 알림 신청(2026-10-24) — 큐 케이스의 '랭큐 굿즈 곧 나와요'에서 고른 것. 실물을 무엇부터 만들지 보는 숫자.
 * 출시 알림은 아직 안 보낸다(열 때 이 명단으로).
 */
function ShopInterestPanel() {
    const q = useQuery<GoodsShopStats>({ queryKey: ["/api/hiq/admin/goods/shop-interest"] });
    const d = q.data;
    if (!d) return null;
    const max = Math.max(1, ...GOODS_SHOP_ITEMS.map((x) => d.byItem?.[x.id] ?? 0));
    return (
        <Panel className="p-4" >
            <div className="flex items-baseline justify-between gap-2">
                <p className="text-[13px] font-bold text-black/80">굿즈샵 출시 알림 신청 <span className="tabular-nums text-brand">{d.total}명</span></p>
                <p className="text-[11.5px] text-black/40">큐 케이스 아래 '랭큐 굿즈 곧 나와요'에서 고른 것</p>
            </div>
            <div className="mt-3 space-y-1.5" data-testid="admin-shop-interest">
                {GOODS_SHOP_ITEMS.map((x) => {
                    const n = d.byItem?.[x.id] ?? 0;
                    return (
                        <div key={x.id} className="flex items-center gap-2 text-[12.5px]">
                            <span className="w-24 shrink-0 text-black/65">{x.name.ko}</span>
                            <span className="h-2 flex-1 overflow-hidden rounded-full bg-black/[0.05]"><i className="block h-full rounded-full bg-brand" style={{ width: `${(n / max) * 100}%` }} /></span>
                            <span className="w-10 shrink-0 text-right tabular-nums font-bold text-black/70">{n}</span>
                        </div>
                    );
                })}
            </div>
            {d.recent?.length > 0 && (
                <details className="mt-3">
                    <summary className="cursor-pointer text-[12px] font-semibold text-black/50">최근 신청 {Math.min(50, d.recent.length)}</summary>
                    <ul className="mt-2 space-y-1 text-[12px] text-black/60">
                        {d.recent.map((r) => <li key={r.memberId}><b className="text-black/75">{r.name || "회원"}</b> · {r.items.map((id) => GOODS_SHOP_ITEMS.find((x) => x.id === id)?.name.ko ?? id).join(" · ")} · {kstDateTime(new Date(r.at).toISOString())}</li>)}
                    </ul>
                </details>
            )}
        </Panel>
    );
}

export default function GoodsView({ initialMemberId = null }: { initialMemberId?: string | null }) {
    const { toast } = useToast();
    const qc = useQueryClient();
    const membersData = useQuery<AdminMember[]>({ queryKey: ADMIN_MEMBERS_KEY }).data;
    const members = useMemo(() => (Array.isArray(membersData) ? membersData : []), [membersData]);
    const [memberId, setMemberId] = useState<string | null>(initialMemberId);
    const [find, setFind] = useState("");
    const [sport, setSport] = useState<GoodsSport>("billiards");
    const [group, setGroup] = useState<string>("all");
    const [term, setTerm] = useState("");
    const [pick, setPick] = useState<GoodsItem | null>(null);
    const [form, setForm] = useState({ reason: "", message: "", notify: true });
    const [revoking, setRevoking] = useState<{ id: string; reason: string } | null>(null);

    const memberKey = ["/api/hiq/admin/goods/member", memberId ?? ""] as const;
    const detail = useQuery<{ member: { id: string; name: string }; owned: GoodsOwned[] }>({ queryKey: memberKey, enabled: !!memberId });
    const logKey = ["/api/hiq/admin/goods/log", memberId ? { memberId } : {}] as const;
    const log = useQuery<GoodsGrantRow[]>({ queryKey: logKey });

    const matches = useMemo(() => {
        const s = find.trim();
        if (!s) return [];
        return members.filter((m) => m.name?.includes(s) || (s.length >= 4 && m.phone?.endsWith(s))).slice(0, 8);
    }, [members, find]);
    const member = members.find((m) => m.id === memberId) ?? null;
    const owned = detail.data?.owned ?? [];
    const ownedMap = useMemo(() => new Map(owned.map((o) => [`${o.sport}|${o.key}`, o])), [owned]);
    const catalog = goodsCatalog(sport);
    const groups = useMemo(() => [...new Map(catalog.map((x) => [x.group, x.groupName])).entries()], [catalog]);
    const shown = catalog.filter((x) => (group === "all" || x.group === group) && (!term.trim() || x.name.includes(term.trim())));
    const mine = catalog.filter((x) => ownedMap.has(`${sport}|${x.key}`));

    const refresh = () => { void qc.invalidateQueries({ queryKey: ["/api/hiq/admin/goods/member"] }); void qc.invalidateQueries({ queryKey: ["/api/hiq/admin/goods/log"] }); };
    const grant = useMutation({
        mutationFn: () => apiRequest("/api/hiq/admin/goods/grant", { method: "POST", body: { memberId, sport, key: pick!.key, reason: form.reason, message: form.message || undefined, notify: form.notify } }),
        onSuccess: (r: any) => { toast({ title: `증정했어요 — ${pick!.name}${r?.serial ? ` · No.${String(r.serial).padStart(3, "0")}` : ""}` }); setPick(null); setForm({ reason: "", message: "", notify: true }); refresh(); },
        onError: (e: any) => toast({ title: e?.message || "증정하지 못했어요", variant: "destructive" }),
    });
    const revoke = useMutation({
        mutationFn: (o: { id: string; reason: string }) => apiRequest("/api/hiq/admin/goods/revoke", { method: "POST", body: { grantId: o.id, reason: o.reason } }),
        onSuccess: () => { toast({ title: "회수했어요" }); setRevoking(null); refresh(); },
        onError: (e: any) => toast({ title: e?.message || "회수하지 못했어요", variant: "destructive" }),
    });

    return (
        <div className="space-y-4" data-testid="admin-goods">
            <ShopInterestPanel />
            {/* 1. 회원 */}
            <Panel className="p-4">
                <p className="text-[12px] font-black text-black/40">1. 받을 회원</p>
                {member ? (
                    <div className="mt-2 flex items-center gap-3">
                        <MemberAvatar name={member.name} src={member.profileImageUrl} className="h-11 w-11 bg-brand/10 text-[16px] font-black text-brand" />
                        <div className="min-w-0 flex-1"><p className="truncate text-[16px] font-black">{member.name}</p><p className="text-[12px] text-black/45">가진 굿즈 {owned.length}개 · 증정 {owned.filter((o) => o.grant).length}개</p></div>
                        <Button variant="outline" onClick={() => { setMemberId(null); setPick(null); }} className="h-9 text-[13px]">다른 회원</Button>
                    </div>
                ) : (
                    <div className="mt-2">
                        <SearchBox value={find} onChange={setFind} placeholder="이름 · 전화 끝 네 자리" className="w-full sm:w-80" />
                        {matches.length > 0 && (
                            <div className="mt-2 grid gap-1.5 sm:grid-cols-2" data-testid="admin-goods-matches">
                                {matches.map((m) => (
                                    <button key={m.id} type="button" onClick={() => { setMemberId(m.id); setFind(""); }} className="flex items-center gap-2.5 rounded-xl border border-black/[0.07] bg-white px-3 py-2 text-left hover:bg-black/[0.03]">
                                        <MemberAvatar name={m.name} src={m.profileImageUrl} className="h-8 w-8 bg-brand/10 text-[13px] font-black text-brand" />
                                        <span className="min-w-0 flex-1 truncate text-[14px] font-bold">{m.name}</span>
                                        <span className="text-[12px] text-black/40">…{String(m.phone ?? "").slice(-4)}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </Panel>

            {member && (
                <>
                    <FilterChips value={sport} onChange={(v) => { setSport(v); setGroup("all"); setPick(null); }} options={GOODS_SPORTS.map((s) => ({ id: s, label: GOODS_SPORT_NAME[s], count: owned.filter((o) => o.sport === s).length }))} />

                    {/* 2. 가진 것 */}
                    <Panel className="p-4">
                        <p className="text-[12px] font-black text-black/40">2. {GOODS_SPORT_NAME[sport]} — 가진 것 {mine.length}</p>
                        {mine.length === 0 ? <p className="mt-2 text-[13px] text-black/45">아직 없어요.</p> : (
                            <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-6" data-testid="admin-goods-owned">
                                {mine.map((x) => {
                                    const o = ownedMap.get(`${sport}|${x.key}`)!;
                                    return (
                                        <div key={x.key} className="rounded-2xl border p-2" style={{ borderColor: o.grant ? "#d6a956" : "rgba(0,0,0,0.07)", boxShadow: o.grant ? "0 0 0 1px #d6a95655" : undefined }}>
                                            <Thumb item={x} />
                                            <p className="mt-1.5 truncate text-[13px] font-bold">{x.name}</p>
                                            <div className="mt-0.5 flex items-center gap-1.5">
                                                {o.grant ? <Pill tone="warn">증정</Pill> : <Pill>자동</Pill>}
                                                {o.serial != null && <span className="text-[12px] tabular-nums text-black/45">No.{String(o.serial).padStart(3, "0")}{x.limit ? `/${x.limit}` : ""}</span>}
                                            </div>
                                            {o.grant && <p className="mt-1 line-clamp-2 text-[12px] text-black/45">{o.grant.reason} · {o.grant.adminName}</p>}
                                            {o.grant && (revoking?.id === o.grant.id ? (
                                                <div className="mt-1.5 space-y-1.5">
                                                    <Input value={revoking.reason} onChange={(e) => setRevoking({ id: o.grant!.id, reason: e.target.value })} placeholder="회수하는 까닭" className="h-8 text-[12.5px]" />
                                                    <div className="flex gap-1">
                                                        <Button data-admin-write disabled={!revoking.reason.trim() || revoke.isPending} onClick={() => revoke.mutate(revoking)} className="h-8 flex-1 bg-red-600 text-[12px] text-white hover:bg-red-700">회수</Button>
                                                        <Button variant="outline" onClick={() => setRevoking(null)} className="h-8 text-[12px]">취소</Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <button data-admin-write type="button" onClick={() => setRevoking({ id: o.grant!.id, reason: "" })} className="mt-1 text-[12px] font-bold text-red-600">회수하기</button>
                                            ))}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Panel>

                    {/* 3. 증정하기 */}
                    <Panel className="p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <p className="text-[12px] font-black text-black/40">3. 증정할 것 고르기</p>
                            <SearchBox value={term} onChange={setTerm} placeholder="이름으로 찾기" className="sm:ml-auto sm:w-56" />
                        </div>
                        <div className="mt-2"><FilterChips value={group} onChange={setGroup} options={[{ id: "all", label: "전체", count: catalog.length }, ...groups.map(([id, name]) => ({ id, label: name, count: catalog.filter((x) => x.group === id).length }))]} /></div>
                        {catalog.length === 0 ? <EmptyState>이 종목의 목록을 불러오지 못했어요.</EmptyState> : (
                            <div className="mt-3 grid max-h-[460px] grid-cols-2 gap-2.5 overflow-y-auto pr-1 sm:grid-cols-4 xl:grid-cols-6" data-testid="admin-goods-catalog">
                                {shown.map((x) => {
                                    const have = ownedMap.has(`${sport}|${x.key}`), on = pick?.key === x.key;
                                    return (
                                        <button key={x.key} type="button" disabled={have} onClick={() => setPick(x)} className={`rounded-2xl border p-2 text-left transition ${have ? "opacity-40" : "hover:-translate-y-0.5"}`}
                                            style={{ borderColor: on ? "#0a6b3f" : "rgba(0,0,0,0.07)", boxShadow: on ? "0 0 0 2px #0a6b3f" : undefined }} data-testid={`admin-goods-item-${x.key}`}>
                                            <Thumb item={x} />
                                            <p className="mt-1.5 truncate text-[13px] font-bold">{x.name}</p>
                                            <p className="text-[12px] text-black/45">{have ? "가짐" : x.limit ? `한정 ${x.limit}` : x.groupName}</p>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        {pick && (
                            <div className="mt-4 grid gap-4 rounded-2xl border border-black/[0.08] bg-black/[0.02] p-4 sm:grid-cols-[260px,1fr]" data-testid="admin-goods-form">
                                <div><Thumb item={pick} size="lg" /><p className="mt-2 text-[15px] font-black">{pick.name}</p><p className="text-[12px] text-black/45">{GOODS_SPORT_NAME[sport]} · {pick.groupName}{pick.limit ? ` · 한정 ${pick.limit}` : ""}</p>
                                    {sport === "golf" && pick.group === "tier" && <p className="mt-1.5 text-[12px] leading-snug text-amber-700">블랙 · 자개는 그 볼마커(기본)가 있어야 화면에 보여요 — 없으면 볼마커도 같이 증정해 주세요.</p>}</div>
                                <div className="space-y-2.5">
                                    <div><p className="mb-1 text-[12px] font-bold text-black/50">증정하는 까닭(운영 기록 · 받는 사람에게 안 보임) *</p><Input value={form.reason} maxLength={200} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="예: 10월 오프라인 대회 우승" className="h-10" /></div>
                                    <div><p className="mb-1 text-[12px] font-bold text-black/50">받는 사람에게 한마디(선택 · 알림과 받은 화면에 보임)</p><Input value={form.message} maxLength={120} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="예: 우승 축하드려요!" className="h-10" /></div>
                                    <label className="flex items-center gap-2 text-[13px] font-bold text-black/65"><input type="checkbox" checked={form.notify} onChange={(e) => setForm({ ...form, notify: e.target.checked })} /> 알림 보내기(밤 9시~아침 8시엔 알림함에만)</label>
                                    <div className="rounded-xl bg-white px-3 py-2.5 text-[12.5px] text-black/60 shadow-[0_1px_0_rgba(0,0,0,0.06)]"><span className="font-bold text-black/80">알림 미리보기</span> · 선물이 도착했어요 — 랭큐가 보낸 선물 · {pick.name}{form.message ? ` — ${form.message}` : ""}</div>
                                    <Button data-admin-write disabled={!form.reason.trim() || grant.isPending} onClick={() => grant.mutate()} className="h-11 w-full bg-brand text-[14px] font-bold text-white hover:bg-brand-strong" data-testid="admin-goods-grant">
                                        {grant.isPending ? "증정하는 중…" : `${member.name}님에게 증정하기`}
                                    </Button>
                                </div>
                            </div>
                        )}
                    </Panel>
                </>
            )}

            {/* 4. 증정 기록 */}
            <Panel className="p-4">
                <p className="text-[12px] font-black text-black/40">{member ? `${member.name}님 증정 기록` : "최근 증정 기록"}</p>
                {(log.data ?? []).length === 0 ? <p className="mt-2 text-[13px] text-black/45">아직 없어요.</p> : (
                    <div className="mt-2 divide-y divide-black/[0.06]">
                        {(log.data ?? []).map((g) => (
                            <div key={g.id} className="flex items-center gap-2.5 py-2.5 text-[13px]" data-testid="admin-goods-log-row">
                                <Pill tone={g.revokedAt ? "neutral" : "warn"}>{GOODS_SPORT_NAME[g.sport]}</Pill>
                                <span className="min-w-0 flex-1">
                                    <span className={`block truncate font-bold ${g.revokedAt ? "text-black/40 line-through" : ""}`}>{g.memberName} · {g.name}{g.serial ? ` · No.${String(g.serial).padStart(3, "0")}` : ""}</span>
                                    <span className="block truncate text-[12px] text-black/45">{g.reason} · {g.adminName} · {kstDateTime(g.at)}{g.revokedAt ? ` · 회수 ${kstDateTime(g.revokedAt)} (${g.revokeReason})` : ""}</span>
                                </span>
                                {!g.revokedAt && !member && <button type="button" onClick={() => setMemberId(g.memberId)} className="text-[12px] font-bold text-brand">회원 보기</button>}
                            </div>
                        ))}
                    </div>
                )}
            </Panel>
        </div>
    );
}
