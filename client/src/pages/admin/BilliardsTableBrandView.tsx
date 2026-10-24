/**
 * 어드민 · 당구 › 당구대 광고(2026-10-24 오너: "이 로고를 투명도 있게 온라인게임 당구대에 · 어드민에서 사진 교체해서 광고나 이런거").
 * 위: 지금 걸린 것(대대 파랑 · 중대 초록 천에 실제 비율로). 가운데: 캠페인 목록(지금 걸림 · 예정 · 끝남 · 꺼짐). 아래: 고치기.
 * 고르는 규칙은 shared/tableBrand pickBrands — 기간 있는 캠페인(협찬)이 기간 없는 '랭큐 기본'보다 먼저 걸린다.
 * 게임은 1분 안에 바뀐 것을 본다(CDN 30초 · 서버 15초 · 화면 1분 — 열려 있던 게임 화면은 다시 열어야 바뀐다). 협찬 이름을 적으면 게임 화면에 '○○ 협찬'이 뜬다.
 */
import { useEffect, useRef, useState, type DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { appConfirm } from "@/components/AppDialog";
import { cn } from "@/lib/utils";
import { LucideUpload } from "@/lib/icons";
import { feltColors } from "@/sim/render/felt";
import { brandRects } from "@/sim/render/tableBrandArt";
import { TABLES } from "@shared/sim/params";
import { BRAND_OPACITY, BRAND_SCALE, BRAND_TABLES, DEFAULT_BRAND_IMAGE, brandLive, type BrandTableId, type TableBrandRow, type TableBrandView } from "@shared/tableBrand";
import { EmptyState, Panel, Pill, kstDateTime } from "./adminUtils";
import { prepBrandImage, type BgKey, type BrandDraft } from "./tableBrandUpload";

const API = "/api/hiq/admin/billiards/table-brands";
const KEY = [API] as const;
const TABLE_NAME: Record<BrandTableId, string> = { DAEDAE: "대대(파랑)", JUNGDAE_KR: "중대(초록)" };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e ?? ""));
interface Data { rows: TableBrandRow[]; live: Record<BrandTableId, TableBrandView | null>; now: number }

/** 미리 보기 — 실제 테이블 비율의 천 위에 로고(렌더러와 같은 자리 계산) */
function ClothPreview({ table, brand, className }: { table: BrandTableId; brand: TableBrandView | null; className?: string }) {
    const spec = TABLES[table];
    const felt = feltColors(spec);
    const [aspect, setAspect] = useState(2);
    const rects = brand ? brandRects(spec, brand, aspect) : [];
    return (
        <div className={cn("relative overflow-hidden rounded-[10px] border-[6px] border-[#5a3a22]", className)} style={{ aspectRatio: `${spec.width} / ${spec.length}`, background: `radial-gradient(circle at 50% 50%, ${felt.centre}, ${felt.edge})` }}
            data-testid={`brand-preview-${table}`}>
            {[1, 2, 3].map((i) => <i key={i} className="absolute left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-white/20" style={{ top: `${100 - i * 25}%` }} />)}
            {brand && rects.map((r, i) => (
                <img key={i} src={brand.image} alt="" draggable={false} onLoad={(e) => { const im = e.currentTarget; if (im.naturalWidth && im.naturalHeight) setAspect(im.naturalWidth / im.naturalHeight); }}
                    className="pointer-events-none absolute"
                    style={{
                        left: `${((r.cx - r.w / 2) / spec.width) * 100}%`, top: `${(1 - (r.cy + r.h / 2) / spec.length) * 100}%`,
                        width: `${(r.w / spec.width) * 100}%`, height: `${(r.h / spec.length) * 100}%`,
                        opacity: brand.opacity, transform: r.rot ? "rotate(180deg)" : undefined,
                        filter: brand.tone === "cloth" ? "grayscale(1) brightness(2.2)" : undefined,
                    }} />
            ))}
        </div>
    );
}

const statusOf = (r: TableBrandRow, now: number): { label: string; tone: "brand" | "info" | "neutral" | "warn" } =>
    !r.enabled ? { label: "꺼짐", tone: "neutral" } : brandLive(r, now) ? { label: "걸 수 있음", tone: "brand" }
        : r.startsAt !== null && now < r.startsAt ? { label: "예정", tone: "info" } : { label: "끝남", tone: "warn" };

