/**
 * 샷 공유 — 카드 PNG 를 만들고 플랫폼에 맞는 경로로 내보낸다(components/hiq/game/ShareResultCard.tsx 와 같은 순서·같은 폴백).
 *  1. 리플레이 URL 을 먼저 클립보드에 복사한다 — 제스처 직후, 캔버스 렌더보다 앞(iOS 는 await 뒤의 클립보드 쓰기를 거부할 수 있다).
 *  2. 카드 렌더(shareCard) → PNG Blob.
 *  3. 네이티브(Capacitor): 캐시 디렉터리에 쓰고 Share.share({ files }) — WebView 에선 navigator.share(files) 도 <a download> 도
 *     조용히 아무 일도 안 일어나므로 이 경로만 쓴다.
 *     웹: navigator.canShare({ files }) 면 Web Share(파일+텍스트 → 파일만 순서: 일부 대상 앱은 text 가 붙으면 이미지를 버린다),
 *     아니면 오브젝트 URL 다운로드.
 *  4. 이미지 경로가 전부 막혀도 링크가 복사됐으면 method "clipboard" 로 성공.
 * 사용자가 공유 시트를 닫은 것(AbortError·cancel·dismiss)은 실패가 아니다.
 * 부수효과는 ShareDeps 로 주입해 헤드리스로 테스트한다(useShare.test.ts). 훅(useShare)은 토스트·i18n 만 얹는다.
 */
import { useCallback, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";
import { Directory, Filesystem } from "@capacitor/filesystem";
import type { SimResult } from "@shared/sim/types";
import { useT } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { canvasToBlob, fileNameFor, renderShareCard, type ShareCardOptions } from "./shareCard";

export type ShareMethod = "native" | "web-share" | "download" | "clipboard";

export interface ShareOutcome {
    readonly ok: boolean;
    /** 실제로 통한 경로. 실패면 null */
    readonly method: ShareMethod | null;
    /** 리플레이 URL 이 클립보드에 들어갔는가 */
    readonly copied: boolean;
    readonly url: string;
}

export interface ShareMeta extends Omit<ShareCardOptions, "createCanvas"> {
    /** 전체 리플레이 URL(클립보드·공유 텍스트) */
    readonly replayUrl: string;
    /** 공유 텍스트. 기본 "{title}\n{replayUrl}" */
    readonly text?: string;
    /** PNG 파일 이름. 기본 fileNameFor(result) */
    readonly filename?: string;
}

export interface WebShareData {
    readonly files?: File[];
    readonly title?: string;
    readonly text?: string;
}

/** 부수효과 묶음(테스트 주입용). */
export interface ShareDeps {
    isNative(): boolean;
    /** 캐시 디렉터리에 base64 PNG 를 쓰고 파일 URI 를 돌려준다 */
    writeCacheFile(name: string, base64: string): Promise<string>;
    nativeShare(o: { title: string; text: string; files: string[] }): Promise<void>;
    /** Web Share 가 없으면 null */
    webShare(): { canShare(d: WebShareData): boolean; share(d: WebShareData): Promise<void> } | null;
    download(blob: Blob, filename: string): boolean;
    copy(text: string): Promise<boolean>;
    blobToBase64(blob: Blob): Promise<string>;
    createCanvas(): HTMLCanvasElement;
    toBlob(canvas: HTMLCanvasElement): Promise<Blob | null>;
    makeFile(blob: Blob, filename: string): File;
}

/* ------------------------------------------------------------------ 기본 부수효과 */

/** 클립보드 복사 — 앱 WebView 에서도 동작(https). navigator.clipboard 가 막힌 환경을 위해 execCommand 폴백. */
export async function copyText(text: string): Promise<boolean> {
    try {
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch { /* 폴백으로 */ }
    try {
        if (typeof document === "undefined" || typeof document.execCommand !== "function") return false;
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        ta.remove();
        return ok === true;
    } catch {
        return false;
    }
}

function downloadBlob(blob: Blob, filename: string): boolean {
    if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function" || typeof document === "undefined") return false;
    const url = URL.createObjectURL(blob);
    try {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        return true;
    } catch {
        return false;
    } finally {
        setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
}

function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => {
            const s = String(r.result);
            resolve(s.slice(s.indexOf(",") + 1));
        };
        r.onerror = () => reject(new Error("read failed"));
        r.readAsDataURL(blob);
    });
}

