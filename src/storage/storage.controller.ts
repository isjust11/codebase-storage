import { Controller, Get, Post, Delete, Param,
   UploadedFile, UseInterceptors, Req, Res, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
type UploadedFileType = { originalname: string; buffer: Buffer; mimetype: string,
   subDirectory?: string , createById?: string,};
import * as path from 'path';
import * as fs from 'fs';
import { StorageService } from './storage.service';
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(@UploadedFile() file: UploadedFileType, @Req() req: Request) {
    const clientKey = (req as any).clientKey as string | undefined;
    if (!clientKey) throw new BadRequestException('Missing client key');
    if (!file) throw new BadRequestException('No file uploaded');
    const originalName = path.basename(file.originalname);
    // Extract createById from request body (form data)
    const createById = (req.body && req.body.createById) ? req.body.createById : undefined;
    return await this.storageService.saveBuffer(clientKey, originalName, file.buffer, file.mimetype, createById);
  }

  // upload file form data  
  @Post('upload-form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFormData(@UploadedFile() file: UploadedFileType, @Req() req: Request) {
    const clientKey = (req as any).clientKey as string | undefined;
    if (!clientKey) throw new BadRequestException('Missing client key');
    if (!file) throw new BadRequestException('No file uploaded');
    const originalName = path.basename(file.originalname);
    return await this.storageService.saveBuffer(clientKey, originalName, file.buffer, file.mimetype);
  }


  @Get('list')
  async list(@Req() req: Request) {
    const clientKey = (req as any).clientKey as string | undefined;
    if (!clientKey) throw new BadRequestException('Missing client key');
    return this.storageService.listFiles(clientKey);
  }

  @Get('file/*path')
  async get(@Param('path') path: string, @Req() req: Request, @Res() res: Response) {
    const clientKey = (req as any).clientKey as string | undefined;
    if (!clientKey) throw new BadRequestException('Missing client key');
    // Decode path (may include userId path like "userId/filename.ext")
    const decodedPath = decodeURIComponent(path);
    const filePath = await this.storageService.getFilePath(clientKey, decodedPath);
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  }

  @Get('file-info/*path')
  async getFileInfo(@Param('path') path: string, @Req() req: Request) {
    const clientKey = (req as any).clientKey as string | undefined;
    if (!clientKey) throw new BadRequestException('Missing client key');
    const decodedPath = decodeURIComponent(path);
    return await this.storageService.getFileInfo(clientKey, decodedPath);
  }

  @Delete('file/*path')
  async remove(@Param('path') path: string, @Req() req: Request) {
    const clientKey = (req as any).clientKey as string | undefined;
    if (!clientKey) throw new BadRequestException('Missing client key');
    const decodedPath = decodeURIComponent(path);
    await this.storageService.deleteFile(clientKey, decodedPath);
    return { success: true };
  }

  @Get('statistics')
  async getStatistics(@Req() req: Request) {
    const clientKey = (req as any).clientKey as string | undefined;
    if (!clientKey) throw new BadRequestException('Missing client key');
    return this.storageService.getFileStatistics(clientKey);
  }
}


