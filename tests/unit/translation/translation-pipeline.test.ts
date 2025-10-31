import { describe, it, expect, beforeEach } from '@jest/globals';
import { TranslationPipeline } from '../../../src/translation/translation-pipeline';
import type { Logger, TranslationPipelineOptions } from '../../../src/types';
import {
  createMockLogger,
  createMockGeminiClient,
  createMockAudioProcessor,
} from '../../helpers/mocks';
import {
  createMockAudioChunk,
  createMockOpusBuffer,
  createMockGeminiResponse,
} from '../../helpers/fixtures';

describe('TranslationPipeline', () => {
  let mockLogger: Logger;
  let mockGeminiClient: any;
  let mockAudioProcessor: any;
  let defaultOptions: Partial<TranslationPipelineOptions>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockGeminiClient = createMockGeminiClient();
    mockAudioProcessor = createMockAudioProcessor();
    defaultOptions = {
      defaultTargetLanguage: 'ja',
      autoDetectLanguage: true,
      maxRetries: 3,
      retryDelay: 100,
    };
  });

  describe('constructor', () => {
    it('should create a TranslationPipeline instance', () => {
      const pipeline = new TranslationPipeline(
        mockGeminiClient,
        mockAudioProcessor,
        mockLogger,
        defaultOptions
      );
      expect(pipeline).toBeDefined();
      expect(pipeline).toBeInstanceOf(TranslationPipeline);
    });

    it('should use default options if not provided', () => {
      const pipeline = new TranslationPipeline(
        mockGeminiClient,
        mockAudioProcessor,
        mockLogger
      );
      expect(pipeline).toBeDefined();
    });

    it('should log initialization', () => {
      new TranslationPipeline(
        mockGeminiClient,
        mockAudioProcessor,
        mockLogger,
        defaultOptions
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'TranslationPipeline initialized',
        expect.objectContaining({
          options: expect.any(Object),
        })
      );
    });
  });

  describe('processAudioChunk', () => {
    it('should process audio chunk and return translation', async () => {
      const pipeline = new TranslationPipeline(
        mockGeminiClient,
        mockAudioProcessor,
        mockLogger
      );

      const audioChunk = createMockAudioChunk();
      const result = await pipeline.processAudioChunk(audioChunk, 'ja');

      expect(result).toBeDefined();
      expect(result.userId).toBe('user123');
      expect(result.translatedText).toBeDefined();
      expect(result.originalText).toBeDefined();
      expect(result.targetLanguage).toBe('ja');
    });

    it('should handle empty audio chunks', async () => {
      const pipeline = new TranslationPipeline(
        mockGeminiClient,
        mockAudioProcessor,
        mockLogger
      );

      const emptyChunk = createMockAudioChunk({ data: Buffer.alloc(0) });

      await expect(pipeline.processAudioChunk(emptyChunk, 'ja')).rejects.toThrow(
        'Audio chunk data is empty'
      );
    });

    it('should use specified target language', async () => {
      const pipeline = new TranslationPipeline(
        mockGeminiClient,
        mockAudioProcessor,
        mockLogger
      );

      const audioChunk = createMockAudioChunk();
      const result = await pipeline.processAudioChunk(audioChunk, 'ko');

      expect(result.targetLanguage).toBe('ko');
      expect(mockGeminiClient.translate).toHaveBeenCalledWith(
        expect.objectContaining({
          targetLanguage: 'ko',
        })
      );
    });

    it('should auto-detect source language when enabled', async () => {
      const pipeline = new TranslationPipeline(
        mockGeminiClient,
        mockAudioProcessor,
        mockLogger,
        { autoDetectLanguage: true }
      );

      const audioChunk = createMockAudioChunk();
      const result = await pipeline.processAudioChunk(audioChunk, 'ja');

      expect(result.sourceLanguage).toBe('en'); // From mock response
      expect(mockGeminiClient.translate).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceLanguage: undefined, // Auto-detect
        })
      );
    });

    it('should use specified source language when auto-detect disabled', async () => {
      const pipeline = new TranslationPipeline(
        mockGeminiClient,
        mockAudioProcessor,
        mockLogger,
        { autoDetectLanguage: false }
      );

      const audioChunk = createMockAudioChunk();
      await pipeline.processAudioChunk(audioChunk, 'ja', 'en');

      expect(mockGeminiClient.translate).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceLanguage: 'en',
        })
      );
    });

    it('should include confidence score in result', async () => {
      const pipeline = new TranslationPipeline(
        mockGeminiClient,
        mockAudioProcessor,
        mockLogger
      );

      const audioChunk = createMockAudioChunk();
      const result = await pipeline.processAudioChunk(audioChunk, 'ja');

      expect(result.confidence).toBeDefined();
      expect(typeof result.confidence).toBe('number');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('retry logic', () => {
    it('should retry on translation failure', async () => {
      const pipeline = new TranslationPipeline(
        mockGeminiClient,
        mockAudioProcessor,
        mockLogger,
        { maxRetries: 3, retryDelay: 10 }
      );

      mockGeminiClient.translate
        .mockRejectedValueOnce(new Error('API Error'))
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce(createMockGeminiResponse());

      const audioChunk = createMockAudioChunk();
      const result = await pipeline.processAudioChunk(audioChunk, 'ja');

      expect(result).toBeDefined();
      expect(mockGeminiClient.translate).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries exceeded', async () => {
      const pipeline = new TranslationPipeline(
        mockGeminiClient,
        mockAudioProcessor,
        mockLogger,
        { maxRetries: 2, retryDelay: 10 }
      );

      mockGeminiClient.translate.mockRejectedValue(new Error('Persistent error'));

      const audioChunk = createMockAudioChunk();

      await expect(pipeline.processAudioChunk(audioChunk, 'ja')).rejects.toThrow();
      expect(mockGeminiClient.translate).toHaveBeenCalledTimes(2);
    });

    it('should log retry attempts', async () => {
      const pipeline = new TranslationPipeline(
        mockGeminiClient,
        mockAudioProcessor,
        mockLogger,
        { maxRetries: 2, retryDelay: 10 }
      );

      mockGeminiClient.translate
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce(createMockGeminiResponse());

      const audioChunk = createMockAudioChunk();
      await pipeline.processAudioChunk(audioChunk, 'ja');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Translation failed, retrying',
        expect.any(Object)
      );
    });
  });

  describe('processStream', () => {
    it('should process audio stream and yield translation results', async () => {
      const pipeline = new TranslationPipeline(
        mockGeminiClient,
        mockAudioProcessor,
        mockLogger
      );

      const mockStream = (async function* () {
        for (let i = 0; i < 3; i++) {
          yield createMockOpusBuffer();
        }
      })();

      const results = [];
      for await (const result of pipeline.processStream(
        mockStream,
        'user123',
        'TestUser',
        'ja'
      )) {
        results.push(result);
      }

      expect(results.length).toBe(1); // All buffers combined into one result
      expect(results[0].translatedText).toBeDefined();
      expect(results[0].userId).toBe('user123');
      expect(results[0].username).toBe('TestUser');
    });

    it('should handle stream with no buffers', async () => {
      const pipeline = new TranslationPipeline(
        mockGeminiClient,
        mockAudioProcessor,
        mockLogger
      );

      const emptyStream = (async function* () {
        // Yield nothing
      })();

      const results = [];
      for await (const result of pipeline.processStream(
        emptyStream,
        'user123',
        'TestUser',
        'ja'
      )) {
        results.push(result);
      }

      expect(results.length).toBe(0);
    });

    it('should convert Opus to PCM before processing', async () => {
      const pipeline = new TranslationPipeline(
        mockGeminiClient,
        mockAudioProcessor,
        mockLogger
      );

      const mockStream = (async function* () {
        yield createMockOpusBuffer();
      })();

      const results = [];
      for await (const result of pipeline.processStream(
        mockStream,
        'user123',
        'TestUser',
        'ja'
      )) {
        results.push(result);
      }

      expect(mockAudioProcessor.convertOpusToPCM).toHaveBeenCalled();
    });

    it('should resample audio after conversion', async () => {
      const pipeline = new TranslationPipeline(
        mockGeminiClient,
        mockAudioProcessor,
        mockLogger
      );

      const mockStream = (async function* () {
        yield createMockOpusBuffer();
      })();

      const results = [];
      for await (const result of pipeline.processStream(
        mockStream,
        'user123',
        'TestUser',
        'ja'
      )) {
        results.push(result);
      }

      expect(mockAudioProcessor.resample).toHaveBeenCalledWith(
        expect.any(Buffer),
        48000,
        16000
      );
    });

    it('should handle stream errors gracefully', async () => {
      const pipeline = new TranslationPipeline(
        mockGeminiClient,
        mockAudioProcessor,
        mockLogger
      );

      mockAudioProcessor.convertOpusToPCM.mockRejectedValueOnce(
        new Error('Conversion failed')
      );

      const errorStream = (async function* () {
        yield createMockOpusBuffer();
      })();

      const results = [];
      for await (const result of pipeline.processStream(
        errorStream,
        'user123',
        'TestUser',
        'ja'
      )) {
        results.push(result);
      }

      expect(results.length).toBe(0);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('processBatch', () => {
    it('should process multiple audio chunks in batch', async () => {
      const pipeline = new TranslationPipeline(
        mockGeminiClient,
        mockAudioProcessor,
        mockLogger
      );

      const chunks = [
        createMockAudioChunk({ userId: 'user1' }),
        createMockAudioChunk({ userId: 'user2' }),
        createMockAudioChunk({ userId: 'user3' }),
      ];

      const results = await pipeline.processBatch(chunks, 'ja');

      expect(results.length).toBe(3);
      expect(results[0].userId).toBe('user1');
      expect(results[1].userId).toBe('user2');
      expect(results[2].userId).toBe('user3');
    });

    it('should handle partial failures in batch', async () => {
      // Create a fresh Gemini client mock for this test
      const failingGeminiClient = {
        translate: jest.fn()
          .mockResolvedValueOnce(createMockGeminiResponse())
          .mockRejectedValueOnce(new Error('Translation failed'))
          .mockResolvedValueOnce(createMockGeminiResponse()),
      };

      const pipeline = new TranslationPipeline(
        failingGeminiClient as any,
        mockAudioProcessor,
        mockLogger
      );

      const chunks = [
        createMockAudioChunk({ userId: 'user1' }),
        createMockAudioChunk({ userId: 'user2' }),
        createMockAudioChunk({ userId: 'user3' }),
      ];

      const results = await pipeline.processBatch(chunks, 'ja');

      expect(results.length).toBe(2); // Only successful ones
      expect(mockLogger.error).toHaveBeenCalled();
    });

    it('should process empty batch', async () => {
      const pipeline = new TranslationPipeline(
        mockGeminiClient,
        mockAudioProcessor,
        mockLogger
      );

      const results = await pipeline.processBatch([], 'ja');

      expect(results).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should throw TranslatorError on audio processing failure', async () => {
      const pipeline = new TranslationPipeline(
        mockGeminiClient,
        mockAudioProcessor,
        mockLogger
      );

      mockGeminiClient.translate.mockRejectedValue(new Error('API error'));

      const audioChunk = createMockAudioChunk();

      await expect(pipeline.processAudioChunk(audioChunk, 'ja')).rejects.toThrow();
    });

    it('should log errors with context', async () => {
      const pipeline = new TranslationPipeline(
        mockGeminiClient,
        mockAudioProcessor,
        mockLogger
      );

      mockGeminiClient.translate.mockRejectedValue(new Error('API error'));

      const audioChunk = createMockAudioChunk({ userId: 'user123' });

      try {
        await pipeline.processAudioChunk(audioChunk, 'ja');
      } catch (error) {
        // Expected
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to process audio chunk',
        expect.objectContaining({
          userId: 'user123',
        })
      );
    });
  });
});
