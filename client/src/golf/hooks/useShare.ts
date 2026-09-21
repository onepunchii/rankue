import { useState, useCallback } from 'react';
import { costText } from "@/golf/components/join/joinUi";
import { apiRequest } from '@/lib/queryClient';
import { kstDateKey, kstDateLabel, kstTime } from '@/lib/kst';

/**
 * 링크에 **날짜와 보기(부킹/조인)를 함께 싣는다.**
 *
 * 왜: 예전 링크는 /golf/booking-list/<id> 뿐이었다. 목록 화면은 항상 '오늘' 부킹으로 열리고
 * 고른 날짜 하루치만 불러오기 때문에, 다음 주 티타임을 공유하면 받는 사람 화면에는 그 글이 아예 없었다.
 * 조인 글을 공유해도 부킹 탭으로 열려서 안 보였다(2026-09-09 검토).
 * 화면(BookingList.tsx)은 이미 ?date=·?view= 를 읽을 줄 알았는데, 링크를 만드는 쪽이 안 붙이고 있었다.
 */
export function buildGolfShareUrl(item: any): string {
    const url = new URL(`${window.location.origin}/golf/booking-list/${item.id}`);
    const day = kstDateKey(item.datetime);
    if (day) url.searchParams.set('date', day);
    url.searchParams.set('view', item.listingType === 'JOIN' ? 'JOIN' : 'BOOKING');
    return url.toString();
}

export const useShare = () => {
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);
    const [shareItem, setShareItem] = useState<any>(null);

    const handleShare = useCallback((item: any) => {
        setShareItem(item);
        setIsShareModalOpen(true);
    }, []);

    const copyToClipboard = useCallback((text: string) => {
        navigator.clipboard.writeText(text);
        alert("예약 링크가 복사되었습니다! 친구에게 붙여넣기 하세요.");
        setIsShareModalOpen(false);
    }, []);

    const handleExternalShare = useCallback(async (item: any) => {
        const shareUrl = buildGolfShareUrl(item);
        const isJoin = item.listingType === "JOIN";
        const name = item.isBlind ? (item.blindName || "비공개 골프장") : item.courseName;
        const shareData = {
            title: `[랭큐] ${name} ${isJoin ? "조인" : "예약"}`,
            // 시각은 한국 시각으로 고정한다 — 기기 시계를 따르면 해외 접속자에게 다른 시간이 찍힌다.
            // 조인은 1/N 이면 greenFee 가 0 이다 — 그대로 쓰면 "그린피: 0원" 이 나갔다. 화면과 같은 규칙(costText)으로 적는다.
            text: `${kstDateLabel(item.datetime)} ${kstTime(item.datetime)}\n${isJoin ? `비용: ${costText(item)}` : `그린피: ${Number(item.greenFee ?? 0).toLocaleString()}원`}`,
            url: shareUrl,
        };

        if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
            try {
                await navigator.share(shareData);
            } catch (err) {
                console.log('Share failed', err);
            }
        } else {
            copyToClipboard(shareUrl);
        }
    }, [copyToClipboard]);

    /**
     * 크루방에 올리는 건 **서버가 만든다**.
     *
     * 예전엔 여기서 /crews/:id/chats 로 message + metadata 를 보냈다. 그런데 그 라우트는 metadata 를
     * 통째로 버린다 — 클라이언트가 카드 종류를 지정할 수 있으면 가짜 정산·예약 카드를 주입할 수 있어서
     * 일부러 막아 둔 것이다. 그래서 크루방에는 카드가 아니라 눌리지 않는 글자 덩어리만 올라갔다.
     * 이제 골프 쪽 라우트가 실제 매물을 읽어 카드를 만든다.
     */
    const handleSendToCrew = useCallback(async (crew: any, item: any) => {
        if (!item) return;
        try {
            await apiRequest(`/api/hiq/golf/bookings/${item.id}/share/crew`, {
                method: "POST",
                body: { crewId: crew.id },
            });
            alert(`${crew.name} 채팅방에 공유되었습니다!`);
            setIsShareModalOpen(false);
        } catch (e: any) {
            alert(e?.message || "공유 중 오류가 발생했습니다.");
        }
    }, []);

    return {
        isShareModalOpen,
        setIsShareModalOpen,
        shareItem,
        handleShare,
        handleExternalShare,
        handleSendToCrew,
        copyToClipboard
    };
};
