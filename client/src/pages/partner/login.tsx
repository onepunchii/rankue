import { useState } from "react";
import { useNativeBridge } from "@/hooks/useNativeBridge";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { LucideBriefcase, LucideArrowLeft, LucideCheckCircle2 } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

// Schema for login
const loginSchema = z.object({
    phone: z.string().min(10, "휴대폰 번호를 입력해주세요."),
    password: z.string().min(4, "비밀번호는 4자리 이상이어야 합니다."), // Changed to required
});

type LoginForm = z.infer<typeof loginSchema>;

export default function PartnerLogin() {
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
        resolver: zodResolver(loginSchema)
    });
    const { sendMessage } = useNativeBridge();

    const onSubmit = async (data: LoginForm) => {
        setIsSubmitting(true);
        try {
            // Phase 1: Simple check. In real app, verify password or SMS code.
            // Here we just check if this user is an owner of any store.
            const result = await apiRequest("/api/hiq/partner/login", {
                method: "POST",
                body: data
            });

            if (result.success) {
                toast({
                    title: "로그인 성공",
                    description: `${result.storeName} 사장님, 환영합니다!`,
                    variant: "success"
                });

                if (result.role === 'super_admin' || result.role === 'admin') {
                    setLocation("/admin/dashboard");
                } else {
                    setLocation("/partner/dashboard");
                }

                // Notify Native App
                sendMessage({
                    type: 'LOGIN_SUCCESS',
                    payload: {
                        token: 'cookie-session',
                        user: result
                    }
                });
            }
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "로그인 실패",
                description: error.message || "등록된 매장의 관리자가 아닙니다.",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#050505] text-white flex flex-col p-6 font-sans">
            <div className="flex items-center mb-10">
                <button onClick={() => setLocation("/menu")} className="p-2 -ml-2 text-white/40 hover:text-white" aria-label="Go back">
                    <LucideArrowLeft className="w-6 h-6" />
                </button>
            </div>

            <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-12 text-center"
                >
                    <div className="w-20 h-20 bg-[#10b981]/10 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-[#10b981]/20 shadow-[0_0_40px_rgba(16,185,129,0.1)]">
                        <LucideBriefcase className="w-10 h-10 text-[#10b981]" />
                    </div>
                    <h1 className="text-3xl font-black mb-2 tracking-tighter">파트너 로그인</h1>
                    <p className="text-white/40">매장 관리자 계정으로 접속하세요.</p>
                </motion.div>

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-white/40 uppercase tracking-widest pl-1">Phone Number</label>
                        <Input
                            {...register("phone")}
                            type="tel"
                            placeholder="01012345678"
                            className="h-16 bg-white/5 border-white/10 rounded-2xl text-xl font-bold px-6 focus:border-[#10b981] transition-all"
                        />
                        {errors.phone && <p className="text-red-400 text-xs pl-1">{errors.phone.message}</p>}
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-bold text-white/40 uppercase tracking-widest pl-1">Password</label>
                        <Input
                            {...register("password")}
                            type="password"
                            placeholder="비밀번호"
                            className="h-16 bg-white/5 border-white/10 rounded-2xl text-xl font-bold px-6 focus:border-[#10b981] transition-all"
                        />
                        {errors.password && <p className="text-red-400 text-xs pl-1">{errors.password.message}</p>}
                    </div>

                    <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full h-16 bg-[#10b981] hover:bg-[#059669] text-black text-lg font-black rounded-2xl transition-all shadow-lg active:scale-[0.98]"
                    >
                        {isSubmitting ? "확인 중..." : "매장 관리 접속"}
                    </Button>
                </form>


                <div className="mt-8 text-center space-y-4">
                    <p className="text-xs text-white/20">
                        아직 파트너가 아니신가요?
                    </p>
                    <PartnerInquiryDialog />
                </div>
            </div>
        </div>
    );
}

// Simple Partner Inquiry Dialog (Lite Version)
function PartnerInquiryDialog() {
    const [isOpen, setIsOpen] = useState(false);
    const [step, setStep] = useState<"form" | "success">("form");
    const { toast } = useToast();

    // Form State
    const [formData, setFormData] = useState({
        ownerName: "",
        phoneNumber: "",
        storeName: "",
        region: "",
        regionGu: "",
        regionDong: "",
        businessNumber: "",
        businessLicenseFile: null as File | null
    });

    // Seoul Gu List (Sample)
    const seoulGuList = [
        "강남구", "강동구", "강북구", "강서구", "관악구", "광진구", "구로구", "금천구",
        "노원구", "도봉구", "동대문구", "동작구", "마포구", "서대문구", "서초구", "성동구",
        "성북구", "송파구", "양천구", "영등포구", "용산구", "은평구", "종로구", "중구", "중랑구"
    ];
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.ownerName || !formData.phoneNumber) {
            toast({ title: "필수 정보 누락", description: "성함과 연락처를 모두 입력해주세요.", variant: "destructive" });
            return;
        }

        setIsSubmitting(true);
        try {
            // Construct payload
            const payload = {
                ...formData,
                region: `${formData.region} ${formData.regionGu} ${formData.regionDong}`.trim(),
                regionDetail: `${formData.regionGu} ${formData.regionDong}`.trim(),
                // For file, normally we'd upload to S3. Here we mock it or send as name if not supporting multipart yet.
                // To keep it simple for "Ultra Simple", we'll just send the name if a file is selected.
                businessLicenseFile: formData.businessLicenseFile ? formData.businessLicenseFile.name : null
            };

            await apiRequest("/api/hiq/partner/inquiry", {
                method: "POST",
                body: payload
            });
            setStep("success");
        } catch (error: any) {
            console.error("Inquiry Error:", error);
            toast({
                title: "오류 발생",
                description: error.message || "잠시 후 다시 시도해주세요.",
                variant: "destructive"
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        setIsOpen(false);
        setStep("form");
        setStep("form");
        setFormData({
            ownerName: "", phoneNumber: "", storeName: "", region: "",
            regionGu: "", regionDong: "", businessNumber: "", businessLicenseFile: null
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" className="w-full h-14 bg-white/5 border-white/10 text-white hover:bg-white/10 rounded-2xl">
                    <span className="font-bold text-[#10b981]">입점하기</span>
                </Button>
            </DialogTrigger>
            <DialogContent className="bg-[#111] border-white/10 text-white max-w-md w-full rounded-[2.5rem] p-8">
                <DialogHeader>
                    <DialogTitle className="text-3xl font-black text-center tracking-tighter mb-2">
                        {step === "form" ? "내 매장 무료 등록" : "신청 완료!"}
                    </DialogTitle>
                    <DialogDescription className="text-center text-white/50 text-base font-medium">
                        {step === "form" ? "담당자 확인 후 연락드립니다." : "입점 문의가 정상 접수되었습니다."}
                    </DialogDescription>
                </DialogHeader>

                {step === "form" ? (
                    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                        <div className="space-y-3">
                            <div>
                                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-1 mb-1 block">
                                    사장님 성함 <span className="text-red-500">*</span>
                                </label>
                                <Input
                                    required
                                    placeholder="홍길동"
                                    value={formData.ownerName}
                                    onChange={e => setFormData({ ...formData, ownerName: e.target.value })}
                                    className="bg-white/5 border-white/10 h-14 rounded-2xl px-5 text-lg font-bold focus:border-[#10b981] transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-1 mb-1 block">
                                    연락처 <span className="text-red-500">*</span>
                                </label>
                                <Input
                                    required
                                    type="tel"
                                    placeholder="010-1234-5678"
                                    value={formData.phoneNumber}
                                    onChange={e => setFormData({ ...formData, phoneNumber: e.target.value })}
                                    className="bg-white/5 border-white/10 h-10 rounded-xl focus:border-[#10b981]"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-1 mb-1 block">
                                    매장명 (선택)
                                </label>
                                <Input
                                    placeholder="운영 중인 매장명"
                                    value={formData.storeName}
                                    onChange={e => setFormData({ ...formData, storeName: e.target.value })}
                                    className="bg-white/5 border-white/10 h-10 rounded-xl focus:border-[#10b981]"
                                />
                            </div>
                        </div>

                        {/* Address Cascade */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-1 mb-1 block">
                                매장 지역 (선택)
                            </label>
                            <div className="flex gap-2">
                                <Select
                                    value={formData.region}
                                    onValueChange={(value) => setFormData({ ...formData, region: value, regionGu: "", regionDong: "" })}
                                >
                                    <SelectTrigger className="bg-white/5 border-white/10 h-14 rounded-2xl px-5 text-lg font-bold focus:ring-[#10b981] text-white flex-1 transition-all">
                                        <SelectValue placeholder="시/도" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-[#111] border-white/10 text-white h-[200px]">
                                        <SelectItem value="서울">서울</SelectItem>
                                        <SelectItem value="경기">경기</SelectItem>
                                        <SelectItem value="인천">인천</SelectItem>
                                        <SelectItem value="부산">부산</SelectItem>
                                        <SelectItem value="대구">대구</SelectItem>
                                        <SelectItem value="광주">광주</SelectItem>
                                        <SelectItem value="대전">대전</SelectItem>
                                        <SelectItem value="울산">울산</SelectItem>
                                        <SelectItem value="세종">세종</SelectItem>
                                        <SelectItem value="강원">강원</SelectItem>
                                        <SelectItem value="충북">충북</SelectItem>
                                        <SelectItem value="충남">충남</SelectItem>
                                        <SelectItem value="전북">전북</SelectItem>
                                        <SelectItem value="전남">전남</SelectItem>
                                        <SelectItem value="경북">경북</SelectItem>
                                        <SelectItem value="경남">경남</SelectItem>
                                        <SelectItem value="제주">제주</SelectItem>
                                    </SelectContent>
                                </Select>

                                {formData.region === "서울" && (
                                    <Select
                                        value={formData.regionGu}
                                        onValueChange={(value) => setFormData({ ...formData, regionGu: value })}
                                    >
                                        <SelectTrigger className="bg-white/5 border-white/10 h-10 rounded-xl focus:ring-[#10b981] text-white flex-1">
                                            <SelectValue placeholder="구" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-[#111] border-white/10 text-white h-[200px]">
                                            {seoulGuList.map(gu => (
                                                <SelectItem key={gu} value={gu}>{gu}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                            {formData.regionGu && (
                                <Input
                                    placeholder="동 입력 (예: 역삼동)"
                                    value={formData.regionDong}
                                    onChange={e => setFormData({ ...formData, regionDong: e.target.value })}
                                    className="bg-white/5 border-white/10 h-10 rounded-xl focus:border-[#10b981]"
                                />
                            )}
                        </div>

                        {/* Business Info */}
                        <div>
                            <label className="text-[10px] font-bold text-white/40 uppercase tracking-widest pl-1 mb-1 block">
                                사업자 정보 (선택)
                            </label>
                            <div className="space-y-2">
                                <Input
                                    placeholder="사업자 등록번호 (숫자만 입력)"
                                    value={formData.businessNumber}
                                    onChange={e => setFormData({ ...formData, businessNumber: e.target.value })}
                                    className="bg-white/5 border-white/10 h-10 rounded-xl focus:border-[#10b981]"
                                />
                                <div className="relative">
                                    <Input
                                        type="file"
                                        className="hidden"
                                        id="license-upload"
                                        onChange={e => setFormData({ ...formData, businessLicenseFile: e.target.files?.[0] || null })}
                                    />
                                    <label
                                        htmlFor="license-upload"
                                        className="flex items-center justify-between w-full h-14 px-5 bg-white/5 border border-white/10 rounded-2xl cursor-pointer hover:bg-white/10 transition-all"
                                    >
                                        <span className="text-sm text-white/50">
                                            {formData.businessLicenseFile ? formData.businessLicenseFile.name : "사업자등록증 업로드"}
                                        </span>
                                        <div className="bg-white/10 px-2 py-1 rounded-md">
                                            <span className="text-xs font-bold text-white/70">파일 찾기</span>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        </div>

                        <Button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full h-14 bg-[#10b981] hover:bg-[#059669] text-black text-xl font-black rounded-2xl mt-4 shadow-lg active:scale-[0.98] transition-all"
                        >
                            {isSubmitting ? "처리 중..." : "지금 바로 시작하기"}
                        </Button>
                    </form>
                ) : (
                    <div className="flex flex-col items-center py-6">
                        <div className="w-16 h-16 bg-[#10b981]/20 rounded-full flex items-center justify-center mb-4">
                            <LucideCheckCircle2 className="w-8 h-8 text-[#10b981]" />
                        </div>
                        <p className="text-center text-sm text-gray-300 font-medium mb-6 leading-relaxed">
                            입점 문의가 접수되었습니다.<br />
                            담당자가 확인 후 연락드리겠습니다. 🙌
                        </p>
                        <Button
                            onClick={handleClose}
                            className="w-full h-12 bg-white text-black font-bold rounded-xl"
                        >
                            확인
                        </Button>
                    </div>
                )
                }
            </DialogContent >
        </Dialog >
    );
}
