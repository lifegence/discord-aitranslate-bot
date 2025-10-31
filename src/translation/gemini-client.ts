import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  GeminiTranslationRequest,
  GeminiTranslationResponse,
  Logger,
} from '../types';
import { ErrorType, TranslatorError } from '../types';

/**
 * Gemini API client for audio translation
 */
export class GeminiClient {
  private genAI: GoogleGenerativeAI;
  private model: string;
  private logger: Logger;
  private connected: boolean = false;

  constructor(apiKey: string, model: string, logger: Logger) {
    if (!apiKey || apiKey.trim() === '') {
      throw new TranslatorError(
        ErrorType.CONFIGURATION_ERROR,
        'Gemini API key is required'
      );
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = model;
    this.logger = logger;
  }

  /**
   * Connect to Gemini API
   */
  async connect(): Promise<void> {
    try {
      this.logger.info('Connecting to Gemini API...');
      // For HTTP-based API, no persistent connection needed
      // This is a placeholder for WebSocket connections if needed
      this.connected = true;
      this.logger.info('Connected to Gemini API');
    } catch (error) {
      this.logger.error('Failed to connect to Gemini API', { error });
      throw new TranslatorError(
        ErrorType.GEMINI_API_ERROR,
        'Failed to connect to Gemini API',
        error as Error
      );
    }
  }

  /**
   * Disconnect from Gemini API
   */
  async disconnect(): Promise<void> {
    this.connected = false;
    this.logger.info('Disconnected from Gemini API');
  }

  /**
   * Check if connected to Gemini API
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Reconnect to Gemini API
   */
  async reconnect(): Promise<void> {
    await this.disconnect();
    await this.connect();
  }

  /**
   * Translate audio to text and translate to target language
   */
  async translate(
    request: GeminiTranslationRequest
  ): Promise<GeminiTranslationResponse> {
    if (!request.audioData || request.audioData.length === 0) {
      throw new TranslatorError(
        ErrorType.TRANSLATION_ERROR,
        'Audio data is required for translation'
      );
    }

    try {
      this.logger.debug('Starting translation', {
        userId: request.userId,
        targetLanguage: request.targetLanguage,
        audioSize: request.audioData.length,
      });

      const model = this.genAI.getGenerativeModel({ model: this.model });

      // Convert PCM to WAV format with header
      const wavBuffer = this.createWavBuffer(request.audioData, 16000, 1);
      const audioBase64 = wavBuffer.toString('base64');

      // Create prompt for transcription and translation
      const prompt = request.sourceLanguage
        ? `Transcribe the following audio in ${request.sourceLanguage} and translate it to ${request.targetLanguage}. Return the result in JSON format with keys: "transcription" (original text), "translation" (translated text), "detectedLanguage" (detected language code), "confidence" (confidence score between 0 and 1).`
        : `Transcribe the following audio (auto-detect language) and translate it to ${request.targetLanguage}. Return the result in JSON format with keys: "transcription" (original text), "translation" (translated text), "detectedLanguage" (detected language code), "confidence" (confidence score between 0 and 1).`;

      // Generate content with audio
      const result = await model.generateContent([
        {
          text: prompt,
        },
        {
          inlineData: {
            mimeType: 'audio/wav',
            data: audioBase64,
          },
        },
      ]);

      const response = result.response;
      const text = response.text();

      this.logger.debug('Received response from Gemini', {
        userId: request.userId,
        responseLength: text.length,
      });

      // Parse JSON response
      let parsedResponse: GeminiTranslationResponse;
      try {
        // Try to extract JSON from the response (in case it's wrapped in markdown code blocks or extra text)
        const jsonMatch = text.match(/\{[\s\S]*?\}/);
        const jsonText = jsonMatch ? jsonMatch[0] : text;

        parsedResponse = JSON.parse(jsonText);

        // Validate that required fields exist
        if (!parsedResponse.translation || !parsedResponse.transcription) {
          throw new Error('Missing required fields in response');
        }
      } catch (parseError) {
        // If JSON parsing fails, try to extract information from text
        this.logger.warn('Failed to parse JSON response, using fallback', {
          error: parseError,
          responseText: text,
        });

        parsedResponse = {
          transcription: text,
          translation: text,
          detectedLanguage: request.sourceLanguage || 'unknown',
          confidence: 0.5,
        };
      }

      this.logger.info('Translation completed', {
        userId: request.userId,
        detectedLanguage: parsedResponse.detectedLanguage,
        confidence: parsedResponse.confidence,
      });

      return parsedResponse;
    } catch (error) {
      this.logger.error('Translation failed', {
        userId: request.userId,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        errorDetails: JSON.stringify(error, null, 2),
      });
      console.error('Gemini API full error:', error);

      throw new TranslatorError(
        ErrorType.TRANSLATION_ERROR,
        'Failed to translate audio',
        error as Error
      );
    }
  }

  /**
   * Stream audio and get real-time transcription/translation
   * This is a placeholder for streaming implementation
   */
  async *streamTranslation(
    audioStream: AsyncIterable<Buffer>,
    targetLanguage: string,
    userId: string
  ): AsyncGenerator<GeminiTranslationResponse> {
    this.logger.info('Starting streaming translation', {
      userId,
      targetLanguage,
    });

    // Accumulate audio chunks
    const chunks: Buffer[] = [];

    for await (const chunk of audioStream) {
      chunks.push(chunk);

      // Process when we have enough data (e.g., 1 second of audio)
      const totalSize = chunks.reduce((sum, c) => sum + c.length, 0);
      if (totalSize >= 16000 * 2) {
        // 1 second at 16kHz, 16-bit
        const audioData = Buffer.concat(chunks);
        chunks.length = 0;

        try {
          const result = await this.translate({
            audioData,
            targetLanguage,
            userId,
          });

          yield result;
        } catch (error) {
          this.logger.error('Streaming translation chunk failed', {
            userId,
            error,
          });
        }
      }
    }

    // Process remaining chunks
    if (chunks.length > 0) {
      const audioData = Buffer.concat(chunks);
      try {
        const result = await this.translate({
          audioData,
          targetLanguage,
          userId,
        });

        yield result;
      } catch (error) {
        this.logger.error('Final streaming translation chunk failed', {
          userId,
          error,
        });
      }
    }
  }

  /**
   * Create WAV file buffer from PCM data
   */
  private createWavBuffer(
    pcmData: Buffer,
    sampleRate: number,
    channels: number
  ): Buffer {
    const bitsPerSample = 16;
    const byteRate = (sampleRate * channels * bitsPerSample) / 8;
    const blockAlign = (channels * bitsPerSample) / 8;
    const dataSize = pcmData.length;
    const headerSize = 44;
    const fileSize = headerSize + dataSize - 8;

    const header = Buffer.alloc(headerSize);

    // RIFF chunk descriptor
    header.write('RIFF', 0);
    header.writeUInt32LE(fileSize, 4);
    header.write('WAVE', 8);

    // fmt sub-chunk
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
    header.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);

    // data sub-chunk
    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    return Buffer.concat([header, pcmData]);
  }
}
