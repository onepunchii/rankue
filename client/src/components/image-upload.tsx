import React, { useState, useRef } from 'react';
import { uploadImage, validateImageFile, getImagePreviewUrl, revokeImagePreviewUrl, type UploadResponse } from '@/lib/uploadUtils';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

interface ImageUploadProps {
  onUploadSuccess?: (uploadResult: UploadResponse) => void;
  maxFiles?: number;
  className?: string;
}

export default function ImageUpload({ onUploadSuccess, maxFiles = 1, className = "" }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<UploadResponse[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0]; // For single file upload
    
    // Validate file
    const validationError = validateImageFile(file);
    if (validationError) {
      toast({
        title: "업로드 오류",
        description: validationError,
        variant: "destructive",
      });
      return;
    }

    // Create preview
    const previewUrl = getImagePreviewUrl(file);
    setPreviewUrls([previewUrl]);

    // Upload file
    setUploading(true);
    try {
      const uploadResult = await uploadImage(file);
      setUploadedImages([uploadResult]);
      
      toast({
        title: "업로드 성공",
        description: "이미지가 성공적으로 업로드되었습니다.",
      });

      if (onUploadSuccess) {
        onUploadSuccess(uploadResult);
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "업로드 실패",
        description: error instanceof Error ? error.message : "이미지 업로드에 실패했습니다.",
        variant: "destructive",
      });
      
      // Clean up preview on error
      revokeImagePreviewUrl(previewUrl);
      setPreviewUrls([]);
    } finally {
      setUploading(false);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const clearImages = () => {
    // Clean up preview URLs
    previewUrls.forEach(url => revokeImagePreviewUrl(url));
    setPreviewUrls([]);
    setUploadedImages([]);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
      
      <div className="flex gap-2">
        <Button
          onClick={handleUploadClick}
          disabled={uploading}
          style={{ backgroundColor: 'rgba(245, 73, 144, 1)' }}
          className="text-white hover:opacity-90"
        >
          {uploading ? '업로드 중...' : '이미지 선택'}
        </Button>
        
        {uploadedImages.length > 0 && (
          <Button
            onClick={clearImages}
            variant="outline"
            className="text-gray-600"
          >
            삭제
          </Button>
        )}
      </div>

      {/* Preview/Uploaded Images */}
      {(previewUrls.length > 0 || uploadedImages.length > 0) && (
        <div className="grid grid-cols-2 gap-4">
          {previewUrls.map((url, index) => (
            <Card key={index} className="overflow-hidden">
              <CardContent className="p-0">
                <img
                  src={uploadedImages[index]?.url || url}
                  alt={`업로드된 이미지 ${index + 1}`}
                  className="w-full h-32 object-cover"
                />
                <div className="p-2 text-xs text-gray-500">
                  {uploadedImages[index] ? (
                    <div>
                      <div className="font-semibold text-green-600">✓ 업로드 완료</div>
                      <div>크기: {Math.round(uploadedImages[index].size / 1024)}KB</div>
                    </div>
                  ) : (
                    <div className="text-blue-600">미리보기</div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      
      {uploading && (
        <div className="text-center text-sm text-gray-500">
          이미지를 업로드하고 있습니다...
        </div>
      )}
    </div>
  );
}