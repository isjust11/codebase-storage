import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';

export interface StoredFile {
  filename: string;
  size: number;
  mimeType: string;
  url: string;
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

  async saveBuffer(clientKey: string, filename: string, buffer: Buffer, mimeType: string): Promise<StoredFile> {
    const dir = await this.ensureClientDir(clientKey);
    const filePath = path.join(dir, filename);
    await fs.writeFile(filePath, buffer);
    const stats = await fs.stat(filePath);
    return {
      filename,
      size: stats.size,
      mimeType,
      url: `/storage/${encodeURIComponent(filename)}`,
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
        results.push({ filename, size: stats.size, mimeType: 'application/octet-stream', url: `/storage/${encodeURIComponent(filename)}` });
      }
      return results;
    } catch (err) {
      return [];
    }
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
}


