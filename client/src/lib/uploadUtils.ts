import { apiRequest } from "./queryClient";
import { getLocale, type Locale } from "./i18n";

// 사용자에게 그대로 보이는 검증 문구 — 훅을 못 쓰는 유틸이라 getLocale() 로 가른다.
const MSG: Record<Locale, { notImage: string; tooLarge: string; badExt: string }> = {
  ko: { notImage: '이미지 파일만 업로드할 수 있습니다.', tooLarge: '파일 크기는 5MB를 초과할 수 없습니다.', badExt: '지원하는 이미지 형식: JPG, PNG, GIF, WebP' },
  en: { notImage: 'Only image files can be uploaded.', tooLarge: 'File size cannot exceed 5MB.', badExt: 'Supported formats: JPG, PNG, GIF, WebP' },
  es: { notImage: 'Solo se pueden subir archivos de imagen.', tooLarge: 'El archivo no puede superar 5MB.', badExt: 'Formatos admitidos: JPG, PNG, GIF, WebP' },
  tr: { notImage: 'Yalnızca görsel dosyaları yüklenebilir.', tooLarge: 'Dosya boyutu 5MB\'ı aşamaz.', badExt: 'Desteklenen biçimler: JPG, PNG, GIF, WebP' },
  vi: { notImage: 'Chỉ có thể tải lên tệp hình ảnh.', tooLarge: 'Kích thước tệp không được vượt quá 5MB.', badExt: 'Định dạng hỗ trợ: JPG, PNG, GIF, WebP' },
};

export interface UploadResponse {
  success: boolean;
  filename: string;
  url: string;
  originalName: string;
  size: number;
}

export const uploadImage = async (file: File): Promise<UploadResponse> => {
  const formData = new FormData();
  formData.append('image', file);

  const response = await fetch('/api/upload/image', {
    method: 'POST',
    body: formData,
    credentials: 'include', // Include session cookies
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to upload image');
  }

  const result = await response.json();
  return result.success && result.data ? result.data : result;
};

export const validateImageFile = (file: File): string | null => {
  const m = MSG[getLocale()] ?? MSG.ko;
  // Check file type
  if (!file.type.startsWith('image/')) {
    return m.notImage;
  }

  // Check file size (5MB limit)
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (file.size > maxSize) {
    return m.tooLarge;
  }

  // Check file extensions
  const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !allowedExtensions.includes(extension)) {
    return m.badExt;
  }

  return null; // Valid file
};

export const getImagePreviewUrl = (file: File): string => {
  return URL.createObjectURL(file);
};

export const revokeImagePreviewUrl = (url: string): void => {
  URL.revokeObjectURL(url);
};