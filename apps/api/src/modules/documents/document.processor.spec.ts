jest.mock('@nestjs/bullmq', () => ({
  Processor: () => () => {},
  WorkerHost: class WorkerHost {},
  OnWorkerEvent: () => () => {},
  InjectQueue: () => () => {},
  getQueueToken: (name: string) => `BullQueue_${name}`,
}));

import { Test, TestingModule } from '@nestjs/testing';
import { DocumentProcessor } from './document.processor';
import {
  DocumentProcessorService,
  DocumentNotFoundError,
} from './document-processor.service';
import { Job } from 'bullmq';

describe('DocumentProcessor', () => {
  let processor: DocumentProcessor;
  let mockProcessorService: jest.Mocked<DocumentProcessorService>;

  beforeEach(async () => {
    mockProcessorService = {
      processDocument: jest.fn(),
      markDocumentFailed: jest.fn(),
      updateDocumentStatus: jest.fn(),
    } as unknown as jest.Mocked<DocumentProcessorService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentProcessor,
        {
          provide: DocumentProcessorService,
          useValue: mockProcessorService,
        },
      ],
    }).compile();

    processor = module.get<DocumentProcessor>(DocumentProcessor);
  });

  const createMockJob = (attemptsMade = 0, maxAttempts = 3): Job<any> =>
    ({
      id: 'job-123',
      data: { documentId: 'doc-abc', userId: 'user-xyz' },
      opts: { attempts: maxAttempts },
      attemptsMade,
    }) as unknown as Job<any>;

  it('should successfully process a document', async () => {
    mockProcessorService.processDocument.mockResolvedValueOnce(undefined);
    const job = createMockJob(0, 3);

    await expect(processor.process(job)).resolves.toBeUndefined();
    expect(mockProcessorService.processDocument).toHaveBeenCalledWith(
      'doc-abc',
      'user-xyz',
    );
    expect(mockProcessorService.markDocumentFailed).not.toHaveBeenCalled();
  });

  it('should handle deleted documents cleanly without retries or marking failed', async () => {
    mockProcessorService.processDocument.mockRejectedValueOnce(
      new DocumentNotFoundError('doc-abc'),
    );
    const job = createMockJob(0, 3);

    // Should complete cleanly without throwing an error (no retries triggered)
    await expect(processor.process(job)).resolves.toBeUndefined();
    expect(mockProcessorService.markDocumentFailed).not.toHaveBeenCalled();
  });

  it('should rethrow error on non-final attempt to allow BullMQ retries', async () => {
    const error = new Error('Transient network error');
    mockProcessorService.processDocument.mockRejectedValueOnce(error);
    const job = createMockJob(0, 3); // Attempt 1 of 3

    await expect(processor.process(job)).rejects.toThrow('Transient network error');
    // Should NOT mark failed yet because attempts remain
    expect(mockProcessorService.markDocumentFailed).not.toHaveBeenCalled();
  });

  it('should mark document as failed and rethrow when all attempts are exhausted', async () => {
    const error = new Error('Persistent failure');
    mockProcessorService.processDocument.mockRejectedValueOnce(error);
    const job = createMockJob(2, 3); // Attempt 3 of 3 (final attempt)

    await expect(processor.process(job)).rejects.toThrow('Persistent failure');
    expect(mockProcessorService.markDocumentFailed).toHaveBeenCalledWith(
      'doc-abc',
      'Persistent failure',
    );
  });
});
