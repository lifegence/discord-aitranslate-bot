import type {
  AudioChunk,
  TranslationResult,
  TranslationPipelineOptions,
  Logger,
  GeminiTranslationRequest,
} from '../types';
import { ErrorType, TranslatorError } from '../types';
import { GeminiClient } from './gemini-client';
import { AudioProcessor } from '../voice/audio-processor';

/**
 * Translation pipeline orchestrating audio processing and translation
 */
export class TranslationPipeline {
  private geminiClient: GeminiClient;
  private audioProcessor: AudioProcessor;
  private logger: Logger;
  private options: Required<TranslationPipelineOptions>;

  constructor(
    geminiClient: GeminiClient,
    audioProcessor: AudioProcessor,
    logger: Logger,
    options?: Partial<TranslationPipelineOptions>
  ) {
    this.geminiClient = geminiClient;
    this.audioProcessor = audioProcessor;
    this.logger = logger;
    this.options = {
      defaultTargetLanguage: options?.defaultTargetLanguage || 'ja',
      autoDetectLanguage: options?.autoDetectLanguage !== false,
      maxRetries: options?.maxRetries || 3,
      retryDelay: options?.retryDelay || 1000,
    };

    this.logger.info('TranslationPipeline initialized', {
      options: this.options,
    });
  }

  /**
   * Process a single audio chunk and return translation
   */
  async processAudioChunk(
    chunk: AudioChunk,
    targetLanguage?: string,
    sourceLanguage?: string
  ): Promise<TranslationResult> {
    if (!chunk.data || chunk.data.length === 0) {
      throw new TranslatorError(
        ErrorType.AUDIO_PROCESSING_ERROR,
        'Audio chunk data is empty'
      );
    }

    this.logger.debug('Processing audio chunk', {
      userId: chunk.userId,
      dataSize: chunk.data.length,
      timestamp: chunk.timestamp,
    });

    try {
      // Audio data is already converted to 16kHz mono PCM in processStream()
      const audioData = chunk.data;

      // Prepare translation request
      const request: GeminiTranslationRequest = {
        audioData,
        targetLanguage: targetLanguage || this.options.defaultTargetLanguage,
        sourceLanguage: this.options.autoDetectLanguage
          ? undefined
          : sourceLanguage,
        userId: chunk.userId,
      };

      // Translate with retry logic
      const response = await this.translateWithRetry(request);

      const result: TranslationResult = {
        userId: chunk.userId,
        username: chunk.username,
        originalText: response.transcription,
        translatedText: response.translation,
        sourceLanguage: response.detectedLanguage,
        targetLanguage: request.targetLanguage,
        timestamp: chunk.timestamp,
        confidence: response.confidence,
      };

      this.logger.info('Translation completed', {
        userId: chunk.userId,
        sourceLanguage: result.sourceLanguage,
        targetLanguage: result.targetLanguage,
        confidence: result.confidence,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to process audio chunk', {
        userId: chunk.userId,
        error,
      });

      throw new TranslatorError(
        ErrorType.TRANSLATION_ERROR,
        `Failed to translate audio for user ${chunk.userId}`,
        error as Error
      );
    }
  }

