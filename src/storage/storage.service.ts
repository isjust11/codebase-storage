import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import * as mime from 'mime-types';

export interface StoredFile {
  filename: string;
  originalName: string;
  size: number;
  mimeType: string;
  url: string;
  uploadedAt: Date;
  publicUrl: string;
}

export interface FileStatistics {
  totalFiles: number;
  totalSize: number;
  fileTypes: {
    [fileType: string]: {
      count: number;
      totalSize: number;
      percentage: number;
    };
  };
  sizeBreakdown: {
    [sizeRange: string]: number;
  };
}

@Injectable()
export class StorageService {
  private readonly storageRoot: string;

  constructor(private readonly configService: ConfigService) {
    this.storageRoot = this.configService.get<string>('STORAGE_ROOT') || 'storage';
  }

  private resolveClientDir(clientKey: string): string {
    return path.resolve(process.cwd(), this.storageRoot, clientKey);
  }

  async ensureClientDir(clientKey: string): Promise<string> {
    const dir = this.resolveClientDir(clientKey);
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  private generateUniqueFilename(originalName: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const uniqueId = randomUUID().substring(0, 8);
    const ext = path.extname(originalName);
    const nameWithoutExt = path.basename(originalName, ext);

    // Tạo tên file với format: timestamp_uniqueId_originalName.ext
    return `${timestamp}_${uniqueId}_${nameWithoutExt}${ext}`;
  }

  async saveBuffer(clientKey: string, originalName: string, buffer: Buffer, mimeType: string, createById?: string): Promise<StoredFile> {
    const clientDir = await this.ensureClientDir(clientKey);
    const uniqueFilename = this.generateUniqueFilename(originalName);
    
    // If createById is provided, create user-specific directory structure
    let targetDir = clientDir;
    if (createById) {
      targetDir = path.join(clientDir, createById);
      await fs.mkdir(targetDir, { recursive: true });
    }
    
    const filePath = path.join(targetDir, uniqueFilename);
    await fs.writeFile(filePath, buffer);
    const stats = await fs.stat(filePath);
    const uploadedAt = new Date();
    
    // Build relative path for URL (includes userId if present)
    const relativePath = createById ? `${createById}/${uniqueFilename}` : uniqueFilename;
    
    return {
      filename: uniqueFilename,
      originalName,
      size: stats.size,
      mimeType,
      url: `/storage/file/${encodeURIComponent(relativePath)}`,
      publicUrl: `/${this.storageRoot}/${clientKey}/${relativePath}`,
      uploadedAt,
    };
  }

  async listFiles(clientKey: string): Promise<StoredFile[]> {
    const dir = this.resolveClientDir(clientKey);
    const results: StoredFile[] = [];
    
    try {
      const entries = await fs.readdir(dir);
      
      for (const entry of entries) {
        const entryPath = path.join(dir, entry);
        const stats = await fs.stat(entryPath);
        
        if (stats.isFile()) {
          // File in root directory
          const originalName = this.parseOriginalName(entry);
          results.push({
            filename: entry,
            originalName,
            size: stats.size,
            mimeType: this.getMimeType(entry),
            url: `/storage/file/${encodeURIComponent(entry)}`,
            publicUrl: `/${this.storageRoot}/${clientKey}/${entry}`,
            uploadedAt: stats.birthtime
          });
        } else if (stats.isDirectory()) {
          // Directory (likely user directory), list files inside
          try {
            const userFiles = await fs.readdir(entryPath);
            for (const userFile of userFiles) {
              const userFilePath = path.join(entryPath, userFile);
              const userFileStats = await fs.stat(userFilePath);
              if (userFileStats.isFile()) {
                const relativePath = `${entry}/${userFile}`;
                const originalName = this.parseOriginalName(userFile);
                results.push({
                  filename: userFile,
                  originalName,
                  size: userFileStats.size,
                  mimeType: this.getMimeType(userFile),
                  url: `/storage/file/${encodeURIComponent(relativePath)}`,
                  publicUrl: `/${this.storageRoot}/${clientKey}/${relativePath}`,
                  uploadedAt: userFileStats.birthtime
                });
              }
            }
          } catch (err) {
            // Skip directory if can't read
            continue;
          }
        }
      }
      return results;
    } catch (err) {
      return [];
    }
  }

  private getMimeType(filename: string): string {
    const ext = path.extname(filename);
    return mime.lookup(ext) || 'application/octet-stream';
  }

  private parseOriginalName(filename: string): string {
    // Parse filename format: timestamp_uniqueId_originalName.ext
    const parts = filename.split('_');
    if (parts.length >= 3) {
      // Remove timestamp and uniqueId, keep the rest as original name
      return parts.slice(2).join('_');
    }
    return filename; // Fallback to original filename if parsing fails
  }

  async getFilePath(clientKey: string, filename: string): Promise<string> {
    const clientDir = this.resolveClientDir(clientKey);
    
    // Try direct path first (for backward compatibility)
    let filePath = path.join(clientDir, filename);
    try {
      const stats = await fs.stat(filePath);
      if (stats.isFile()) return filePath;
    } catch {
      // File not found at direct path, continue searching
    }
    
    // If filename contains path separator, try that path
    if (filename.includes('/')) {
      filePath = path.join(clientDir, filename);
      try {
        const stats = await fs.stat(filePath);
        if (stats.isFile()) return filePath;
      } catch {
        // Continue to search in subdirectories
      }
    }
    
    // Search in user subdirectories
    try {
      const entries = await fs.readdir(clientDir);
      for (const entry of entries) {
        const entryPath = path.join(clientDir, entry);
        const stats = await fs.stat(entryPath);
        if (stats.isDirectory()) {
          const potentialPath = path.join(entryPath, filename);
          try {
            const fileStats = await fs.stat(potentialPath);
            if (fileStats.isFile()) return potentialPath;
          } catch {
            // Continue searching
          }
        }
      }
    } catch {
      // Directory read error
    }
    
    throw new NotFoundException('File not found');
  }

  async deleteFile(clientKey: string, filename: string): Promise<void> {
    const filePath = await this.getFilePath(clientKey, filename);
    try {
      await fs.unlink(filePath);
    } catch {
      throw new NotFoundException('File not found');
    }
  }

  async getFileInfo(clientKey: string, filename: string): Promise<any> {
    try {
      const filePath = await this.getFilePath(clientKey, filename);
      const stats = await fs.stat(filePath);
      const originalName = this.parseOriginalName(path.basename(filename));
      
      // Extract relative path from filePath for publicUrl
      const clientDir = this.resolveClientDir(clientKey);
      const relativePath = path.relative(clientDir, filePath).replace(/\\/g, '/');
      
      return {
        filename: path.basename(filename),
        originalName: originalName,
        size: stats.size,
        mimeType: this.getMimeType(filename),
        url: `/storage/file/${encodeURIComponent(relativePath)}`,
        publicUrl: `/${this.storageRoot}/${clientKey}/${relativePath}`,
        uploadedAt: stats.birthtime
      };
    } catch (error) {
      throw new NotFoundException('File not found');
    }
  }


  async getFileStatistics(clientKey: string): Promise<FileStatistics> {
    const files = await this.listFiles(clientKey);

    if (files.length === 0) {
      return {
        totalFiles: 0,
        totalSize: 0,
        fileTypes: {},
        sizeBreakdown: {}
      };
    }

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const fileTypes: { [fileType: string]: { count: number; totalSize: number; percentage: number } } = {};
    const sizeBreakdown: { [sizeRange: string]: number } = {
      '0-1MB': 0,
      '1-10MB': 0,
      '10-100MB': 0,
      '100MB+': 0
    };

    // Thống kê theo loại file
    files.forEach(file => {
      const fileType = this.getFileTypeFromMimeType(file.mimeType);

      if (!fileTypes[fileType]) {
        fileTypes[fileType] = {
          count: 0,
          totalSize: 0,
          percentage: 0
        };
      }

      fileTypes[fileType].count++;
      fileTypes[fileType].totalSize += file.size;
    });

    // Tính phần trăm cho mỗi loại file
    Object.keys(fileTypes).forEach(fileType => {
      fileTypes[fileType].percentage = Math.round((fileTypes[fileType].count / files.length) * 100);
    });

    // Thống kê theo kích thước file
    files.forEach(file => {
      const sizeInMB = file.size / (1024 * 1024);
      if (sizeInMB < 1) {
        sizeBreakdown['0-1MB']++;
      } else if (sizeInMB < 10) {
        sizeBreakdown['1-10MB']++;
      } else if (sizeInMB < 100) {
        sizeBreakdown['10-100MB']++;
      } else {
        sizeBreakdown['100MB+']++;
      }
    });

    return {
      totalFiles: files.length,
      totalSize,
      fileTypes,
      sizeBreakdown
    };
  }

  private getFileTypeFromMimeType(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'Images';
    if (mimeType.startsWith('video/')) return 'Videos';
    if (mimeType.startsWith('audio/')) return 'Audio';
    if (mimeType.startsWith('text/')) return 'Text';
    if (mimeType.includes('pdf')) return 'PDF';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'Documents';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'Spreadsheets';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'Presentations';
    if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('archive')) return 'Archives';
    return 'Other';
  }
}


