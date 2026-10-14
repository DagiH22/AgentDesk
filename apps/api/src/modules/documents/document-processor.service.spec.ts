import { Test, TestingModule } from '@nestjs/testing';
import { DocumentProcessorService } from './document-processor.service';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { ExtractionService } from '../extraction/extraction.service';
import { ChunkingService } from '../chunking/chunking.service';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { DocumentChunksService } from './document-chunks.service';
import { NotFoundException } from '@nestjs/common';

describe('DocumentProcessorService', () => {
  let service: DocumentProcessorService;
  let mockDb: any;
  let mockStorageService: any;
  let mockExtractionService: any;
  let mockChunkingService: any;
  let mockEmbeddingsService: any;
  let mockDocumentChunksService: any;

  const mockDoc = {
    id: 'doc-123',
    userId: 'user-456',
    filename: 'test.pdf',
    storageKey: 'documents/user-456/doc-123.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    status: 'uploaded',
  };

  beforeEach(async () => {
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([mockDoc]),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
    };

    mockStorageService = {
      get: jest.fn().mockResolvedValue({
        transformToByteArray: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      }),
    };

    mockExtractionService = {
      extractText: jest.fn().mockResolvedValue({ text: 'Extracted content from PDF.' }),
    };

    mockChunkingService = {
      chunkText: jest.fn().mockReturnValue([
        { index: 0, text: 'First chunk', tokenCount: 10 },
        { index: 1, text: 'Second chunk', tokenCount: 12 },
      ]),
    };

    mockEmbeddingsService = {
      generateEmbeddings: jest.fn().mockResolvedValue([
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6],
      ]),
    };

    mockDocumentChunksService = {
      saveChunks: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentProcessorService,
        { provide: DatabaseService, useValue: { db: mockDb } },
        { provide: StorageService, useValue: mockStorageService },
        { provide: ExtractionService, useValue: mockExtractionService },
        { provide: ChunkingService, useValue: mockChunkingService },
        { provide: EmbeddingsService, useValue: mockEmbeddingsService },
        { provide: DocumentChunksService, useValue: mockDocumentChunksService },
      ],
    }).compile();

    service = module.get<DocumentProcessorService>(DocumentProcessorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('successful indexing', () => {
    it('should complete full indexing pipeline from uploaded to ready', async () => {
      await service.processDocument('doc-123', 'user-456');

      // 1. Check status updated to 'processing'
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'processing' }),
      );

      // 2. Storage downloaded
      expect(mockStorageService.get).toHaveBeenCalledWith(mockDoc.storageKey);

      // 3. Extraction called
      expect(mockExtractionService.extractText).toHaveBeenCalled();

      // 4. Chunking called
      expect(mockChunkingService.chunkText).toHaveBeenCalledWith(
        'Extracted content from PDF.',
        'doc-123',
      );

      // 5. Embeddings generated for chunks
      expect(mockEmbeddingsService.generateEmbeddings).toHaveBeenCalledWith([
        'First chunk',
        'Second chunk',
      ]);

      // 6. Chunks persisted
      expect(mockDocumentChunksService.saveChunks).toHaveBeenCalledWith(
        'doc-123',
        [
          {
            chunkIndex: 0,
            content: 'First chunk',
            tokenCount: 10,
            embedding: [0.1, 0.2, 0.3],
          },
          {
            chunkIndex: 1,
            content: 'Second chunk',
            tokenCount: 12,
            embedding: [0.4, 0.5, 0.6],
          },
        ],
      );

      // 7. Status updated to 'ready'
      expect(mockDb.set).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'ready' }),
      );
    });

    it('should handle documents producing 0 chunks and mark them ready', async () => {
      mockChunkingService.chunkText.mockReturnValueOnce([]);

      await service.processDocument('doc-123', 'user-456');

      expect(mockDocumentChunksService.saveChunks).toHaveBeenCalledWith('doc-123', []);
      expect(mockDb.set).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'ready' }),
      );
    });
  });

  describe('failed embedding', () => {
    it('should throw error when embedding API fails and allow BullMQ to retry', async () => {
      mockEmbeddingsService.generateEmbeddings.mockRejectedValueOnce(
        new Error('OpenAI API rate limit or network failure'),
      );

      await expect(service.processDocument('doc-123', 'user-456')).rejects.toThrow(
        'OpenAI API rate limit or network failure',
      );

      // Document chunks should NOT be saved if embeddings failed
      expect(mockDocumentChunksService.saveChunks).not.toHaveBeenCalled();
    });

    it('should update document status to failed when markDocumentFailed is called', async () => {
      await service.markDocumentFailed('doc-123', 'Max retry attempts exhausted');

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' }),
      );
    });
  });

  describe('error conditions and validation', () => {
    it('should throw NotFoundException if document does not exist', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      await expect(service.processDocument('non-existent-doc')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if userId does not match', async () => {
      await expect(service.processDocument('doc-123', 'wrong-user')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if storage file is missing', async () => {
      mockStorageService.get.mockResolvedValueOnce(null);

      await expect(service.processDocument('doc-123', 'user-456')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
