import { apiRequest } from "./queryClient";

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

  return response.json();
};

export const validateImageFile = (file: File): string | null => {
  // Check file type
  if (!file.type.startsWith('image/')) {
    return '이미지 파일만 업로드할 수 있습니다.';
  }

  // Check file size (5MB limit)
  const maxSize = 5 * 1024 * 1024; // 5MB
  if (file.size > maxSize) {
    return '파일 크기는 5MB를 초과할 수 없습니다.';
  }

  // Check file extensions
  const allowedExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !allowedExtensions.includes(extension)) {
    return '지원하는 이미지 형식: JPG, PNG, GIF, WebP';
  }

  return null; // Valid file
};

export const getImagePreviewUrl = (file: File): string => {
  return URL.createObjectURL(file);
};

export const revokeImagePreviewUrl = (url: string): void => {
  URL.revokeObjectURL(url);
};