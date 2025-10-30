import {
  ChatInputCommandInteraction,
  GuildMember,
  EmbedBuilder,
} from 'discord.js';
import type { Logger, BotConfig } from '../types';
import { TranslatorError } from '../types';
import { VoiceManager } from '../voice/voice-manager';
import { TranslationPipeline } from '../translation/translation-pipeline';

/**
 * Handler for slash commands
 */
export class CommandHandler {
  private voiceManager: VoiceManager;
  private translationPipeline: TranslationPipeline;
  private logger: Logger;
  private config: BotConfig;

  constructor(
    voiceManager: VoiceManager,
    translationPipeline: TranslationPipeline,
    logger: Logger,
    config: BotConfig
  ) {
    this.voiceManager = voiceManager;
    this.translationPipeline = translationPipeline;
    this.logger = logger;
    this.config = config;
  }

  /**
   * Handle interaction command
   */
  async handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const { commandName } = interaction;

    this.logger.info('Handling command', {
      commandName,
      userId: interaction.user.id,
      guildId: interaction.guildId,
    });

    try {
      switch (commandName) {
        case 'translate-join':
          await this.handleJoinCommand(interaction);
          break;
        case 'translate-leave':
          await this.handleLeaveCommand(interaction);
          break;
        case 'translate-language':
          await this.handleLanguageCommand(interaction);
          break;
        case 'translate-status':
          await this.handleStatusCommand(interaction);
          break;
        default:
          await interaction.reply({
            content: 'Unknown command',
            ephemeral: true,
          });
      }
    } catch (error) {
      this.logger.error('Command handling failed', {
        commandName,
        error,
      });

      const errorMessage =
        error instanceof TranslatorError
          ? error.message
          : 'An error occurred while processing your command';

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content: `❌ ${errorMessage}`,
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: `❌ ${errorMessage}`,
          ephemeral: true,
        });
      }
    }
  }

  /**
   * Handle /translate-join command
   */
  private async handleJoinCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    await interaction.deferReply();

    if (!interaction.guildId) {
      await interaction.editReply('This command can only be used in a server');
      return;
    }

    const member = interaction.member as GuildMember;
    if (!member?.voice?.channel) {
      await interaction.editReply('❌ You need to be in a voice channel first!');
      return;
    }

    const voiceChannel = member.voice.channel;
    const targetLanguage =
      (interaction.options.get('language')?.value as string) ||
      this.config.defaultTargetLanguage;

    try {
      const session = await this.voiceManager.joinChannel(
        voiceChannel,
        interaction.channelId,
        targetLanguage
      );

      // Set up translation event handling
      this.setupTranslationHandling(session.guildId, interaction.channelId);

      const embed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle('✅ Translation Started')
        .setDescription(
          `Now translating speech in **${voiceChannel.name}** to **${this.getLanguageName(targetLanguage)}**`
        )
        .addFields(
          {
            name: 'Voice Channel',
            value: voiceChannel.name,
            inline: true,
          },
          {
            name: 'Target Language',
            value: this.getLanguageName(targetLanguage),
            inline: true,
          }
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      this.logger.info('Successfully joined voice channel', {
        guildId: interaction.guildId,
        channelId: voiceChannel.id,
        targetLanguage,
      });
    } catch (error) {
      this.logger.error('Failed to join voice channel', { error });
      throw error;
    }
  }

  /**
   * Handle /translate-leave command
   */
  private async handleLeaveCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    await interaction.deferReply();

    if (!interaction.guildId) {
      await interaction.editReply('This command can only be used in a server');
      return;
    }

    const session = this.voiceManager.getSession(interaction.guildId);
    if (!session) {
      await interaction.editReply('❌ Not currently in a voice channel');
      return;
    }

    try {
      await this.voiceManager.leaveChannel(interaction.guildId);

      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle('👋 Translation Stopped')
        .setDescription('Left the voice channel and stopped translation')
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

      this.logger.info('Successfully left voice channel', {
        guildId: interaction.guildId,
      });
    } catch (error) {
      this.logger.error('Failed to leave voice channel', { error });
      throw error;
    }
  }

  /**
   * Handle /translate-language command
   */
  private async handleLanguageCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    await interaction.deferReply();

    if (!interaction.guildId) {
      await interaction.editReply('This command can only be used in a server');
      return;
    }

    const session = this.voiceManager.getSession(interaction.guildId);
    if (!session) {
      await interaction.editReply(
        '❌ Not currently in a voice channel. Use `/translate-join` first'
      );
      return;
    }

    const newLanguage = interaction.options.get('language')?.value as string;
    this.voiceManager.setTargetLanguage(interaction.guildId, newLanguage);

    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle('🔄 Language Changed')
      .setDescription(
        `Target language changed to **${this.getLanguageName(newLanguage)}**`
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    this.logger.info('Changed target language', {
      guildId: interaction.guildId,
      newLanguage,
    });
  }

  /**
   * Handle /translate-status command
   */
  private async handleStatusCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.guildId) {
      await interaction.editReply('This command can only be used in a server');
      return;
    }

    const session = this.voiceManager.getSession(interaction.guildId);

    if (!session) {
      await interaction.editReply('❌ Not currently active in this server');
      return;
    }

    const uptimeSeconds = Math.floor((Date.now() - session.startedAt) / 1000);
    const uptimeMinutes = Math.floor(uptimeSeconds / 60);
    const uptimeHours = Math.floor(uptimeMinutes / 60);

    const uptimeStr =
      uptimeHours > 0
        ? `${uptimeHours}h ${uptimeMinutes % 60}m`
        : `${uptimeMinutes}m ${uptimeSeconds % 60}s`;

    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle('📊 Translation Status')
      .addFields(
        {
          name: 'Status',
          value: session.isActive ? '✅ Active' : '❌ Inactive',
          inline: true,
        },
        {
          name: 'Target Language',
          value: this.getLanguageName(session.targetLanguage),
          inline: true,
        },
        {
          name: 'Uptime',
          value: uptimeStr,
          inline: true,
        },
        {
          name: 'Active Users',
          value: session.activeUsers.size.toString() || '0',
          inline: true,
        },
        {
          name: 'Voice Channel',
          value: `<#${session.channelId}>`,
          inline: true,
        },
        {
          name: 'Text Channel',
          value: `<#${session.textChannelId}>`,
          inline: true,
        }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  }

  /**
   * Setup translation event handling for a session
   */
  private setupTranslationHandling(
    guildId: string,
    _textChannelId: string
  ): void {
    this.voiceManager.on('userAudioStream', async (data) => {
      if (data.guildId !== guildId) return;

      const { userId, stream } = data;
      const session = this.voiceManager.getSession(guildId);
      if (!session) return;

      // Get user info
      const username = 'User'; // TODO: Get actual username from Discord

      try {
        // Process audio stream and get translations
        for await (const result of this.translationPipeline.processStream(
          stream,
          userId,
          username,
          session.targetLanguage
        )) {
          // Send translation to text channel
          await this.sendTranslation(session.textChannelId, result);
        }
      } catch (error) {
        this.logger.error('Translation stream processing failed', {
          guildId,
          userId,
          error,
        });
      }
    });
  }

  /**
   * Send translation to text channel
   */
  private async sendTranslation(
    _textChannelId: string,
    result: any
  ): Promise<void> {
    // This will be implemented with actual Discord channel sending
    this.logger.info('Translation result', {
      userId: result.userId,
      original: result.originalText,
      translated: result.translatedText,
      language: result.targetLanguage,
    });
  }

  /**
   * Get language name from code
   */
  private getLanguageName(code: string): string {
    const languages: Record<string, string> = {
      ja: 'Japanese (日本語)',
      en: 'English',
      ko: 'Korean (한국어)',
      zh: 'Chinese (中文)',
      es: 'Spanish (Español)',
      fr: 'French (Français)',
      de: 'German (Deutsch)',
      it: 'Italian (Italiano)',
      pt: 'Portuguese (Português)',
      ru: 'Russian (Русский)',
    };

    return languages[code] || code;
  }
}
