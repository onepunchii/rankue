import { QRCodeSVG } from 'qrcode.react';
import { LucideShare2, LucideDownload, LucidePrinter } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function HiqQrPoster() {
    const qrUrl = "https://www.polli.co.kr/hiq";

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 print:p-0 print:bg-white print:text-black">
            {/* Poster Container */}
            <div className="max-w-md w-full aspect-[1/1.414] bg-zinc-900 relative overflow-hidden rounded-3xl shadow-2xl border border-[#333] flex flex-col items-center justify-between p-12 print:shadow-none print:border-none print:rounded-none print:w-full print:h-full print:bg-white print:text-black">

                {/* Background Text Pattern */}
                <div className="absolute inset-0 z-0 opacity-5 pointer-events-none select-none overflow-hidden flex flex-wrap content-start gap-4 p-4 transform -rotate-12 scale-150">
                    {Array.from({ length: 100 }).map((_, i) => (
                        <span key={i} className="text-4xl font-black text-white uppercase whitespace-nowrap">HiQ BILLIARDS</span>
                    ))}
                </div>

                {/* Content */}
                <div className="relative z-10 flex flex-col items-center text-center w-full h-full justify-between">

                    {/* Header */}
                    <div className="space-y-2 mt-8">
                        <h1 className="text-6xl font-black text-[#ffd700] tracking-tighter drop-shadow-lg print:text-black">HiQ</h1>
                        <p className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 print:text-black print:bg-none">
                            프리미엄 디지털 점수판
                        </p>
                    </div>

                    {/* QR Code Section */}
                    <div className="relative group">
                        <div className="absolute -inset-4 bg-gradient-to-tr from-[#ffd700] to-[#fdb931] rounded-3xl opacity-30 blur-xl animate-pulse print:hidden"></div>
                        <div className="bg-white p-6 rounded-3xl shadow-2xl border-4 border-[#ffd700] relative">
                            <QRCodeSVG
                                value={qrUrl}
                                size={250}
                                level={"H"}
                                includeMargin={true}
                                imageSettings={{
                                    src: "",
                                    x: undefined,
                                    y: undefined,
                                    height: 24,
                                    width: 24,
                                    excavate: true,
                                }}
                            />
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-8 h-8 bg-black rounded-full flex items-center justify-center">
                                <span className="text-[#ffd700] font-black text-xs">HiQ</span>
                            </div>
                        </div>
                    </div>

                    {/* Footer Text */}
                    <div className="space-y-4 mb-8">
                        <div className="space-y-1">
                            <h2 className="text-3xl font-black text-white print:text-black">스캔하여 게임 시작</h2>
                            <p className="text-zinc-400 font-medium print:text-gray-600">카메라를 켜고 QR코드를 비춰주세요</p>
                        </div>

                        <div className="pt-6 border-t border-white/10 w-full print:border-black/10">
                            <p className="text-[#ffd700] font-bold text-lg tracking-widest print:text-black">www.polli.co.kr/hiq</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Actions (Screen Only) */}
            <div className="mt-8 flex gap-4 print:hidden">
                <Button onClick={handlePrint} className="bg-[#ffd700] hover:bg-[#ffe033] text-black font-bold rounded-full px-6">
                    <LucidePrinter className="w-5 h-5 mr-2" />
                    프린트 / PDF로 저장
                </Button>
                <Button variant="outline" className="rounded-full px-6 border-zinc-700 text-zinc-300 hover:text-white bg-transparent hover:bg-zinc-800">
                    <LucideShare2 className="w-5 h-5 mr-2" />
                    공유하기
                </Button>
            </div>
        </div>
    );
}
