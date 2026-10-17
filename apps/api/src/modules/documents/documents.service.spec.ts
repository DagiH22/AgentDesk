jest.mock('@nestjs/bullmq', () => {
  const { Inject } = jest.requireActual('@nestjs/common');
  const getQueueToken = (name?: string) => `BullQueue_${name || 'default'}`;
  return {
    Processor: () => () => {},
    WorkerHost: class WorkerHost {},
    OnWorkerEvent: () => () => {},
    InjectQueue: (name?: string) => Inject(getQueueToken(name)),
    getQueueToken,
  };
});

import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';
import { DocumentsService } from './documents.service';
import { DatabaseService } from '../database/database.service';
import { StorageService } from '../storage/storage.service';
import { ExtractionService } from '../extraction/extraction.service';
import { DOCUMENT_PROCESSING_QUEUE, PROCESS_DOCUMENT_JOB } from './document.processor';
import { NotFoundException } from '@nestjs/common';

describe('DocumentsService', () => {
  let service: DocumentsService;
  let mockDb: any;
  let mockStorageService: any;
  let mockExtractionService: any;
  let mockQueue: any;

  beforeEach(async () => {
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
    };

    mockStorageService = {
      upload: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      get: jest.fn(),
    };

    mockExtractionService = {
      extractText: jest.fn().mockResolvedValue({ text: 'Extracted sample text' }),
    };

    mockQueue = {
      getJob: jest.fn(),
      add: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: DatabaseService, useValue: { db: mockDb } },
        { provide: StorageService, useValue: mockStorageService },
        { provide: ExtractionService, useValue: mockExtractionService },
        { provide: getQueueToken(DOCUMENT_PROCESSING_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
  });

  describe('enqueueDocument & deduplication', () => {
    it('should successfully enqueue a job with deterministic jobId', async () => {
      mockQueue.getJob.mockResolvedValueOnce(null);
      mockQueue.add.mockResolvedValueOnce({ id: 'doc-123' });

      const result = await service.enqueueDocument('doc-123', 'user-456');

      expect(result).toBe(true);
      expect(mockQueue.getJob).toHaveBeenCalledWith('doc-doc-123');
      expect(mockQueue.add).toHaveBeenCalledWith(
        PROCESS_DOCUMENT_JOB,
        { documentId: 'doc-123', userId: 'user-456' },
        expect.objectContaining({
          jobId: 'doc-doc-123',
          attempts: 3,
          removeOnComplete: true,
          removeOnFail: true,
        }),
      );
    });

    it('should reject duplicate enqueue when an existing job is active', async () => {
      const mockActiveJob = {
        getState: jest.fn().mockResolvedValue('active'),
        remove: jest.fn(),
      };
      mockQueue.getJob.mockResolvedValueOnce(mockActiveJob);

      const result = await service.enqueueDocument('doc-123', 'user-456');

      expect(result).toBe(false);
      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(mockActiveJob.remove).not.toHaveBeenCalled();
    });

    it('should reject duplicate enqueue when an existing job is waiting', async () => {
      const mockWaitingJob = {
        getState: jest.fn().mockResolvedValue('waiting'),
        remove: jest.fn(),
      };
      mockQueue.getJob.mockResolvedValueOnce(mockWaitingJob);

      const result = await service.enqueueDocument('doc-123', 'user-456');

      expect(result).toBe(false);
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should allow intentional re-indexing when existing job has completed', async () => {
      const mockCompletedJob = {
        getState: jest.fn().mockResolvedValue('completed'),
        remove: jest.fn().mockResolvedValue(undefined),
      };
      mockQueue.getJob.mockResolvedValueOnce(mockCompletedJob);
      mockQueue.add.mockResolvedValueOnce({ id: 'doc-123' });

      const result = await service.enqueueDocument('doc-123', 'user-456');

      expect(result).toBe(true);
      expect(mockCompletedJob.remove).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalledWith(
        PROCESS_DOCUMENT_JOB,
        { documentId: 'doc-123', userId: 'user-456' },
        expect.objectContaining({ jobId: 'doc-doc-123' }),
      );
    });
  });

  describe('queueDocumentProcessing (re-indexing status handling)', () => {
    it('should update status to processing ONLY when enqueue succeeds', async () => {
      mockDb.limit.mockResolvedValueOnce([
        { id: 'doc-123', userId: 'user-456', status: 'ready' },
      ]);
      mockQueue.getJob.mockResolvedValueOnce(null);
      mockQueue.add.mockResolvedValueOnce({ id: 'doc-123' });

      const result = await service.queueDocumentProcessing('user-456', 'doc-123');

      expect(result.queued).toBe(true);
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'processing' }),
      );
    });

    it('should NOT update status to processing when enqueue fails (e.g. queue error)', async () => {
      mockDb.limit.mockResolvedValueOnce([
        { id: 'doc-123', userId: 'user-456', status: 'ready' },
      ]);
      mockQueue.getJob.mockRejectedValueOnce(new Error('Redis connection error'));

      const result = await service.queueDocumentProcessing('user-456', 'doc-123');

      expect(result.queued).toBe(false);
      // Status update to 'processing' must NOT be called
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('should NOT update status to processing when job is already active', async () => {
      mockDb.limit.mockResolvedValueOnce([
        { id: 'doc-123', userId: 'user-456', status: 'ready' },
      ]);
      const mockActiveJob = {
        getState: jest.fn().mockResolvedValue('active'),
      };
      mockQueue.getJob.mockResolvedValueOnce(mockActiveJob);

      const result = await service.queueDocumentProcessing('user-456', 'doc-123');

      expect(result.queued).toBe(false);
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if document does not exist', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      await expect(
        service.queueDocumentProcessing('user-456', 'doc-123'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('uploadDocument status handling on enqueue failure', () => {
    it('should mark document as failed if enqueue fails during upload', async () => {
      const mockFile = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: 1024,
        buffer: Buffer.from('test'),
      } as Express.Multer.File;

      const createdDoc = {
        id: 'doc-new',
        userId: 'user-456',
        filename: 'test.pdf',
        storageKey: 'documents/user-456/doc-new.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        status: 'uploaded',
      };

      mockDb.returning.mockResolvedValueOnce([createdDoc]);
      mockQueue.getJob.mockRejectedValueOnce(new Error('Redis offline'));

      const response = await service.uploadDocument('user-456', mockFile);

      // Verify DB was updated to 'failed'
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed' }),
      );
      expect(response.status).toBe('failed');
    });
  });
});
