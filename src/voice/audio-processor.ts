import prism from 'prism-media';
import type { AudioChunk, AudioProcessorOptions, Logger } from '../types';
import { ErrorType, TranslatorError } from '../types';

/**
 * Audio processor for handling Discord voice streams
 */
export class AudioProcessor {
  private options: Required<AudioProcessorOptions>;
  private logger: Logger;
  private userBuffers: Map<string, Buffer[]>;

  constructor(options: Partial<AudioProcessorOptions>, logger: Logger) {
    this.options = {
      sampleRate: options.sampleRate || 48000,
      channels: options.channels || 2,
      chunkSizeMs: options.chunkSizeMs || 500,
      vadEnabled: options.vadEnabled !== undefined ? options.vadEnabled : true,
    };
    this.logger = logger;
    this.userBuffers = new Map();

    this.logger.info('AudioProcessor initialized', {
      options: this.options,
    });
  }

  /**
   * Convert Opus audio to PCM format
   */
  async convertOpusToPCM(opusData: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const decoder = new prism.opus.Decoder({
          rate: this.options.sampleRate,
          channels: this.options.channels,
          frameSize: 960,
        });

        const chunks: Buffer[] = [];

        decoder.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        decoder.on('end', () => {
          resolve(Buffer.concat(chunks));
        });

        decoder.on('error', (error: Error) => {
          reject(
            new TranslatorError(
              ErrorType.AUDIO_PROCESSING_ERROR,
              'Failed to decode Opus audio',
              error
            )
          );
        });

        decoder.write(opusData);
        decoder.end();
      } catch (error) {
        reject(
          new TranslatorError(
            ErrorType.AUDIO_PROCESSING_ERROR,
            'Failed to convert Opus to PCM',
            error as Error
          )
        );
      }
    });
  }

  /**
   * Resample audio to target sample rate
   */
  async resample(
    pcmData: Buffer,
    sourceSampleRate: number,
    targetSampleRate: number
  ): Promise<Buffer> {
    if (sourceSampleRate === targetSampleRate) {
      return pcmData;
    }

    return new Promise((resolve, reject) => {
      try {
        const resampler = new prism.FFmpeg({
          args: [
            '-f',
            's16le',
            '-ar',
            sourceSampleRate.toString(),
            '-ac',
            this.options.channels.toString(),
            '-i',
            'pipe:0',
            '-f',
            's16le',
            '-ar',
            targetSampleRate.toString(),
            '-ac',
            '1', // Mono for translation
            'pipe:1',
          ],
        });

        const chunks: Buffer[] = [];

        resampler.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });

        resampler.on('end', () => {
          resolve(Buffer.concat(chunks));
        });

        resampler.on('error', (error: Error) => {
          reject(
            new TranslatorError(
              ErrorType.AUDIO_PROCESSING_ERROR,
              'Failed to resample audio',
              error
            )
          );
        });

        resampler.write(pcmData);
        resampler.end();
      } catch (error) {
        reject(
          new TranslatorError(
            ErrorType.AUDIO_PROCESSING_ERROR,
            'Failed to resample audio',
            error as Error
          )
        );
      }
    });
  }

  /**
   * Detect voice activity in audio buffer
   */
  hasVoiceActivity(audioData: Buffer): boolean {
    if (!this.options.vadEnabled) {
      return true;
    }

    // Simple energy-based VAD
    const samples = new Int16Array(
      audioData.buffer,
      audioData.byteOffset,
      audioData.length / 2
    );

    let energy = 0;
    for (let i = 0; i < samples.length; i++) {
      energy += Math.abs(samples[i]);
    }

    const averageEnergy = energy / samples.length;
    const threshold = 100; // Adjust this threshold as needed

    return averageEnergy > threshold;
  }

  /**
   * Create audio chunks from buffer
   */
  createChunks(
    audioData: Buffer,
    userId: string,
    username: string
  ): AudioChunk[] {
    // Skip if no voice activity detected
    if (!this.hasVoiceActivity(audioData)) {
      this.logger.debug('No voice activity detected', { userId });
      return [];
    }

    const chunkSizeBytes =
      (this.options.sampleRate * this.options.chunkSizeMs * 2) / 1000; // 16-bit samples
    const chunks: AudioChunk[] = [];

    for (let i = 0; i < audioData.length; i += chunkSizeBytes) {
      const chunkData = audioData.slice(i, i + chunkSizeBytes);

      if (chunkData.length > 0) {
        chunks.push({
          userId,
          username,
          data: chunkData,
          timestamp: Date.now(),
          sampleRate: this.options.sampleRate,
          channels: 1, // Mono for translation
        });
      }
    }

    this.logger.debug('Created audio chunks', {
      userId,
      chunkCount: chunks.length,
    });

    return chunks;
  }

  /**
   * Add audio data to user buffer
   */
  addToBuffer(userId: string, data: Buffer): void {
    if (!this.userBuffers.has(userId)) {
      this.userBuffers.set(userId, []);
    }

    this.userBuffers.get(userId)!.push(data);
  }

  /**
   * Get buffer size for user
   */
  getBufferSize(userId: string): number {
    const buffers = this.userBuffers.get(userId);
    if (!buffers) {
      return 0;
    }

    return buffers.reduce((sum, buffer) => sum + buffer.length, 0);
  }

  /**
   * Process buffered audio and create chunks
   */
  processBuffer(userId: string, username: string, newData?: Buffer): AudioChunk[] {
    if (newData) {
      this.addToBuffer(userId, newData);
    }

    const buffers = this.userBuffers.get(userId);
    if (!buffers || buffers.length === 0) {
      return [];
    }

    const combinedBuffer = Buffer.concat(buffers);
    const chunkSizeBytes =
      (this.options.sampleRate * this.options.chunkSizeMs * 2) / 1000;

    if (combinedBuffer.length < chunkSizeBytes) {
      // Not enough data yet
      return [];
    }

    // Create chunks from complete data
    const completeChunkCount = Math.floor(combinedBuffer.length / chunkSizeBytes);
    const processedSize = completeChunkCount * chunkSizeBytes;
    const processedData = combinedBuffer.slice(0, processedSize);
    const remainingData = combinedBuffer.slice(processedSize);

    // Update buffer with remaining data
    this.userBuffers.set(userId, remainingData.length > 0 ? [remainingData] : []);

    // Create chunks
    return this.createChunks(processedData, userId, username);
  }

  /**
   * Clear buffer for user
   */
  clearBuffer(userId: string): void {
    this.userBuffers.delete(userId);
    this.logger.debug('Cleared buffer', { userId });
  }

  /**
   * Clear all buffers
   */
  clearAllBuffers(): void {
    this.userBuffers.clear();
    this.logger.debug('Cleared all buffers');
  }
}
