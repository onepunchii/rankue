/**
 * 코스 도장 카드 공유 시트(2026-10-21) — 골프 도장첩 카드(golf/stamps/StampShareSheet)와 같은 흐름이다.
 *
 * 도장 카드는 **언제 어느 코스를 걸었는지**라, 누르자마자 보내지 않고 나갈 카드를 먼저 보여 준다.
 * 카드 주소는 시트를 열 때 서버가 서명해 준다(30일 뒤 닫힘) — 열기 전엔 주소가 세상에 없다(react-query 에 두지 않는다 — 저장 캐시에 남는다).
 *  - 이미지 공유: 앱 공용 shareImage(앱 = OS 공유 시트, 모바일 웹 = 파일 공유, 데스크톱 = 내려받기)
 *  - 링크 복사: 서명된 카드 주소 — 받은 사람만 30일 동안 볼 수 있다
 * ⚠️ 리터럴 색만(등산의 색). 글자는 12px 이상.
 */
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { LucideLink, LucideShare2 } from "@/lib/icons";
import { apiRequest } from "@/lib/queryClient";
import { shareImage } from "@/lib/shareImage";
import { copyText } from "@/sim/share/useShare";
import { useToast } from "@/hooks/use-toast";

export function TrailStampShareSheet({ open, onClose, route, courseKey, title }: { open: boolean; onClose: () => void; route: string; courseKey: string; title: string }) {
    const { toast } = useToast();
    const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!open) return;
        let alive = true;
        setLink(null); setError(null); setLoaded(false);
        apiRequest(`/api/hiq/trails/${encodeURIComponent(route)}/${encodeURIComponent(courseKey)}/share`)
            .then((d) => { if (alive) setLink(d); })
            .catch((e) => { if (alive) setError(e?.message || "카드를 만들지 못했어요"); });
        return () => { alive = false; };
    }, [open, route, courseKey]);

    const onShare = async () => {
        if (!link || busy) return;
        setBusy(true);
        try {
            const outcome = await shareImage({ url: link.url, filename: `rankue-trail-${route}-${courseKey}.png`, title: `${title} 도장`, text: `${title} 도장 — 랭큐 코리아둘레길` });
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
            <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-3xl border-[#FFFFFF0F] bg-[#0B1F26] px-5 pb-0 pt-5 [&>button]:right-5 [&>button]:top-5 [&>button]:text-[#F4EFE3] [&>button]:opacity-60" data-testid="trail-stamp-share-sheet">
                <SheetTitle className="text-[20px] font-semibold tracking-tight text-[#F4EFE3]">도장 카드 공유</SheetTitle>
                <SheetDescription className="mt-1 text-[13px] text-[#F4EFE399]">이 카드 그대로 나가요.</SheetDescription>
                <div className="relative mx-auto mt-4 aspect-square w-full max-w-[380px] overflow-hidden rounded-2xl bg-[#FFFFFF08] ring-1 ring-inset ring-[#FFFFFF14]">
                    {link && <img src={link.url} alt={`${title} 도장 카드`} className={`h-full w-full object-cover ${loaded ? "" : "opacity-0"}`} onLoad={() => setLoaded(true)} onError={() => setError("카드를 그리지 못했어요")} />}
                    {!loaded && <div className="absolute inset-0 flex items-center justify-center"><p className="text-[13px] text-[#F4EFE380]">{error ?? "카드를 그리는 중…"}</p></div>}
                </div>
                <p className="mt-3 text-center text-[12.5px] leading-relaxed text-[#F4EFE380] break-keep">걸은 날과 코스가 적힌 카드예요.<br />보낸 사람만 볼 수 있고, 링크는 30일 뒤에 닫혀요.</p>
                <div className="grid grid-cols-[1fr_auto] gap-2.5 pt-4" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
                    <button type="button" onClick={() => { void onShare(); }} disabled={!loaded || busy} data-track-as="trail-stamp-share"
                        className="inline-flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-[#F28C6A] text-[15px] font-semibold text-[#2A1208] active:opacity-90 disabled:opacity-50">
                        <LucideShare2 weight="bold" className="h-[18px] w-[18px]" />{busy ? "여는 중…" : "이미지 공유"}
                    </button>
                    <button type="button" onClick={() => { void onCopy(); }} disabled={!link}
                        className="inline-flex h-[52px] items-center justify-center gap-1.5 rounded-2xl bg-[#FFFFFF12] px-4 text-[14px] font-semibold text-[#F4EFE3] active:bg-[#FFFFFF1F] disabled:opacity-50">
                        <LucideLink weight="bold" className="h-4 w-4" />링크 복사
                    </button>
                </div>
            </SheetContent>
        </Sheet>
    );
}
