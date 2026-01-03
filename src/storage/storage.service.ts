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
    const dir = await this.ensureClientDir(clientKey);
    const uniqueFilename = this.generateUniqueFilename(originalName);
    const filePath = path.join(dir, createById ? `${createById}/` : '', uniqueFilename);
    await fs.writeFile(filePath, buffer);
    const stats = await fs.stat(filePath);
    const uploadedAt = new Date();
    return {
      filename: uniqueFilename,
      originalName,
      size: stats.size,
      mimeType,
      url: `/storage/file/${encodeURIComponent(uniqueFilename)}`,
      publicUrl: `/${process.env.STORAGE_ROOT}/${clientKey}/${createById ? `${createById}/` : ''}${uniqueFilename}`,
      uploadedAt,
    };
  }

  async listFiles(clientKey: string): Promise<StoredFile[]> {
    const dir = this.resolveClientDir(clientKey);
    try {
      const files = await fs.readdir(dir);
      const results: StoredFile[] = [];
      for (const filename of files) {
        const filePath = path.join(dir, filename);
        const stats = await fs.stat(filePath);
        if (!stats.isFile()) continue;

        // Parse original name from filename (format: timestamp_uniqueId_originalName.ext)
        const originalName = this.parseOriginalName(filename);

        results.push({
          filename,
          originalName,
          size: stats.size,
          mimeType: this.getMimeType(filename),
          url: `/storage/file/${encodeURIComponent(filename)}`,
          publicUrl: `/${process.env.STORAGE_ROOT}/${clientKey}/${filename}`,
          uploadedAt: stats.birthtime
        });
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
    const filePath = path.join(this.resolveClientDir(clientKey), filename);
    try {
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) throw new Error('Not a file');
    } catch {
      throw new NotFoundException('File not found');
    }
    return filePath;
  }

  async deleteFile(clientKey: string, filename: string): Promise<void> {
    const filePath = path.join(this.resolveClientDir(clientKey), filename);
    try {
      await fs.unlink(filePath);
    } catch {
      throw new NotFoundException('File not found');
    }
  }

  async getFileInfo(clientKey: string, filename: string): Promise<any> {
    try {
      const filePath = path.join(this.resolveClientDir(clientKey), filename);
      const stats = await fs.stat(filePath);
      const originalName = this.parseOriginalName(filename);
      return {
        filename,
        originalName: originalName,
        size: stats.size,
        mimeType: this.getMimeType(filename),
        url: `/storage/file/${encodeURIComponent(filename)}`,
        publicUrl: `/${process.env.STORAGE_ROOT}/${clientKey}/${filename}`,
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