const toLocalInput = (ms: number | null) => {
    if (ms === null) return "";
    const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 16);
};
const fromLocalInput = (v: string): number | null => (v ? new Date(v).getTime() : null);

type Form = Omit<TableBrandRow, "id" | "createdAt" | "updatedAt">;
const EMPTY: Form = { title: "", image: DEFAULT_BRAND_IMAGE, opacity: BRAND_OPACITY.def, scale: BRAND_SCALE.def, place: "center", tone: "original", sponsor: null, tables: ["DAEDAE", "JUNGDAE_KR"], startsAt: null, endsAt: null, enabled: true };

export default function BilliardsTableBrandView() {
    const { toast } = useToast();
    const qc = useQueryClient();
    const q = useQuery<Data>({ queryKey: KEY });
    const [editing, setEditing] = useState<string | "new" | null>(null);
    const [form, setForm] = useState<Form>(EMPTY);
    const rows = Array.isArray(q.data?.rows) ? q.data!.rows : [];
    const now = q.data?.now ?? Date.now();
    const done = () => { void qc.invalidateQueries({ queryKey: KEY }); };

    const open = (r: TableBrandRow | null) => {
        setEditing(r ? r.id : "new");
        setForm(r ? { title: r.title, image: r.image, opacity: r.opacity, scale: r.scale, place: r.place, tone: r.tone, sponsor: r.sponsor, tables: [...r.tables], startsAt: r.startsAt, endsAt: r.endsAt, enabled: r.enabled } : { ...EMPTY, title: "", sponsor: "" });
    };
    const save = useMutation({
        mutationFn: () => apiRequest(editing === "new" ? API : `${API}/${editing}`, { method: editing === "new" ? "POST" : "PATCH", body: { ...form, sponsor: form.sponsor?.trim() ? form.sponsor.trim() : null } }),
        onSuccess: () => { toast({ title: editing === "new" ? "캠페인을 만들었어요" : "고쳤어요", description: "게임에는 1분 안에 보여요 — 열려 있던 게임 화면은 다시 열면 바뀝니다." }); setEditing(null); done(); },
        onError: (e) => toast({ title: "저장하지 못했어요", description: errMsg(e), variant: "destructive" }),
    });
    const toggle = useMutation({
        mutationFn: (r: TableBrandRow) => apiRequest(`${API}/${r.id}`, { method: "PATCH", body: { enabled: !r.enabled } }),
        onSuccess: done,
        onError: (e) => toast({ title: "바꾸지 못했어요", description: errMsg(e), variant: "destructive" }),
    });
    const remove = useMutation({
        mutationFn: (r: TableBrandRow) => apiRequest(`${API}/${r.id}`, { method: "DELETE" }),
        onSuccess: () => { toast({ title: "지웠어요" }); setEditing(null); done(); },
        onError: (e) => toast({ title: "지우지 못했어요", description: errMsg(e), variant: "destructive" }),
    });
    const onRemove = async (r: TableBrandRow) => {
        if (!(await appConfirm({ message: `'${r.title}' 캠페인을 지울까요? 올린 그림도 다른 캠페인이 안 쓰면 같이 지워집니다.`, tone: "danger", confirmText: "지우기" }))) return;
        remove.mutate(r);
    };

    if (q.isLoading) return <EmptyState>불러오는 중…</EmptyState>;
    if (q.isError) return <EmptyState>불러오지 못했어요 — {errMsg(q.error)}</EmptyState>;
    const live = q.data?.live ?? { DAEDAE: null, JUNGDAE_KR: null };
    return (
        <div className="space-y-4" data-testid="admin-table-brand">
            <Panel className="p-4">
                <p className="text-[13px] font-bold text-black/80">지금 게임에 걸린 것</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-black/45">기간 있는 캠페인(협찬)이 기간 없는 '랭큐 기본'보다 먼저 걸립니다. 바꾸면 게임에는 1분 안에 보여요(열려 있던 게임 화면은 다시 열면).</p>
                <div className="mt-3 grid max-w-[300px] grid-cols-2 gap-4">
                    {BRAND_TABLES.map((t) => (
                        <div key={t}>
                            <ClothPreview table={t} brand={live[t]} />
                            <p className="mt-1.5 text-center text-[12px] font-semibold text-black/60">{TABLE_NAME[t]}</p>
                            <p className="truncate text-center text-[11.5px] text-black/40">{live[t] ? rows.find((r) => r.id === live[t]!.id)?.title ?? "" : "로고 없음"}{live[t]?.sponsor ? ` · ${live[t]!.sponsor} 협찬` : ""}</p>
                        </div>
                    ))}
                </div>
            </Panel>

            <Panel className="divide-y divide-black/[0.06]">
                <div className="flex items-center justify-between gap-2 p-4">
                    <p className="text-[13px] font-bold text-black/80">캠페인 {rows.length}</p>
                    <button data-admin-write onClick={() => open(null)} className="h-9 rounded-lg bg-brand px-3 text-[13px] font-bold text-white hover:bg-brand-strong" data-testid="brand-new">새 캠페인</button>
                </div>
                {rows.map((r) => {
                    const st = statusOf(r, now);
                    const on = BRAND_TABLES.some((t) => live[t]?.id === r.id);
                    return (
                        <div key={r.id} className="flex items-center gap-3 p-4" data-testid="brand-row">
                            <span className="flex h-12 w-20 shrink-0 items-center justify-center rounded-lg bg-[#1d5fb3] p-1"><img src={r.image} alt="" className="max-h-full max-w-full object-contain" style={{ opacity: Math.min(1, r.opacity * 4) }} /></span>
                            <div className="min-w-0 flex-1">
                                <p className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-bold text-black/85">{r.title} {on ? <Pill tone="brand">지금 걸림</Pill> : <Pill tone={st.tone}>{st.label}</Pill>}{r.sponsor && <Pill tone="info">{r.sponsor} 협찬</Pill>}</p>
                                <p className="mt-0.5 text-[12px] text-black/50">{r.tables.map((t) => TABLE_NAME[t]).join(" · ")} · {r.place === "center" ? "가운데" : "양 끝"} · {Math.round(r.opacity * 100)}% · 폭 {Math.round(r.scale * 100)}%{r.tone === "cloth" ? " · 천 색" : ""}</p>
                                <p className="text-[12px] text-black/40">{r.startsAt || r.endsAt ? `${r.startsAt ? kstDateTime(new Date(r.startsAt).toISOString()) : "지금부터"} ~ ${r.endsAt ? kstDateTime(new Date(r.endsAt).toISOString()) : "계속"}` : "기간 없음(늘)"}</p>
                            </div>
                            <div className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                                <button onClick={() => open(r)} className="h-8 rounded-lg border border-black/10 px-2.5 text-[12.5px] font-bold text-black/70 hover:bg-black/[0.03]">고치기</button>
                                <button data-admin-write onClick={() => toggle.mutate(r)} disabled={toggle.isPending} className="h-8 rounded-lg border border-black/10 px-2.5 text-[12.5px] font-bold text-black/70 hover:bg-black/[0.03] disabled:opacity-40">{r.enabled ? "끄기" : "켜기"}</button>
                            </div>
                        </div>
                    );
                })}
            </Panel>

            {editing && <Editor form={form} setForm={setForm} isNew={editing === "new"} saving={save.isPending}
                onSave={() => save.mutate()} onCancel={() => setEditing(null)}
                onRemove={editing !== "new" ? () => { const r = rows.find((x) => x.id === editing); if (r) void onRemove(r); } : undefined} />}
        </div>
    );
}

