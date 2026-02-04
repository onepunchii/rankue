import { useState, useCallback } from 'react';
import { apiRequest } from '@/lib/queryClient';

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
        const shareUrl = `${window.location.origin}/golf/booking-list/${item.id}`;
        const shareData = {
            title: `[랭큐] ${item.courseName || item.blindName} 예약`,
            text: `${new Date(item.datetime).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })} ${new Date(item.datetime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}\n그린피: ${item.greenFee.toLocaleString()}원`,
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

    const handleSendToCrew = useCallback(async (crew: any, item: any) => {
        if (!item) return;

        const dateStr = new Date(item.datetime).toLocaleDateString('ko-KR', {
            month: 'long', day: 'numeric', weekday: 'short'
        });
        const timeStr = new Date(item.datetime).toLocaleTimeString('ko-KR', {
            hour: '2-digit', minute: '2-digit'
        });
        const shareUrl = `${window.location.origin}/golf/booking-list/${item.id}`;

        const message = `⛳️ [부킹 공유] ${item.courseName || item.blindName}\n📅 ${dateStr} ${timeStr}\n💰 그린피 ${item.greenFee.toLocaleString()}원\n👉 확인하기: ${shareUrl}`;

        try {
            await apiRequest(`/api/hiq/crews/${crew.id}/chats`, {
                method: "POST",
                body: {
                    message,
                    type: "text",
                    metadata: {
                        type: 'GOLF_BOOKING',
                        bookingId: item.id,
                        courseName: item.courseName || item.blindName,
                        datetime: item.datetime,
                        greenFee: item.greenFee
                    }
                }
            });
            alert(`${crew.name} 채팅방에 공유되었습니다!`);
            setIsShareModalOpen(false);
        } catch (e) {
            alert("공유 중 오류가 발생했습니다.");
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
