import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { LucideShare2, LucideDownload, LucideUsers, LucideChevronRight } from "@/lib/icons";

/* ============================================================================
 * 경기 결과 공유 카드
 *
 * 당구는 단톡방에 결과 이미지를 던지는 문화가 강해서, 결과 카드 한 장이
 * 가장 싼 유입 경로다. 그래서 화면 카드와 "실제로 공유되는 PNG"를 같은
 * 레이아웃/같은 색으로 맞춰 그린다.
 *
 * 이미지는 외부 의존성 없이 Canvas 2D 로 직접 그린다(html2canvas 류 미사용).
 * 캔버스에서 웹폰트를 기다리면 첫 공유가 깨질 수 있어 시스템 폰트만 쓴다.
 * ========================================================================== */

export interface SharePlayer {
    name: string;
    score: number;
    target: number;
    /** 이미 포맷된 에버리지 문자열 ("1.25") */
    avg: string;
    highRun: number;
    win: boolean;
}

export interface ShareResultData {
    players: SharePlayer[];
    innings: number;
    /** "3c" | "4c" */
    gameType?: string | null;
    isPractice?: boolean;
    playedAt?: string | number | Date | null;
}

/* ---------------------------------------------------------------- 디자인 값 */

const CREAM = "#f2f0eb";
const BRAND = "#006241";
const INK_1 = "rgba(0,0,0,0.87)";
const INK_3 = "rgba(0,0,0,0.55)";
const INK_4 = "rgba(0,0,0,0.40)";
const SITE = "rankue.co.kr";

// BilliardBall.tsx 의 3D 글로시 팔레트 + 4번 슬롯(파랑, PlayerCard 테마와 동일 계열).
// 화면 카드와 캔버스가 같은 값을 쓰도록 한 곳에 둔다.
const BALLS = [
    { hi: "#ffffff", base: "#efece2", lo: "#c2bfb2" }, // 1번 - 흰공
    { hi: "#ffe98a", base: "#f4c20d", lo: "#a97e00" }, // 2번 - 노란공
    { hi: "#ff9382", base: "#e02d2d", lo: "#8c1212" }, // 3번 - 빨간공
    { hi: "#93b4ff", base: "#2563eb", lo: "#12357f" }, // 4번 - 파란공
];

const FONT_STACK =
    '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

const CANVAS_SIZE = 1080;

/* ------------------------------------------------------------ 캔버스 유틸 */

/** 폰트 지정이 파싱에 실패하면 캔버스는 조용히 10px 로 남는다 → 크기 확인 후 폴백. */
function setFont(ctx: CanvasRenderingContext2D, weight: number, size: number) {
    ctx.font = `${weight} ${size}px ${FONT_STACK}`;
    if (!ctx.font.includes(`${size}px`)) ctx.font = `${weight} ${size}px sans-serif`;
}

function roundRectPath(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
) {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    const anyCtx = ctx as any;
    if (typeof anyCtx.roundRect === "function") {
        anyCtx.roundRect(x, y, w, h, rr);
        return;
    }
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
}

/** 이름이 길면 점수 영역을 침범하므로 말줄임 처리. 폰트는 호출 전에 세팅되어 있어야 한다. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
    if (maxW <= 0) return "";
    if (ctx.measureText(text).width <= maxW) return text;
    let s = text;
    while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
    return `${s}…`;
}

function drawBall(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    p: { hi: string; base: string; lo: string },
) {
    const g = ctx.createRadialGradient(cx - r * 0.32, cy - r * 0.4, r * 0.06, cx, cy, r * 1.06);
    g.addColorStop(0, p.hi);
    g.addColorStop(0.46, p.base);
    g.addColorStop(1, p.lo);

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.20)";
    ctx.shadowBlur = r * 0.3;
    ctx.shadowOffsetY = r * 0.16;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();

    // 스페큘러 하이라이트
    const hx = cx - r * 0.3;
    const hy = cy - r * 0.38;
    const s = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 0.44);
    s.addColorStop(0, "rgba(255,255,255,0.92)");
    s.addColorStop(1, "rgba(255,255,255,0)");
    ctx.beginPath();
    ctx.arc(hx, hy, r * 0.44, 0, Math.PI * 2);
    ctx.fillStyle = s;
    ctx.fill();
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/* -------------------------------------------------------------- 공통 라벨 */

function typeLabelOf(gameType?: string | null) {
    if (gameType === "4c") return "4구";
    if (gameType === "3c") return "3구";
    return "당구";
}

