import { useState, useEffect, useRef, memo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { LucideMessageSquare, LucideSend, LucideLoader2, LucideTrash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

interface ChatMessage {
    id: string;
    senderId: string;
    message: string;
    type?: string;
    createdAt: string;
    sender?: {
        name: string;
        profileImageUrl?: string;
    };
    metadata?: any;
}

interface CrewChatTabProps {
    crewId: string;
    isMember: boolean;
    isAdmin: boolean;
    currentMemberId?: string;
    onSettlementClick?: (id: string) => void;
}

export function CrewChatTab({ crewId, isMember, isAdmin, currentMemberId, onSettlementClick }: CrewChatTabProps) {
    const { toast } = useToast();
    const [_, setLocation] = useLocation();
    const [inputValue, setInputValue] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // 1. Fetch chats
    const { data: chats, isLoading } = useQuery<ChatMessage[]>({
        queryKey: [`/api/hiq/crews/${crewId}/chats`],
        enabled: !!crewId && isMember,
        refetchInterval: 3000, // Poll every 3 seconds for basic real-time feel
    });

    // 2. Send chat with optimistic update
    const sendChatMutation = useMutation({
        mutationFn: async (message: string) => {
            return await apiRequest(`/api/hiq/crews/${crewId}/chats`, {
                method: "POST",
                body: JSON.stringify({ message }),
            });
        },
        onMutate: async (newMessage) => {
            await queryClient.cancelQueries({ queryKey: [`/api/hiq/crews/${crewId}/chats`] });
            const previousChats = queryClient.getQueryData<ChatMessage[]>([`/api/hiq/crews/${crewId}/chats`]);

            if (previousChats && currentMemberId) {
                const optimisticChat: ChatMessage = {
                    id: `temp-${Date.now()}`,
                    senderId: currentMemberId,
                    message: newMessage,
                    createdAt: new Date().toISOString(),
                    sender: { name: "나" },
                };
                queryClient.setQueryData<ChatMessage[]>([`/api/hiq/crews/${crewId}/chats`], [...previousChats, optimisticChat]);
            }
            return { previousChats };
        },
        onError: (err, _, context) => {
            if (context?.previousChats) {
                queryClient.setQueryData([`/api/hiq/crews/${crewId}/chats`], context.previousChats);
            }
            toast({
                title: "전송 실패",
                description: "메시지를 보내지 못했습니다.",
                variant: "destructive"
            });
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crewId}/chats`] });
        },
    });

    // 3. Delete chat
    const deleteChatMutation = useMutation({
        mutationFn: async (chatId: string) => {
            return await apiRequest(`/api/hiq/crews/${crewId}/chats/${chatId}`, {
                method: "DELETE",
            });
        },
        onSuccess: () => {
            toast({ title: "메시지가 삭제되었습니다." });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crewId}/chats`] });
        },
        onError: (error: any) => {
            toast({
                title: "삭제 실패",
                description: error.message,
                variant: "destructive"
            });
        }
    });

    const handleSendMessage = () => {
        if (!inputValue.trim() || sendChatMutation.isPending) return;
        sendChatMutation.mutate(inputValue);
        setInputValue("");
    };

    // Improved conditional auto-scroll
    useEffect(() => {
        if (!messagesEndRef.current || !scrollContainerRef.current || !chats) return;

        const container = scrollContainerRef.current;
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 500; // Increased threshold to support large padding

        const lastMessage = chats[chats.length - 1];
        const isMyMessage = lastMessage?.senderId === currentMemberId;

        if (isNearBottom || isMyMessage) {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }, [chats, currentMemberId]);

    if (!isMember) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-10">
                <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mb-6">
                    <LucideMessageSquare className="w-10 h-10 text-white/45" />
                </div>
                <h3 className="text-[17px] font-semibold text-white/80 mb-2">채팅은 멤버 전용입니다</h3>
                <p className="text-sm font-medium text-white/55 leading-relaxed">
                    크루에 가입하여 멤버들과<br />새로운 대화를 시작해보세요!
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full flex-1 relative bg-[#0f0f0f]">
            {/* Messages Area */}
            <div
                ref={scrollContainerRef}
                className="flex-1 overflow-y-auto space-y-4 px-6 pt-6 pb-[30vh] custom-scrollbar"
            >
                {isLoading && !chats ? (
                    <div className="h-full flex items-center justify-center">
                        <LucideLoader2 className="w-6 h-6 text-white/45 animate-spin" />
                    </div>
                ) : chats && chats.length > 0 ? (
                    chats.map((chat, index) => {
                        const isMe = chat.senderId === currentMemberId;
                        const prevChat = index > 0 ? chats[index - 1] : null;
                        const showDate = !prevChat || format(new Date(chat.createdAt), 'yyyy-MM-dd') !== format(new Date(prevChat.createdAt), 'yyyy-MM-dd');

                        return (
                            <div key={chat.id}>
                                {showDate && (
                                    <div className="flex justify-center my-6">
                                        <span className="text-[12px] font-medium text-white/55 bg-white/5 px-2.5 py-1 rounded-full tabular-nums">
                                            {format(new Date(chat.createdAt), 'yyyy년 M월 d일 eeee', { locale: ko })}
                                        </span>
                                    </div>
                                )}
                                <ChatMessageItem
                                    chat={chat}
                                    isMe={isMe}
                                    isAdmin={isAdmin}
                                    onDelete={(id) => deleteChatMutation.mutate(id)}
                                    onSettlementClick={onSettlementClick}
                                    setLocation={setLocation}
                                />
                            </div>
                        );
                    })
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center">
                        <LucideMessageSquare className="w-12 h-12 mb-4 text-white/45" />
                        <p className="text-sm font-medium text-white/45">대화를 시작해보세요</p>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area - 하단 탭(h-20) 위에 위치하도록 bottom-20 설정 */}
            {isMember && (
                <div className="absolute bottom-20 left-0 right-0 p-6 bg-[#0f0f0f] pt-10 z-50">
                    <div className="relative flex items-center gap-2 max-w-4xl mx-auto mb-4">
                        <input
                            type="text"
                            placeholder="메시지 입력..."
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                    e.preventDefault();
                                    handleSendMessage();
                                }
                            }}
                            className="flex-1 bg-white/5 border border-white/10 text-white text-sm rounded-2xl h-12 px-5 focus:outline-none focus:border-brand/50 focus:bg-white/10 transition-all placeholder:text-white/45"
                        />
                        <Button
                            size="icon"
                            title="메시지 전송"
                            disabled={!inputValue.trim() || sendChatMutation.isPending}
                            onClick={handleSendMessage}
                            className="w-12 h-12 rounded-2xl bg-brand hover:bg-brand/90 text-brand-fg transition-all active:scale-95 flex-shrink-0"
                        >
                            {sendChatMutation.isPending ? (
                                <LucideLoader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <LucideSend className="w-5 h-5 ml-0.5" />
                            )}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

// Separate Memoized Message Item for Performance
const ChatMessageItem = memo(({
    chat, isMe, isAdmin, onDelete, onSettlementClick, setLocation
}: {
    chat: ChatMessage,
    isMe: boolean,
    isAdmin: boolean,
    onDelete: (id: string) => void,
    onSettlementClick?: (id: string) => void,
    setLocation: (url: string) => void
}) => {
    const isTemp = chat.id.startsWith('temp-');

    return (
        <div className={cn("flex w-full mb-1 group", isMe ? "justify-end" : "justify-start")}>
            <div className={cn("flex max-w-[85%] gap-2", isMe ? "flex-row-reverse" : "flex-row")}>
                {!isMe && (
                    <div className="w-8 h-8 rounded-full bg-white/10 flex-shrink-0 flex items-center justify-center text-[12px] font-medium text-white/55 overflow-hidden mt-1 border border-white/5">
                        {chat.sender?.profileImageUrl ? (
                            <img src={chat.sender.profileImageUrl} className="w-full h-full object-cover" alt="" />
                        ) : chat.sender?.name?.charAt(0)}
                    </div>
                )}

                <div className={cn("flex flex-col", isMe ? "items-end" : "items-start")}>
                    {!isMe && (
                        <span className="text-[12px] font-medium text-white/55 ml-1 mb-1">{chat.sender?.name}</span>
                    )}

                    <div className="flex items-end gap-1.5 flex-row-reverse group-hover:flex-row">
                        <div className={cn(
                            "px-4 py-2.5 rounded-2xl text-sm font-medium break-all leading-relaxed relative",
                            isMe ? "bg-brand text-brand-fg rounded-tr-none" : "bg-white/10 text-white rounded-tl-none border border-white/5",
                            (chat.type === 'settlement' || chat.metadata?.type === 'GOLF_BOOKING') && "bg-transparent p-0 shadow-none border-none",
                            isTemp && "opacity-60"
                        )}>
                            {chat.type === 'settlement' ? (
                                <div className="bg-white text-black rounded-2xl overflow-hidden w-64 border border-white/10">
                                    <div className="bg-brand px-4 py-3 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg">💰</span>
                                            <span className="font-semibold text-xs">정산 요청</span>
                                        </div>
                                        <span className="text-xs font-semibold bg-black/10 px-2 py-0.5 rounded-full">분할</span>
                                    </div>
                                    <div className="p-5">
                                        <h3 className="font-bold text-sm mb-2 opacity-80">{chat.metadata?.title}</h3>
                                        <div className="text-2xl font-semibold mb-5 tracking-tight tabular-nums">
                                            {chat.metadata?.totalAmount?.toLocaleString()}<span className="text-sm font-bold ml-0.5">원</span>
                                        </div>
                                        <Button
                                            size="sm"
                                            className="w-full bg-black text-white hover:bg-neutral-800 font-bold h-10 rounded-xl text-xs transition-all active:scale-[0.98]"
                                            onClick={() => chat.metadata?.settlementId && onSettlementClick?.(chat.metadata.settlementId)}
                                        >
                                            상세 내역 확인하기
                                        </Button>
                                    </div>
                                </div>
                            ) : chat.metadata?.type === 'GOLF_BOOKING' ? (
                                <div className="bg-[#1A1A1A] border border-white/10 rounded-2xl overflow-hidden w-64">
                                    <div className="bg-blue-500 px-4 py-2.5 flex items-center gap-2">
                                        <span className="text-sm">⛳️</span>
                                        <span className="font-semibold text-xs text-white">부킹 공유</span>
                                    </div>
                                    <div className="p-5 space-y-4">
                                        <div>
                                            <h3 className="font-semibold text-white text-base line-clamp-1 leading-tight">{chat.metadata.courseName}</h3>
                                            <div className="flex items-center gap-2 mt-1.5 text-white/55 text-xs font-medium tabular-nums">
                                                <span>{new Date(chat.metadata.datetime).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}</span>
                                                <span className="w-1 h-1 rounded-full bg-white/10" />
                                                <span>{new Date(chat.metadata.datetime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                        </div>
                                        <div className="text-xl font-semibold text-blue-400 tracking-tight tabular-nums">
                                            {chat.metadata.greenFee.toLocaleString()}<span className="text-xs ml-0.5 text-blue-400/60">원</span>
                                        </div>
                                        <Button
                                            size="sm" variant="ghost"
                                            className="w-full bg-white/5 hover:bg-white/10 text-white font-semibold h-10 rounded-xl text-xs border border-white/5 transition-all active:scale-95"
                                            onClick={() => setLocation(`/golf/booking-list/${chat.metadata.bookingId}`)}
                                        >
                                            자세히 보기
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                chat.message
                            )}
                        </div>

                        <div className={cn("flex flex-col mb-1", isMe ? "items-end" : "items-start")}>
                            {(isMe || isAdmin) && !isTemp && (
                                <button
                                    onClick={() => {
                                        if (confirm("메시지를 삭제하시겠습니까?")) {
                                            onDelete(chat.id);
                                        }
                                    }}
                                    title="메시지 삭제"
                                    className="opacity-0 group-hover:opacity-100 p-1 text-white/45 hover:text-red-500 transition-all mb-1"
                                >
                                    <LucideTrash2 className="w-3 h-3" />
                                </button>
                            )}
                            <span className="text-xs font-medium text-white/45 whitespace-nowrap px-0.5 tabular-nums">
                                {isTemp ? "전송 중" : format(new Date(chat.createdAt), 'a h:mm', { locale: ko })}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

ChatMessageItem.displayName = "ChatMessageItem";