function Editor({ form, setForm, isNew, saving, onSave, onCancel, onRemove }: {
    form: Form; setForm: (f: Form) => void; isNew: boolean; saving: boolean; onSave: () => void; onCancel: () => void; onRemove?: () => void;
}) {
    const { toast } = useToast();
    const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });
    const [draft, setDraft] = useState<(BrandDraft & { bg: BgKey; src: Blob }) | null>(null);
    const [over, setOver] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => { ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, []);

    const take = async (blob: Blob, bg: BgKey | "auto" = "auto") => {
        try { setDraft({ ...(await prepBrandImage(blob, bg)), src: blob }); } catch (e) { toast({ title: "그림을 읽지 못했어요", description: errMsg(e), variant: "destructive" }); }
    };
    const upload = useMutation({
        mutationFn: (d: BrandDraft) => apiRequest(`${API}/image`, { method: "POST", body: { png: d.png } }),
        onSuccess: (r: any) => { if (typeof r?.url === "string") { setForm({ ...form, image: r.url }); setDraft(null); toast({ title: "그림을 올렸어요", description: "저장을 눌러야 캠페인에 들어갑니다." }); } },
        onError: (e) => toast({ title: "그림을 올리지 못했어요", description: errMsg(e), variant: "destructive" }),
    });
    const onDrop = (e: DragEvent) => {
        e.preventDefault(); setOver(false);
        const f = Array.from(e.dataTransfer.files ?? []).find((x) => x.type.startsWith("image/"));
        if (f) void take(f); else toast({ title: "그림 파일을 놓아 주세요", variant: "destructive" });
    };
    const preview: TableBrandView = { id: "preview", image: draft?.png ?? form.image, opacity: form.opacity, scale: form.scale, place: form.place, tone: form.tone, sponsor: form.sponsor };
    const toggleTable = (t: BrandTableId) => set("tables", form.tables.includes(t) ? form.tables.filter((x) => x !== t) : [...form.tables, t]);
    const field = "h-9 w-full rounded-lg border border-black/10 bg-white px-3 text-[13px]";
    const seg = (on: boolean) => cn("h-9 flex-1 rounded-lg border text-[13px] font-bold", on ? "border-brand bg-brand/10 text-brand" : "border-black/10 text-black/60");

    return (
        <div ref={ref}>
            <Panel className="p-4" >
                <p className="text-[14px] font-bold text-black/85">{isNew ? "새 캠페인" : "캠페인 고치기"}</p>
                <div className="mt-3 grid gap-5 md:grid-cols-[1fr_260px]">
                    <div className="space-y-3.5">
                        <label className="block text-[12px] font-semibold text-black/55">이름(관리용)
                            <input className={cn(field, "mt-1")} value={form.title} maxLength={40} onChange={(e) => set("title", e.target.value)} placeholder="예: ○○큐 11월 협찬" />
                        </label>
                        <label className="block text-[12px] font-semibold text-black/55">협찬 이름 — 적으면 게임 화면에 '○○ 협찬'이 뜹니다(우리 로고면 비워 두세요)
                            <input className={cn(field, "mt-1")} value={form.sponsor ?? ""} maxLength={30} onChange={(e) => set("sponsor", e.target.value)} placeholder="예: ○○큐" />
                        </label>

                        <div className={cn("rounded-xl border border-dashed p-3 transition-colors", over ? "border-brand bg-brand/[0.04]" : "border-black/15")}
                            onDragOver={(e) => { e.preventDefault(); if (!over) setOver(true); }} onDragLeave={() => setOver(false)} onDrop={onDrop} data-testid="brand-drop">
                            <div className="flex items-center gap-3">
                                <span className="flex h-12 w-24 shrink-0 items-center justify-center rounded-lg bg-[#1d5fb3] p-1"><img src={draft?.png ?? form.image} alt="" className="max-h-full max-w-full object-contain" /></span>
                                <p className="min-w-0 flex-1 text-[12px] leading-relaxed text-black/50">{draft ? `${draft.width}×${draft.height}px · ${Math.max(1, Math.round(draft.bytes / 1024))}KB — 아직 안 올렸어요` : "그림을 여기로 끌어다 놓거나 파일을 고르세요. 투명 바탕 PNG 가 가장 좋고, 검은 · 흰 바탕은 지울 수 있어요."}</p>
                                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void take(f); }} />
                                <button onClick={() => fileRef.current?.click()} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 text-[13px] font-bold text-black/70"><LucideUpload className="h-4 w-4" />파일</button>
                            </div>
                            {draft && (
                                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                                    {(["none", "black", "white"] as const).map((b) => (
                                        <button key={b} onClick={() => void take(draft.src, b)} className={cn("h-8 rounded-lg border px-2.5 text-[12px] font-bold", draft.bg === b ? "border-brand bg-brand/10 text-brand" : "border-black/10 text-black/55")}>
                                            {b === "none" ? "바탕 그대로" : b === "black" ? "검은 바탕 지우기" : "흰 바탕 지우기"}
                                        </button>
                                    ))}
                                    <button data-admin-write onClick={() => upload.mutate(draft)} disabled={upload.isPending} className="ml-auto h-8 rounded-lg bg-brand px-3 text-[12.5px] font-bold text-white disabled:opacity-40">{upload.isPending ? "올리는 중…" : "이 그림 올리기"}</button>
                                </div>
                            )}
                            {form.image !== DEFAULT_BRAND_IMAGE && !draft && (
                                <button onClick={() => set("image", DEFAULT_BRAND_IMAGE)} className="mt-2 text-[12px] font-semibold text-black/45 underline">랭큐 기본 로고로 되돌리기</button>
                            )}
                        </div>

                        <div>
                            <p className="text-[12px] font-semibold text-black/55">걸 테이블</p>
                            <div className="mt-1 flex gap-2">{BRAND_TABLES.map((t) => <button key={t} onClick={() => toggleTable(t)} className={seg(form.tables.includes(t))}>{TABLE_NAME[t]}</button>)}</div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div><p className="text-[12px] font-semibold text-black/55">자리</p>
                                <div className="mt-1 flex gap-2"><button onClick={() => set("place", "center")} className={seg(form.place === "center")}>가운데</button><button onClick={() => set("place", "ends")} className={seg(form.place === "ends")}>양 끝</button></div></div>
                            <div><p className="text-[12px] font-semibold text-black/55">색</p>
                                <div className="mt-1 flex gap-2"><button onClick={() => set("tone", "original")} className={seg(form.tone === "original")}>그림 그대로</button><button onClick={() => set("tone", "cloth")} className={seg(form.tone === "cloth")}>천 색에 녹이기</button></div></div>
                        </div>
                        <label className="block text-[12px] font-semibold text-black/55">진하기 {Math.round(form.opacity * 100)}%
                            <input type="range" className="mt-1 w-full accent-brand" min={BRAND_OPACITY.min * 100} max={BRAND_OPACITY.max * 100} value={Math.round(form.opacity * 100)} onChange={(e) => set("opacity", Number(e.target.value) / 100)} />
                        </label>
                        <label className="block text-[12px] font-semibold text-black/55">크기(테이블 폭의) {Math.round(form.scale * 100)}%
                            <input type="range" className="mt-1 w-full accent-brand" min={BRAND_SCALE.min * 100} max={BRAND_SCALE.max * 100} value={Math.round(form.scale * 100)} onChange={(e) => set("scale", Number(e.target.value) / 100)} />
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="block text-[12px] font-semibold text-black/55">시작(비우면 지금부터)
                                <input type="datetime-local" className={cn(field, "mt-1")} value={toLocalInput(form.startsAt)} onChange={(e) => set("startsAt", fromLocalInput(e.target.value))} />
                            </label>
                            <label className="block text-[12px] font-semibold text-black/55">끝(비우면 계속)
                                <input type="datetime-local" className={cn(field, "mt-1")} value={toLocalInput(form.endsAt)} onChange={(e) => set("endsAt", fromLocalInput(e.target.value))} />
                            </label>
                        </div>
                        <label className="inline-flex items-center gap-2 text-[13px] font-semibold text-black/70"><input type="checkbox" className="accent-brand" checked={form.enabled} onChange={(e) => set("enabled", e.target.checked)} />켜기</label>
                    </div>
                    <div>
                        <p className="text-[12px] font-semibold text-black/55">미리 보기</p>
                        <div className="mt-1 grid grid-cols-2 gap-3">
                            {BRAND_TABLES.map((t) => <div key={t}><ClothPreview table={t} brand={form.tables.includes(t) ? preview : null} /><p className="mt-1 text-center text-[11.5px] text-black/45">{TABLE_NAME[t]}</p></div>)}
                        </div>
                        <p className="mt-2 text-[11.5px] leading-relaxed text-black/40">공은 로고 위를 지나가고 그림자도 그 위에 집니다. 조준 · 물리와는 상관없어요. 너무 진하면 공이 덜 보이니 15% 안팎을 권해요.</p>
                    </div>
                </div>
                <div className="mt-4 flex gap-2">
                    {onRemove && <button data-admin-write onClick={onRemove} className="h-10 rounded-lg border border-red-500/30 px-3 text-[13px] font-bold text-red-600">지우기</button>}
                    <button onClick={onCancel} disabled={saving} className="ml-auto h-10 rounded-lg border border-black/10 px-4 text-[13px] font-bold text-black/60">취소</button>
                    <button data-admin-write onClick={onSave} disabled={saving || !!draft || !form.title.trim() || !form.tables.length} data-testid="brand-save"
                        className="h-10 rounded-lg bg-brand px-5 text-[13px] font-bold text-white hover:bg-brand-strong disabled:opacity-40">{saving ? "저장하는 중…" : "저장"}</button>
                </div>
                {draft && <p className="mt-2 text-right text-[11.5px] text-amber-700">새 그림을 먼저 올려 주세요(‘이 그림 올리기’).</p>}
            </Panel>
        </div>
    );
}