function dateLabelOf(playedAt?: string | number | Date | null) {
    const d = playedAt ? new Date(playedAt) : new Date();
    const safe = Number.isNaN(d.getTime()) ? new Date() : d;
    const mm = String(safe.getMonth() + 1).padStart(2, "0");
    const dd = String(safe.getDate()).padStart(2, "0");
    return `${safe.getFullYear()}.${mm}.${dd}`;
}

function fileSlugOf(playedAt?: string | number | Date | null) {
    return dateLabelOf(playedAt).replace(/\./g, "");
}

/* ------------------------------------------------------------ 캔버스 그리기 */

export function drawShareCard(ctx: CanvasRenderingContext2D, data: ShareResultData) {
    const S = CANVAS_SIZE;
    const players = (data.players || []).slice(0, 4);
    const n = Math.max(1, players.length);
    const isPractice = !!data.isPractice;

    // 배경(크림)
    ctx.fillStyle = CREAM;
    ctx.fillRect(0, 0, S, S);

    // 흰 카드 — 테두리 없이 그림자로만 띄운다
    const CX = 56;
    const CY = 56;
    const CW = S - 112;
    const CH = S - 112;
    const CR = 44;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.10)";
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = "#ffffff";
    roundRectPath(ctx, CX, CY, CW, CH, CR);
    ctx.fill();
    ctx.restore();

    const innerL = CX + 60;
    const innerR = CX + CW - 60;
    const footTop = CY + CH - 144;

    // 브랜드 푸터 밴드 (카드 모서리로 클리핑)
    ctx.save();
    roundRectPath(ctx, CX, CY, CW, CH, CR);
    ctx.clip();
    ctx.fillStyle = BRAND;
    ctx.fillRect(CX, footTop, CW, 144);
    ctx.restore();

    /* 헤더 --------------------------------------------------------------- */
    const headCy = CY + 84;
    const typeLabel = typeLabelOf(data.gameType);

    setFont(ctx, 700, 30);
    const pillTextW = ctx.measureText(typeLabel).width;
    const pillW = pillTextW + 46;
    const pillH = 56;
    ctx.fillStyle = BRAND;
    roundRectPath(ctx, innerL, headCy - pillH / 2, pillW, pillH, pillH / 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(typeLabel, innerL + pillW / 2, headCy + 2);

    setFont(ctx, 700, 42);
    ctx.fillStyle = INK_1;
    ctx.textAlign = "left";
    ctx.fillText(isPractice ? "연습 기록" : "경기 결과", innerL + pillW + 20, headCy + 1);

    setFont(ctx, 600, 28);
    ctx.fillStyle = INK_4;
    ctx.textAlign = "right";
    ctx.fillText(dateLabelOf(data.playedAt), innerR, headCy + 1);

    /* 선수 행 ------------------------------------------------------------ */
    const regionTop = CY + 164;
    const regionBottom = footTop - 84;
    const rowH = (regionBottom - regionTop) / n;

    // 혼자 친 기록(연습)은 행이 하나뿐이라 상한을 그대로 두면 카드 절반이 빈다 → 크게 키운다.
    const solo = n === 1;
    const nameSize = Math.round(clamp(rowH * 0.17, 30, solo ? 64 : 50));
    const scoreSize = Math.round(clamp(rowH * 0.34, 56, solo ? 170 : 104));
    const subSize = Math.round(clamp(rowH * 0.105, 22, solo ? 36 : 30));
    const ballR = Math.round(clamp(rowH * 0.09, 14, solo ? 38 : 26));

    players.forEach((p, i) => {
        const top = regionTop + i * rowH;
        const cy = top + rowH / 2;
        const showWin = p.win && !isPractice;

        // 승자 행만 아주 옅은 브랜드 틴트로 띄운다 (구분선 대신)
        if (showWin) {
            ctx.fillStyle = "rgba(0,98,65,0.07)";
            roundRectPath(ctx, innerL - 24, top + 8, innerR - innerL + 48, rowH - 16, 26);
            ctx.fill();
        }

        drawBall(ctx, innerL + ballR + 6, cy, ballR, BALLS[i] || BALLS[0]);

        // 오른쪽 점수 블록을 먼저 재서 이름 최대폭을 정한다
        const targetTxt = `/ ${Number(p.target) || 0}`;
        setFont(ctx, 600, Math.round(scoreSize * 0.36));
        const targetW = ctx.measureText(targetTxt).width;

        setFont(ctx, 800, scoreSize);
        const scoreTxt = String(Number(p.score) || 0);
        const scoreW = ctx.measureText(scoreTxt).width;

        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillStyle = showWin ? BRAND : INK_1;
        ctx.fillText(scoreTxt, innerR - targetW - 14, cy);

        setFont(ctx, 600, Math.round(scoreSize * 0.36));
        ctx.fillStyle = INK_4;
        ctx.fillText(targetTxt, innerR, cy + scoreSize * 0.13);

        const textL = innerL + ballR * 2 + 34;
        const scoreBlockW = scoreW + targetW + 14;

        // 이름 + 승 배지
        setFont(ctx, 700, nameSize);
        const chipH = Math.round(nameSize * 0.86);
        let chipW = 0;
        if (showWin) {
            setFont(ctx, 700, Math.round(nameSize * 0.56));
            chipW = ctx.measureText("승").width + Math.round(nameSize * 0.7);
            setFont(ctx, 700, nameSize);
        }
        const nameMax = innerR - scoreBlockW - 40 - textL - (showWin ? chipW + 16 : 0);
        const name = fitText(ctx, p.name || "선수", nameMax);
        const nameBaseline = cy - 6;

        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        ctx.fillStyle = INK_1;
        ctx.fillText(name, textL, nameBaseline);

        if (showWin) {
            const nameW = ctx.measureText(name).width;
            const chipX = textL + nameW + 16;
            const chipY = nameBaseline - nameSize * 0.72;
            ctx.fillStyle = BRAND;
            roundRectPath(ctx, chipX, chipY, chipW, chipH, chipH / 2);
            ctx.fill();
            setFont(ctx, 700, Math.round(nameSize * 0.56));
            ctx.fillStyle = "#ffffff";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("승", chipX + chipW / 2, chipY + chipH / 2 + 1);
            ctx.textAlign = "left";
            ctx.textBaseline = "alphabetic";
        }

        setFont(ctx, 500, subSize);
        ctx.fillStyle = INK_3;
        ctx.fillText(
            `에버 ${p.avg} · 하이런 ${Number(p.highRun) || 0}`,
            textL,
            nameBaseline + subSize + 14,
        );
    });

    /* 이닝 칩 ------------------------------------------------------------ */
    const inningTxt = `총 ${Number(data.innings) || 0}이닝`;
    const chipCy = (regionBottom + footTop) / 2;
    setFont(ctx, 600, 30);
    const iw = ctx.measureText(inningTxt).width + 46;
    const ih = 54;
    ctx.fillStyle = "rgba(0,0,0,0.045)";
    roundRectPath(ctx, S / 2 - iw / 2, chipCy - ih / 2, iw, ih, ih / 2);
    ctx.fill();
    ctx.fillStyle = INK_3;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(inningTxt, S / 2, chipCy + 2);

    /* 푸터(브랜딩) -------------------------------------------------------- */
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    setFont(ctx, 700, 40);
    ctx.fillStyle = "#ffffff";
    ctx.fillText("랭큐 RANKUE", innerL, footTop + 64);

    setFont(ctx, 500, 26);
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.fillText("손안의 당구 점수판", innerL, footTop + 104);

    setFont(ctx, 600, 28);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(SITE, innerR, footTop + 72);
}

