import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LucideX, LucideLoader2 } from 'lucide-react';
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

    // --- State Management ---
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCourse, setSelectedCourse] = useState<any>(null);
    const [date, setDate] = useState("");
    const [currentTime, setCurrentTime] = useState("");
    const [timeList, setTimeList] = useState<string[]>([]);
    const [greenFee, setGreenFee] = useState("");
    const [isHotDeal, setIsHotDeal] = useState(false);
    const [listingType, setListingType] = useState<'BOOKING' | 'JOIN'>(initialMode);

    // Join Specific
    const [joinHeadcount, setJoinHeadcount] = useState(1);
    const [joinCondition, setJoinCondition] = useState<string[]>([]);

    // Manager Specific
    const [isBlind, setIsBlind] = useState(false);
    const [blindName, setBlindName] = useState("");
    const [policyType, setPolicyType] = useState("POLICY_STANDARD");
    const [policyCustomText, setPolicyCustomText] = useState("");
    const [selectedOptions, setSelectedOptions] = useState<string[]>([]);

    // --- Mutation ---
    const createMutation = useMutation({
        mutationFn: async () => {
            if (!selectedCourse) throw new Error("골프장을 선택해주세요");
            if (!date) throw new Error("날짜를 선택해주세요");
            if (timeList.length === 0) throw new Error("시간을 최소 1개 이상 추가해주세요");
            if (!greenFee) throw new Error("그린피를 입력해주세요");

            // Bulk create for multiple times
            const promises = timeList.map(time => {
                const dateTimeStr = `${date}T${time}:00`;
                return apiRequest('/api/hiq/golf/bookings', {
                    method: 'POST',
                    body: {
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
                        managerPhone: "010-1234-5678" // 실제로는 유저 정보에서 가져와야 함
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
                <h2 className="text-lg font-black tracking-tight">티타임 등록</h2>
                <button onClick={onClose} className="p-2 -mr-2 text-white/40 hover:text-white transition-colors">
                    <LucideX className="w-6 h-6" />
                </button>
            </div>

            {/* Scrollable Content */}
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
                />

                <TimeSelectionSection
                    date={date}
                    setDate={setDate}
                    currentTime={currentTime}
                    setCurrentTime={setCurrentTime}
                    timeList={timeList}
                    setTimeList={setTimeList}
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
                />
            </div>

            {/* Footer Action */}
            <div className="p-6 border-t border-white/5 bg-[#121212] shrink-0 absolute bottom-0 left-0 right-0">
                <button
                    onClick={() => createMutation.mutate()}
                    disabled={!isReady || createMutation.isPending}
                    className={cn(
                        "w-full h-14 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 transition-all",
                        isReady
                            ? "bg-[#64DD17] text-[#051907] hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-[#64DD17]/20"
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
        </div>
    );
}
