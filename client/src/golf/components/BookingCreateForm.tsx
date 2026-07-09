import { useState } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { LucideX, LucideLoader2, LucideUser, LucideListOrdered, LucideTrash2 } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { CourseSearchSection } from './booking/CourseSearchSection';
import { TimeSelectionSection } from './booking/TimeSelectionSection';
import { OptionSelectionSection } from './booking/OptionSelectionSection';

interface BookingCreateFormProps {
    onClose: () => void;
    initialMode: 'BOOKING' | 'JOIN';
}

export function BookingCreateForm({ onClose, initialMode }: BookingCreateFormProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Authenticated user — bookings must be stamped/filtered by the real owner, not a mock phone.
    const { data: me } = useQuery<any>({ queryKey: ["/api/hiq/me"] });

    // --- State Management ---
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCourse, setSelectedCourse] = useState<any>(null);
    const [date, setDate] = useState("");
    const [currentTime, setCurrentTime] = useState("");
    const [timeList, setTimeList] = useState<string[]>([]);
    const [greenFee, setGreenFee] = useState("");
    const [isHotDeal, setIsHotDeal] = useState(false);
    const [listingType, setListingType] = useState<'BOOKING' | 'JOIN'>(initialMode);
    const [comment, setComment] = useState("");

    // Join Specific
    const [joinHeadcount, setJoinHeadcount] = useState(1);
    const [joinCondition, setJoinCondition] = useState<string[]>([]);

    // Manager Specific
    const [isBlind, setIsBlind] = useState(false);
    const [blindName, setBlindName] = useState("");
    const [policyType, setPolicyType] = useState("POLICY_STANDARD");
    const [policyCustomText, setPolicyCustomText] = useState("");
    const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
    const [showHistory, setShowHistory] = useState(false);

    // --- History Query ---
    const { data: myBookings } = useQuery({
        queryKey: ['/api/hiq/golf/bookings', 'my', me?.phone],
        queryFn: () => apiRequest('/api/hiq/golf/bookings').then(res => res.filter((b: any) => b.managerPhone === me?.phone)),
        enabled: showHistory && !!me?.phone
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => apiRequest(`/api/hiq/golf/bookings/${id}`, { method: 'DELETE' }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['/api/hiq/golf/bookings'] });
            queryClient.invalidateQueries({ queryKey: ['/api/hiq/golf/bookings/counts'] });
            toast({ title: "삭제 완료", description: "티타임이 삭제되었습니다." });
        }
    });

    // --- Mutation ---
    const createMutation = useMutation({
        mutationFn: async () => {
            if (!selectedCourse) throw new Error("골프장을 선택해주세요");
            if (!date) throw new Error("날짜를 선택해주세요");
            if (timeList.length === 0) throw new Error("시간을 최소 1개 이상 추가해주세요");
            if (!greenFee) throw new Error("그린피를 입력해주세요");
            if (!me?.phone) throw new Error("로그인 정보를 확인할 수 없습니다");

            // Bulk create for multiple times
            const promises = timeList.map(time => {
                const dateTimeStr = `${date}T${time}:00`;
                return apiRequest('/api/hiq/golf/bookings', {
                    method: 'POST',
                    body: {
                        courseId: String(selectedCourse.id),
                        courseName: selectedCourse.name,
                        region: selectedCourse.region,
                        datetime: dateTimeStr,
                        greenFee: parseInt(greenFee.replace(/,/g, "")),
                        listingType,
                        options: selectedOptions,
                        isHotDeal,
                        isBlind,
                        blindName: isBlind ? blindName : null,
                        joinHeadcount: listingType === 'JOIN' ? joinHeadcount : null,
                        joinCondition: listingType === 'JOIN' ? joinCondition.join(',') : null,
                        policyType,
                        policyCustomText,
                        comment,
                        managerPhone: me.phone
                    }
                });
            });

            await Promise.all(promises);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['/api/hiq/golf/bookings'] });
            queryClient.invalidateQueries({ queryKey: ['/api/hiq/golf/joins'] });
            queryClient.invalidateQueries({ queryKey: ['/api/hiq/golf/bookings/counts'] });
            toast({ title: "등록 완료", description: `${timeList.length}건의 티타임이 등록되었습니다.` });
            onClose();
        },
        onError: (err: any) => {
            toast({ variant: "destructive", title: "등록 실패", description: err.message });
        }
    });

    const isReady = selectedCourse && date && timeList.length > 0 && greenFee;

    return (
        <div className="h-full flex flex-col bg-[#121212] text-white relative">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/5 shrink-0">
                <div className="flex items-center gap-4">
                    <h2 className="text-lg font-black tracking-tight shrink-0">티타임 등록</h2>
                    {/* Listing Type Toggle */}
                    <div className="flex bg-[#1A1A1A] rounded-full p-1 border border-white/5 h-10">
                        {(['BOOKING', 'JOIN'] as const).map(type => (
                            <button
                                key={type}
                                onClick={() => setListingType(type)}
                                title={type === 'BOOKING' ? '부킹' : '조인'}
                                aria-label={type === 'BOOKING' ? '부킹' : '조인'}
                                className={cn(
                                    "px-4 h-full rounded-full text-[10px] font-black transition-all flex items-center justify-center whitespace-nowrap min-w-[60px]",
                                    listingType === type ? (type === 'BOOKING' ? "bg-[#64DD17] text-[#051907]" : "bg-[#FF6B00] text-white") : "text-white/40 hover:text-white"
                                )}
                            >
                                {type === 'BOOKING' ? '부킹' : '조인'}
                            </button>
                        ))}
                    </div>

                    {/* History Toggle */}
                    <button
                        onClick={() => setShowHistory(!showHistory)}
                        title="등록내역 확인"
                        aria-label="등록내역 확인"
                        className={cn(
                            "h-10 px-4 rounded-full border border-white/5 flex items-center gap-2 transition-all ml-2",
                            showHistory
                                ? "bg-white text-black font-bold"
                                : "bg-[#1A1A1A] text-white/40 hover:text-white"
                        )}
                    >
                        <LucideListOrdered className="w-4 h-4" />
                        <span className="text-[10px] font-bold">등록내역</span>
                    </button>
                </div>
                <button
                    onClick={onClose}
                    title="닫기"
                    aria-label="닫기"
                    className="p-2 -mr-2 text-white/40 hover:text-white transition-colors"
                >
                    <LucideX className="w-6 h-6" />
                </button>
            </div>

            {/* Content Area */}
            {showHistory ? (
                <div className="flex-1 overflow-y-auto px-6 py-6 pb-32">
                    <div className="space-y-4">
                        {myBookings?.map((booking: any) => (
                            <div key={booking.id} className="bg-white/5 rounded-2xl p-5 border border-white/5 flex items-center justify-between">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-black", booking.listingType === 'JOIN' ? "bg-[#FF6B00]/20 text-[#FF6B00]" : "bg-[#64DD17]/20 text-[#64DD17]")}>
                                            {booking.listingType === 'JOIN' ? 'JO' : 'BK'}
                                        </span>
                                        <span className="text-sm font-bold text-white">{booking.courseName}</span>
                                    </div>
                                    <div className="text-xs text-white/60 font-medium">
                                        {new Date(booking.datetime).toLocaleDateString()} {new Date(booking.datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                    <div className="text-sm font-black text-white mt-1">{booking.greenFee.toLocaleString()}원</div>
                                </div>
                                <button
                                    onClick={() => deleteMutation.mutate(booking.id)}
                                    className="p-3 rounded-full bg-white/5 text-white/40 hover:bg-red-500/10 hover:text-red-500 transition-colors"
                                >
                                    <LucideTrash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                        {(!myBookings || myBookings.length === 0) && (
                            <div className="text-center py-20 text-white/20">
                                <LucideListOrdered className="w-10 h-10 mx-auto mb-4 opacity-20" />
                                <p className="text-xs">등록된 내역이 없습니다.</p>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-10 pb-32">
                    <CourseSearchSection
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                        selectedCourse={selectedCourse}
                        setSelectedCourse={setSelectedCourse}
                        isManager={true} // 실제 권한 체크 필요
                        isBlind={isBlind}
                        setIsBlind={setIsBlind}
                        blindName={blindName}
                        setBlindName={setBlindName}
                        listingType={listingType}
                    />

                    <TimeSelectionSection
                        date={date}
                        setDate={setDate}
                        currentTime={currentTime}
                        setCurrentTime={setCurrentTime}
                        timeList={timeList}
                        setTimeList={setTimeList}
                        listingType={listingType}
                    />

                    <OptionSelectionSection
                        greenFee={greenFee}
                        setGreenFee={setGreenFee}
                        isHotDeal={isHotDeal}
                        setIsHotDeal={setIsHotDeal}
                        listingType={listingType}
                        joinHeadcount={joinHeadcount}
                        setJoinHeadcount={setJoinHeadcount}
                        joinCondition={joinCondition}
                        setJoinCondition={setJoinCondition}
                        isManager={true}
                        policyType={policyType}
                        setPolicyType={setPolicyType}
                        policyCustomText={policyCustomText}
                        setPolicyCustomText={setPolicyCustomText}
                        selectedOptions={selectedOptions}
                        toggleOption={(id) => setSelectedOptions(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])}
                        comment={comment}
                        setComment={setComment}
                    />
                </div>
            )}

            {/* Footer Action */}
            {!showHistory && (
                <div className="p-6 border-t border-white/5 bg-[#121212] shrink-0 absolute bottom-0 left-0 right-0">
                    <button
                        onClick={() => createMutation.mutate()}
                        disabled={!isReady || createMutation.isPending}
                        className={cn(
                            "w-full h-14 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-all",
                            isReady
                                ? (listingType === 'JOIN' ? "bg-[#FF6B00] text-white hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-[#FF6B00]/20" : "bg-[#64DD17] text-[#051907] hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-[#64DD17]/20")
                                : "bg-white/5 text-white/20 cursor-not-allowed"
                        )}
                    >
                        {createMutation.isPending ? (
                            <>
                                <LucideLoader2 className="w-5 h-5 animate-spin" />
                                <span>등록 중...</span>
                            </>
                        ) : (
                            <span>{timeList.length > 0 ? `${timeList.length}건 일괄 등록하기` : "등록하기"}</span>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
}
