import { Client, GatewayIntentBits, Events, TextChannel } from 'discord.js';
import sodium from 'libsodium-wrappers';
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
  // Initialize sodium encryption library
  await sodium.ready;
  console.log('✅ Sodium library loaded successfully');

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
      sampleRate: 16000, // Gemini API expects 16kHz mono
      channels: 1,
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

    console.log('🎙️ Received userAudioStream event:', {
      guildId,
      userId,
      hasSession: !!session,
    });

    if (!session) {
      logger.warn('Received audio stream for non-existent session', {
        guildId,
      });
      return;
    }

    try {
      // Get user from guild
      const guild = client.guilds.cache.get(guildId);
      if (!guild) {
        console.log('❌ Guild not found');
        return;
      }

      const member = await guild.members.fetch(userId);
      const username = member.displayName || member.user.username;

      console.log('👤 Processing audio for user:', username);

      // Process audio stream
      let resultCount = 0;
      for await (const result of translationPipeline.processStream(
        stream,
        userId,
        username,
        session.targetLanguage
      )) {
        resultCount++;
        console.log(`📨 Sending translation result #${resultCount}`);

        // Send translation to text channel
        await sendTranslationMessage(
          client,
          session.textChannelId,
          result,
          logger
        );
      }

      console.log(`✅ Completed processing, sent ${resultCount} translations`);
    } catch (error) {
      logger.error('Failed to process audio stream', {
        guildId,
        userId,
        error,
      });
      console.error('❌ Audio stream processing error:', error);
    }
  });

  // Handle errors
  client.on(Events.Error, (error) => {
    logger.error('Discord client error', {
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
    });
    console.error('Discord client full error:', error);
  });

  voiceManager.on('error', (data) => {
    logger.error('Voice manager error', {
      guildId: data.guildId,
      errorMessage: data.error instanceof Error ? data.error.message : String(data.error),
      errorStack: data.error instanceof Error ? data.error.stack : undefined,
    });
    console.error('Voice manager full error:', data);
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

    // Simple format: Show only the translated text with username
    const message = `**${result.username}**: ${result.translatedText}`;

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
