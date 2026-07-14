import { motion } from "framer-motion";
import { LucideIcon } from "@/lib/icons";

interface ActionMiniButtonProps {
    icon: LucideIcon;
    label: string;
    onClick: () => void;
}

export function ActionMiniButton({ icon: Icon, label, onClick }: ActionMiniButtonProps) {
    return (
        <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={onClick}
            className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.06)] hover:bg-black/[0.04] transition-all gap-2"
        >
            <div className="w-10 h-10 rounded-xl bg-black/[0.04] flex items-center justify-center">
                <Icon className="w-5 h-5 text-brand" />
            </div>
            <span className="font-bold text-[12px] text-[rgba(0,0,0,0.87)] tracking-normal">{label}</span>
        </motion.button>
    );
}
