import { Module, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMBEDDING_PROVIDER } from './embeddings.types';
import { EmbeddingsService } from './embeddings.service';
import { OpenAiEmbeddingProvider } from './providers/openai-embedding.provider';
import { MockEmbeddingProvider } from './providers/mock-embedding.provider';

@Module({
  providers: [
    {
      provide: EMBEDDING_PROVIDER,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const logger = new Logger('EmbeddingsModule');
        const providerType = configService.get<string>('EMBEDDING_PROVIDER', 'openai');
        const apiKey =
          configService.get<string>('EMBEDDING_API_KEY') ||
          configService.get<string>('OPENAI_API_KEY');
        const model = configService.get<string>('EMBEDDING_MODEL', 'text-embedding-3-small');
        const apiUrl = configService.get<string>('EMBEDDING_API_URL');
        const isProduction = configService.get<string>('NODE_ENV') === 'production';

        if (providerType === 'mock') {
          logger.log('Using MockEmbeddingProvider for vector embeddings.');
          return new MockEmbeddingProvider();
        }

        if (providerType === 'openai') {
          if (!apiKey) {
            if (isProduction) {
              throw new Error(
                'OpenAI embedding provider configured in production but EMBEDDING_API_KEY / OPENAI_API_KEY is missing.',
              );
            }
            logger.warn(
              'No OpenAI API key found in development. Falling back to MockEmbeddingProvider.',
            );
            return new MockEmbeddingProvider();
          }

          logger.log(`Using OpenAiEmbeddingProvider with model: ${model}`);
          return new OpenAiEmbeddingProvider({
            apiKey,
            model,
            apiUrl,
          });
        }

        logger.warn(
          `Unknown EMBEDDING_PROVIDER '${providerType}'. Falling back to MockEmbeddingProvider.`,
        );
        return new MockEmbeddingProvider();
      },
    },
    EmbeddingsService,
  ],
  exports: [EmbeddingsService, EMBEDDING_PROVIDER],
})
export class EmbeddingsModule {}
