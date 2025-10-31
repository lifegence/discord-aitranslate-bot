import type { AudioChunk, TranslationResult } from '../../src/types';

/**
 * Create mock audio chunk for testing
 */
export function createMockAudioChunk(overrides?: Partial<AudioChunk>): AudioChunk {
  return {
    userId: 'user123',
    username: 'TestUser',
    data: Buffer.alloc(1920), // 20ms at 48kHz stereo
    timestamp: Date.now(),
    sampleRate: 48000,
    channels: 2,
    ...overrides,
  };
}

/**
 * Create mock Opus audio buffer
 */
export function createMockOpusBuffer(size = 960): Buffer {
  // Create a fake Opus packet
  // Real Opus packets would have proper headers, but for testing we just need a buffer
  return Buffer.alloc(size);
}

/**
 * Create mock PCM audio buffer (16-bit samples)
 */
export function createMockPCMBuffer(sampleCount: number, channels = 2): Buffer {
  const buffer = Buffer.alloc(sampleCount * channels * 2); // 16-bit = 2 bytes per sample

  // Fill with some varying values to simulate audio
  for (let i = 0; i < sampleCount * channels; i++) {
    const value = Math.sin(i * 0.1) * 1000; // Simple sine wave
    buffer.writeInt16LE(Math.floor(value), i * 2);
  }

  return buffer;
}

/**
 * Create silent PCM buffer
 */
export function createSilentPCMBuffer(sampleCount: number, channels = 2): Buffer {
  return Buffer.alloc(sampleCount * channels * 2, 0);
}

/**
 * Create mock translation result
 */
export function createMockTranslationResult(
  overrides?: Partial<TranslationResult>
): TranslationResult {
  return {
    userId: 'user123',
    username: 'TestUser',
    originalText: 'Hello, how are you?',
    translatedText: 'こんにちは、お元気ですか？',
    sourceLanguage: 'en',
    targetLanguage: 'ja',
    timestamp: Date.now(),
    confidence: 0.95,
    ...overrides,
  };
}

/**
 * Create mock Gemini translation response
 */
export function createMockGeminiResponse() {
  return {
    transcription: 'Hello, how are you?',
    translation: 'こんにちは、お元気ですか？',
    detectedLanguage: 'en',
    confidence: 0.95,
  };
}

/**
 * Create audio stream mock
 */
export function createMockAudioStream(bufferCount = 3): AsyncIterable<Buffer> {
  const buffers = Array.from({ length: bufferCount }, () => createMockOpusBuffer());

  return (async function* () {
    for (const buffer of buffers) {
      yield buffer;
    }
  })();
}