  /**
   * Process audio stream and yield translation results
   */
  async *processStream(
    audioStream: AsyncIterable<Buffer>,
    userId: string,
    username: string,
    targetLanguage?: string
  ): AsyncGenerator<TranslationResult> {
    this.logger.info('Starting stream processing', {
      userId,
      targetLanguage: targetLanguage || this.options.defaultTargetLanguage,
    });

    try {
      let bufferCount = 0;
      let pcmBuffers: Buffer[] = [];

      for await (const audioBuffer of audioStream) {
        bufferCount++;
        this.logger.debug('Received audio buffer', {
          userId,
          bufferSize: audioBuffer.length,
          bufferCount,
        });
        console.log(`📦 Opus buffer #${bufferCount}: ${audioBuffer.length} bytes`);

        try {
          // Decode Opus to PCM before processing
          const pcmData = await this.audioProcessor.convertOpusToPCM(audioBuffer);
          console.log(`✅ Decoded Opus #${bufferCount}: ${pcmData.length} bytes PCM`);

          // Accumulate PCM buffers (don't process until user stops speaking)
          pcmBuffers.push(pcmData);
          console.log(`📦 Accumulated buffer #${bufferCount}: ${pcmData.length} bytes (total: ${pcmBuffers.length} buffers)`);
        } catch (error) {
          this.logger.error('Failed to process audio buffer', {
            userId,
            error,
          });
          console.error('❌ Buffer processing error:', error);
          // Continue with next buffer
        }
      }
      console.log(`📊 Total Opus buffers received: ${bufferCount}`);

      // Process all accumulated PCM buffers when user stops speaking
      if (pcmBuffers.length > 0) {
        console.log(`🔄 User stopped speaking. Processing ${pcmBuffers.length} accumulated frames...`);
        const combinedPcm = Buffer.concat(pcmBuffers);
        console.log(`📊 Total PCM data: ${combinedPcm.length} bytes`);

        const resampledData = await this.audioProcessor.resample(combinedPcm, 48000, 16000);
        console.log(`✅ Resampled to: ${resampledData.length} bytes`);

        // Create a single chunk from all the data
        const chunk = {
          userId,
          username,
          data: resampledData,
          timestamp: Date.now(),
          sampleRate: 16000,
          channels: 1,
        };

        try {
          console.log(`🔄 Processing complete speech: ${chunk.data.length} bytes`);
          const result = await this.processAudioChunk(chunk, targetLanguage);
          console.log(`✅ Translation: "${result.originalText}" -> "${result.translatedText}"`);
          yield result;
        } catch (error) {
          this.logger.error('Failed to process speech chunk', {
            userId,
            error,
          });
          console.error('❌ Speech processing error:', error);
        }
      }

      this.logger.info('Stream processing completed', { userId });
    } catch (error) {
      this.logger.error('Stream processing failed', {
        userId,
        error,
      });

      throw new TranslatorError(
        ErrorType.TRANSLATION_ERROR,
        `Failed to process audio stream for user ${userId}`,
        error as Error
      );
    }
  }

  /**
   * Translate with retry logic
   */
  private async translateWithRetry(
    request: GeminiTranslationRequest,
    attempt = 1
  ): Promise<any> {
    try {
      return await this.geminiClient.translate(request);
    } catch (error) {
      if (attempt >= this.options.maxRetries) {
        this.logger.error('Max retries exceeded', {
          userId: request.userId,
          attempts: attempt,
        });
        throw error;
      }

      this.logger.warn('Translation failed, retrying', {
        userId: request.userId,
        attempt,
        maxRetries: this.options.maxRetries,
        error,
      });

      // Wait before retrying
      await new Promise((resolve) =>
        setTimeout(resolve, this.options.retryDelay)
      );

      return this.translateWithRetry(request, attempt + 1);
    }
  }

  /**
   * Batch process multiple audio chunks
   */
  async processBatch(
    chunks: AudioChunk[],
    targetLanguage?: string
  ): Promise<TranslationResult[]> {
    this.logger.info('Processing batch', {
      chunkCount: chunks.length,
      targetLanguage: targetLanguage || this.options.defaultTargetLanguage,
    });

    const results = await Promise.allSettled(
      chunks.map((chunk) => this.processAudioChunk(chunk, targetLanguage))
    );

    const successful: TranslationResult[] = [];
    const failed: Array<{ chunk: AudioChunk; error: Error }> = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        successful.push(result.value);
      } else {
        failed.push({
          chunk: chunks[index],
          error: result.reason,
        });
        this.logger.error('Batch item failed', {
          userId: chunks[index].userId,
          error: result.reason,
        });
      }
    });

    this.logger.info('Batch processing completed', {
      successful: successful.length,
      failed: failed.length,
    });

    return successful;
  }
}
