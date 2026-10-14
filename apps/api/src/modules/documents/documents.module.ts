import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentChunksService } from './document-chunks.service';
import { DocumentProcessorService } from './document-processor.service';
import { DocumentProcessor, DOCUMENT_PROCESSING_QUEUE } from './document.processor';
import { DatabaseModule } from '../database/database.module';
import { StorageModule } from '../storage/storage.module';
import { ExtractionModule } from '../extraction/extraction.module';
import { ChunkingModule } from '../chunking/chunking.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';

@Module({
  imports: [
    DatabaseModule,
    StorageModule,
    ExtractionModule,
    ChunkingModule,
    EmbeddingsModule,
    BullModule.registerQueue({
      name: DOCUMENT_PROCESSING_QUEUE,
    }),
  ],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    DocumentChunksService,
    DocumentProcessorService,
    DocumentProcessor,
  ],
  exports: [DocumentsService, DocumentChunksService, DocumentProcessorService],
})
export class DocumentsModule {}
