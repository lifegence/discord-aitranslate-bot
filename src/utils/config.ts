import dotenv from 'dotenv';
import type { BotConfig } from '../types';
import { ErrorType, TranslatorError } from '../types';

// Load environment variables
dotenv.config();

/**
 * Validate and load bot configuration from environment variables
 */
export function loadConfig(): BotConfig {
  const requiredEnvVars = [
    'DISCORD_BOT_TOKEN',
    'DISCORD_CLIENT_ID',
    'GOOGLE_GEMINI_API_KEY',
  ];

  const missing = requiredEnvVars.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new TranslatorError(
      ErrorType.CONFIGURATION_ERROR,
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }

  return {
    discordToken: process.env.DISCORD_BOT_TOKEN!,
    discordClientId: process.env.DISCORD_CLIENT_ID!,
    geminiApiKey: process.env.GOOGLE_GEMINI_API_KEY!,
    defaultTargetLanguage: process.env.DEFAULT_TARGET_LANGUAGE || 'ja',
    logLevel: process.env.LOG_LEVEL || 'info',
    audioChunkSizeMs: parseInt(process.env.AUDIO_CHUNK_SIZE_MS || '500', 10),
    vadEnabled: process.env.VAD_ENABLED !== 'false',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp',
  };
}
