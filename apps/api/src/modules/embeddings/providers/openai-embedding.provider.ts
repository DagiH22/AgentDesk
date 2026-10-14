import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingProvider, EmbeddingProviderOptions } from '../embeddings.types';

@Injectable()
export class OpenAiEmbeddingProvider implements EmbeddingProvider {
  private readonly logger = new Logger(OpenAiEmbeddingProvider.name);
  private readonly apiKey: string;
  private readonly model: string;
  private readonly apiUrl: string;
  private readonly dimensions = 1536;

  constructor(options: EmbeddingProviderOptions = {}) {
    this.apiKey = options.apiKey || '';
    this.model = options.model || 'text-embedding-3-small';
    this.apiUrl = options.apiUrl || 'https://api.openai.com/v1/embeddings';

    if (!this.apiKey) {
      this.logger.warn('OpenAiEmbeddingProvider initialized without an API key.');
    }
  }

  getDimensions(): number {
    return this.dimensions;
  }

  getModelName(): string {
    return this.model;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const embeddings = await this.generateEmbeddings([text]);
    return embeddings[0];
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) {
      return [];
    }

    if (!this.apiKey) {
      throw new Error('OpenAI API key is missing. Set EMBEDDING_API_KEY or OPENAI_API_KEY.');
    }

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: texts,
        }),
      });

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status} ${response.statusText}`;
        try {
          const errorJson = (await response.json()) as any;
          if (errorJson?.error?.message) {
            errorMessage = errorJson.error.message;
          }
        } catch {
          // Ignore JSON parsing failure
        }
        // Sanitize error message to prevent any potential credential leakage
        throw new Error(`OpenAI Embedding API error: ${errorMessage}`);
      }

      const data = (await response.json()) as {
        data: Array<{ embedding: number[]; index: number }>;
      };

      if (!data.data || !Array.isArray(data.data)) {
        throw new Error('Invalid response structure from OpenAI Embedding API');
      }

      // Sort by index to preserve input ordering
      const sorted = [...data.data].sort((a, b) => a.index - b.index);
      return sorted.map((item) => item.embedding);
    } catch (error: any) {
      // Re-throw sanitized error without revealing API keys or document contents
      const safeMessage = error instanceof Error ? error.message : 'Unknown embedding error';
      throw new Error(`Failed to generate embeddings: ${safeMessage}`);
    }
  }
}
