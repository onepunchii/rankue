/**
 * Utility for image processing and compression
 */

/**
 * Compresses an image file and returns a Base64 string
 * @param file The image file to compress
 * @param maxSize The maximum width or height of the image (default: 1280)
 * @param quality The JPEG quality (default: 0.7)
 * @returns Promise resolving to a Base64 string
 */
export const compressImage = (file: File, maxSize: number = 1280, quality: number = 0.7): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Max dimension: 1280px by default
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

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error("Canvas context failed"));
                    return;
                }

                ctx.drawImage(img, 0, 0, width, height);

                // Compress to JPEG with specified quality
                const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
                resolve(compressedBase64);
            };
            img.onerror = () => reject(new Error("Image load failed"));
            img.src = event.target?.result as string;
        };
        reader.onerror = () => reject(new Error("File read failed"));
        reader.readAsDataURL(file);
    });
};
