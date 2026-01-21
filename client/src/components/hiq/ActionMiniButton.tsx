import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

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
            className="flex flex-col items-center justify-center p-4 bg-white/[0.03] rounded-[1.5rem] border border-white/5 hover:bg-white/[0.08] transition-all gap-2"
        >
            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                <Icon className="w-5 h-5 text-premium-bright" />
            </div>
            <span className="font-bold text-[10px] text-premium-bright tracking-widest uppercase">{label}</span>
        </motion.button>
    );
}
