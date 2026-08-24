import { useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";

// 공유 단일 진입점. 화면마다 navigator.share 를 다시 쓰다 보니 처리가 제각각이었다
// (어떤 곳은 취소를 에러로 토스트, 어떤 곳은 복사 폴백 없음).
//
// 규칙:
//  1) OS 공유 시트가 있으면 그걸 쓴다(카톡·문자 등 사용자가 쓰는 앱으로 바로 간다)
//  2) 없으면 클립보드 복사 + 안내 토스트 (데스크톱 브라우저)
//  3) 사용자가 시트를 닫은 것(AbortError)은 실패가 아니다 — 조용히 넘어간다

export function useShare() {
    const { toast } = useToast();
    const { t } = useT();

    return useCallback(async (opts: { title?: string; text?: string; url: string }) => {
        const { title, text, url } = opts;
        try {
            if (typeof navigator !== "undefined" && navigator.share) {
                await navigator.share({ title, text, url });
                return;
            }
            await navigator.clipboard.writeText(url);
            toast({ title: t("share.copied") });
        } catch (e: any) {
            // 공유 시트 취소는 정상 흐름이다.
            if (e?.name === "AbortError") return;
            // 클립보드까지 막힌 환경(구형 브라우저·비보안 컨텍스트) — 주소를 직접 보여준다.
            try {
                await navigator.clipboard.writeText(url);
                toast({ title: t("share.copied") });
            } catch {
                toast({ title: t("share.failed"), description: url });
            }
        }
    }, [toast, t]);
}
