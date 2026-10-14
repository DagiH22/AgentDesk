import { Injectable } from '@nestjs/common';
import { EmbeddingProvider } from '../embeddings.types';

@Injectable()
export class MockEmbeddingProvider implements EmbeddingProvider {
  private readonly dimensions = 1536;
  private readonly modelName = 'mock-embedding-1536';

  getDimensions(): number {
    return this.dimensions;
  }

  getModelName(): string {
    return this.modelName;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const embeddings = await this.generateEmbeddings([text]);
    return embeddings[0];
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.createDeterministicVector(text));
  }

  /**
   * Generates a deterministic unit-normalized 1536-dimensional vector
   * based on the hash of the input text.
   */
  private createDeterministicVector(text: string): number[] {
    let seed = 0;
    for (let i = 0; i < text.length; i++) {
      seed = (seed * 31 + text.charCodeAt(i)) >>> 0;
    }

    const vector = new Array<number>(this.dimensions);
    let sumSquares = 0;

    // Use a Linear Congruential Generator (LCG) for deterministic pseudo-random floats
    let state = seed || 1;
    for (let i = 0; i < this.dimensions; i++) {
      state = (1664525 * state + 1013904223) >>> 0;
      const val = (state / 4294967296) * 2 - 1; // Between -1 and 1
      vector[i] = val;
      sumSquares += val * val;
    }

    // Normalize to unit length
    const norm = Math.sqrt(sumSquares) || 1;
    for (let i = 0; i < this.dimensions; i++) {
      vector[i] = Number((vector[i] / norm).toFixed(6));
    }

    return vector;
  }
}
