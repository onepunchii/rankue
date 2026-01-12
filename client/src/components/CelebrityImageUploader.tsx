import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Image as ImageIcon } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CelebrityImageUploaderProps {
  onUploadComplete?: (imageUrl: string, category: string, fileName: string) => void;
}

const CELEBRITY_CATEGORIES = [
  { value: "male-idol", label: "남자 아이돌" },
  { value: "female-idol", label: "여자 아이돌" },
  { value: "actor", label: "배우" },
  { value: "actress", label: "여배우" },
  { value: "singer", label: "가수" },
  { value: "comedian", label: "개그맨" },
  { value: "influencer", label: "인플루언서" },
  { value: "variety", label: "예능인" },
  { value: "other", label: "기타" }
];

export function CelebrityImageUploader({ onUploadComplete }: CelebrityImageUploaderProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [category, setCategory] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const { toast } = useToast();

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Check file type
      if (!file.type.startsWith('image/')) {
        toast({
          title: "잘못된 파일 형식",
          description: "이미지 파일만 업로드할 수 있습니다.",
          variant: "destructive",
        });
        return;
      }

      // Check file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "파일 크기 초과",
          description: "5MB 이하의 이미지만 업로드할 수 있습니다.",
          variant: "destructive",
        });
        return;
      }

      setSelectedFile(file);
      
      // Create preview URL
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      
      // Auto-generate filename from file
      const name = file.name.split('.')[0];
      setFileName(name);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !category || !fileName.trim()) {
      toast({
        title: "필수 정보 누락",
        description: "파일, 카테고리, 파일명을 모두 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      // Get upload URL
      const uploadResponse = await fetch('/api/celebrity-images/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category,
          fileName: fileName.trim(),
        }),
      });

      if (!uploadResponse.ok) {
        throw new Error('Upload URL을 가져올 수 없습니다.');
      }

      const { uploadURL } = await uploadResponse.json();

      // Upload file to object storage
      const fileUploadResponse = await fetch(uploadURL, {
        method: 'PUT',
        body: selectedFile,
        headers: {
          'Content-Type': selectedFile.type,
        },
      });

      if (!fileUploadResponse.ok) {
        throw new Error('파일 업로드에 실패했습니다.');
      }

      // Update database with image info
      const updateResponse = await fetch('/api/celebrity-images', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category,
          fileName: fileName.trim(),
          imageUrl: uploadURL.split('?')[0], // Remove query parameters
        }),
      });

      if (!updateResponse.ok) {
        throw new Error('데이터베이스 업데이트에 실패했습니다.');
      }

      toast({
        title: "업로드 완료",
        description: `${fileName} 이미지가 ${CELEBRITY_CATEGORIES.find(c => c.value === category)?.label} 카테고리에 업로드되었습니다.`,
      });

      // Reset form
      setSelectedFile(null);
      setCategory("");
      setFileName("");
      setPreviewUrl("");
      
      // Clean up preview URL
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }

      // Callback
      onUploadComplete?.(uploadURL.split('?')[0], category, fileName.trim());

    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "업로드 실패",
        description: error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const clearSelection = () => {
    setSelectedFile(null);
    setPreviewUrl("");
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <ImageIcon className="w-5 h-5" />
          <span>연예인 이미지 업로드</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* File Selection */}
        <div className="space-y-2">
          <Label htmlFor="file-upload">이미지 파일</Label>
          <Input
            id="file-upload"
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            disabled={isUploading}
          />
        </div>

        {/* Preview */}
        {previewUrl && (
          <div className="relative">
            <img
              src={previewUrl}
              alt="Preview"
              className="w-full h-32 object-cover rounded-lg border"
            />
            <Button
              size="sm"
              variant="destructive"
              className="absolute top-2 right-2"
              onClick={clearSelection}
              disabled={isUploading}
            >
              ✕
            </Button>
          </div>
        )}

        {/* Category Selection */}
        <div className="space-y-2">
          <Label htmlFor="category">카테고리</Label>
          <Select value={category} onValueChange={setCategory} disabled={isUploading}>
            <SelectTrigger>
              <SelectValue placeholder="카테고리를 선택하세요" />
            </SelectTrigger>
            <SelectContent>
              {CELEBRITY_CATEGORIES.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* File Name */}
        <div className="space-y-2">
          <Label htmlFor="filename">파일명</Label>
          <Input
            id="filename"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            placeholder="연예인 이름 또는 식별자"
            disabled={isUploading}
          />
          <p className="text-xs text-gray-500">
            예: 아이유, BTS-지민, 박서준 등
          </p>
        </div>

        {/* Upload Button */}
        <Button
          onClick={handleUpload}
          disabled={!selectedFile || !category || !fileName.trim() || isUploading}
          className="w-full"
        >
          {isUploading ? (
            <div className="flex items-center space-x-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              <span>업로드 중...</span>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <Upload className="w-4 h-4" />
              <span>업로드</span>
            </div>
          )}
        </Button>

        {/* Directory Structure Info */}
        <div className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
          <p className="font-medium mb-2">폴더 구조:</p>
          <ul className="space-y-1 text-xs">
            <li>📁 celebrities/</li>
            <li>&nbsp;&nbsp;📁 male-idol/ (남자 아이돌)</li>
            <li>&nbsp;&nbsp;📁 female-idol/ (여자 아이돌)</li>
            <li>&nbsp;&nbsp;📁 actor/ (배우)</li>
            <li>&nbsp;&nbsp;📁 actress/ (여배우)</li>
            <li>&nbsp;&nbsp;📁 singer/ (가수)</li>
            <li>&nbsp;&nbsp;📁 comedian/ (개그맨)</li>
            <li>&nbsp;&nbsp;📁 influencer/ (인플루언서)</li>
            <li>&nbsp;&nbsp;📁 variety/ (예능인)</li>
            <li>&nbsp;&nbsp;📁 other/ (기타)</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

export default CelebrityImageUploader;