/** 결과 카드를 PNG Blob 으로. 실패하면 null (앱은 죽지 않는다). */
export async function renderShareBlob(data: ShareResultData): Promise<Blob | null> {
    try {
        const canvas = document.createElement("canvas");
        canvas.width = CANVAS_SIZE;
        canvas.height = CANVAS_SIZE;
        const ctx = canvas.getContext("2d");
        if (!ctx) return null;
        drawShareCard(ctx, data);
        return await new Promise<Blob | null>((resolve) => {
            try {
                canvas.toBlob((b) => resolve(b), "image/png");
            } catch {
                resolve(null);
            }
        });
    } catch (e) {
        console.warn("[ShareResultCard] render failed", e);
        return null;
    }
}

/* ---------------------------------------------------------------- 화면 카드 */

function PreviewBall({ index, size }: { index: number; size: number }) {
    const c = BALLS[index] || BALLS[0];
    return (
        <span
            aria-hidden
            className="relative inline-block shrink-0"
            style={{
                width: size,
                height: size,
                borderRadius: "50%",
                background: `radial-gradient(circle at 34% 30%, ${c.hi} 0%, ${c.base} 46%, ${c.lo} 100%)`,
                boxShadow: `0 ${size * 0.09}px ${size * 0.14}px rgba(0,0,0,0.22), inset -1px -1.5px 2px rgba(0,0,0,0.18)`,
            }}
        >
            <span
                className="absolute"
                style={{
                    top: "14%",
                    left: "20%",
                    width: "46%",
                    height: "46%",
                    borderRadius: "50%",
                    background:
                        "radial-gradient(circle at 38% 38%, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 68%)",
                }}
            />
        </span>
    );
}

