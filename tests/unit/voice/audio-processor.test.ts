import { describe, it, expect, beforeEach } from '@jest/globals';
import { AudioProcessor } from '../../../src/voice/audio-processor';
import type { AudioProcessorOptions, Logger } from '../../../src/types';
import { createMockLogger } from '../../helpers/mocks';
import {
  createMockOpusBuffer,
  createMockPCMBuffer,
  createSilentPCMBuffer,
} from '../../helpers/fixtures';

describe('AudioProcessor', () => {
  let mockLogger: Logger;
  let defaultOptions: Partial<AudioProcessorOptions>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    defaultOptions = {
      sampleRate: 48000,
      channels: 2,
      chunkSizeMs: 500,
      vadEnabled: true,
    };
  });

  describe('constructor', () => {
    it('should create an AudioProcessor instance with options', () => {
      const processor = new AudioProcessor(defaultOptions, mockLogger);
      expect(processor).toBeDefined();
      expect(processor).toBeInstanceOf(AudioProcessor);
    });

    it('should use default options if not provided', () => {
      const processor = new AudioProcessor({}, mockLogger);
      expect(processor).toBeDefined();
      expect(processor).toBeInstanceOf(AudioProcessor);
    });

    it('should log initialization', () => {
      new AudioProcessor(defaultOptions, mockLogger);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'AudioProcessor initialized',
        expect.objectContaining({
          options: expect.any(Object),
        })
      );
    });
  });

  describe('convertOpusToPCM', () => {
    it('should convert Opus to PCM format', async () => {
      const processor = new AudioProcessor(defaultOptions, mockLogger);
      const opusData = createMockOpusBuffer(960);

      const result = await processor.convertOpusToPCM(opusData);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle empty Opus data', async () => {
      const processor = new AudioProcessor(defaultOptions, mockLogger);
      const emptyOpus = Buffer.alloc(0);

      const result = await processor.convertOpusToPCM(emptyOpus);

      expect(result).toBeInstanceOf(Buffer);
    });
  });

  describe('resample', () => {
    it('should resample audio to target sample rate', async () => {
      const processor = new AudioProcessor(defaultOptions, mockLogger);
      const pcmData = createMockPCMBuffer(9600, 2); // 48kHz stereo, 100ms

      const result = await processor.resample(pcmData, 48000, 16000);

      expect(result).toBeInstanceOf(Buffer);
      // Downsampling 48kHz to 16kHz and stereo to mono should reduce size significantly
      expect(result.length).toBeLessThan(pcmData.length);
    });

    it('should convert stereo to mono during resampling', async () => {
      const processor = new AudioProcessor(defaultOptions, mockLogger);
      const stereoData = createMockPCMBuffer(4800, 2); // 48kHz stereo, 50ms

      const result = await processor.resample(stereoData, 48000, 16000);

      // Mono output should be roughly 1/6 the size (1/3 sample rate * 1/2 channels)
      const expectedSize = Math.floor((stereoData.length / 2) / 3);
      expect(result.length).toBeCloseTo(expectedSize, -1);
    });

    it('should handle zero-length PCM data', async () => {
      const processor = new AudioProcessor(defaultOptions, mockLogger);
      const emptyPCM = Buffer.alloc(0);

      const result = await processor.resample(emptyPCM, 48000, 16000);

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(0);
    });
  });

  describe('hasVoiceActivity', () => {
    it('should detect voice activity when VAD is enabled', () => {
      const processor = new AudioProcessor(
        { ...defaultOptions, vadEnabled: true },
        mockLogger
      );
      const activeAudio = createMockPCMBuffer(4800, 2);

      const hasActivity = processor.hasVoiceActivity(activeAudio);

      expect(hasActivity).toBe(true);
    });

    it('should return false for silent audio', () => {
      const processor = new AudioProcessor(
        { ...defaultOptions, vadEnabled: true },
        mockLogger
      );
      const silentAudio = createSilentPCMBuffer(4800, 2);

      const hasActivity = processor.hasVoiceActivity(silentAudio);

      expect(hasActivity).toBe(false);
    });

    it('should always return true when VAD is disabled', () => {
      const processor = new AudioProcessor(
        { ...defaultOptions, vadEnabled: false },
        mockLogger
      );
      const silentAudio = createSilentPCMBuffer(4800, 2);

      const hasActivity = processor.hasVoiceActivity(silentAudio);

      expect(hasActivity).toBe(true);
    });
  });

  describe('createChunks', () => {
    it('should create audio chunks of specified size', () => {
      const processor = new AudioProcessor(
        { ...defaultOptions, sampleRate: 16000, chunkSizeMs: 500 },
        mockLogger
      );
      // 1 second of audio at 16kHz mono (2 bytes per sample)
      const audioData = createMockPCMBuffer(16000, 1);

      const chunks = processor.createChunks(audioData, 'user123', 'TestUser');

      expect(chunks.length).toBe(2); // Should create 2 chunks of 500ms each
      chunks.forEach((chunk) => {
        expect(chunk.userId).toBe('user123');
        expect(chunk.username).toBe('TestUser');
        expect(chunk.data).toBeInstanceOf(Buffer);
        expect(chunk.sampleRate).toBe(16000);
        expect(chunk.channels).toBe(1);
      });
    });

    it('should skip silent periods when VAD is enabled', () => {
      const processor = new AudioProcessor(
        { ...defaultOptions, vadEnabled: true },
        mockLogger
      );
      const silentAudio = createSilentPCMBuffer(48000, 2);

      const chunks = processor.createChunks(silentAudio, 'user123', 'TestUser');

      expect(chunks.length).toBe(0);
    });

    it('should process all audio when VAD is disabled', () => {
      const processor = new AudioProcessor(
        { ...defaultOptions, sampleRate: 16000, vadEnabled: false, chunkSizeMs: 500 },
        mockLogger
      );
      const silentAudio = createSilentPCMBuffer(16000, 1);

      const chunks = processor.createChunks(silentAudio, 'user123', 'TestUser');

      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe('buffer management', () => {
    it('should buffer audio until chunk size is reached', () => {
      const processor = new AudioProcessor(
        { ...defaultOptions, chunkSizeMs: 1000 },
        mockLogger
      );

      const smallChunk = Buffer.alloc(1000);
      processor.addToBuffer('user123', smallChunk);

      expect(processor.getBufferSize('user123')).toBe(1000);
    });

    it('should return zero size for non-existent buffer', () => {
      const processor = new AudioProcessor(defaultOptions, mockLogger);

      expect(processor.getBufferSize('non-existent-user')).toBe(0);
    });

    it('should maintain separate buffers for different users', () => {
      const processor = new AudioProcessor(defaultOptions, mockLogger);

      processor.addToBuffer('user1', Buffer.alloc(1000));
      processor.addToBuffer('user2', Buffer.alloc(2000));

      expect(processor.getBufferSize('user1')).toBe(1000);
      expect(processor.getBufferSize('user2')).toBe(2000);
    });

    it('should accumulate multiple buffers for same user', () => {
      const processor = new AudioProcessor(defaultOptions, mockLogger);

      processor.addToBuffer('user123', Buffer.alloc(1000));
      processor.addToBuffer('user123', Buffer.alloc(500));

      expect(processor.getBufferSize('user123')).toBe(1500);
    });

    it('should clear buffer for specific user', () => {
      const processor = new AudioProcessor(defaultOptions, mockLogger);

      processor.addToBuffer('user123', Buffer.alloc(1000));
      processor.clearBuffer('user123');

      expect(processor.getBufferSize('user123')).toBe(0);
    });

    it('should clear all buffers', () => {
      const processor = new AudioProcessor(defaultOptions, mockLogger);

      processor.addToBuffer('user1', Buffer.alloc(1000));
      processor.addToBuffer('user2', Buffer.alloc(2000));
      processor.clearAllBuffers();

      expect(processor.getBufferSize('user1')).toBe(0);
      expect(processor.getBufferSize('user2')).toBe(0);
    });
  });

  describe('processBuffer', () => {
    it('should return empty array when buffer is too small', () => {
      const processor = new AudioProcessor(
        { ...defaultOptions, sampleRate: 16000, chunkSizeMs: 500 },
        mockLogger
      );

      const smallData = Buffer.alloc(100);
      const chunks = processor.processBuffer('user123', 'TestUser', smallData);

      expect(chunks).toEqual([]);
      expect(processor.getBufferSize('user123')).toBeGreaterThan(0);
    });

    it('should create chunks when buffer reaches threshold', () => {
      const processor = new AudioProcessor(
        { ...defaultOptions, sampleRate: 16000, chunkSizeMs: 500, vadEnabled: false },
        mockLogger
      );

      // 500ms at 16kHz mono = 16000 bytes
      const largeData = createMockPCMBuffer(8000, 1);
      const chunks = processor.processBuffer('user123', 'TestUser', largeData);

      expect(chunks.length).toBeGreaterThan(0);
    });
  });

  describe('flushBuffer', () => {
    it('should flush remaining buffer data', () => {
      const processor = new AudioProcessor(
        { ...defaultOptions, sampleRate: 16000, vadEnabled: false },
        mockLogger
      );

      processor.addToBuffer('user123', createMockPCMBuffer(1000, 1));
      const chunks = processor.flushBuffer('user123', 'TestUser');

      expect(chunks.length).toBeGreaterThan(0);
      expect(processor.getBufferSize('user123')).toBe(0);
    });

    it('should return empty array for empty buffer', () => {
      const processor = new AudioProcessor(defaultOptions, mockLogger);

      const chunks = processor.flushBuffer('user123', 'TestUser');

      expect(chunks).toEqual([]);
    });

    it('should clear buffer after flushing', () => {
      const processor = new AudioProcessor(
        { ...defaultOptions, sampleRate: 16000, vadEnabled: false },
        mockLogger
      );

      processor.addToBuffer('user123', createMockPCMBuffer(1000, 1));
      processor.flushBuffer('user123', 'TestUser');

      expect(processor.getBufferSize('user123')).toBe(0);
    });
  });
});
