import { EventEmitter } from 'events';
import type { Logger } from '../../src/types';

/**
 * Create mock logger for testing
 */
export function createMockLogger(): Logger {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
}

/**
 * Create mock voice channel
 */
export function createMockVoiceChannel() {
  return {
    id: 'voice-channel-123',
    name: 'Test Voice Channel',
    guild: {
      id: 'guild-123',
      name: 'Test Guild',
      voiceAdapterCreator: jest.fn(),
    },
  };
}

/**
 * Create mock voice connection
 */
export function createMockVoiceConnection() {
  const connection = new EventEmitter();
  return Object.assign(connection, {
    state: { status: 'ready' },
    destroy: jest.fn(),
    receiver: {
      speaking: new EventEmitter(),
      subscribe: jest.fn((_userId: string, _options: any) => {
        const stream = new EventEmitter();
        return Object.assign(stream, {
          read: jest.fn(),
        });
      }),
    },
  });
}

/**
 * Create mock Gemini client
 */
export function createMockGeminiClient() {
  return {
    translate: jest.fn().mockResolvedValue({
      transcription: 'Hello, how are you?',
      translation: 'こんにちは、お元気ですか？',
      detectedLanguage: 'en',
      confidence: 0.95,
    }),
  };
}

/**
 * Create mock audio processor
 */
export function createMockAudioProcessor() {
  return {
    convertOpusToPCM: jest.fn().mockResolvedValue(Buffer.alloc(1920)),
    resample: jest.fn().mockResolvedValue(Buffer.alloc(640)),
    hasVoiceActivity: jest.fn().mockReturnValue(true),
    createChunks: jest.fn().mockReturnValue([]),
    addToBuffer: jest.fn(),
    getBufferSize: jest.fn().mockReturnValue(0),
    processBuffer: jest.fn().mockReturnValue([]),
    flushBuffer: jest.fn().mockReturnValue([]),
    clearBuffer: jest.fn(),
    clearAllBuffers: jest.fn(),
  };
}

/**
 * Create async iterable from array
 */
export async function* createAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) {
    yield item;
  }
}
