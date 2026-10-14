import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DocumentProcessorService } from './document-processor.service';

export const DOCUMENT_PROCESSING_QUEUE = 'document-processing';
export const PROCESS_DOCUMENT_JOB = 'process-document';

export interface DocumentJobData {
  documentId: string;
  userId?: string;
}

@Processor(DOCUMENT_PROCESSING_QUEUE)
export class DocumentProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentProcessor.name);

  constructor(private readonly documentProcessorService: DocumentProcessorService) {
    super();
  }

  async process(job: Job<DocumentJobData>): Promise<void> {
    const { documentId, userId } = job.data;
    const maxAttempts = job.opts.attempts || 1;

    this.logger.log(
      `Processing job ${job.id} for document ${documentId} (Attempt ${job.attemptsMade + 1}/${maxAttempts})`,
    );

    try {
      await this.documentProcessorService.processDocument(documentId, userId);
    } catch (error: any) {
      // Check if this was the last attempt
      if (job.attemptsMade + 1 >= maxAttempts) {
        this.logger.error(
          `All ${maxAttempts} retry attempts exhausted for document ${documentId}. Marking as failed.`,
        );
        await this.documentProcessorService.markDocumentFailed(documentId, error.message);
      }
      // Re-throw so BullMQ records the failure and schedules retry if attempts remain
      throw error;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<DocumentJobData>, error: Error) {
    this.logger.error(
      `Job ${job.id} failed for document ${job.data.documentId}: ${error.message}`,
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<DocumentJobData>) {
    this.logger.log(`Job ${job.id} successfully completed for document ${job.data.documentId}`);
  }
}
