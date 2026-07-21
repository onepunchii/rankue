import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { LucideShieldQuestion, LucideKeyRound, LucideCheckCircle2, LucideLoader2 } from "@/lib/icons";
import { useT } from "@/lib/i18n";

interface PinResetDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialPhone?: string;
}

export function PinResetDialog({ open, onOpenChange, initialPhone = "" }: PinResetDialogProps) {
    const { t } = useT();
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
            toast({ variant: "destructive", title: t("pinReset.inputError"), description: t("pinReset.invalidPhone") });
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
                title: t("pinReset.error"),
                description: error.message || t("pinReset.fetchQuestionFailed")
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleVerifyAndReset = async () => {
        if (!answer) {
            toast({ variant: "destructive", title: t("pinReset.inputError"), description: t("pinReset.enterAnswer") });
            return;
        }
        if (newPin.length < 4) {
            toast({ variant: "destructive", title: t("pinReset.inputError"), description: t("pinReset.pinTooShort") });
            return;
        }
        if (newPin !== confirmPin) {
            toast({ variant: "destructive", title: t("pinReset.inputError"), description: t("pinReset.pinMismatch") });
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
                title: t("pinReset.failed"),
                description: error.message || t("pinReset.resetFailed")
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
                            {t("pinReset.title")}
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
                                    <Label className="text-black/55 font-semibold text-xs">{t("pinReset.phoneLabel")}</Label>
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
                                    {isLoading ? <LucideLoader2 className="animate-spin" /> : t("pinReset.checkQuestion")}
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
                                    <p className="text-black/55 text-sm font-semibold mb-2">{t("pinReset.securityQuestion")}</p>
                                    <h3 className="text-xl font-semibold text-[rgba(0,0,0,0.87)]">{question}</h3>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-black/55 font-semibold text-xs">{t("pinReset.answerLabel")}</Label>
                                    <Input
                                        placeholder={t("pinReset.answerPlaceholder")}
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
                                    {t("pinReset.nextStep")}
                                </Button>
                                <button onClick={() => setStep(1)} className="w-full text-black/55 text-[12px] font-semibold hover:text-[rgba(0,0,0,0.87)] transition-all">{t("pinReset.back")}</button>
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
                                        <Label className="text-black/55 font-semibold text-xs">{t("pinReset.newPinLabel")}</Label>
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
                                        <Label className="text-black/55 font-semibold text-xs">{t("pinReset.confirmPinLabel")}</Label>
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
                                    {isLoading ? <LucideLoader2 className="animate-spin" /> : t("pinReset.submitChange")}
                                </Button>
                                <button onClick={() => setStep(2)} className="w-full text-black/55 text-[12px] font-semibold hover:text-[rgba(0,0,0,0.87)] transition-all">{t("pinReset.back")}</button>
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
                                <h3 className="text-2xl font-semibold mb-2">{t("pinReset.changeSuccess")}</h3>
                                <p className="text-black/55 mb-8 leading-relaxed">{t("pinReset.successDesc1")}<br />{t("pinReset.successDesc2")}</p>
                                <Button
                                    onClick={handleClose}
                                    className="w-full h-14 bg-brand text-brand-fg font-semibold text-lg rounded-tile hover:bg-brand/90 active:scale-95 transition-all"
                                >
                                    {t("pinReset.confirm")}
                                </Button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </DialogContent>
        </Dialog>
    );
}
