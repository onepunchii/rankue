/**
 * 스코어카드 한 장으로 라운드 남기기 — 홈 · 여권의 '스코어카드 스캔'이 여는 창(2026-10-13).
 * 그림을 올리면 골프장 · 전후반 · 날짜를 읽고, 내 줄을 고르면 **바로 끝난 라운드로** 남는다(방을 만들고 1번 홀부터 넘기지 않는다).
 * 남긴 뒤에는 결과 화면으로 간다. 읽고 묻는 화면은 ScanSheet 의 round 길이 그린다.
 */
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { SCAN_COPY } from "@shared/golfScorecardScan";
import { ScanSheet } from "./ScanSheet";

export function ScanRoundSheet({ onClose }: { onClose: () => void }) {
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const { data: me } = useQuery<any>({ queryKey: ["/api/hiq/me"] });
    if (!me?.id) return null;
    const refresh = () => {
        // 평균 · 기록 · 여권이 새 라운드를 보게
        for (const key of [["/api/hiq/me"], ["/api/hiq/history", { sport: "GOLF" }], ["/api/hiq/golf/passport-stats"], ["/api/hiq/golf/stamp-awards"], ["/api/hiq/golf/passport/footprints"], ["/api/hiq/golf/scan/status"]]) {
            void queryClient.invalidateQueries({ queryKey: key });
        }
    };
    return (
        <ScanSheet
            players={[{ memberId: me.id, name: me.name ?? me.nickname ?? "나" }]}
            pars={[]}
            parKnown={[]}
            onClose={onClose}
            round={{
                // 여러 장을 올렸을 때 — 목록에서 '마치기'
                onBatchDone: (saved) => {
                    refresh();
                    if (saved > 0) toast({ title: `라운드 ${saved}개를 기록했어요`, description: "라운딩 리포트에서 볼 수 있어요." });
                    onClose();
                },
                onDone: (id, official) => {
                    refresh();
                    toast({ title: "라운드를 기록했어요", description: official ? SCAN_COPY.official : SCAN_COPY.unofficial });
                    onClose();
                    setLocation(`/golf/game/${id}/result`);
                },
            }}
        />
    );
}