export function defaultShareDeps(): ShareDeps {
    return {
        isNative: () => Capacitor.isNativePlatform(),
        writeCacheFile: async (name, base64) => (await Filesystem.writeFile({ path: name, data: base64, directory: Directory.Cache })).uri,
        nativeShare: (o) => Share.share(o).then(() => undefined),
        webShare: () => {
            const n = typeof navigator !== "undefined" ? (navigator as Navigator & { canShare?: (d: WebShareData) => boolean }) : null;
            if (!n || typeof n.share !== "function" || typeof n.canShare !== "function") return null;
            return { canShare: (d) => n.canShare!(d), share: (d) => n.share(d as ShareData) };
        },
        download: downloadBlob,
        copy: copyText,
        blobToBase64,
        createCanvas: () => document.createElement("canvas"),
        toBlob: canvasToBlob,
        makeFile: (blob, filename) => new File([blob], filename, { type: "image/png" }),
    };
}

/** 공유 시트를 닫은 것은 실패가 아니다. */
export function isDismissal(e: unknown): boolean {
    const name = (e as { name?: string } | null)?.name;
    if (name === "AbortError") return true;
    const msg = String((e as { message?: string } | null)?.message ?? e);
    return /cancel|abort|dismiss/i.test(msg);
}

/* ------------------------------------------------------------------ 공유 */

export async function shareShot(result: SimResult, meta: ShareMeta, deps: ShareDeps = defaultShareDeps()): Promise<ShareOutcome> {
    const url = meta.replayUrl;
    const text = meta.text ?? `${meta.title}\n${url}`;
    const filename = meta.filename ?? fileNameFor(result);

    // 1. 링크 복사(제스처 직후)
    let copied = false;
    try { copied = await deps.copy(url); } catch { copied = false; }

    // 2. 카드 → PNG
    let blob: Blob | null = null;
    try {
        const canvas = renderShareCard(result, { ...meta, createCanvas: deps.createCanvas });
        blob = await deps.toBlob(canvas);
    } catch {
        blob = null;
    }
    if (!blob) return { ok: copied, method: copied ? "clipboard" : null, copied, url };

    // 3. 네이티브
    if (deps.isNative()) {
        try {
            const base64 = await deps.blobToBase64(blob);
            const uri = await deps.writeCacheFile(filename, base64);
            await deps.nativeShare({ title: meta.title, text, files: [uri] });
            return { ok: true, method: "native", copied, url };
        } catch (e) {
            if (isDismissal(e)) return { ok: true, method: "native", copied, url };
            return { ok: copied, method: copied ? "clipboard" : null, copied, url };
        }
    }

    // 3'. Web Share(파일)
    const web = deps.webShare();
    if (web) {
        try {
            const file = deps.makeFile(blob, filename);
            const withText: WebShareData = { files: [file], title: meta.title, text };
            const filesOnly: WebShareData = { files: [file] };
            const payload = web.canShare(withText) ? withText : web.canShare(filesOnly) ? filesOnly : null;
            if (payload) {
                await web.share(payload);
                return { ok: true, method: "web-share", copied, url };
            }
        } catch (e) {
            if (isDismissal(e)) return { ok: true, method: "web-share", copied, url };
            // 그 밖의 실패는 다운로드로
        }
    }

    // 4. 다운로드(웹만 — WebView 에선 inert 라 네이티브 경로가 먼저 잡는다)
    let downloaded = false;
    try { downloaded = deps.download(blob, filename); } catch { downloaded = false; }
    if (downloaded) return { ok: true, method: "download", copied, url };
    return { ok: copied, method: copied ? "clipboard" : null, copied, url };
}

/* ------------------------------------------------------------------ 훅 */

/** 페이지용: 공유 결과를 토스트로 알린다(링크 복사됨 / 실패). 진행 중엔 중복 호출을 무시한다. */
export function useShare(deps?: ShareDeps): { share: (result: SimResult, meta: ShareMeta) => Promise<ShareOutcome | null>; busy: boolean } {
    const { t } = useT();
    const { toast } = useToast();
    const busyRef = useRef(false);
    const [busy, setBusy] = useState(false);
    const depsRef = useRef(deps);
    depsRef.current = deps;

    const share = useCallback(async (result: SimResult, meta: ShareMeta): Promise<ShareOutcome | null> => {
        if (busyRef.current) return null;
        busyRef.current = true;
        setBusy(true);
        try {
            const r = await shareShot(result, meta, depsRef.current);
            if (!r.ok) toast({ title: t("sim.share.failed") });
            else if (r.copied) toast({ title: t("sim.share.copied") });
            return r;
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
    }, [t, toast]);

    return { share, busy };
}
