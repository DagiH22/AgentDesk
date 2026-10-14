import { Test, TestingModule } from '@nestjs/testing';
import { EmbeddingsService } from './embeddings.service';
import { EMBEDDING_PROVIDER, EmbeddingProvider } from './embeddings.types';
import { MockEmbeddingProvider } from './providers/mock-embedding.provider';
import { OpenAiEmbeddingProvider } from './providers/openai-embedding.provider';

describe('EmbeddingsService & Providers', () => {
  describe('MockEmbeddingProvider', () => {
    let mockProvider: MockEmbeddingProvider;

    beforeEach(() => {
      mockProvider = new MockEmbeddingProvider();
    });

    it('should have 1536 dimensions', () => {
      expect(mockProvider.getDimensions()).toBe(1536);
    });

    it('should generate a 1536-dimensional embedding vector', async () => {
      const vector = await mockProvider.generateEmbedding('Hello world');
      expect(vector).toBeDefined();
      expect(vector.length).toBe(1536);
      expect(typeof vector[0]).toBe('number');
    });

    it('should generate deterministic embeddings for the same text', async () => {
      const vec1 = await mockProvider.generateEmbedding('Test document');
      const vec2 = await mockProvider.generateEmbedding('Test document');
      expect(vec1).toEqual(vec2);
    });

    it('should generate different embeddings for different texts', async () => {
      const vec1 = await mockProvider.generateEmbedding('Apple');
      const vec2 = await mockProvider.generateEmbedding('Orange');
      expect(vec1).not.toEqual(vec2);
    });
  });

  describe('OpenAiEmbeddingProvider', () => {
    it('should throw an error if API key is missing', async () => {
      const provider = new OpenAiEmbeddingProvider({ apiKey: '' });
      await expect(provider.generateEmbedding('Test')).rejects.toThrow(
        /OpenAI API key is missing/,
      );
    });

    it('should handle API errors safely without exposing sensitive info', async () => {
      const provider = new OpenAiEmbeddingProvider({
        apiKey: 'test-secret-key-12345',
        apiUrl: 'http://invalid-endpoint-that-fails.local',
      });

      await expect(provider.generateEmbedding('Secret text')).rejects.toThrow(
        /Failed to generate embeddings/,
      );
    });

    it('should correctly configure custom model', () => {
      const provider = new OpenAiEmbeddingProvider({
        apiKey: 'dummy',
        model: 'text-embedding-3-large',
      });
      expect(provider.getModelName()).toBe('text-embedding-3-large');
    });
  });

  describe('EmbeddingsService', () => {
    let service: EmbeddingsService;
    let provider: EmbeddingProvider;

    beforeEach(async () => {
      provider = new MockEmbeddingProvider();
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EmbeddingsService,
          {
            provide: EMBEDDING_PROVIDER,
            useValue: provider,
          },
        ],
      }).compile();

      service = module.get<EmbeddingsService>(EmbeddingsService);
    });

    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should return empty array for empty inputs', async () => {
      const result = await service.generateEmbeddings([]);
      expect(result).toEqual([]);
    });

    it('should generate embeddings for multiple texts', async () => {
      const result = await service.generateEmbeddings(['chunk 1', 'chunk 2']);
      expect(result.length).toBe(2);
      expect(result[0].length).toBe(1536);
      expect(result[1].length).toBe(1536);
    });

    it('should propagate errors when provider fails', async () => {
      const failingProvider: EmbeddingProvider = {
        generateEmbedding: jest.fn().mockRejectedValue(new Error('Rate limit exceeded')),
        generateEmbeddings: jest.fn().mockRejectedValue(new Error('Rate limit exceeded')),
        getDimensions: () => 1536,
        getModelName: () => 'mock',
      };

      const failingModule: TestingModule = await Test.createTestingModule({
        providers: [
          EmbeddingsService,
          {
            provide: EMBEDDING_PROVIDER,
            useValue: failingProvider,
          },
        ],
      }).compile();

      const failingService = failingModule.get<EmbeddingsService>(EmbeddingsService);
      await expect(failingService.generateEmbedding('test')).rejects.toThrow(
        'Rate limit exceeded',
      );
    });
  });
});
