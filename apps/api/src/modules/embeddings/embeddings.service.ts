import { Inject, Injectable, Logger } from '@nestjs/common';
import { EMBEDDING_PROVIDER, EmbeddingProvider } from './embeddings.types';

@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);

  constructor(
    @Inject(EMBEDDING_PROVIDER)
    private readonly provider: EmbeddingProvider,
  ) {}

  /**
   * Generates a vector embedding for a single text chunk.
   * Note: Never logs document content or embedding vectors.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const embeddings = await this.generateEmbeddings([text]);
    return embeddings[0];
  }

  /**
   * Generates vector embeddings for a batch of text chunks.
   * Note: Never logs document content or embedding vectors.
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) {
      return [];
    }

    const startTime = Date.now();
    this.logger.debug(
      `Generating embeddings for ${texts.length} item(s) using model: ${this.provider.getModelName()}`,
    );

    try {
      const embeddings = await this.provider.generateEmbeddings(texts);
      const durationMs = Date.now() - startTime;
      this.logger.log(
        `Successfully generated embeddings for ${texts.length} item(s) in ${durationMs}ms`,
      );
      return embeddings;
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      this.logger.error(
        `Failed to generate embeddings for ${texts.length} item(s) after ${durationMs}ms: ${error.message}`,
      );
      throw error;
    }
  }

  getDimensions(): number {
    return this.provider.getDimensions();
  }

  getModelName(): string {
    return this.provider.getModelName();
  }
}
