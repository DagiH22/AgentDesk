import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { ExtractionService } from '../extraction/extraction.service';
import { ChunkingService } from '../chunking/chunking.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { DocumentChunksService } from './document-chunks.service';
import { documents } from '@agentdesk/db';
import { eq } from 'drizzle-orm';

@Injectable()
export class DocumentProcessorService {
  private readonly logger = new Logger(DocumentProcessorService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly storageService: StorageService,
    private readonly extractionService: ExtractionService,
    private readonly chunkingService: ChunkingService,
    private readonly embeddingsService: EmbeddingsService,
    private readonly documentChunksService: DocumentChunksService,
  ) {}

  /**
   * Complete indexing pipeline for a document:
   * 1. Status: uploaded -> processing
   * 2. Download from storage
   * 3. Extract text
   * 4. Token-aware chunking
   * 5. Generate vector embeddings
   * 6. Persist chunks idempotently
   * 7. Status: processing -> ready (or failed on error)
   */
  async processDocument(documentId: string, userId?: string): Promise<void> {
    this.logger.log(`Starting document processing pipeline for document: ${documentId}`);

    // 1. Fetch document metadata
    const [doc] = await this.databaseService.db
      .select()
      .from(documents)
      .where(eq(documents.id, documentId))
      .limit(1);

    if (!doc) {
      this.logger.error(`Document with ID ${documentId} not found in database.`);
      throw new NotFoundException(`Document ${documentId} not found`);
    }

    if (userId && doc.userId !== userId) {
      throw new NotFoundException(`Document ${documentId} not found or access denied`);
    }

    // 2. Set status to 'processing'
    await this.updateDocumentStatus(documentId, 'processing');

    try {
      // 3. Download file from S3 / MinIO storage
      const body = await this.storageService.get(doc.storageKey);
      if (!body) {
        throw new NotFoundException(`Document storage object not found: ${doc.storageKey}`);
      }

      const byteArray = await (body as any).transformToByteArray();
      const buffer = Buffer.from(byteArray);

      // 4. Extract text from document (PDF or TXT)
      const extractionResult = await this.extractionService.extractText(buffer, doc.mimeType);
      const text = extractionResult.text;

      // 5. Chunk extracted text into token-bounded chunks
      const chunks = this.chunkingService.chunkText(text, documentId);

      if (chunks.length === 0) {
        this.logger.warn(`Document ${documentId} produced 0 chunks after text extraction.`);
        await this.documentChunksService.saveChunks(documentId, []);
        await this.updateDocumentStatus(documentId, 'ready');
        return;
      }

      this.logger.log(
        `Document ${documentId} chunked into ${chunks.length} chunks. Generating embeddings...`,
      );

      // 6. Generate vector embeddings for all chunks (supports batching)
      const texts = chunks.map((chunk) => chunk.text);
      const embeddings = await this.embeddingsService.generateEmbeddings(texts);

      if (embeddings.length !== chunks.length) {
        throw new Error(
          `Embedding count mismatch: expected ${chunks.length}, got ${embeddings.length}`,
        );
      }

      // 7. Combine chunks with vector embeddings
      const chunkRecords = chunks.map((chunk, index) => ({
        chunkIndex: chunk.index,
        content: chunk.text,
        tokenCount: chunk.tokenCount,
        embedding: embeddings[index],
      }));

      // 8. Idempotently persist chunks (replaces any previous chunks atomically)
      await this.documentChunksService.saveChunks(documentId, chunkRecords);

      // 9. Set status to 'ready'
      await this.updateDocumentStatus(documentId, 'ready');
      this.logger.log(
        `Successfully indexed document ${documentId} with ${chunkRecords.length} chunks and vector embeddings.`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed processing document ${documentId}: ${error.message}`,
        error.stack,
      );
      // Re-throw so BullMQ worker can handle retries
      throw error;
    }
  }

  /**
   * Updates document status in database.
   */
  async updateDocumentStatus(
    documentId: string,
    status: 'uploaded' | 'processing' | 'ready' | 'failed',
  ): Promise<void> {
    await this.databaseService.db
      .update(documents)
      .set({
        status,
        updatedAt: new Date(),
      })
      .where(eq(documents.id, documentId));
  }

  /**
   * Explicitly marks document as failed (called when retries are exhausted).
   */
  async markDocumentFailed(documentId: string, reason?: string): Promise<void> {
    this.logger.error(
      `Marking document ${documentId} as failed. Reason: ${reason || 'Unknown error'}`,
    );
    await this.updateDocumentStatus(documentId, 'failed');
  }
}
