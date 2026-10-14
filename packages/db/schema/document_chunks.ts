import { pgTable, uuid, integer, text, timestamp, index, uniqueIndex, vector } from 'drizzle-orm/pg-core';
import { documents } from './documents';
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';

export const documentChunks = pgTable('document_chunks', {
  id: uuid('id').defaultRandom().primaryKey(),
  documentId: uuid('document_id')
    .notNull()
    .references(() => documents.id, { onDelete: 'cascade' }),
  chunkIndex: integer('chunk_index').notNull(),
  content: text('content').notNull(),
  tokenCount: integer('token_count'),
  embedding: vector('embedding', { dimensions: 1536 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  uniqueIndex('doc_chunks_doc_id_chunk_idx_unique').on(table.documentId, table.chunkIndex),
  index('doc_chunks_document_id_idx').on(table.documentId),
]);

export type DocumentChunkEntity = InferSelectModel<typeof documentChunks>;
export type NewDocumentChunkEntity = InferInsertModel<typeof documentChunks>;
