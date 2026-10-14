import { Test, TestingModule } from '@nestjs/testing';
import { DocumentChunksService, ChunkInput } from './document-chunks.service';
import { DatabaseService } from '../database/database.service';

describe('DocumentChunksService', () => {
  let service: DocumentChunksService;
  let mockDb: any;
  let mockTx: any;

  beforeEach(async () => {
    mockTx = {
      delete: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn(),
    };

    mockDb = {
      transaction: jest.fn(async (callback: any) => {
        return callback(mockTx);
      }),
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentChunksService,
        {
          provide: DatabaseService,
          useValue: { db: mockDb },
        },
      ],
    }).compile();

    service = module.get<DocumentChunksService>(DocumentChunksService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('chunk persistence', () => {
    it('should save chunks with content, tokenCount, and embedding', async () => {
      const documentId = 'doc-123';
      const chunks: ChunkInput[] = [
        {
          chunkIndex: 0,
          content: 'First chunk content',
          tokenCount: 15,
          embedding: [0.1, 0.2, 0.3],
        },
        {
          chunkIndex: 1,
          content: 'Second chunk content',
          tokenCount: 20,
          embedding: [0.4, 0.5, 0.6],
        },
      ];

      const expectedInserted = chunks.map((c, idx) => ({
        id: `chunk-id-${idx}`,
        documentId,
        ...c,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      mockTx.returning.mockResolvedValueOnce(expectedInserted);

      const result = await service.saveChunks(documentId, chunks);

      expect(mockDb.transaction).toHaveBeenCalled();
      expect(mockTx.delete).toHaveBeenCalled();
      expect(mockTx.insert).toHaveBeenCalled();
      expect(mockTx.values).toHaveBeenCalledWith([
        {
          documentId,
          chunkIndex: 0,
          content: 'First chunk content',
          tokenCount: 15,
          embedding: [0.1, 0.2, 0.3],
        },
        {
          documentId,
          chunkIndex: 1,
          content: 'Second chunk content',
          tokenCount: 20,
          embedding: [0.4, 0.5, 0.6],
        },
      ]);
      expect(result).toEqual(expectedInserted);
    });

    it('should return empty array when saving 0 chunks without inserting', async () => {
      const documentId = 'doc-empty';
      const result = await service.saveChunks(documentId, []);

      expect(mockTx.delete).toHaveBeenCalled();
      expect(mockTx.insert).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should throw an error if documentId is empty', async () => {
      await expect(service.saveChunks('', [])).rejects.toThrow(
        'documentId is required to save chunks',
      );
    });
  });

  describe('document/chunk relationship', () => {
    it('should retrieve chunks associated with a specific documentId', async () => {
      const documentId = 'doc-rel-1';
      const mockChunks = [
        { id: 'c1', documentId, chunkIndex: 0, content: 'Text 1' },
        { id: 'c2', documentId, chunkIndex: 1, content: 'Text 2' },
      ];

      mockDb.orderBy.mockResolvedValueOnce(mockChunks);

      const result = await service.getChunksByDocumentId(documentId);

      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.from).toHaveBeenCalled();
      expect(result).toEqual(mockChunks);
      expect(result.every((c) => c.documentId === documentId)).toBe(true);
    });

    it('should retrieve a specific chunk by documentId and chunkIndex', async () => {
      const documentId = 'doc-rel-1';
      const mockChunk = { id: 'c1', documentId, chunkIndex: 0, content: 'Text 1' };

      mockDb.limit.mockResolvedValueOnce([mockChunk]);

      const result = await service.getChunkByIndex(documentId, 0);

      expect(result).toEqual(mockChunk);
      expect(result?.documentId).toBe(documentId);
      expect(result?.chunkIndex).toBe(0);
    });

    it('should return null if chunk is not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const result = await service.getChunkByIndex('doc-rel-1', 99);
      expect(result).toBeNull();
    });
  });

  describe('duplicate prevention & idempotency', () => {
    it('should delete existing chunks before inserting new ones to prevent duplicate conflicts', async () => {
      const documentId = 'doc-reindex';
      const initialChunks: ChunkInput[] = [
        { chunkIndex: 0, content: 'Original content', tokenCount: 10 },
      ];

      mockTx.returning.mockResolvedValueOnce([
        { id: 'c1', documentId, chunkIndex: 0, content: 'Original content' },
      ]);

      await service.saveChunks(documentId, initialChunks);

      expect(mockTx.delete).toHaveBeenCalled();
      expect(mockTx.insert).toHaveBeenCalled();

      // Now simulate re-indexing with updated chunks
      const reindexedChunks: ChunkInput[] = [
        { chunkIndex: 0, content: 'Updated content', tokenCount: 12 },
        { chunkIndex: 1, content: 'New second chunk', tokenCount: 15 },
      ];

      mockTx.returning.mockResolvedValueOnce([
        { id: 'c1-new', documentId, chunkIndex: 0, content: 'Updated content' },
        { id: 'c2-new', documentId, chunkIndex: 1, content: 'New second chunk' },
      ]);

      const reindexResult = await service.saveChunks(documentId, reindexedChunks);

      // Verify that delete was called in the transaction prior to insert
      expect(mockTx.delete).toHaveBeenCalledTimes(2);
      expect(reindexResult.length).toBe(2);
      expect(reindexResult[0].content).toBe('Updated content');
    });

    it('should rollback transaction if insertion fails', async () => {
      const documentId = 'doc-fail';
      const chunks: ChunkInput[] = [
        { chunkIndex: 0, content: 'Test chunk', tokenCount: 5 },
      ];

      mockTx.returning.mockRejectedValueOnce(new Error('Unique constraint violation or DB failure'));

      await expect(service.saveChunks(documentId, chunks)).rejects.toThrow(
        'Unique constraint violation or DB failure',
      );
    });
  });
});
