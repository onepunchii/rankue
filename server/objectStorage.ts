import { Response } from "express";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

// Local storage directory
const LOCAL_STORAGE_DIR = path.resolve(process.cwd(), "uploads");

// Ensure upload directory exists
if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
  fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// Emulate Replit's Object Storage using local filesystem
export class ObjectStorageService {
  constructor() {
    console.log(`[ObjectStorage] Initialized using local directory: ${LOCAL_STORAGE_DIR}`);
  }

  getPublicObjectSearchPaths(): Array<string> {
    return [LOCAL_STORAGE_DIR];
  }

  getPrivateObjectDir(): string {
    return path.join(LOCAL_STORAGE_DIR, "private");
  }

  // Search for a public object from the search paths (Local FS)
  async searchPublicObject(filePath: string): Promise<string | null> {
    // Handling "category/filename" style paths
    const fullPath = path.join(LOCAL_STORAGE_DIR, filePath);
    
    if (fs.existsSync(fullPath)) {
        return fullPath;
    }
    return null;
  }

  async searchCelebrityImage(category: string, fileName: string): Promise<string | null> {
      const extensions = ['', '.jpg', '.jpeg', '.png', '.webp'];
      for (const ext of extensions) {
          const tryPath = path.join(LOCAL_STORAGE_DIR, "public", "celebrities", category, `${fileName}${ext}`);
          if (fs.existsSync(tryPath)) {
              return tryPath;
          }
      }
      return null;
  }

  async downloadObject(filePath: string, res: Response, cacheTtlSec: number = 3600) {
    try {
        if (!fs.existsSync(filePath)) {
             res.status(404).json({ error: "File not found" });
             return;
        }

       res.sendFile(filePath, {
           maxAge: cacheTtlSec * 1000
       });
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }
  
  // For local dev, we don't really have "signed URLs" for upload in the same way.
  // We can return a special URL that the frontend knows how to handle, or just a direct upload API endpoint.
  // However, since the frontend is likely expecting a PUT to this URL, we might need a local route to handle it.
  // For now, let's return a placeholder that logs a warning.
  async getCelebrityImageUploadURL(category: string, fileName: string): Promise<string> {
      console.warn("[ObjectStorage] getCelebrityImageUploadURL is not fully supported in local mode without a corresponding upload route handler.");
      return `http://localhost:5000/api/local-upload?category=${category}&filename=${fileName}`;
  }
}

// Export a singleton instance
export const objectStorageService = new ObjectStorageService();
// Mocking the 'objectStorageClient' if it's used directly elsewhere (though likely not needed with this refactor)
export const objectStorageClient = null; 