// 캔버스 쪽 clamp 와 같은 눈금. 행이 적을수록 크게 → 미리보기와 PNG 의 인상이 어긋나지 않는다.
const PREVIEW_SCALE = {
    solo: { ball: 26, name: "text-[17px]", sub: "text-[12px]", score: "text-[46px]", target: "text-[15px]" },
    duo: { ball: 16, name: "text-[13px]", sub: "text-[10px]", score: "text-[26px]", target: "text-[11px]" },
    many: { ball: 12, name: "text-[12px]", sub: "text-[9px]", score: "text-[22px]", target: "text-[10px]" },
};

/** 공유될 PNG 와 동일한 레이아웃의 미리보기 카드. 이미지 생성이 실패해도 이건 항상 보인다. */
export function ShareResultCard({ data, className }: { data: ShareResultData; className?: string }) {
    const players = (data.players || []).slice(0, 4);
    const isPractice = !!data.isPractice;
    const sz =
        players.length <= 1 ? PREVIEW_SCALE.solo : players.length === 2 ? PREVIEW_SCALE.duo : PREVIEW_SCALE.many;

    return (
        <div className={cn("w-full rounded-2xl bg-[#f2f0eb] p-3", className)}>
            <div className="flex aspect-square w-full flex-col overflow-hidden rounded-xl bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <div className="flex flex-1 flex-col px-4 pt-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                            <span className="rounded-full bg-brand px-2 py-[3px] text-[10px] font-bold leading-none text-brand-fg">
                                {typeLabelOf(data.gameType)}
                            </span>
                            <span className="text-[13px] font-bold text-ink-1">
                                {isPractice ? "연습 기록" : "경기 결과"}
                            </span>
                        </div>
                        <span className="text-[10px] font-semibold tabular-nums text-black/45">
                            {dateLabelOf(data.playedAt)}
                        </span>
                    </div>

                    {/* 각 행이 flex-1 로 영역을 균등 분할 — 캔버스의 rowH 분할과 같은 리듬 */}
                    <div className="flex flex-1 flex-col py-1">
                        {players.map((p, i) => {
                            const showWin = p.win && !isPractice;
                            return (
                                <div
                                    key={i}
                                    className={cn(
                                        "flex flex-1 items-center gap-2.5 rounded-[10px] px-2",
                                        showWin && "bg-brand/[0.07]",
                                    )}
                                >
                                    <PreviewBall index={i} size={sz.ball} />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                            <span className={cn("truncate font-bold text-ink-1", sz.name)}>
                                                {p.name || "선수"}
                                            </span>
                                            {showWin && (
                                                <span className="shrink-0 rounded-full bg-brand px-1.5 py-[2px] text-[9px] font-bold leading-none text-brand-fg">
                                                    승
                                                </span>
                                            )}
                                        </div>
                                        <p className={cn("font-medium tabular-nums text-black/45", sz.sub)}>
                                            에버 {p.avg} · 하이런 {Number(p.highRun) || 0}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 items-baseline gap-0.5">
                                        <span
                                            className={cn(
                                                "font-bold leading-none tracking-tight tabular-nums",
                                                sz.score,
                                                showWin ? "text-brand" : "text-ink-1",
                                            )}
                                        >
                                            {Number(p.score) || 0}
                                        </span>
                                        <span className={cn("font-semibold tabular-nums text-black/35", sz.target)}>
                                            / {Number(p.target) || 0}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex justify-center pb-3">
                        <span className="rounded-full bg-black/[0.045] px-2.5 py-1 text-[10px] font-semibold tabular-nums text-black/55">
                            총 {Number(data.innings) || 0}이닝
                        </span>
                    </div>
                </div>

                <div className="flex items-center justify-between bg-brand px-4 py-2.5">
                    <div>
                        <p className="text-[12px] font-bold leading-tight text-brand-fg">랭큐 RANKUE</p>
                        <p className="text-[9px] font-medium leading-tight text-white/70">
                            손안의 당구 점수판
                        </p>
                    </div>
                    <span className="text-[9px] font-semibold text-white/75">{SITE}</span>
                </div>
            </div>
        </div>
    );
}

/* --------------------------------------------------- 버튼 + 공유 시트(진입점) */

function buildShareText(data: ShareResultData) {
    const players = (data.players || []).slice(0, 4);
    const line = players.map((p) => `${p.name || "선수"} ${Number(p.score) || 0}`).join(" : ");
    return `[랭큐] ${typeLabelOf(data.gameType)} ${line} (${Number(data.innings) || 0}이닝)\n손안의 당구 점수판 · ${SITE}`;
}

function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    try {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
    } finally {
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
}

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = () => reject(new Error("read failed"));
        r.readAsDataURL(blob);
    });
}

// 네이티브 앱 공유. WebView 안에서는 navigator.share 의 파일 공유도, <a download> 도
// 동작하지 않아서(둘 다 조용히 아무 일도 안 일어난다) 파일을 캐시에 쓴 뒤
// 네이티브 공유 시트를 띄우는 경로가 유일하게 확실하다.
async function shareNative(blob: Blob, filename: string, text: string): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;
    try {
        const dataUrl = await blobToDataUrl(blob);
        const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
        const written = await Filesystem.writeFile({
            path: filename,
            data: base64,
            directory: Directory.Cache,
        });
        await Share.share({ title: "랭큐 경기 결과", text, files: [written.uri] });
        return true;
    } catch (e: any) {
        // 사용자가 공유 시트를 닫은 것도 여기로 온다 — 실패로 보고 폴백하면 안 된다.
        const msg = String(e?.message ?? e);
        if (/cancel|abort|dismiss/i.test(msg)) return true;
        console.warn("[ShareResultCard] native share failed", e);
        return false;
    }
}

