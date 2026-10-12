/**
 * 도장첩 완성 카드 공유 시트(2026-10-12) — 발자국 카드 공유(passport/FootprintShareSheet)와 같은 흐름이다.
 *
 * 다 채운 도장첩은 **어느 골프장을 다녔는지**라, 누르자마자 보내지 않고 나갈 카드를 먼저 보여 준다.
 * 카드 주소는 이 시트를 열 때 서버가 서명해 준다(30일 뒤 닫힘) — 열기 전엔 주소가 세상에 없다.
 *  - 이미지 공유: 앱 공용 shareImage(앱 = OS 공유 시트 → 카카오톡 · 사진 저장, 모바일 웹 = 파일 공유, 데스크톱 = 내려받기).
 *  - 링크 복사: 서명된 카드 주소. 받은 사람만 30일 동안 볼 수 있다.
 * ⚠️ 리터럴 색만 — 골프 테마가 `.bg-white` · `.text-black/*` 를 바꿔 끼운다.
 */
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { LucideShare2, LucideLink } from "@/lib/icons";
import { apiRequest } from "@/lib/queryClient";
import { shareImage } from "@/lib/shareImage";
import { copyText } from "@/sim/share/useShare";
import { useToast } from "@/hooks/use-toast";

export function StampShareSheet({ open, onClose, bookId, bookName }: { open: boolean; onClose: () => void; bookId: string; bookName: string }) {
    const { toast } = useToast();
    const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [busy, setBusy] = useState(false);

    // 열 때마다 새로 서명받는다 — react-query 에 두면 서명 주소가 저장 캐시(localStorage)에 남는다.
    useEffect(() => {
        if (!open) return;
        let alive = true;
        setLink(null); setError(null); setLoaded(false);
        apiRequest(`/api/hiq/golf/stamp-share?book=${encodeURIComponent(bookId)}`)
            .then((d) => { if (alive) setLink(d); })
            .catch((e) => { if (alive) setError(e?.message || "카드를 만들지 못했어요"); });
        return () => { alive = false; };
    }, [open, bookId]);

    const title = `${bookName} 도장첩 완성`;
    const onShare = async () => {
        if (!link || busy) return;
        setBusy(true);
        try {
            const outcome = await shareImage({ url: link.url, filename: `rankue-golf-stamps-${bookId}.png`, title, text: `${title} — 랭큐 골프 도장깨기` });
            if (outcome === "downloaded") toast({ title: "카드 이미지를 저장했어요" });
            else if (outcome === "failed") toast({ title: "카드를 보내지 못했어요. 잠시 뒤 다시 해 주세요", variant: "destructive" });
        } finally { setBusy(false); }
    };
    const onCopy = async () => {
        if (!link) return;
        const ok = await copyText(new URL(link.url, window.location.origin).toString());
        toast(ok ? { title: "링크를 복사했어요", description: "받은 사람만 30일 동안 볼 수 있어요" } : { title: "복사하지 못했어요", variant: "destructive" });
    };

    return (
        <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
            <SheetContent
                side="bottom"
                className="bg-[#0F0F0F] border-[#FFFFFF0F] rounded-t-3xl px-5 pt-5 pb-0 max-h-[92vh] overflow-y-auto [&>button]:right-5 [&>button]:top-5 [&>button]:opacity-60"
                data-testid="stamp-share-sheet"
            >
                <SheetTitle className="text-[20px] font-semibold tracking-tight text-[#ffffff]">완성 카드 공유</SheetTitle>
                <SheetDescription className="mt-1 text-[13px] text-[#FFFFFF8C]">이 카드 그대로 나가요.</SheetDescription>

                <div className="mt-4 mx-auto w-full max-w-[380px] aspect-square rounded-2xl overflow-hidden bg-[#FFFFFF08] ring-1 ring-inset ring-[#FFFFFF0F] relative">
                    {link && (
                        <img
                            src={link.url}
                            alt={`${title} 카드`}
                            className={loaded ? "w-full h-full object-cover" : "w-full h-full object-cover opacity-0"}
                            onLoad={() => setLoaded(true)}
                            onError={() => setError("카드를 그리지 못했어요")}
                        />
                    )}
                    {!loaded && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <p className="text-[13px] text-[#FFFFFF73]">{error ?? "카드를 그리는 중…"}</p>
                        </div>
                    )}
                </div>

                <p className="mt-3 text-[12.5px] leading-relaxed text-[#FFFFFF73] break-keep text-center">
                    다녀온 골프장이 적힌 카드예요.<br />보낸 사람만 볼 수 있고, 링크는 30일 뒤에 닫혀요.
                </p>

                <div className="grid grid-cols-[1fr_auto] gap-2.5 pt-4" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
                    <button
                        type="button"
                        onClick={() => { void onShare(); }}
                        disabled={!loaded || busy}
                        className="h-[52px] rounded-2xl bg-gradient-to-br from-[#FF8A3D] to-[#E85200] text-[15px] font-semibold text-[#ffffff] inline-flex items-center justify-center gap-2 active:opacity-90 disabled:opacity-50"
                    >
                        <LucideShare2 weight="bold" className="w-[18px] h-[18px]" />
                        {busy ? "여는 중…" : "이미지 공유"}
                    </button>
                    <button
                        type="button"
                        onClick={() => { void onCopy(); }}
                        disabled={!link}
                        className="h-[52px] px-4 rounded-2xl bg-[#FFFFFF12] text-[14px] font-semibold text-[#ffffff] inline-flex items-center justify-center gap-1.5 active:bg-[#FFFFFF1F] disabled:opacity-50"
                    >
                        <LucideLink weight="bold" className="w-4 h-4" />
                        링크 복사
                    </button>
                </div>
            </SheetContent>
        </Sheet>
    );
}

export default StampShareSheet;
