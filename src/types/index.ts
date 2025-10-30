import { VoiceConnection } from '@discordjs/voice';

/**
 * Bot configuration interface
 */
export interface BotConfig {
  discordToken: string;
  discordClientId: string;
  geminiApiKey: string;
  defaultTargetLanguage: string;
  logLevel: string;
  audioChunkSizeMs: number;
  vadEnabled: boolean;
  geminiModel: string;
}

/**
 * Audio chunk data structure
 */
export interface AudioChunk {
  userId: string;
  username: string;
  data: Buffer;
  timestamp: number;
  sampleRate: number;
  channels: number;
}

/**
 * Translation result structure
 */
export interface TranslationResult {
  userId: string;
  username: string;
  originalText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  timestamp: number;
  confidence?: number;
}

/**
 * Voice session state
 */
export interface VoiceSession {
  guildId: string;
  channelId: string;
  textChannelId: string;
  connection: VoiceConnection;
  targetLanguage: string;
  isActive: boolean;
  startedAt: number;
  activeUsers: Set<string>;
}

/**
 * Gemini API request structure for translation
 */
export interface GeminiTranslationRequest {
  audioData: Buffer;
  sourceLanguage?: string;
  targetLanguage: string;
  userId: string;
}

/**
 * Gemini API response structure
 */
export interface GeminiTranslationResponse {
  transcription: string;
  translation: string;
  detectedLanguage: string;
  confidence: number;
}

/**
 * Audio processor options
 */
export interface AudioProcessorOptions {
  sampleRate: number;
  channels: number;
  chunkSizeMs: number;
  vadEnabled: boolean;
}

/**
 * Voice manager options
 */
export interface VoiceManagerOptions {
  selfDeaf: boolean;
  selfMute: boolean;
}

/**
 * Translation pipeline options
 */
export interface TranslationPipelineOptions {
  defaultTargetLanguage: string;
  autoDetectLanguage: boolean;
  maxRetries: number;
  retryDelay: number;
}

/**
 * Logger interface
 */
export interface Logger {
  error(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  debug(message: string, meta?: unknown): void;
}

/**
 * Command interaction data
 */
export interface CommandInteraction {
  guildId: string;
  channelId: string;
  userId: string;
  username: string;
  options: Map<string, unknown>;
}

/**
 * Error types
 */
export enum ErrorType {
  DISCORD_CONNECTION_ERROR = 'DISCORD_CONNECTION_ERROR',
  GEMINI_API_ERROR = 'GEMINI_API_ERROR',
  AUDIO_PROCESSING_ERROR = 'AUDIO_PROCESSING_ERROR',
  TRANSLATION_ERROR = 'TRANSLATION_ERROR',
  VOICE_CHANNEL_ERROR = 'VOICE_CHANNEL_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
}

/**
 * Custom error class
 */
export class TranslatorError extends Error {
  constructor(
    public type: ErrorType,
    message: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'TranslatorError';
  }
}
