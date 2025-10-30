import { Client, GatewayIntentBits, Events, TextChannel } from 'discord.js';
import { loadConfig } from './utils/config';
import { createLogger } from './utils/logger';
import { VoiceManager } from './voice/voice-manager';
import { AudioProcessor } from './voice/audio-processor';
import { GeminiClient } from './translation/gemini-client';
import { TranslationPipeline } from './translation/translation-pipeline';
import { CommandHandler } from './bot/command-handler';
import type { TranslationResult } from './types';

/**
 * Main bot entry point
 */
async function main() {
  // Load configuration
  const config = loadConfig();
  const logger = createLogger({ level: config.logLevel });

  logger.info('Starting Discord Realtime Translator Bot');

  // Initialize Discord client
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildMessages,
    ],
  });

  // Initialize components
  const voiceManager = new VoiceManager(logger);
  const audioProcessor = new AudioProcessor(
    {
      sampleRate: 48000,
      channels: 2,
      chunkSizeMs: config.audioChunkSizeMs,
      vadEnabled: config.vadEnabled,
    },
    logger
  );

  const geminiClient = new GeminiClient(
    config.geminiApiKey,
    config.geminiModel,
    logger
  );

  const translationPipeline = new TranslationPipeline(
    geminiClient,
    audioProcessor,
    logger,
    {
      defaultTargetLanguage: config.defaultTargetLanguage,
      autoDetectLanguage: true,
      maxRetries: 3,
      retryDelay: 1000,
    }
  );

  const commandHandler = new CommandHandler(
    voiceManager,
    translationPipeline,
    logger,
    config
  );

  // Setup event handlers
  client.once(Events.ClientReady, async (readyClient) => {
    logger.info(`Logged in as ${readyClient.user.tag}`);
    logger.info(`Ready in ${readyClient.guilds.cache.size} guilds`);

    // Connect to Gemini API
    try {
      await geminiClient.connect();
      logger.info('Connected to Gemini API');
    } catch (error) {
      logger.error('Failed to connect to Gemini API', { error });
      process.exit(1);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    try {
      await commandHandler.handleCommand(interaction);
    } catch (error) {
      logger.error('Failed to handle command', { error });
    }
  });

  // Handle translation results
  voiceManager.on('userAudioStream', async (data) => {
    const { guildId, userId, stream } = data;
    const session = voiceManager.getSession(guildId);

    if (!session) {
      logger.warn('Received audio stream for non-existent session', {
        guildId,
      });
      return;
    }

    try {
      // Get user from guild
      const guild = client.guilds.cache.get(guildId);
      if (!guild) return;

      const member = await guild.members.fetch(userId);
      const username = member.displayName || member.user.username;

      // Process audio stream
      for await (const result of translationPipeline.processStream(
        stream,
        userId,
        username,
        session.targetLanguage
      )) {
        // Send translation to text channel
        await sendTranslationMessage(
          client,
          session.textChannelId,
          result,
          logger
        );
      }
    } catch (error) {
      logger.error('Failed to process audio stream', {
        guildId,
        userId,
        error,
      });
    }
  });

  // Handle errors
  client.on(Events.Error, (error) => {
    logger.error('Discord client error', { error });
  });

  voiceManager.on('error', (data) => {
    logger.error('Voice manager error', data);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Shutting down...');

    await voiceManager.disconnectAll();
    await geminiClient.disconnect();
    client.destroy();

    logger.info('Shutdown complete');
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Shutting down...');

    await voiceManager.disconnectAll();
    await geminiClient.disconnect();
    client.destroy();

    logger.info('Shutdown complete');
    process.exit(0);
  });

  // Login to Discord
  try {
    await client.login(config.discordToken);
  } catch (error) {
    logger.error('Failed to login to Discord', { error });
    process.exit(1);
  }
}

/**
 * Send translation message to Discord text channel
 */
async function sendTranslationMessage(
  client: Client,
  channelId: string,
  result: TranslationResult,
  logger: any
): Promise<void> {
  try {
    const channel = await client.channels.fetch(channelId);

    if (!channel || !channel.isTextBased()) {
      logger.warn('Invalid text channel', { channelId });
      return;
    }

    const textChannel = channel as TextChannel;

    // Format translation message
    const languageFlags: Record<string, string> = {
      ja: '🇯🇵',
      en: '🇺🇸',
      ko: '🇰🇷',
      zh: '🇨🇳',
      es: '🇪🇸',
      fr: '🇫🇷',
      de: '🇩🇪',
      it: '🇮🇹',
      pt: '🇵🇹',
      ru: '🇷🇺',
    };

    const sourceFlag = languageFlags[result.sourceLanguage] || '🌐';
    const targetFlag = languageFlags[result.targetLanguage] || '🌐';

    const message = `**${result.username}** ${sourceFlag} → ${targetFlag}\n` +
      `📝 ${result.originalText}\n` +
      `🔄 ${result.translatedText}`;

    await textChannel.send(message);

    logger.debug('Sent translation message', {
      channelId,
      userId: result.userId,
    });
  } catch (error) {
    logger.error('Failed to send translation message', {
      channelId,
      error,
    });
  }
}

// Start the bot
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
