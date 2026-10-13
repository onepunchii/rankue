/**
 * 스코어카드로 채우기(2026-10-13) — 앱에서 받은 스코어카드 그림을 올리면 읽어서 표로 보여 주고, 방장이 확인한 뒤 점수판에 넣는다.
 *
 * 오너가 정한 것: 받는 것은 스마트스코어 꼴의 디지털 카드뿐(수기는 안 받는다) · 카메라가 아니라 **그림 올리기**.
 * 읽은 것은 초안이다 — 여기서는 아무것도 저장되지 않고, '점수판에 넣기'를 눌러야 지금의 점수 저장 길로 들어간다.
 * 칸은 카드와 견주기 쉽게 **카드에 적힌 꼴**(파 기준 0 · 1 · −1)로 보여 주고, 고칠 때 타수를 같이 적는다.
 * 칸의 색: 확정(그대로) · 확인 필요(주황 — 아홉 홀 합이 카드와 다르거나, 가려진 칸을 합에서 계산한 값) · 빈칸(점선) · 내가 고친 칸(초록).
 * 계산 · 문구: shared/golfScorecardScan. ⚠️ 리터럴 색만. 글자 12px 이상, 굵기는 semibold 까지.
 */
import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { appConfirm } from "@/components/AppDialog";
import { LucideCheck, LucideImage, LucideLoader2, LucideMinus, LucidePlus, LucideX } from "@/lib/icons";
import { isValidStroke } from "@shared/golfMatch";
import { SCAN_COPY, SCAN_MAX_EDGE, applyScanRows, guessSeats, type ScanCell, type ScanDraft, type SumCheck } from "@shared/golfScorecardScan";

interface Player { memberId: string; name?: string | null; scores?: unknown }
/** 화면의 칸 — 사람이 손댄 칸은 mine */
type Cell = ScanCell & { mine?: boolean };
interface Row { label: string | null; seat: string | null; cells: Cell[]; out: SumCheck; in: SumCheck }

/** 올릴 그림을 줄인다 — 긴 변 SCAN_MAX_EDGE 까지, 흰 바탕의 JPEG 로(위치 정보 같은 꼬리표도 이때 떨어진다) */
async function shrink(file: File): Promise<string> {
    const url = URL.createObjectURL(file);
    try {
        const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("image")); i.src = url; });
        const k = Math.min(1, SCAN_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight, 1));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.naturalWidth * k));
        c.height = Math.max(1, Math.round(img.naturalHeight * k));
        const g = c.getContext("2d");
        if (!g) throw new Error("canvas");
        g.fillStyle = "#FFFFFF";
        g.fillRect(0, 0, c.width, c.height);
        g.drawImage(img, 0, 0, c.width, c.height);
        return c.toDataURL("image/jpeg", 0.88);
    } finally {
        URL.revokeObjectURL(url);
    }
}

/** 카드에 적힌 꼴로 — 파를 아는 홀은 파 기준(0 · 1 · −1), 모르면 타수 */
const cardText = (strokes: number, par: number | null) => {
    if (!strokes) return "";
    if (par == null) return String(strokes);
    const n = strokes - par;
    return n < 0 ? `−${-n}` : String(n);
};

/** 아홉 홀 합 — 카드의 합(타수)과 지금 표의 합. 카드에 합이 없으면 want 는 null */
function halfSum(cells: readonly Cell[], from: number, chk: SumCheck) {
    const part = cells.slice(from, from + 9);
    const now = part.every((c) => c.strokes > 0) ? part.reduce((a, c) => a + c.strokes, 0) : null;
    const want = chk.read != null && chk.off != null ? chk.read - chk.off : null;
    return { now, want, ok: now != null && want != null ? now === want : null };
}

