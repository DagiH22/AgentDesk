import 'multer';
import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Request,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DocumentsService } from './documents.service';
import { ConfigService } from '@nestjs/config';
import { DocumentResponse } from './types/document.types';

@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  private readonly maxFileSize: number;

  constructor(
    private readonly documentsService: DocumentsService,
    private readonly configService: ConfigService,
  ) {
    this.maxFileSize = this.configService.get<number>('MAX_DOCUMENT_SIZE', 5242880);
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @Request() req: any,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<DocumentResponse> {
    if (!file) {
      throw new BadRequestException('No file provided or the field is not named "file"');
    }

    if (file.size === 0) {
      throw new BadRequestException('The uploaded file is empty');
    }

    if (file.size > this.maxFileSize) {
      throw new BadRequestException(
        `File size exceeds the maximum allowed size of ${this.maxFileSize} bytes`,
      );
    }

    const allowedMimeTypes = ['application/pdf', 'text/plain'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Only PDF and plain text files are allowed');
    }

    const userId = req.user.id;
    return this.documentsService.uploadDocument(userId, file);
  }

  @Get()
  async getDocuments(@Request() req: any): Promise<DocumentResponse[]> {
    const userId = req.user.id;
    return this.documentsService.getDocumentsForUser(userId);
  }

  @Get(':id/preview')
  async getDocumentPreview(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) documentId: string,
  ): Promise<{ text: string }> {
    const userId = req.user.id;
    return this.documentsService.getDocumentPreview(userId, documentId);
  }

  @Post(':id/reindex')
  async reindexDocument(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) documentId: string,
  ): Promise<{ queued: boolean; message: string }> {
    const userId = req.user.id;
    return this.documentsService.queueDocumentProcessing(userId, documentId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDocument(
    @Request() req: any,
    @Param('id', ParseUUIDPipe) documentId: string,
  ): Promise<void> {
    const userId = req.user.id;
    await this.documentsService.deleteDocument(userId, documentId);
  }
}
