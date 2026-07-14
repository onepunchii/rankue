import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { LucideShieldQuestion, LucideKeyRound, LucideCheckCircle2, LucideLoader2 } from "lucide-react";

interface PinResetDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialPhone?: string;
}

export function PinResetDialog({ open, onOpenChange, initialPhone = "" }: PinResetDialogProps) {
    const { toast } = useToast();
    const [step, setStep] = useState(1); // 1: phone, 2: answer, 3: new pin, 4: success
    const [phone, setPhone] = useState(initialPhone);
    const [question, setQuestion] = useState("");
    const [answer, setAnswer] = useState("");
    const [newPin, setNewPin] = useState("");
    const [confirmPin, setConfirmPin] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleFetchQuestion = async () => {
        if (phone.length < 10) {
            toast({ variant: "destructive", title: "입력 오류", description: "올바른 전화번호를 입력해주세요." });
            return;
        }

        setIsLoading(true);
        try {
            const res = await apiRequest("/api/hiq/reset-pin/question", {
                method: "POST",
                body: { phone }
            });
            setQuestion(res.question);
            setStep(2);
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "오류",
                description: error.message || "보안 질문을 불러올 수 없습니다."
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleVerifyAndReset = async () => {
        if (!answer) {
            toast({ variant: "destructive", title: "입력 오류", description: "정답을 입력해주세요." });
            return;
        }
        if (newPin.length < 4) {
            toast({ variant: "destructive", title: "입력 오류", description: "비밀번호는 4자리 이상이어야 합니다." });
            return;
        }
        if (newPin !== confirmPin) {
            toast({ variant: "destructive", title: "입력 오류", description: "비밀번호가 일치하지 않습니다." });
            return;
        }

        setIsLoading(true);
        try {
            await apiRequest("/api/hiq/reset-pin/verify", {
                method: "POST",
                body: { phone, answer, newPin }
            });
            setStep(4);
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "실패",
                description: error.message || "비밀번호 재설정에 실패했습니다."
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleClose = () => {
        onOpenChange(false);
        // Reset state after a delay
        setTimeout(() => {
            setStep(1);
            setQuestion("");
            setAnswer("");
            setNewPin("");
            setConfirmPin("");
        }, 300);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-white border-black/[0.08] text-[rgba(0,0,0,0.87)] max-w-md rounded-card p-0 overflow-hidden">
                <div className="p-8">
                    <DialogHeader className="mb-8">
                        <DialogTitle className="text-2xl font-semibold flex items-center gap-3">
                            <LucideShieldQuestion className="w-6 h-6 text-brand" />
                            PIN 재설정
                        </DialogTitle>
                    </DialogHeader>

                    <AnimatePresence mode="wait">
                        {step === 1 && (
                            <motion.div
                                key="step1"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6"
                            >
                                <div className="space-y-2">
                                    <Label className="text-black/55 font-semibold text-xs">휴대폰 번호</Label>
                                    <Input
                                        placeholder="01012345678"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ""))}
                                        className="bg-surface-2 border-surface-line h-14 text-xl font-bold rounded-tile focus:border-brand transition-all"
                                    />
                                </div>
                                <Button
                                    onClick={handleFetchQuestion}
                                    disabled={isLoading || phone.length < 10}
                                    className="w-full h-14 bg-brand text-brand-fg font-semibold text-lg rounded-tile hover:bg-brand/90 active:scale-95 transition-all"
                                >
                                    {isLoading ? <LucideLoader2 className="animate-spin" /> : "질문 확인하기"}
                                </Button>
                            </motion.div>
                        )}

                        {step === 2 && (
                            <motion.div
                                key="step2"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6"
                            >
                                <div className="p-6 bg-surface-2 rounded-2xl text-center">
                                    <p className="text-black/55 text-sm font-semibold mb-2">보안 질문</p>
                                    <h3 className="text-xl font-semibold text-[rgba(0,0,0,0.87)]">{question}</h3>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-black/55 font-semibold text-xs">정답</Label>
                                    <Input
                                        placeholder="정답을 입력하세요"
                                        value={answer}
                                        onChange={(e) => setAnswer(e.target.value)}
                                        className="bg-surface-2 border-surface-line h-14 text-xl font-bold rounded-tile focus:border-brand transition-all"
                                    />
                                </div>
                                <Button
                                    onClick={() => setStep(3)}
                                    disabled={!answer}
                                    className="w-full h-14 bg-brand text-brand-fg font-semibold text-lg rounded-tile hover:bg-brand/90 active:scale-95 transition-all"
                                >
                                    다음 단계
                                </Button>
                                <button onClick={() => setStep(1)} className="w-full text-black/55 text-[12px] font-semibold hover:text-[rgba(0,0,0,0.87)] transition-all">뒤로가기</button>
                            </motion.div>
                        )}

                        {step === 3 && (
                            <motion.div
                                key="step3"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6"
                            >
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label className="text-black/55 font-semibold text-xs">새 PIN 설정 (4자리)</Label>
                                        <Input
                                            type="password"
                                            maxLength={4}
                                            value={newPin}
                                            onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, ""))}
                                            placeholder="••••"
                                            className="bg-surface-2 border-surface-line h-16 text-center text-3xl tracking-[1em] font-semibold rounded-tile focus:border-brand transition-all"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label className="text-black/55 font-semibold text-xs">PIN 확인</Label>
                                        <Input
                                            type="password"
                                            maxLength={4}
                                            value={confirmPin}
                                            onChange={(e) => setConfirmPin(e.target.value.replace(/[^0-9]/g, ""))}
                                            placeholder="••••"
                                            className="bg-surface-2 border-surface-line h-16 text-center text-3xl tracking-[1em] font-semibold rounded-tile focus:border-brand transition-all"
                                        />
                                    </div>
                                </div>
                                <Button
                                    onClick={handleVerifyAndReset}
                                    disabled={isLoading || newPin.length < 4 || newPin !== confirmPin}
                                    className="w-full h-14 bg-brand text-brand-fg font-semibold text-lg rounded-tile hover:bg-brand/90 active:scale-95 transition-all"
                                >
                                    {isLoading ? <LucideLoader2 className="animate-spin" /> : "PIN 변경 완료"}
                                </Button>
                                <button onClick={() => setStep(2)} className="w-full text-black/55 text-[12px] font-semibold hover:text-[rgba(0,0,0,0.87)] transition-all">뒤로가기</button>
                            </motion.div>
                        )}

                        {step === 4 && (
                            <motion.div
                                key="step4"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="text-center py-4"
                            >
                                <div className="w-20 h-20 bg-brand/10 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <LucideCheckCircle2 className="w-12 h-12 text-brand" />
                                </div>
                                <h3 className="text-2xl font-semibold mb-2">변경 완료!</h3>
                                <p className="text-black/55 mb-8 leading-relaxed">새로운 PIN 번호로<br />로그인하실 수 있습니다.</p>
                                <Button
                                    onClick={handleClose}
                                    className="w-full h-14 bg-brand text-brand-fg font-semibold text-lg rounded-tile hover:bg-brand/90 active:scale-95 transition-all"
                                >
                                    확인
                                </Button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </DialogContent>
        </Dialog>
    );
}
