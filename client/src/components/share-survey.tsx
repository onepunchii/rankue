import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Survey } from "@shared/schema";

interface ShareSurveyProps {
  survey: Survey;
}

export default function ShareSurvey({ survey }: ShareSurveyProps) {
  const [embedWidth, setEmbedWidth] = useState("100%");
  const [embedHeight, setEmbedHeight] = useState("600");
  const { toast } = useToast();

  const surveyUrl = `${window.location.origin}/survey/${survey.id}`;
  const embedCode = `<iframe src="${surveyUrl}?embed=true" width="${embedWidth}" height="${embedHeight}px" frameborder="0" style="border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);"></iframe>`;

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "복사 완료",
        description: `${type}이(가) 클립보드에 복사되었습니다.`,
      });
    } catch (error) {
      toast({
        title: "복사 실패",
        description: "클립보드 복사에 실패했습니다.",
        variant: "destructive",
      });
    }
  };

  const shareToSocial = (platform: string) => {
    const text = `${survey.title} - 폴리 설문조사에 참여해보세요!`;
    const url = surveyUrl;

    const shareUrls = {
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
      twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      kakao: `https://story.kakao.com/share?url=${encodeURIComponent(url)}`,
      line: `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(url)}`,
      telegram: `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
    };

    if (shareUrls[platform as keyof typeof shareUrls]) {
      window.open(shareUrls[platform as keyof typeof shareUrls], '_blank', 'width=600,height=400');
    }
  };

  const generateQRCode = () => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(surveyUrl)}`;
    return qrUrl;
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="border-white/20 hover:bg-white/10 text-white transition-all">
          <i className="fas fa-share-alt mr-2"></i>
          공유하기
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto glass-card border border-white/10 bg-black/95 text-white">
        <DialogHeader className="pb-6 border-b border-white/5">
          <DialogTitle className="text-2xl font-black tracking-tighter text-white">
            설문 공유하기
          </DialogTitle>
          <DialogDescription className="text-sm text-white/40 font-medium">
            공유를 통해 더 많은 고견을 들어보세요
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="link" className="w-full mt-6">
          <TabsList className="grid w-full grid-cols-4 bg-white/5 p-1 rounded-xl">
            <TabsTrigger value="link" className="rounded-lg data-[state=active]:bg-purple-600 data-[state=active]:text-white text-white/40 font-bold">링크</TabsTrigger>
            <TabsTrigger value="social" className="rounded-lg data-[state=active]:bg-purple-600 data-[state=active]:text-white text-white/40 font-bold">소셜</TabsTrigger>
            <TabsTrigger value="embed" className="rounded-lg data-[state=active]:bg-purple-600 data-[state=active]:text-white text-white/40 font-bold">임베드</TabsTrigger>
            <TabsTrigger value="qr" className="rounded-lg data-[state=active]:bg-purple-600 data-[state=active]:text-white text-white/40 font-bold">QR코드</TabsTrigger>
          </TabsList>

          <TabsContent value="link" className="space-y-4">
            <Card className="bg-white/5 border border-white/10 shadow-2xl rounded-2xl overflow-hidden">
              <CardHeader className="pb-4 border-b border-white/5">
                <CardTitle className="text-lg font-bold flex items-center text-white">
                  <i className="fas fa-link mr-3 text-purple-400"></i>
                  링크 공유
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                <div>
                  <Label htmlFor="survey-url" className="text-xs font-black uppercase tracking-widest text-white/40">설문 URL</Label>
                  <div className="flex gap-2 mt-2">
                    <Input
                      id="survey-url"
                      value={surveyUrl}
                      readOnly
                      className="flex-1 bg-white/5 border-white/10 text-white rounded-xl focus:ring-purple-500/20"
                    />
                    <Button
                      onClick={() => copyToClipboard(surveyUrl, "링크")}
                      className="bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl px-6"
                    >
                      복사
                    </Button>
                  </div>
                </div>

                <div>
                  <Label htmlFor="share-text" className="text-xs font-black uppercase tracking-widest text-white/40">공유 메시지</Label>
                  <Textarea
                    id="share-text"
                    value={`${survey.title} - 폴리 설문조사에 참여해보세요!\n\n${surveyUrl}`}
                    readOnly
                    className="mt-2 bg-white/5 border-white/10 text-white rounded-xl focus:ring-purple-500/20"
                    rows={4}
                  />
                  <Button
                    onClick={() => copyToClipboard(`${survey.title} - 폴리 설문조사에 참여해보세요!\n\n${surveyUrl}`, "메시지")}
                    className="mt-4 w-full bg-white/5 hover:bg-white/10 text-white font-bold rounded-xl border border-white/10 py-6"
                  >
                    <i className="fas fa-copy mr-2"></i>
                    메시지 복사
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="social" className="space-y-4">
            <Card className="bg-white/5 border border-white/10 shadow-2xl rounded-2xl overflow-hidden">
              <CardHeader className="pb-4 border-b border-white/5">
                <CardTitle className="text-lg font-bold flex items-center text-white">
                  <i className="fas fa-share-alt mr-3 text-purple-400"></i>
                  소셜 미디어 공유
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 p-6">
                  <Button
                    onClick={() => shareToSocial('facebook')}
                    className="h-14 bg-[#1877F2] hover:opacity-90 text-white font-black rounded-xl"
                  >
                    <i className="fab fa-facebook-f mr-2 text-lg"></i>
                    FACEBOOK
                  </Button>
                  <Button
                    onClick={() => shareToSocial('twitter')}
                    className="h-14 bg-black hover:bg-white/10 border border-white/10 text-white font-black rounded-xl"
                  >
                    <i className="fab fa-twitter mr-2 text-lg"></i>
                    X
                  </Button>
                  <Button
                    onClick={() => shareToSocial('kakao')}
                    className="h-14 bg-[#FEE500] hover:opacity-90 text-black font-black rounded-xl"
                  >
                    <i className="fas fa-comment mr-2 text-lg"></i>
                    KAKAO
                  </Button>
                  <Button
                    onClick={() => shareToSocial('line')}
                    className="h-14 bg-[#06C755] hover:opacity-90 text-white font-black rounded-xl"
                  >
                    <i className="fab fa-line mr-2 text-lg"></i>
                    LINE
                  </Button>
                  <Button
                    onClick={() => shareToSocial('telegram')}
                    className="bg-blue-500 hover:bg-blue-600 text-white shadow-md hover:shadow-lg transition-all duration-200"
                  >
                    <i className="fab fa-telegram mr-2"></i>
                    텔레그램
                  </Button>
                  <Button
                    onClick={() => {
                      if (navigator.share) {
                        navigator.share({
                          title: survey.title,
                          text: `${survey.title} - 폴리 설문조사에 참여해보세요!`,
                          url: surveyUrl
                        });
                      } else {
                        copyToClipboard(surveyUrl, "링크");
                      }
                    }}
                    className="bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white shadow-md hover:shadow-lg transition-all duration-200"
                  >
                    <i className="fas fa-share mr-2"></i>
                    더보기
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="embed" className="space-y-4">
            <Card className="bg-white/5 border border-white/10 shadow-2xl rounded-2xl overflow-hidden">
              <CardHeader className="pb-4 border-b border-white/5">
                <CardTitle className="text-lg font-bold flex items-center text-white">
                  <i className="fas fa-code mr-3 text-purple-400"></i>
                  웹사이트 임베드
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="embed-width" className="text-xs font-black uppercase tracking-widest text-white/40">너비</Label>
                    <Input
                      id="embed-width"
                      value={embedWidth}
                      onChange={(e) => setEmbedWidth(e.target.value)}
                      placeholder="100% 또는 400px"
                      className="mt-2 bg-white/5 border-white/10 text-white rounded-xl focus:ring-purple-500/20"
                    />
                  </div>
                  <div>
                    <Label htmlFor="embed-height" className="text-xs font-black uppercase tracking-widest text-white/40">높이</Label>
                    <Input
                      id="embed-height"
                      value={embedHeight}
                      onChange={(e) => setEmbedHeight(e.target.value)}
                      placeholder="600"
                      className="mt-2 bg-white/5 border-white/10 text-white rounded-xl focus:ring-purple-500/20"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="embed-code" className="text-xs font-black uppercase tracking-widest text-white/40">임베드 코드</Label>
                  <Textarea
                    id="embed-code"
                    value={embedCode}
                    readOnly
                    className="mt-2 font-mono text-sm bg-black/50 border border-white/10 text-purple-300 rounded-xl focus:ring-purple-500/20"
                    rows={4}
                  />
                  <Button
                    onClick={() => copyToClipboard(embedCode, "임베드 코드")}
                    className="mt-4 w-full bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl py-6"
                  >
                    <i className="fas fa-copy mr-2"></i>
                    코드 복사
                  </Button>
                </div>

                <div className="border border-white/10 rounded-2xl p-6 bg-white/5">
                  <h4 className="text-xs font-black uppercase tracking-widest text-white/40 mb-4">미리보기</h4>
                  <div className="bg-white/5 border border-white/10 rounded-xl shadow-2xl relative overflow-hidden" style={{ width: embedWidth.includes('%') ? embedWidth : `${embedWidth}px`, height: `${Math.min(parseInt(embedHeight), 200)}px` }}>
                    <div className="p-4 text-center text-white/20 flex items-center justify-center h-full">
                      <div className="animate-pulse">
                        <i className="fas fa-browser text-4xl mb-3"></i>
                        <p className="text-xs font-black uppercase tracking-tighter">Live Preview</p>
                        <p className="text-[10px] opacity-50 mt-1">({embedWidth} × {embedHeight}px)</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="qr" className="space-y-4">
            <Card className="bg-white/5 border border-white/10 shadow-2xl rounded-2xl overflow-hidden">
              <CardHeader className="pb-4 border-b border-white/5">
                <CardTitle className="text-lg font-bold flex items-center text-white">
                  <i className="fas fa-qrcode mr-3 text-purple-400"></i>
                  QR 코드
                </CardTitle>
              </CardHeader>
              <CardContent className="text-center space-y-4">
                <div className="flex justify-center">
                  <div className="p-4 bg-white rounded-xl shadow-lg">
                    <img
                      src={generateQRCode()}
                      alt="Survey QR Code"
                      className="mx-auto border rounded-lg"
                    />
                  </div>
                </div>
                <p className="text-xs text-white/40 font-bold uppercase tracking-widest py-4">
                  QR 코드를 스캔하여 설문에 바로 참여할 수 있습니다
                </p>
                <div className="flex gap-4 justify-center py-6 px-8">
                  <Button
                    onClick={() => {
                      const link = document.createElement('a');
                      link.download = `survey-${survey.id}-qr.png`;
                      link.href = generateQRCode();
                      link.click();
                    }}
                    className="flex-1 h-14 bg-purple-600 hover:bg-purple-700 text-white font-black rounded-xl"
                  >
                    <i className="fas fa-download mr-2"></i>
                    DOWNLOAD
                  </Button>
                  <Button
                    onClick={() => copyToClipboard(generateQRCode(), "QR 코드 URL")}
                    className="flex-1 h-14 bg-white/5 hover:bg-white/10 text-white border border-white/10 font-black rounded-xl"
                  >
                    <i className="fas fa-copy mr-2"></i>
                    URL COPY
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}