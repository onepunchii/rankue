import { useState, useEffect, useMemo } from "react";
import {
    LucideMessageSquare,
    LucideX,
    LucideCheck,
    LucidePlus,
    LucideList,
    LucideTrash2,
    LucideSearch
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

// Sections
import { CourseSearchSection } from "./booking/CourseSearchSection";
import { TimeSelectionSection } from "./booking/TimeSelectionSection";
import { OptionSelectionSection } from "./booking/OptionSelectionSection";

import { COURSES } from "@/golf/data/golfCourses";

interface BookingCreateFormProps {
    onClose: () => void;
    initialMode?: 'BOOKING' | 'JOIN';
}

export function BookingCreateForm({ onClose, initialMode = 'BOOKING' }: BookingCreateFormProps) {
    const { toast } = useToast();
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCourse, setSelectedCourse] = useState<any>(null);
    const [date, setDate] = useState("");
    const [currentTime, setCurrentTime] = useState("");
    const [timeList, setTimeList] = useState<string[]>([]);
    const [managerPhone, setManagerPhone] = useState("010-1234-5678");
    const [greenFee, setGreenFee] = useState("");
    const [isHotDeal, setIsHotDeal] = useState(false);
    const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
    const [comment, setComment] = useState("");
    const [isBlind, setIsBlind] = useState(false);
    const [blindName, setBlindName] = useState("");
    const [listingType, setListingType] = useState<'BOOKING' | 'JOIN'>(initialMode);
    const [joinHeadcount, setJoinHeadcount] = useState(1);
    const [joinCondition, setJoinCondition] = useState<string[]>([]);
    const [policyType, setPolicyType] = useState("POLICY_STANDARD");
    const [policyCustomText, setPolicyCustomText] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [viewMode, setViewMode] = useState<'create' | 'list'>('create');

    // Fetch My Bookings for List View
    const { data: myBookings = [], refetch: refetchMyBookings } = useQuery({
        queryKey: ['/api/hiq/golf/bookings', 'my', managerPhone],
        queryFn: async () => {
            const all = await apiRequest("/api/hiq/golf/bookings");
            return all.filter((b: any) => b.managerPhone === managerPhone);
        },
        enabled: viewMode === 'list'
    });

    const handleDelete = async (id: string) => {
        if (!confirm("정말 삭제하시겠습니까?")) return;
        try {
            await apiRequest(`/api/hiq/golf/bookings/${id}`, { method: "DELETE" });
            toast({ title: "삭제되었습니다." });
            refetchMyBookings();
        } catch (e) {
            toast({ variant: "destructive", title: "삭제 실패", description: "잠시 후 다시 시도해주세요." });
        }
    };

    const { data: user, isLoading: isUserLoading } = useQuery<any>({
        queryKey: ["/api/hiq/me"],
    });

    // Check if user is a manager/admin
    const isManager = useMemo(() => {
        if (!user) return false;
        const managerRoles = ['admin', 'super_admin', 'store_owner', 'booking_manager'];
        return managerRoles.includes(user.role);
    }, [user]);

    useEffect(() => {
        if (user?.phone) {
            setManagerPhone(user.phone);
        }
    }, [user]);

    // Force JOIN mode for non-managers
    useEffect(() => {
        if (!isManager && listingType === 'BOOKING') {
            setListingType('JOIN');
        }
    }, [isManager, listingType]);

    // Auto-fill blind name when blind mode is enabled
    useEffect(() => {
        if (isBlind && !blindName && selectedCourse) {
            setBlindName(`${selectedCourse.region.substring(0, 2)}권 명문`);
        }
    }, [isBlind, selectedCourse]);

    const toggleOption = (id: string) => {
        setSelectedOptions(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const handleSubmit = async () => {
        if (!selectedCourse || !date || timeList.length === 0 || !greenFee) {
            toast({
                variant: "destructive",
                title: "입력 확인 필요",
                description: "필수 항목(골프장, 날짜, 티오프 시간, 그린피)을 모두 입력해주세요."
            });
            return;
        }

        setIsSubmitting(true);

        const bookings = timeList.map(t => ({
            courseId: String(selectedCourse.id),
            courseName: selectedCourse.name,
            region: selectedCourse.region,
            datetime: `${date}T${t}:00`,
            managerPhone,
            greenFee: parseInt(greenFee.replace(/,/g, "")),
            isHotDeal,
            options: selectedOptions,
            comment,
            isBlind,
            blindName: isBlind ? blindName : null,
            policyType,
            policyCustomText: policyType === 'POLICY_CUSTOM' ? policyCustomText : null,
            listingType,
            joinHeadcount: listingType === 'JOIN' ? joinHeadcount : null,
            joinCondition: listingType === 'JOIN' ? joinCondition.join(',') : null
        }));

        console.log("Submitting Batch Bookings:", bookings);

        try {
            await apiRequest("/api/hiq/golf/bookings", {
                method: "POST",
                body: bookings
            });
            setIsSubmitting(false);
            setShowSuccess(true);
        } catch (error: any) {
            console.error("Failed to create bookings:", error);
            const message = error.message || "부킹 등록에 실패했습니다. 다시 시도해주세요.";
            toast({
                variant: "destructive",
                title: "등록 실패",
                description: message
            });
            setIsSubmitting(false);
        }
    };

    const handleContinue = () => {
        // Reset lists for continuous registration
        setTimeList([]);
        setDate("");
        setCurrentTime("");
        setShowSuccess(false);
    };

    const handleFinished = () => {
        onClose();
    };

    if (showSuccess) {
        return (
            <div className="h-full flex flex-col items-center justify-center p-8 bg-[#0A0A0A]">
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="w-20 h-20 rounded-full bg-[#64DD17]/20 flex items-center justify-center mb-6"
                >
                    <LucideCheck className="w-10 h-10 text-[#64DD17]" />
                </motion.div>
                <h2 className="text-2xl font-black text-white mb-2">등록 완료!</h2>
                <p className="text-white/40 text-center mb-10">티타임이 성공적으로 등록되었습니다.</p>
                <div className="space-y-4 w-full max-w-xs">
                    <button
                        onClick={handleContinue}
                        className="w-full py-5 rounded-2xl bg-[#64DD17] text-[#051907] font-black uppercase tracking-widest shadow-[0_0_20px_rgba(100,221,23,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                        계속해서 등록하기
                    </button>
                    <button
                        onClick={handleFinished}
                        className="w-full py-5 rounded-2xl bg-white/5 text-white/60 font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                    >
                        닫기
                    </button>
                </div>
            </div>
        );
    }

    if (isUserLoading) {
        return <div className="h-full flex items-center justify-center bg-[#0A0A0A] text-white">Loading...</div>;
    }

    return (
        <div className="h-full flex flex-col bg-[#0A0A0A] overflow-hidden">
            {/* Header */}
            <div className="px-6 h-16 flex items-center justify-between border-b border-white/5 bg-[#0A0A0A] shrink-0">
                <h2 className="text-lg font-black text-white">
                    {viewMode === 'create'
                        ? (isManager
                            ? (listingType === 'JOIN' ? "조인 등록" : "부킹 등록")
                            : "조인 등록")
                        : "내가 만든 부킹"}
                </h2>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setViewMode(prev => prev === 'create' ? 'list' : 'create')}
                        className={cn(
                            "px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5",
                            viewMode === 'list'
                                ? "bg-[#64DD17] text-[#051907]"
                                : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
                        )}
                    >
                        {viewMode === 'create' ? (
                            <>
                                <LucideList className="w-3.5 h-3.5" />
                                <span>내 부킹 관리</span>
                            </>
                        ) : (
                            <>
                                <LucidePlus className="w-3.5 h-3.5" />
                                <span>부킹 등록</span>
                            </>
                        )}
                    </button>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-white/5 transition-colors group"
                        title="닫기"
                    >
                        <LucideX className="w-6 h-6 text-white/40 group-hover:text-white" />
                    </button>
                </div>
            </div>

            {/* Type Switcher - Only visible to Managers */}
            {viewMode === 'create' && isManager && (
                <div className="p-4 bg-[#0A0A0A] border-b border-white/5">
                    <div className="flex bg-[#1E1E1E] p-1 rounded-2xl">
                        <button
                            onClick={() => setListingType('BOOKING')}
                            className={cn(
                                "flex-1 py-3 rounded-xl text-sm font-black transition-all flex items-center justify-center gap-2",
                                listingType === 'BOOKING'
                                    ? "bg-[#64DD17] text-[#051907] shadow-lg"
                                    : "text-white/40 hover:text-white"
                            )}
                        >
                            <span>부킹</span>
                        </button>
                        <button
                            onClick={() => setListingType('JOIN')}
                            className={cn(
                                "flex-1 py-3 rounded-xl text-sm font-black transition-all flex items-center justify-center gap-2",
                                listingType === 'JOIN'
                                    ? "bg-[#FF6B00] text-white shadow-lg"
                                    : "text-white/40 hover:text-white"
                            )}
                        >
                            <span>조인</span>
                        </button>
                    </div>
                </div>
            )}

            {viewMode === 'list' ? (
                <div className="flex-1 overflow-y-auto p-6 space-y-3 no-scrollbar pb-32">
                    {/* List View Logic is kept simple here */}
                    {myBookings.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-white/20 space-y-4">
                            <LucideList className="w-12 h-12 opacity-20" />
                            <span className="text-sm font-bold">등록한 부킹이 없습니다.</span>
                        </div>
                    ) : (
                        myBookings.map((booking: any) => (
                            <div key={booking.id} className="bg-[#1E1E1E] border border-white/5 rounded-2xl p-5 flex items-center justify-between group hover:border-white/10 transition-all">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="text-sm font-black text-white">
                                            {booking.isBlind ? booking.blindName : booking.courseName}
                                        </span>
                                        <span className={cn(
                                            "text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-tighter",
                                            booking.listingType === 'JOIN'
                                                ? "bg-[#FF6B00]/20 text-[#FF6B00] border border-[#FF6B00]/20"
                                                : "bg-[#64DD17]/20 text-[#64DD17] border border-[#64DD17]/20"
                                        )}>
                                            {booking.listingType === 'JOIN' ? "조인" : "부킹"}
                                        </span>
                                        {booking.isBlind && <span className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded text-white/60">비공개</span>}
                                    </div>
                                    <div className="text-[11px] font-bold text-white/40 tracking-widest">
                                        {new Date(booking.datetime).toLocaleDateString()} {new Date(booking.datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-right">
                                        <div className="text-sm font-black text-[#64DD17]">
                                            {booking.greenFee.toLocaleString()}<span className="text-[10px] text-white/40 ml-0.5">원</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleDelete(booking.id)}
                                        className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center hover:bg-red-500 hover:text-white text-red-500 transition-colors"
                                        title="삭제"
                                    >
                                        <LucideTrash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            ) : (
                <>
                    <div className="flex-1 overflow-y-auto p-6 space-y-10 no-scrollbar pb-32">
                        {/* 1. Course Selection */}
                        <CourseSearchSection
                            searchQuery={searchQuery}
                            setSearchQuery={setSearchQuery}
                            selectedCourse={selectedCourse}
                            setSelectedCourse={setSelectedCourse}
                            isManager={isManager}
                            isBlind={isBlind}
                            setIsBlind={setIsBlind}
                            blindName={blindName}
                            setBlindName={setBlindName}
                        />

                        {/* 2. Date & Time */}
                        <TimeSelectionSection
                            date={date}
                            setDate={setDate}
                            currentTime={currentTime}
                            setCurrentTime={setCurrentTime}
                            timeList={timeList}
                            setTimeList={setTimeList}
                        />

                        {/* 3. Options & Pricing */}
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
                            isManager={isManager}
                            policyType={policyType}
                            setPolicyType={setPolicyType}
                            policyCustomText={policyCustomText}
                            setPolicyCustomText={setPolicyCustomText}
                            selectedOptions={selectedOptions}
                            toggleOption={toggleOption}
                        />

                        {/* 4. Manager Comment */}
                        <section className="space-y-6">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-8 h-8 rounded-lg bg-[#64DD17]/10 flex items-center justify-center">
                                    <LucideMessageSquare className="w-4 h-4 text-[#64DD17]" />
                                </div>
                                <h3 className="text-sm font-black text-white uppercase tracking-widest">5. 매니저 코멘트</h3>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] ml-1">담당자 연락처 (필수)</label>
                                    <div className="relative">
                                        <LucideSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 hidden" />
                                        <input
                                            type="tel"
                                            inputMode="tel"
                                            value={managerPhone}
                                            onChange={(e) => setManagerPhone(e.target.value)}
                                            placeholder="010-0000-0000"
                                            title="담당자 연락처"
                                            className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 px-4 text-sm font-bold text-white focus:outline-none focus:border-[#64DD17]/50 transition-all"
                                        />
                                    </div>
                                    <p className="text-[9px] font-bold text-white/10 uppercase tracking-tight ml-1 leading-relaxed">
                                        예약 문자를 수신할 번호를 입력해주세요. 기본적으로 회원정보상의 번호가 입력됩니다.
                                    </p>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em] ml-1">매니저 코멘트</label>
                                    <textarea
                                        value={comment}
                                        onChange={(e) => setComment(e.target.value)}
                                        placeholder="공지사항이나 전달 사항을 입력해주세요 (최대 100자)"
                                        maxLength={100}
                                        title="매니저 코멘트"
                                        className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 px-4 text-sm font-bold text-white focus:outline-none focus:border-[#64DD17]/50 h-32 resize-none no-scrollbar"
                                    />
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* Submit Button */}
                    <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A] to-transparent shrink-0">
                        <button
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                            className={cn(
                                "w-full py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-sm transition-all flex items-center justify-center gap-3 active:scale-[0.98]",
                                isSubmitting
                                    ? "bg-[#333] text-white/20"
                                    : listingType === 'JOIN'
                                        ? "bg-[#FF6B00] text-white shadow-[0_10px_30px_rgba(255,107,0,0.3)] hover:scale-[1.02]"
                                        : "bg-[#64DD17] text-[#051907] shadow-[0_10px_30px_rgba(100,221,23,0.3)] hover:scale-[1.02]"
                            )}
                        >
                            {isSubmitting ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                    등록 중...
                                </>
                            ) : listingType === 'JOIN' ? "조인 등록하기" : "부킹 등록하기"}
                        </button>
                        <p className="text-[9px] font-bold text-white/20 text-center mt-3 uppercase tracking-widest">
                            Tip: 시간대별로 가격이 다른 경우, 나눠서 등록해 주세요.
                        </p>
                    </div>
                </>
            )}
        </div>
    );
}