export function ShareResultButton({
    data,
    className,
}: {
    data: ShareResultData;
    className?: string;
}) {
    const { toast } = useToast();
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    // 크루가 2개 이상이면 어디에 올릴지 골라야 한다. 1개면 바로 올리고, 0개면 버튼을 숨긴다.
    const [pickCrew, setPickCrew] = useState(false);

    const filename = `rankue-${fileSlugOf(data.playedAt)}.png`;

    const { data: myCrews = [] } = useQuery<any[]>({
        queryKey: ["/api/hiq/crews/mine"],
        queryFn: async () => await apiRequest("/api/hiq/crews/mine?sport=BILLIARDS"),
        enabled: open,
        staleTime: 60_000,
    });

    const failToast = () =>
        toast({
            title: "이미지를 만들지 못했어요",
            description: "화면에 보이는 카드를 캡처해서 공유해 주세요.",
            variant: "destructive",
        });

    const handleShare = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const blob = await renderShareBlob(data);
            if (!blob) {
                failToast();
                return;
            }

            // 네이티브 앱이면 여기서 끝난다(웹 경로는 WebView에서 통하지 않는다).
            if (await shareNative(blob, filename, buildShareText(data))) return;

            const nav = navigator as any;
            try {
                const file = new File([blob], filename, { type: "image/png" });
                const withText = { files: [file], title: "랭큐 경기 결과", text: buildShareText(data) };
                const filesOnly = { files: [file] };

                if (typeof nav.share === "function" && typeof nav.canShare === "function") {
                    // 일부 대상 앱은 text 가 붙으면 이미지를 버린다 → files 만 보내는 경로도 시도
                    const payload = nav.canShare(withText)
                        ? withText
                        : nav.canShare(filesOnly)
                            ? filesOnly
                            : null;
                    if (payload) {
                        await nav.share(payload);
                        return;
                    }
                }
            } catch (e: any) {
                // 사용자가 공유 시트를 닫은 것뿐이면 다운로드로 떨어뜨리지 않는다
                if (e?.name === "AbortError") return;
                console.warn("[ShareResultCard] web share failed", e);
            }

            downloadBlob(blob, filename);
            toast({
                title: "이미지를 저장했어요",
                description: "사진첩(다운로드)에서 단톡방에 올려보세요.",
            });
        } catch (e) {
            console.warn("[ShareResultCard] share failed", e);
            failToast();
        } finally {
            setBusy(false);
        }
    };

    const handleDownload = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const blob = await renderShareBlob(data);
            if (!blob) {
                failToast();
                return;
            }
            // 앱에서는 <a download> 가 통하지 않는다 → 네이티브 공유 시트("이미지 저장"도 여기서 고를 수 있다)
            if (await shareNative(blob, filename, buildShareText(data))) return;
            downloadBlob(blob, filename);
            toast({ title: "이미지를 저장했어요" });
        } catch (e) {
            console.warn("[ShareResultCard] download failed", e);
            failToast();
        } finally {
            setBusy(false);
        }
    };

    // 크루 사진첩에 올린다. 이미지를 Blob 스토리지에 먼저 올리고 그 URL을 사진으로 등록.
    const shareToCrew = async (crewId: string, crewName: string) => {
        if (busy) return;
        setBusy(true);
        try {
            const blob = await renderShareBlob(data);
            if (!blob) { failToast(); return; }

            const dataUrl = await blobToDataUrl(blob);
            const up = await apiRequest("/api/hiq/upload", {
                method: "POST",
                body: { dataUrl, category: "crew-photo" },
            });
            const url = up?.url ?? up?.data?.url;
            if (!url) throw new Error("업로드 URL 없음");

            await apiRequest(`/api/hiq/crews/${crewId}/photos`, {
                method: "POST",
                body: { url, caption: buildShareText(data).split("\n")[0] },
            });

            toast({ title: `${crewName} 사진첩에 올렸어요` });
            setPickCrew(false);
            setOpen(false);
        } catch (e) {
            console.warn("[ShareResultCard] crew share failed", e);
            toast({ title: "크루에 올리지 못했어요", description: "잠시 후 다시 시도해주세요.", variant: "destructive" });
        } finally {
            setBusy(false);
        }
    };

    const handleCrewClick = () => {
        if (myCrews.length === 1) {
            const c = myCrews[0]?.crew ?? myCrews[0];
            shareToCrew(c.id, c.name);
        } else {
            setPickCrew(true);
        }
    };

    return (
        <>
            <Button onClick={() => setOpen(true)} className={cn("rk-btn-primary gap-2", className)}>
                <LucideShare2 className="h-5 w-5" />
                결과 공유
            </Button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-sm rounded-card bg-white text-[rgba(0,0,0,0.87)]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                            <LucideShare2 className="h-5 w-5 text-brand" />
                            결과 공유
                        </DialogTitle>
                        <DialogDescription className="text-black/55">
                            단톡방에 이대로 올릴 수 있어요.
                        </DialogDescription>
                    </DialogHeader>

                    <ShareResultCard data={data} />

                    <div className="flex flex-col gap-2 pt-1">
                        <Button
                            onClick={handleShare}
                            disabled={busy}
                            className="rk-btn-primary h-12 w-full gap-2 rounded-2xl"
                        >
                            <LucideShare2 className="h-4 w-4" />
                            {busy ? "만드는 중…" : "밖으로 공유 (카톡 등)"}
                        </Button>

                        {myCrews.length > 0 && (
                            <Button
                                variant="ghost"
                                onClick={handleCrewClick}
                                disabled={busy}
                                className="rk-btn-secondary h-12 w-full gap-2 rounded-2xl"
                            >
                                <LucideUsers className="h-4 w-4" />
                                크루에 올리기
                            </Button>
                        )}

                        <button
                            onClick={handleDownload}
                            disabled={busy}
                            className="h-10 w-full text-[13px] font-semibold text-black/45 hover:text-black/70 transition-colors disabled:opacity-40"
                        >
                            이미지만 저장
                        </button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* 크루가 2개 이상일 때만 — 어디에 올릴지 고른다 */}
            <Dialog open={pickCrew} onOpenChange={(o) => { if (!busy) setPickCrew(o); }}>
                <DialogContent className="max-w-sm rounded-card bg-white text-[rgba(0,0,0,0.87)]">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold">어느 크루에 올릴까요?</DialogTitle>
                        <DialogDescription className="text-black/55">
                            선택한 크루의 사진첩에 결과 카드가 올라갑니다.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-col gap-2">
                        {myCrews.map((row: any) => {
                            const c = row?.crew ?? row;
                            return (
                                <button
                                    key={c.id}
                                    onClick={() => shareToCrew(c.id, c.name)}
                                    disabled={busy}
                                    className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 text-left shadow-[0_1px_2px_rgba(0,0,0,0.05)] active:scale-[0.99] transition-transform disabled:opacity-50"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-[15px] font-bold text-brand">
                                            {(c.name ?? "?").trim().charAt(0)}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate text-[15px] font-bold text-ink-1">{c.name}</p>
                                            {c.region && <p className="truncate text-[12px] font-medium text-black/45">{c.region}</p>}
                                        </div>
                                    </div>
                                    <LucideChevronRight className="h-4 w-4 shrink-0 text-black/30" />
                                </button>
                            );
                        })}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