export function ScanSheet({ matchId, players, pars, parKnown, onApply, onClose }: {
    matchId: string;
    players: readonly Player[];
    pars: readonly number[];
    parKnown: readonly boolean[];
    /** 고친 점수를 점수판에 넣는다(저장까지) */
    onApply: (next: Player[]) => Promise<unknown>;
    onClose: () => void;
}) {
    const [step, setStep] = useState<"pick" | "reading" | "confirm">("pick");
    const [error, setError] = useState<string | null>(null);
    const [draft, setDraft] = useState<ScanDraft | null>(null);
    const [rows, setRows] = useState<Row[]>([]);
    const [sel, setSel] = useState<{ r: number; h: number } | null>(null);
    const [saving, setSaving] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);
    const parAt = (h: number) => (parKnown[h] ? pars[h] : null);

    const onFile = async (file: File | undefined) => {
        if (!file) return;
        setError(null);
        setStep("reading");
        try {
            const image = await shrink(file);
            const res = await apiRequest(`/api/hiq/golf/match/${matchId}/scan`, { method: "POST", body: { image }, timeoutMs: 20_000 });
            const d = res?.draft as ScanDraft | undefined;
            if (!d?.rows?.length) throw new Error(SCAN_COPY.none);
            const seats = guessSeats(d.rows.map((r) => r.label), players);
            setDraft(d);
            setRows(d.rows.map((r, i) => ({ label: r.label, seat: seats[i], cells: r.cells, out: r.out, in: r.in })));
            setSel(null);
            setStep("confirm");
        } catch (e: any) {
            setError(e?.message === "image" || e?.message === "canvas" ? "그림을 열지 못했어요. 다른 그림으로 해 주세요." : (e?.message || SCAN_COPY.failed));
            setStep("pick");
        } finally {
            if (fileRef.current) fileRef.current.value = "";
        }
    };

    const setCell = (r: number, h: number, strokes: number) => {
        if (strokes !== 0 && !isValidStroke(strokes)) return;
        setRows((prev) => prev.map((row, i) => {
            if (i !== r) return row;
            const cells: Cell[] = row.cells.map((c, j) => (j !== h ? c : { strokes, state: strokes ? "ok" : "empty", mine: true }));
            // 고쳐서 아홉 홀 합이 카드와 맞게 됐으면, '합이 다르다'던 그 아홉 홀의 표시는 풀린다(계산해 넣은 칸은 그대로 둔다)
            for (const from of [0, 9]) {
                if (halfSum(cells, from, from === 0 ? row.out : row.in).ok !== true) continue;
                for (let j = from; j < from + 9; j++) if (cells[j].state === "check" && cells[j].why !== "derived") cells[j] = { strokes: cells[j].strokes, state: "ok" };
            }
            return { ...row, cells };
        }));
    };
    const setSeat = (r: number, seat: string | null) => {
        // 한 사람에게 한 줄 — 다른 줄이 이미 잡고 있으면 그쪽을 푼다
        setRows((prev) => prev.map((row, i) => (i === r ? { ...row, seat } : seat && row.seat === seat ? { ...row, seat: null } : row)));
    };

    const seated = rows.filter((r) => r.seat);
    const unchecked = useMemo(() => seated.reduce((n, r) => n + r.cells.filter((c) => c.state === "check").length, 0), [seated]);

    const apply = async () => {
        if (!seated.length || saving) return;
        if (unchecked > 0) {
            const go = await appConfirm({ title: `확인하지 않은 칸이 ${unchecked}개 있어요`, message: "주황색 칸은 카드와 다를 수 있어요. 그대로 넣을까요?", confirmText: "그대로 넣기", cancelText: "더 볼게요" });
            if (!go) return;
        }
        setSaving(true);
        try {
            await onApply(applyScanRows(players, rows.map((r) => ({ memberId: r.seat, strokes: r.cells.map((c) => c.strokes) }))));
            onClose();
        } catch {
            /* 저장 실패는 점수판의 알림이 말한다 */
        } finally {
            setSaving(false);
        }
    };

    const picked = sel ? rows[sel.r]?.cells[sel.h] : null;

    return (
        <div role="dialog" aria-modal="true" aria-label={SCAN_COPY.title} className="fixed inset-0 z-[60] flex flex-col bg-[#050505] text-[#FFFFFF]" data-testid="scan-sheet">
            <div className="h-[env(safe-area-inset-top)] shrink-0" aria-hidden />
            <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[#FFFFFF0F] px-4">
                <h2 className="flex-1 text-[16px] font-semibold">{SCAN_COPY.title}</h2>
                <button type="button" onClick={onClose} aria-label="닫기" className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFFFFF0F] active:bg-[#FFFFFF1F]" data-testid="scan-close">
                    <LucideX className="h-5 w-5 text-[#FFFFFFB3]" />
                </button>
            </header>

            {step === "pick" && (
                <div className="flex-1 overflow-y-auto px-4 py-5">
                    <p className="text-[14px] leading-relaxed text-[#FFFFFFD9]">{SCAN_COPY.lead}</p>
                    <button type="button" onClick={() => fileRef.current?.click()} data-testid="scan-pick"
                        className="mt-4 flex w-full flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-[#FFFFFF33] bg-[#FFFFFF08] py-10 active:bg-[#FFFFFF12]">
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#64DD1726]"><LucideImage className="h-6 w-6 text-[#9BEF5C]" /></span>
                        <span className="text-[15px] font-semibold">{SCAN_COPY.pick}</span>
                    </button>
                    {/* 카메라를 바로 열지 않는다(capture 없음) — 앱에서 저장해 둔 카드 그림을 고른다 */}
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { void onFile(e.target.files?.[0]); }} data-testid="scan-file" />
                    {error && <p role="alert" className="mt-3 rounded-xl bg-[#FF6E6E1F] px-3.5 py-3 text-[13px] leading-relaxed text-[#FF9C9C]" data-testid="scan-error">{error}</p>}
                    <ul className="mt-5 space-y-2 text-[13px] leading-relaxed text-[#FFFFFF99]">
                        <li>· {SCAN_COPY.accept}</li>
                        <li>· 카드 전체가 나온 그림이 가장 잘 읽혀요.</li>
                        <li>· {SCAN_COPY.privacy}</li>
                    </ul>
                </div>
            )}

            {step === "reading" && (
                <div className="flex flex-1 flex-col items-center justify-center gap-3" role="status" data-testid="scan-reading">
                    <LucideLoader2 className="h-8 w-8 animate-spin text-[#9BEF5C]" />
                    <p className="text-[14px] text-[#FFFFFFB3]">{SCAN_COPY.reading}</p>
                </div>
            )}

            {step === "confirm" && draft && (
                <>
                    <div className="flex-1 overflow-y-auto px-4 pb-6 pt-4">
                        {draft.notices.map((n) => (
                            <p key={n} role="alert" className="mb-3 rounded-xl bg-[#FFB02E1F] px-3.5 py-3 text-[13px] leading-relaxed text-[#FFD08A]" data-testid={`scan-notice-${n}`}>{SCAN_COPY.notices[n]}</p>
                        ))}
                        <p className="mb-3 text-[13px] leading-relaxed text-[#FFFFFF99]">
                            카드에 적힌 그대로(파 기준) 보여 드려요. <span className="text-[#FFD08A]">주황색 칸</span>은 카드와 견줘 보고, 다르면 눌러서 고쳐 주세요.
                        </p>

                        {rows.map((row, r) => (
                            <section key={r} className="mb-4 rounded-2xl border border-[#FFFFFF14] bg-[#FFFFFF08] p-3" data-testid={`scan-row-${r}`}>
                                <p className="text-[12px] text-[#FFFFFF80]">{SCAN_COPY.seat}{row.label ? <span className="ml-1.5 text-[#FFFFFFB3]">카드의 이름 · {row.label}</span> : null}</p>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {players.map((p) => {
                                        const on = row.seat === p.memberId;
                                        return (
                                            <button key={p.memberId} type="button" aria-pressed={on} onClick={() => setSeat(r, on ? null : p.memberId)} data-testid={`scan-seat-${r}-${p.memberId}`}
                                                className={cn("h-9 max-w-[9rem] truncate rounded-full px-3 text-[13px]", on ? "bg-[#64DD17] font-semibold text-[#051907]" : "bg-[#FFFFFF0F] text-[#FFFFFFCC] active:bg-[#FFFFFF1F]")}>
                                                {p.name || "이름 없음"}
                                            </button>
                                        );
                                    })}
                                    {!row.seat && <span className="flex h-9 items-center px-1 text-[12px] text-[#FFFFFF66]">고르지 않으면 넣지 않아요</span>}
                                </div>

                                {[0, 9].map((from) => {
                                    const sum = halfSum(row.cells, from, from === 0 ? row.out : row.in);
                                    return (
                                        <div key={from} className="mt-3">
                                            <div className="grid grid-cols-[repeat(9,minmax(0,1fr))_3rem] gap-1 text-center text-[12px] text-[#FFFFFF66]" aria-hidden>
                                                {Array.from({ length: 9 }, (_, i) => <span key={i}>{from + i + 1}</span>)}
                                                <span>합</span>
                                            </div>
                                            <div className="mt-1 grid grid-cols-[repeat(9,minmax(0,1fr))_3rem] gap-1">
                                                {row.cells.slice(from, from + 9).map((c, i) => {
                                                    const h = from + i;
                                                    const on = sel?.r === r && sel.h === h;
                                                    const hot = c.state === "check" && (c.why === "sign" || c.why === "derived");
                                                    return (
                                                        <button key={h} type="button" onClick={() => setSel(on ? null : { r, h })} data-testid={`scan-cell-${r}-${h}`} data-state={c.mine ? "mine" : c.state}
                                                            aria-label={`${h + 1}번 홀 ${c.strokes ? `${c.strokes}타` : "빈칸"}${c.state === "check" ? " · 확인 필요" : ""}`}
                                                            className={cn("h-10 rounded-lg border text-[14px] tabular-nums",
                                                                c.mine ? "border-[#64DD1766] bg-[#64DD171F] text-[#B6F28A]"
                                                                    : c.state === "empty" ? "border-dashed border-[#FFFFFF40] bg-transparent text-[#FFFFFF59]"
                                                                        : hot ? "border-[#FFB02E] bg-[#FFB02E33] font-semibold text-[#FFD08A]"
                                                                            : c.state === "check" ? "border-[#FFB02E80] bg-transparent text-[#FFD08A]"
                                                                                : "border-transparent bg-[#FFFFFF0F] text-[#FFFFFF]",
                                                                on && "ring-2 ring-[#FFFFFF]")}>
                                                            {c.strokes ? cardText(c.strokes, parAt(h)) : "·"}
                                                        </button>
                                                    );
                                                })}
                                                <span className={cn("flex h-10 items-center justify-center rounded-lg text-[13px] tabular-nums", sum.ok === false ? "bg-[#FFB02E26] text-[#FFD08A]" : sum.ok ? "text-[#9BEF5C]" : "text-[#FFFFFF99]")} data-testid={`scan-sum-${r}-${from}`}>
                                                    {sum.now ?? "–"}
                                                </span>
                                            </div>
                                            {sum.ok === false && <p className="mt-1.5 text-[12px] text-[#FFD08A]">{from === 0 ? "앞" : "뒤"} 9홀 합이 {sum.now}인데 카드에는 {sum.want}이에요.</p>}
                                        </div>
                                    );
                                })}
                            </section>
                        ))}
                    </div>

                    {/* 고르는 칸 — 카드의 숫자와 타수를 같이 보여 준다 */}
                    {sel && picked && (
                        <div className="shrink-0 border-t border-[#FFFFFF14] bg-[#101010] px-4 py-3" data-testid="scan-editor">
                            <p className="text-[13px] text-[#FFFFFFB3]">
                                {sel.h + 1}번 홀{parAt(sel.h) != null ? ` · 파 ${parAt(sel.h)}` : ""}
                                {picked.state === "check" && picked.why ? <span className="ml-2 text-[#FFD08A]">{SCAN_COPY.why[picked.why]}</span> : null}
                            </p>
                            <div className="mt-2 flex items-center gap-2">
                                <button type="button" aria-label="한 타 줄이기" onClick={() => setCell(sel.r, sel.h, Math.max(1, (picked.strokes || (parAt(sel.h) ?? 4)) - 1))} className="flex h-11 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFFFFF14] active:bg-[#FFFFFF24]" data-testid="scan-minus"><LucideMinus className="h-5 w-5" /></button>
                                <span className="min-w-[3.25rem] whitespace-nowrap text-center text-[18px] font-semibold tabular-nums" data-testid="scan-value">{picked.strokes ? `${picked.strokes}타` : "빈칸"}</span>
                                <button type="button" aria-label="한 타 늘리기" onClick={() => setCell(sel.r, sel.h, picked.strokes ? picked.strokes + 1 : (parAt(sel.h) ?? 4))} className="flex h-11 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFFFFF14] active:bg-[#FFFFFF24]" data-testid="scan-plus"><LucidePlus className="h-5 w-5" /></button>
                                {picked.alt != null && !picked.mine && (
                                    <button type="button" onClick={() => setCell(sel.r, sel.h, picked.alt as number)} className="h-11 shrink-0 whitespace-nowrap rounded-xl bg-[#FFB02E33] px-2.5 text-[13px] text-[#FFD08A] active:bg-[#FFB02E4D]" data-testid="scan-alt">
                                        {cardText(picked.alt, parAt(sel.h))} · {picked.alt}타로
                                    </button>
                                )}
                                {picked.strokes > 0 && !picked.mine && (
                                    <button type="button" onClick={() => setCell(sel.r, sel.h, picked.strokes)} className="ml-auto flex h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-xl bg-[#64DD1726] px-2.5 text-[13px] text-[#B6F28A] active:bg-[#64DD1740]" data-testid="scan-keep">
                                        <LucideCheck className="h-4 w-4" />맞아요
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="shrink-0 border-t border-[#FFFFFF14] bg-[#050505] px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
                        <button type="button" disabled={!seated.length || saving} onClick={() => { void apply(); }} data-testid="scan-apply"
                            className={cn("flex h-[52px] w-full items-center justify-center rounded-2xl text-[15px] font-semibold", seated.length && !saving ? "bg-[#64DD17] text-[#051907] active:bg-[#58C414]" : "bg-[#FFFFFF14] text-[#FFFFFF59]")}>
                            {saving ? "넣는 중…" : !seated.length ? "줄마다 누구인지 골라 주세요" : unchecked ? `${SCAN_COPY.apply} · 확인 필요 ${unchecked}칸` : SCAN_COPY.apply}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
