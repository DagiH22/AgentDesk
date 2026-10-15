import 'multer';
import {
  Injectable,
  Logger,
  NotFoundException,
  InternalServerErrorException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { documents, documentChunks } from '@agentdesk/db';
import { eq, and, desc, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { DocumentResponse } from './types/document.types';
import { ExtractionService } from '../extraction/extraction.service';
import {
  DOCUMENT_PROCESSING_QUEUE,
  PROCESS_DOCUMENT_JOB,
  DocumentJobData,
} from './document.processor';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly storageService: StorageService,
    private readonly extractionService: ExtractionService,
    @Optional()
    @InjectQueue(DOCUMENT_PROCESSING_QUEUE)
    private readonly documentQueue?: Queue<DocumentJobData>,
  ) {}

  async uploadDocument(
    userId: string,
    file: Express.Multer.File,
  ): Promise<DocumentResponse> {
    // 1. Verify content before uploading (throws if invalid or empty)
    await this.extractionService.extractText(file.buffer, file.mimetype);

    const uuid = randomUUID();
    // Use only UUID + sanitized extension — never embed the original filename in the storage key
    // to prevent path traversal and to avoid exposing user-supplied filenames in storage.
    const safeExt = extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 10);
    const storageKey = `documents/${userId}/${uuid}${safeExt}`;

    try {
      await this.storageService.upload({
        key: storageKey,
        body: file.buffer,
        contentType: file.mimetype,
      });
    } catch (error: any) {
      this.logger.error(`Failed to upload document to storage: ${error.message}`, error.stack);
      throw new InternalServerErrorException('Failed to upload document to storage');
    }

    let newDoc: any;
    try {
      [newDoc] = await this.databaseService.db
        .insert(documents)
        .values({
          userId,
          filename: file.originalname,
          storageKey,
          mimeType: file.mimetype,
          size: file.size,
          status: 'uploaded',
        })
        .returning();
    } catch (error: any) {
      this.logger.error(`Failed to save document metadata in DB. Rolling back storage.`, error.stack);

      // Cleanup storage since DB failed
      try {
        await this.storageService.delete(storageKey);
      } catch (cleanupError: any) {
        this.logger.error(
          `Failed to clean up storage after DB failure for key ${storageKey}`,
          cleanupError.stack,
        );
      }

      throw new InternalServerErrorException('Failed to save document metadata');
    }

    // 2. Enqueue document for background text chunking and vector embedding generation
    await this.enqueueDocument(newDoc.id, userId);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { storageKey: _storageKey, ...safeDoc } = newDoc;
    return safeDoc as DocumentResponse;
  }

  /**
   * Enqueues a document to BullMQ for chunking and vector embedding generation.
   * Configures retry with exponential backoff.
   */
  async enqueueDocument(documentId: string, userId: string): Promise<boolean> {
    if (!this.documentQueue) {
      this.logger.warn(
        `Document queue is not available. Skipping automatic enqueue for ${documentId}.`,
      );
      return false;
    }

    try {
      await this.documentQueue.add(
        PROCESS_DOCUMENT_JOB,
        { documentId, userId },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: true,
        },
      );
      this.logger.log(`Enqueued document ${documentId} for vector embedding processing.`);
      return true;
    } catch (queueError: any) {
      this.logger.warn(
        `Failed to enqueue document ${documentId} to BullMQ: ${queueError.message}`,
      );
      return false;
    }
  }

  async queueDocumentProcessing(
    userId: string,
    documentId: string,
  ): Promise<{ queued: boolean; message: string }> {
    const [doc] = await this.databaseService.db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.userId, userId)))
      .limit(1);

    if (!doc) {
      throw new NotFoundException('Document not found or you do not have permission to process it');
    }

    // Set status to 'processing' immediately upon request
    await this.databaseService.db
      .update(documents)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(eq(documents.id, documentId));

    const queued = await this.enqueueDocument(documentId, userId);
    return {
      queued,
      message: queued ? 'Document re-indexing queued successfully' : 'Could not queue document re-indexing',
    };
  }

  async getDocumentsForUser(userId: string): Promise<DocumentResponse[]> {
    try {
      const docs = await this.databaseService.db
        .select({
          id: documents.id,
          userId: documents.userId,
          filename: documents.filename,
          mimeType: documents.mimeType,
          size: documents.size,
          status: documents.status,
          createdAt: documents.createdAt,
          updatedAt: documents.updatedAt,
          chunkCount: sql<number>`count(${documentChunks.id})::int`,
        })
        .from(documents)
        .leftJoin(documentChunks, eq(documents.id, documentChunks.documentId))
        .where(eq(documents.userId, userId))
        .groupBy(documents.id)
        .orderBy(desc(documents.createdAt));

      return docs;
    } catch (error: any) {
      this.logger.error(`Failed to retrieve documents for user ${userId}`, error.stack);
      throw new InternalServerErrorException('Failed to retrieve documents');
    }
  }

  async getDocumentPreview(userId: string, documentId: string): Promise<{ text: string }> {
    const [doc] = await this.databaseService.db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.userId, userId)))
      .limit(1);

    if (!doc) {
      throw new NotFoundException('Document not found or you do not have permission to view it');
    }

    if (doc.status === 'failed') {
      throw new BadRequestException('Document extraction failed');
    }

    try {
      const body = await this.storageService.get(doc.storageKey);
      if (!body) {
        throw new NotFoundException('Document content not found in storage');
      }

      const byteArray = await (body as any).transformToByteArray();
      const buffer = Buffer.from(byteArray);

      const result = await this.extractionService.extractText(buffer, doc.mimeType);
      return { text: result.text };
    } catch (error: any) {
      this.logger.error(`Failed to generate preview for document ${documentId}`, error.stack);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to generate document preview');
    }
  }

  async deleteDocument(userId: string, documentId: string): Promise<void> {
    const [doc] = await this.databaseService.db
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.userId, userId)))
      .limit(1);

    if (!doc) {
      throw new NotFoundException('Document not found or you do not have permission to delete it');
    }

    // 1. Delete from object storage
    try {
      await this.storageService.delete(doc.storageKey);
    } catch (error: any) {
      this.logger.error(`Failed to delete document from storage (key: ${doc.storageKey})`, error.stack);
      throw new InternalServerErrorException('Failed to delete document from storage');
    }

    // 2. Delete metadata from PostgreSQL (Document chunks cascade delete automatically)
    try {
      await this.databaseService.db
        .delete(documents)
        .where(eq(documents.id, documentId));
    } catch (error: any) {
      this.logger.error(`Failed to delete document metadata from DB (id: ${documentId})`, error.stack);
      throw new InternalServerErrorException('Failed to delete document metadata');
    }
  }
}
