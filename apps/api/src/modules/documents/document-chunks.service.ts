import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { documentChunks, DocumentChunkEntity, NewDocumentChunkEntity } from '@agentdesk/db';
import { eq, and, asc, count } from 'drizzle-orm';

export interface ChunkInput {
  chunkIndex: number;
  content: string;
  tokenCount?: number;
  embedding?: number[];
}

@Injectable()
export class DocumentChunksService {
  private readonly logger = new Logger(DocumentChunksService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Persists document chunks idempotently within a transaction.
   * If chunks already exist for this documentId, they are replaced cleanly.
   * Never logs document content or embedding vectors.
   */
  async saveChunks(
    documentId: string,
    chunks: ChunkInput[],
  ): Promise<DocumentChunkEntity[]> {
    if (!documentId) {
      throw new Error('documentId is required to save chunks');
    }

    this.logger.debug(`Saving ${chunks.length} chunk(s) for document ${documentId}`);

    return await this.databaseService.db.transaction(async (tx) => {
      // 1. Delete existing chunks for this document (idempotent replacement / retry safety)
      await tx
        .delete(documentChunks)
        .where(eq(documentChunks.documentId, documentId));

      if (chunks.length === 0) {
        return [];
      }

      // 2. Prepare new records
      const recordsToInsert: NewDocumentChunkEntity[] = chunks.map((chunk) => ({
        documentId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        tokenCount: chunk.tokenCount ?? null,
        embedding: chunk.embedding ?? null,
      }));

      // 3. Insert fresh chunks
      const inserted = await tx
        .insert(documentChunks)
        .values(recordsToInsert)
        .returning();

      this.logger.log(`Successfully persisted ${inserted.length} chunk(s) for document ${documentId}`);
      return inserted;
    });
  }

  /**
   * Retrieves all chunks for a given document ordered by chunkIndex.
   */
  async getChunksByDocumentId(documentId: string): Promise<DocumentChunkEntity[]> {
    return await this.databaseService.db
      .select()
      .from(documentChunks)
      .where(eq(documentChunks.documentId, documentId))
      .orderBy(asc(documentChunks.chunkIndex));
  }

  /**
   * Retrieves a single chunk by documentId and chunkIndex.
   */
  async getChunkByIndex(
    documentId: string,
    chunkIndex: number,
  ): Promise<DocumentChunkEntity | null> {
    const results = await this.databaseService.db
      .select()
      .from(documentChunks)
      .where(
        and(
          eq(documentChunks.documentId, documentId),
          eq(documentChunks.chunkIndex, chunkIndex),
        ),
      )
      .limit(1);

    return results[0] ?? null;
  }

  /**
   * Deletes all chunks for a given document.
   */
  async deleteChunksByDocumentId(documentId: string): Promise<void> {
    await this.databaseService.db
      .delete(documentChunks)
      .where(eq(documentChunks.documentId, documentId));
  }

  /**
   * Counts the number of chunks for a given document.
   */
  async countChunksByDocumentId(documentId: string): Promise<number> {
    const [result] = await this.databaseService.db
      .select({ total: count() })
      .from(documentChunks)
      .where(eq(documentChunks.documentId, documentId));

    return Number(result?.total ?? 0);
  }
}
