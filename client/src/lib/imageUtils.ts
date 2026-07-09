/**
 * Image utilities: downscale + compress to WebP on the client, then upload to Vercel Blob.
 * DB rows should store ONLY the returned Blob URL — never base64 data URLs.
 */
import { apiRequest } from "./queryClient";

/**
 * Downscale an image (longest side <= maxSize) and encode it as a WebP data URL.
 * WebP gives markedly smaller files than JPEG at the same visual quality.
 */
export const compressImageToWebp = (
    file: File,
    maxSize: number = 1280,
    quality: number = 0.8
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement("canvas");
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxSize) {
                        height *= maxSize / width;
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width *= maxSize / height;
                        height = maxSize;
                    }
                }

                canvas.width = Math.round(width);
                canvas.height = Math.round(height);

                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    reject(new Error("Canvas context failed"));
                    return;
                }
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL("image/webp", quality));
            };
            img.onerror = () => reject(new Error("Image load failed"));
            img.src = event.target?.result as string;
        };
        reader.onerror = () => reject(new Error("File read failed"));
        reader.readAsDataURL(file);
    });
};

/**
 * Compress to WebP and upload to Vercel Blob via the API. Returns the public Blob URL
 * to store in the DB. `category` is a short folder segment (e.g. "avatar", "crew-cover").
 */
export const uploadImage = async (
    file: File,
    category: string = "misc",
    opts?: { maxSize?: number; quality?: number }
): Promise<string> => {
    const dataUrl = await compressImageToWebp(file, opts?.maxSize ?? 1280, opts?.quality ?? 0.8);
    const result = await apiRequest("/api/hiq/upload", {
        method: "POST",
        body: { dataUrl, category },
    });
    const url = result?.url ?? result?.data?.url;
    if (!url) throw new Error("업로드 응답에 URL이 없습니다");
    return url;
};

/**
 * @deprecated Produces a base64 data URL (no Blob upload). Retained only so any legacy
 * caller keeps compiling; new code should use {@link uploadImage}. Now emits WebP.
 */
export const compressImage = (
    file: File,
    maxSize: number = 1280,
    quality: number = 0.7
): Promise<string> => compressImageToWebp(file, maxSize, quality);
