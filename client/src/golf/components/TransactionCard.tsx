import { motion } from "framer-motion";
import { MoveRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface TransactionCardProps {
    fromName: string;
    toName: string;
    amount: number;
    details: string[];
}

export function TransactionCard({ fromName, toName, amount, details }: TransactionCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center justify-between gap-4"
        >
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold text-white/80 truncate">{fromName}</span>
                    <MoveRight className="w-3 h-3 text-white/20 shrink-0" />
                    <span className="text-sm font-bold text-[#64DD17] truncate">{toName}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                    {details.map((detail, idx) => (
                        <span key={idx} className="text-[10px] font-bold text-white/50">
                            {detail}{idx < details.length - 1 && " · "}
                        </span>
                    ))}
                </div>
            </div>

            <div className="text-right shrink-0">
                <p className="text-md font-black text-white italic tracking-tight">
                    {amount.toLocaleString()}<span className="text-[10px] ml-0.5 not-italic">P</span>
                </p>
            </div>
        </motion.div>
    );
}
