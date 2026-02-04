/**
 * Utility for image compression using Canvas
 * @param file The image file to compress
 * @param maxWidth Maximum width of the output image
 * @param quality Quality of the output JPEG (0.0 to 1.0)
 */
export const compressImage = (file: File, maxWidth: number = 800, quality: number = 0.7): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const scaleSize = maxWidth / img.width;

                // Only scale down, never scale up
                const actualWidth = img.width > maxWidth ? maxWidth : img.width;
                const actualHeight = img.width > maxWidth ? img.height * scaleSize : img.height;

                canvas.width = actualWidth;
                canvas.height = actualHeight;

                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
        };
        reader.onerror = (error) => reject(error);
    });
};
