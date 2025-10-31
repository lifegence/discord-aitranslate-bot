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
        // Discord always sends stereo audio at 48kHz, regardless of our output preferences
        const decoder = new prism.opus.Decoder({
          rate: 48000,
          channels: 2,
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
   * Resample audio to target sample rate and convert stereo to mono
   * Uses simple linear interpolation for downsampling
   */
  async resample(
    pcmData: Buffer,
    sourceSampleRate: number,
    targetSampleRate: number
  ): Promise<Buffer> {
    console.log(`   🔄 Resampling ${pcmData.length} bytes from ${sourceSampleRate}Hz stereo to ${targetSampleRate}Hz mono...`);

    // Convert buffer to Int16Array (16-bit PCM samples)
    const sourceSamples = new Int16Array(
      pcmData.buffer,
      pcmData.byteOffset,
      pcmData.length / 2
    );

    // Source is stereo (2 channels), target is mono (1 channel)
    const sourceFrames = sourceSamples.length / 2; // Each frame has 2 samples (L+R)
    const ratio = sourceSampleRate / targetSampleRate;
    const targetFrames = Math.floor(sourceFrames / ratio);

    console.log(`   📊 Source: ${sourceFrames} stereo frames, Target: ${targetFrames} mono frames`);

    // Create output buffer for mono samples
    const targetSamples = new Int16Array(targetFrames);

    // Resample with linear interpolation and convert stereo to mono
    for (let i = 0; i < targetFrames; i++) {
      const sourceIndex = i * ratio;
      const sourceFrame = Math.floor(sourceIndex);
      const fraction = sourceIndex - sourceFrame;

      // Get left and right channels for current frame
      const leftIndex = sourceFrame * 2;
      const rightIndex = leftIndex + 1;

      if (rightIndex < sourceSamples.length) {
        // Average left and right channels to convert to mono
        const monoSample = Math.floor(
          (sourceSamples[leftIndex] + sourceSamples[rightIndex]) / 2
        );

        // Linear interpolation with next frame if available
        if (leftIndex + 2 < sourceSamples.length) {
          const nextMonoSample = Math.floor(
            (sourceSamples[leftIndex + 2] + sourceSamples[leftIndex + 3]) / 2
          );
          targetSamples[i] = Math.floor(
            monoSample * (1 - fraction) + nextMonoSample * fraction
          );
        } else {
          targetSamples[i] = monoSample;
        }
      }
    }

    const outputBuffer = Buffer.from(targetSamples.buffer);
    console.log(`   ✅ Resampled to ${outputBuffer.length} bytes (${targetFrames} mono samples)`);

    return outputBuffer;
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

    console.log(`📊 Buffer analysis for ${userId}:`);
    console.log(`   Combined buffer size: ${combinedBuffer.length} bytes`);
    console.log(`   Required chunk size: ${chunkSizeBytes} bytes`);
    console.log(`   Ratio: ${(combinedBuffer.length / chunkSizeBytes * 100).toFixed(1)}%`);

    if (combinedBuffer.length < chunkSizeBytes) {
      // Not enough data yet
      console.log(`   ❌ Not enough data (need ${chunkSizeBytes - combinedBuffer.length} more bytes)`);
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
   * Flush remaining buffer data and create final chunk (even if smaller than chunk size)
   */
  flushBuffer(userId: string, username: string): AudioChunk[] {
    const buffers = this.userBuffers.get(userId);
    if (!buffers || buffers.length === 0) {
      return [];
    }

    const combinedBuffer = Buffer.concat(buffers);
    console.log(`🔄 Flushing buffer for ${userId}: ${combinedBuffer.length} bytes`);

    // Clear the buffer
    this.userBuffers.delete(userId);

    // Create chunk from whatever data we have
    if (combinedBuffer.length > 0) {
      return this.createChunks(combinedBuffer, userId, username);
    }

    return [];
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
