import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Settings, FolderOpen } from "lucide-react";
import CelebrityImageUploader from "@/components/CelebrityImageUploader";
import { useState } from "react";

const CelebrityAdmin = () => {
  const [showUploader, setShowUploader] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{
    fileName: string;
    category: string;
    imageUrl: string;
    uploadTime: string;
  }>>([]);

  const handleUploadComplete = (imageUrl: string, category: string, fileName: string) => {
    const newFile = {
      fileName,
      category,
      imageUrl,
      uploadTime: new Date().toLocaleString('ko-KR')
    };
    setUploadedFiles(prev => [newFile, ...prev]);
    setShowUploader(false);
  };

  const categoryLabels: Record<string, string> = {
    "male-idol": "남자 아이돌",
    "female-idol": "여자 아이돌",
    "actor": "배우",
    "actress": "여배우",
    "singer": "가수",
    "comedian": "개그맨",
    "influencer": "인플루언서",
    "variety": "예능인",
    "other": "기타"
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50 dark:from-gray-900 dark:via-purple-900/20 dark:to-pink-900/20">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Card className="mb-6 bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border border-purple-200 dark:border-purple-800/50 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center space-x-3 text-2xl text-gray-900 dark:text-white">
              <Settings className="w-7 h-7 text-purple-600" />
              <span>연예인 이미지 관리</span>
            </CardTitle>
            <p className="text-gray-600 dark:text-gray-300">
              연예인 프로필 이미지를 카테고리별로 업로드하고 관리하세요.
            </p>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => setShowUploader(!showUploader)}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                <Upload className="w-4 h-4 mr-2" />
                {showUploader ? "업로더 닫기" : "이미지 업로드"}
              </Button>
              
              <Button variant="outline" className="border-purple-300 text-purple-700 hover:bg-purple-50">
                <FolderOpen className="w-4 h-4 mr-2" />
                폴더 구조 보기
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Image Uploader */}
        {showUploader && (
          <div className="mb-6">
            <CelebrityImageUploader onUploadComplete={handleUploadComplete} />
          </div>
        )}

        {/* Folder Structure */}
        <Card className="mb-6 bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border border-purple-200 dark:border-purple-800/50 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2 text-lg text-gray-900 dark:text-white">
              <FolderOpen className="w-5 h-5 text-purple-600" />
              <span>폴더 구조</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 font-mono text-sm">
              <div className="text-gray-700 dark:text-gray-300">
                <div className="mb-2">📁 public/celebrities/</div>
                <div className="ml-4 space-y-1">
                  {Object.entries(categoryLabels).map(([key, label]) => (
                    <div key={key} className="flex justify-between">
                      <span>📁 {key}/</span>
                      <span className="text-gray-500">({label})</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recently Uploaded Files */}
        {uploadedFiles.length > 0 && (
          <Card className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border border-purple-200 dark:border-purple-800/50 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2 text-lg text-gray-900 dark:text-white">
                <Upload className="w-5 h-5 text-green-600" />
                <span>최근 업로드된 파일</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {uploadedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800/50"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 bg-green-100 dark:bg-green-800 rounded-lg flex items-center justify-center">
                        <Upload className="w-6 h-6 text-green-600" />
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900 dark:text-white">
                          {file.fileName}
                        </h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          카테고리: {categoryLabels[file.category] || file.category}
                        </p>
                        <p className="text-xs text-gray-500">
                          업로드: {file.uploadTime}
                        </p>
                      </div>
                    </div>
                    <div className="text-green-600 font-medium text-sm">
                      ✅ 완료
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Usage Instructions */}
        <Card className="mt-6 bg-blue-50/80 dark:bg-blue-900/20 backdrop-blur-md border border-blue-200 dark:border-blue-800/50">
          <CardHeader>
            <CardTitle className="text-lg text-blue-900 dark:text-blue-100">
              📋 사용 방법
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-blue-800 dark:text-blue-200 space-y-2">
            <p><strong>1. 이미지 업로드:</strong> 상단 "이미지 업로드" 버튼을 클릭하여 업로더를 엽니다.</p>
            <p><strong>2. 카테고리 선택:</strong> 연예인의 직업/장르에 맞는 카테고리를 선택하세요.</p>
            <p><strong>3. 파일명 입력:</strong> 연예인 이름이나 식별 가능한 이름을 입력하세요.</p>
            <p><strong>4. 파일 선택:</strong> JPG, PNG, WEBP 형식의 이미지 파일을 선택하세요 (최대 5MB).</p>
            <p><strong>5. 업로드:</strong> 모든 정보를 입력한 후 업로드 버튼을 클릭하세요.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CelebrityAdmin;