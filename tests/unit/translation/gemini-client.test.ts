import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { GeminiClient } from '../../../src/translation/gemini-client';
import type { Logger, GeminiTranslationRequest } from '../../../src/types';
import { createMockLogger } from '../../helpers/mocks';
import { createMockPCMBuffer } from '../../helpers/fixtures';

// Mock Google Generative AI
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValue({
        response: {
          text: jest.fn().mockReturnValue(
            JSON.stringify({
              transcription: 'Hello, how are you?',
              translation: 'こんにちは、お元気ですか？',
              detectedLanguage: 'en',
              confidence: 0.95,
            })
          ),
        },
      } as any),
    }),
  })),
}));

describe('GeminiClient', () => {
  let mockLogger: Logger;
  const testApiKey = 'test-api-key-123';
  const testModel = 'gemini-2.0-flash-exp';

  beforeEach(() => {
    mockLogger = createMockLogger();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create a GeminiClient instance with API key', () => {
      const client = new GeminiClient(testApiKey, testModel, mockLogger);
      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(GeminiClient);
    });

    it('should throw error if API key is missing', () => {
      expect(() => new GeminiClient('', testModel, mockLogger)).toThrow(
        'Gemini API key is required'
      );
    });

    it('should throw error if API key is whitespace', () => {
      expect(() => new GeminiClient('   ', testModel, mockLogger)).toThrow(
        'Gemini API key is required'
      );
    });
  });

  describe('connect', () => {
    it('should establish connection to Gemini API', async () => {
      const client = new GeminiClient(testApiKey, testModel, mockLogger);

      await client.connect();

      expect(client.isConnected()).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Connected to Gemini API');
    });

    it('should log connection attempt', async () => {
      const client = new GeminiClient(testApiKey, testModel, mockLogger);

      await client.connect();

      expect(mockLogger.info).toHaveBeenCalledWith('Connecting to Gemini API...');
    });
  });

  describe('disconnect', () => {
    it('should disconnect gracefully', async () => {
      const client = new GeminiClient(testApiKey, testModel, mockLogger);

      await client.connect();
      await client.disconnect();

      expect(client.isConnected()).toBe(false);
      expect(mockLogger.info).toHaveBeenCalledWith('Disconnected from Gemini API');
    });

    it('should disconnect even if not connected', async () => {
      const client = new GeminiClient(testApiKey, testModel, mockLogger);

      await client.disconnect();

      expect(client.isConnected()).toBe(false);
    });
  });

  describe('reconnect', () => {
    it('should reconnect on connection loss', async () => {
      const client = new GeminiClient(testApiKey, testModel, mockLogger);

      await client.connect();
      await client.reconnect();

      expect(client.isConnected()).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Connected to Gemini API');
    });
  });

  describe('translate', () => {
    it('should translate audio to text and translate', async () => {
      const client = new GeminiClient(testApiKey, testModel, mockLogger);
      await client.connect();

      const request: GeminiTranslationRequest = {
        audioData: createMockPCMBuffer(16000, 1), // 1 second at 16kHz mono
        targetLanguage: 'ja',
        userId: 'user123',
      };

      const result = await client.translate(request);

      expect(result).toBeDefined();
      expect(result.transcription).toBe('Hello, how are you?');
      expect(result.translation).toBe('こんにちは、お元気ですか？');
      expect(result.detectedLanguage).toBe('en');
      expect(result.confidence).toBe(0.95);
    });

    it('should handle empty audio data', async () => {
      const client = new GeminiClient(testApiKey, testModel, mockLogger);
      await client.connect();

      const request: GeminiTranslationRequest = {
        audioData: Buffer.alloc(0),
        targetLanguage: 'ja',
        userId: 'user123',
      };

      await expect(client.translate(request)).rejects.toThrow(
        'Audio data is required for translation'
      );
    });

    it('should auto-detect source language', async () => {
      const client = new GeminiClient(testApiKey, testModel, mockLogger);
      await client.connect();

      const request: GeminiTranslationRequest = {
        audioData: createMockPCMBuffer(16000, 1),
        targetLanguage: 'ja',
        userId: 'user123',
        // No sourceLanguage specified
      };

      const result = await client.translate(request);

      expect(result.detectedLanguage).toBe('en');
    });

    it('should return confidence score', async () => {
      const client = new GeminiClient(testApiKey, testModel, mockLogger);
      await client.connect();

      const request: GeminiTranslationRequest = {
        audioData: createMockPCMBuffer(16000, 1),
        targetLanguage: 'ja',
        userId: 'user123',
      };

      const result = await client.translate(request);

      expect(result.confidence).toBeDefined();
      expect(typeof result.confidence).toBe('number');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should use specified source language when provided', async () => {
      const client = new GeminiClient(testApiKey, testModel, mockLogger);
      await client.connect();

      const request: GeminiTranslationRequest = {
        audioData: createMockPCMBuffer(16000, 1),
        targetLanguage: 'ja',
        sourceLanguage: 'en',
        userId: 'user123',
      };

      const result = await client.translate(request);

      expect(result).toBeDefined();
    });

    it('should handle different target languages', async () => {
      const client = new GeminiClient(testApiKey, testModel, mockLogger);
      await client.connect();

      const languages = ['ja', 'en', 'ko', 'zh', 'es', 'fr'];

      for (const lang of languages) {
        const request: GeminiTranslationRequest = {
          audioData: createMockPCMBuffer(16000, 1),
          targetLanguage: lang,
          userId: 'user123',
        };

        const result = await client.translate(request);
        expect(result).toBeDefined();
        expect(result.translation).toBeDefined();
      }
    });

    it('should log translation attempts', async () => {
      const client = new GeminiClient(testApiKey, testModel, mockLogger);
      await client.connect();

      const request: GeminiTranslationRequest = {
        audioData: createMockPCMBuffer(16000, 1),
        targetLanguage: 'ja',
        userId: 'user123',
      };

      await client.translate(request);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Starting translation',
        expect.objectContaining({
          userId: 'user123',
          targetLanguage: 'ja',
        })
      );
    });
  });

  describe('error handling', () => {
    it('should handle API errors gracefully', async () => {
      const client = new GeminiClient(testApiKey, testModel, mockLogger);
      await client.connect();

      // Mock API error
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      GoogleGenerativeAI.mockImplementationOnce(() => ({
        getGenerativeModel: jest.fn().mockReturnValue({
          generateContent: jest.fn().mockRejectedValue(new Error('API Error') as any),
        }),
      }));

      const errorClient = new GeminiClient(testApiKey, testModel, mockLogger);

      const request: GeminiTranslationRequest = {
        audioData: createMockPCMBuffer(16000, 1),
        targetLanguage: 'ja',
        userId: 'user123',
      };

      await expect(errorClient.translate(request)).rejects.toThrow();
    });
  });

  describe('connection state', () => {
    it('should track connection state correctly', async () => {
      const client = new GeminiClient(testApiKey, testModel, mockLogger);

      expect(client.isConnected()).toBe(false);

      await client.connect();
      expect(client.isConnected()).toBe(true);

      await client.disconnect();
      expect(client.isConnected()).toBe(false);
    });
  });
});
