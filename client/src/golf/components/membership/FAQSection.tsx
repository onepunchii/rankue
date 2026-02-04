import { useState } from "react";
import { LucideInfo, LucideChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { FAQ_LIST } from "../../data/membershipMock";

export function FAQSection() {
    const [openIndex, setOpenIndex] = useState<number | null>(null);

    const toggleFAQ = (index: number) => {
        setOpenIndex(openIndex === index ? null : index);
    };

    return (
        <div className="mt-8 pt-8 border-t border-white/5">
            <div className="flex items-center gap-2 mb-6 px-1">
                <LucideInfo className="w-5 h-5 text-[#64DD17]" />
                <h3 className="text-lg font-bold text-white">자주 묻는 질문</h3>
            </div>

            <div className="space-y-3">
                {FAQ_LIST.map((item, index) => (
                    <div
                        key={index}
                        className={cn(
                            "rounded-2xl border transition-all duration-300 overflow-hidden",
                            openIndex === index
                                ? "bg-[#1E1E1E] border-[#64DD17]/30"
                                : "bg-[#18181b] border-white/5 hover:border-white/10"
                        )}
                    >
                        <button
                            onClick={() => toggleFAQ(index)}
                            className="w-full flex items-center justify-between p-5 text-left"
                        >
                            <span className={cn(
                                "text-sm font-bold",
                                openIndex === index ? "text-white" : "text-zinc-400"
                            )}>
                                Q. {item.q}
                            </span>
                            <LucideChevronDown
                                className={cn(
                                    "w-5 h-5 text-zinc-500 transition-transform duration-300",
                                    openIndex === index && "rotate-180 text-[#64DD17]"
                                )}
                            />
                        </button>

                        <div
                            className={cn(
                                "px-5 text-sm text-zinc-400 leading-relaxed overflow-hidden transition-all duration-300 ease-in-out",
                                openIndex === index ? "max-h-40 pb-5 opacity-100" : "max-h-0 opacity-0"
                            )}
                        >
                            <div className="pt-2 border-t border-white/5">
                                {item.a}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
