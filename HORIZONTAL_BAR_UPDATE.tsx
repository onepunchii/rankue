// Updated Presidential Approval Section - Horizontal Bar Design
// Replace lines 420-435 in politics.tsx with this:

{/* Horizontal Bar Chart - Custom Design */ }
<div className="space-y-4 mb-8">
    {processApprovalData(presidentialData || []).map((item, index) => (
        <div key={index} className="space-y-2">
            <div className="flex items-center justify-between text-sm">
                <span className="text-white/80 font-bold text-xs">{item.name}</span>
                <span className="text-white font-black">{item.value}%</span>
            </div>
            <div className="relative h-3 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${item.value}%` }}
                    transition={{ duration: 1, delay: index * 0.1, ease: "easeOut" }}
                    className="h-full rounded-full"
                    style={{
                        backgroundColor: item.color,
                        boxShadow: `0 0 20px ${item.color}40`
                    }}
                />
            </div>
        </div>
    ))}
</div>
