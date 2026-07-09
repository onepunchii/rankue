import { QRCodeSVG } from 'qrcode.react';
import { LucideShare2, LucideDownload, LucidePrinter } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function HiqQrPoster() {
    const qrUrl = "https://www.rankue.co.kr";

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 print:p-0 print:bg-white print:text-black">
            {/* Poster Container */}
            <div className="max-w-md w-full aspect-[1/1.414] bg-surface-1 relative overflow-hidden rounded-card border border-surface-line flex flex-col items-center justify-between p-12 print:shadow-none print:border-none print:rounded-none print:w-full print:h-full print:bg-white print:text-black">

                {/* Background Text Pattern */}
                <div className="absolute inset-0 z-0 opacity-5 pointer-events-none select-none overflow-hidden flex flex-wrap content-start gap-4 p-4 transform -rotate-12 scale-150">
                    {Array.from({ length: 100 }).map((_, i) => (
                        <span key={i} className="text-4xl font-bold text-white whitespace-nowrap">랭큐</span>
                    ))}
                </div>

                {/* Content */}
                <div className="relative z-10 flex flex-col items-center text-center w-full h-full justify-between">

                    {/* Header */}
                    <div className="space-y-2 mt-8">
                        <h1 className="text-6xl font-bold text-brand print:text-black">랭큐</h1>
                        <p className="text-2xl font-semibold text-white print:text-black">
                            프리미엄 디지털 점수판
                        </p>
                    </div>

                    {/* QR Code Section */}
                    <div className="relative group">
                        <div className="bg-white p-6 rounded-card border-4 border-brand relative">
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
                                <span className="text-brand font-bold text-xs">랭큐</span>
                            </div>
                        </div>
                    </div>

                    {/* Footer Text */}
                    <div className="space-y-4 mb-8">
                        <div className="space-y-1">
                            <h2 className="text-3xl font-bold text-white print:text-black">스캔하여 게임 시작</h2>
                            <p className="text-ink-3 font-medium print:text-gray-600">카메라를 켜고 QR코드를 비춰주세요</p>
                        </div>

                        <div className="pt-6 border-t border-white/10 w-full print:border-black/10">
                            <p className="text-brand font-semibold text-lg print:text-black">www.rankue.co.kr</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Actions (Screen Only) */}
            <div className="mt-8 flex gap-4 print:hidden">
                <Button onClick={handlePrint} className="bg-brand text-brand-fg hover:bg-brand/90 font-semibold rounded-full px-6">
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
