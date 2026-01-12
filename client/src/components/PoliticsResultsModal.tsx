import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { X, Download, Share2, Shield, Calendar, Users, BarChart2, Vote, Crown, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';

interface PoliticsResultsModalProps {
  surveyResults: any;
  onClose: () => void;
}

export default function PoliticsResultsModal({ surveyResults, onClose }: PoliticsResultsModalProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'detailed'>('overview');

  if (!surveyResults) return null;

  // Premium Neon Colors
  const colors = ['#A855F7', '#EC4899', '#3B82F6', '#10B981', '#F59E0B', '#EF4444'];

  const getChartData = (result: any) => {
    return result.optionStats?.map((stat: any, index: number) => ({
      name: stat.option.length > 20 ? stat.option.substring(0, 20) + '...' : stat.option,
      fullName: stat.option,
      value: stat.count,
      percentage: stat.percentage,
      fill: colors[index % colors.length]
    })) || [];
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-black/90 p-2 border border-white/10 rounded-lg shadow-xl backdrop-blur-md text-xs">
          <p className="font-bold text-white mb-0.5">{data.fullName}</p>
          <p className="text-purple-400 font-bold">
            {data.value}표 ({data.percentage}%)
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-3 md:p-4">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[100px] pointer-events-none opacity-40" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative bg-black/50 backdrop-blur-2xl rounded-[24px] max-w-3xl w-full max-h-[85vh] overflow-hidden shadow-2xl border border-white/10 flex flex-col"
      >
        {/* Header - Compact & Responsive */}
        <div className="sticky top-0 z-10 bg-black/70 backdrop-blur-xl border-b border-white/5 px-5 py-4">
          <div className="relative">
            <div className="flex items-start space-x-4 pr-8"> {/* Added pr-8 to avoid overlapping with close button */}
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-white/10 rounded-xl flex items-center justify-center shadow-[0_0_15px_rgba(168,85,247,0.15)] shrink-0">
                <Vote className="w-5 h-5 text-purple-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-black italic tracking-tight text-white leading-tight break-words">
                  {surveyResults.survey.title}
                </h2>
                <p className="text-white/40 text-xs font-medium break-words mt-1">
                  {surveyResults.survey.description}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="absolute top-0 right-0 bg-white/5 hover:bg-white/10 p-1.5 rounded-full transition-colors shrink-0"
            >
              <X className="w-5 h-5 text-white/50 hover:text-white" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 custom-scrollbar">
          {/* Stats Summary - Compact Grid */}
          <div className="px-5 py-4 grid grid-cols-4 gap-2">
            {[
              { label: '참여', value: surveyResults.totalParticipants, icon: Users, color: 'text-blue-400' },
              { label: '항목', value: surveyResults.questionResults?.length || 0, icon: BarChart2, color: 'text-purple-400' },
              { label: '마감', value: new Date(surveyResults.survey.votingEndDate).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }), icon: Calendar, color: 'text-pink-400' }, // Short date
              { label: '참여율', value: 'High', icon: TrendingUp, color: 'text-emerald-400' }
            ].map((stat, i) => (
              <div key={i} className="bg-white/[0.03] border border-white/5 rounded-xl p-2.5 flex flex-col items-center justify-center text-center">
                <stat.icon className={`w-3.5 h-3.5 mb-1 ${stat.color} opacity-80`} />
                <div className={`text-lg font-black ${stat.color} leading-none mb-0.5`}>{stat.value}</div>
                <div className="text-[9px] font-bold text-white/30 uppercase tracking-wide">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Content Tabs - Compact */}
          <div className="px-5 mb-4">
            <div className="bg-white/5 p-0.5 rounded-lg inline-flex border border-white/5">
              {['overview', 'detailed'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab as any)}
                  className={`px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${activeTab === tab
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md'
                      : 'text-white/40 hover:text-white'
                    }`}
                >
                  {tab === 'overview' ? 'Overview' : 'Detail'}
                </button>
              ))}
            </div>
          </div>

          <div className="px-5 pb-8 space-y-4">
            {activeTab === 'overview' ? (
              <div className="grid grid-cols-1 gap-4">
                {surveyResults.questionResults?.map((result: any, index: number) => {
                  const chartData = getChartData(result);
                  const sortedData = [...chartData].sort((a, b) => b.value - a.value);
                  const winner = sortedData[0];

                  return (
                    <motion.div
                      key={result.questionId}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="bg-white/[0.02] border border-white/10 rounded-[20px] p-5 relative overflow-hidden"
                    >
                      {/* Question Header */}
                      <div className="flex items-start space-x-3 mb-4 relative z-10">
                        <div className="w-6 h-6 rounded bg-white/5 flex items-center justify-center text-xs font-black text-white/50 border border-white/5 shrink-0">
                          Q{index + 1}
                        </div>
                        <h3 className="text-base font-bold text-white leading-tight break-words">
                          {result.question}
                        </h3>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                        {/* Chart Section */}
                        <div className="md:col-span-3 h-40 relative px-2">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={chartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={40}
                                outerRadius={70}
                                paddingAngle={3}
                                dataKey="value"
                                stroke="none"
                              >
                                {chartData.map((entry: any, index: number) => (
                                  <Cell key={`cell-${index}`} fill={entry.fill} />
                                ))}
                              </Pie>
                              <Tooltip content={<CustomTooltip />} />
                            </PieChart>
                          </ResponsiveContainer>

                          {/* Center Label */}
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                            <div className="text-[9px] font-black text-white/30 uppercase tracking-widest">Total</div>
                            <div className="text-sm font-black text-white">{result.totalResponses}</div>
                          </div>
                        </div>

                        {/* Winner Section */}
                        <div className="md:col-span-2 flex flex-col justify-center space-y-3">
                          <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-xl p-3 relative overflow-hidden">
                            <div className="absolute -top-1 -right-1 p-2 opacity-20">
                              <Crown className="w-8 h-8 text-yellow-400 rotate-12" />
                            </div>
                            <div className="text-[9px] font-black text-purple-400 uppercase tracking-widest mb-0.5">Top Choice</div>
                            <div className="text-base font-bold text-white mb-0.5 truncate">{winner?.fullName}</div>
                            <div className="text-2xl font-black italic text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
                              {winner?.percentage}%
                            </div>
                          </div>

                          {/* Top 3 List (Compact) */}
                          <div className="space-y-1.5 max-h-24 overflow-y-auto custom-scrollbar pr-1">
                            {sortedData.slice(1, 4).map((item, idx) => (
                              <div key={idx} className="flex items-center justify-between text-[11px] p-1.5 rounded hover:bg-white/5 transition-colors">
                                <div className="flex items-center space-x-2 min-w-0">
                                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: item.fill }}></div>
                                  <span className="text-white/60 font-medium truncate">{item.fullName}</span>
                                </div>
                                <span className="text-white font-bold ml-2">{item.percentage}%</span>
                              </div>
                            ))}
                            {sortedData.length > 4 && (
                              <div className="text-[10px] text-center text-white/30 pt-1">+{sortedData.length - 4} more</div>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-4">
                {surveyResults.questionResults?.map((result: any, index: number) => {
                  const chartData = getChartData(result);
                  return (
                    <motion.div
                      key={result.questionId}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="bg-white/[0.02] border border-white/10 rounded-[20px] p-4"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3 min-w-0">
                          <div className="w-6 h-6 rounded bg-white/5 flex items-center justify-center font-black text-white/40 text-xs shrink-0">
                            {index + 1}
                          </div>
                          <h3 className="text-sm font-bold text-white break-words">{result.question}</h3>
                        </div>
                      </div>

                      <div className="h-32 mb-4">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 30, top: 0, bottom: 0 }} barSize={8}>
                            <XAxis type="number" hide />
                            <YAxis type="category" dataKey="name" width={80} hide />
                            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                              {chartData.map((entry: any, i: number) => (
                                <Cell key={i} fill={entry.fill} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      <div className="space-y-2">
                        {chartData.map((stat: any, idx: number) => (
                          <div key={idx} className="relative group">
                            <div className="flex items-center justify-between text-[10px] mb-1 relative z-10">
                              <span className="font-bold text-white/80 group-hover:text-white transition-colors truncate max-w-[70%]">{stat.fullName}</span>
                              <span className="font-black text-white">{stat.percentage}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${stat.percentage}%` }}
                                transition={{ duration: 1, ease: "easeOut" }}
                                className="h-full rounded-full"
                                style={{ backgroundColor: stat.fill }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer - Compact */}
        <div className="sticky bottom-0 bg-[#0a0a0a]/90 backdrop-blur-xl border-t border-white/5 px-5 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center text-[9px] font-bold text-white/30 uppercase tracking-widest hidden sm:flex">
              <Shield className="w-2.5 h-2.5 mr-1.5 text-emerald-500" />
              Secure Poll
            </div>
            <div className="flex space-x-2 w-full sm:w-auto justify-end">
              <Button size="sm" variant="ghost" className="h-8 rounded-lg text-[10px] font-bold text-white/60 hover:text-white hover:bg-white/10 uppercase tracking-wider">
                <Download className="w-3 h-3 mr-1.5" />
                Save
              </Button>
              <Button size="sm" className="h-8 bg-white text-black hover:bg-white/90 rounded-lg text-[10px] font-black uppercase tracking-wider px-4">
                <Share2 className="w-3 h-3 mr-1.5" />
                Share
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}