/**
 * Back-compat shim. The canonical implementation lives in ./imageUtils.
 * Prefer importing `uploadImage` / `compressImageToWebp` from "@/lib/imageUtils".
 */
export { compressImage, compressImageToWebp, uploadImage } from "./imageUtils";
