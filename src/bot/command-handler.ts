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
  private logger: Logger;
  private config: BotConfig;

  constructor(
    voiceManager: VoiceManager,
    _translationPipeline: TranslationPipeline,
    logger: Logger,
    config: BotConfig
  ) {
    this.voiceManager = voiceManager;
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
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      console.error('Full error details:', error);

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
    if (!interaction.guildId) {
      await interaction.reply({
        content: 'This command can only be used in a server',
        ephemeral: true,
      });
      return;
    }

    const member = interaction.member as GuildMember;
    if (!member?.voice?.channel) {
      await interaction.reply({
        content: '❌ You need to be in a voice channel first!',
        ephemeral: true,
      });
      return;
    }

    const voiceChannel = member.voice.channel;
    const targetLanguage =
      (interaction.options.get('language')?.value as string) ||
      this.config.defaultTargetLanguage;

    // Reply immediately to avoid timeout
    await interaction.reply({
      content: `🔄 Connecting to **${voiceChannel.name}**...`,
      ephemeral: true,
    });

    // Process connection in background
    try {
      await this.voiceManager.joinChannel(
        voiceChannel,
        interaction.channelId,
        targetLanguage
      );

      // Update with success message
      await interaction.editReply({
        content: `✅ Now translating in **${voiceChannel.name}** to **${this.getLanguageName(targetLanguage)}**`,
      });

      this.logger.info('Successfully joined voice channel', {
        guildId: interaction.guildId,
        channelId: voiceChannel.id,
        targetLanguage,
      });
    } catch (error) {
      this.logger.error('Failed to join voice channel', { error });

      await interaction.editReply({
        content: `❌ Failed to join voice channel: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }).catch(() => {
        // Ignore if edit fails
      });

      throw error;
    }
  }

  /**
   * Handle /translate-leave command
   */
  private async handleLeaveCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    if (!interaction.guildId) {
      await interaction.reply({
        content: 'This command can only be used in a server',
        ephemeral: true,
      });
      return;
    }

    const session = this.voiceManager.getSession(interaction.guildId);
    if (!session) {
      await interaction.reply({
        content: '❌ Not currently in a voice channel',
        ephemeral: true,
      });
      return;
    }

    // Reply immediately
    await interaction.reply({
      content: '👋 Leaving voice channel...',
      ephemeral: true,
    });

    try {
      await this.voiceManager.leaveChannel(interaction.guildId);

      await interaction.editReply({
        content: '✅ Left the voice channel and stopped translation',
      });

      this.logger.info('Successfully left voice channel', {
        guildId: interaction.guildId,
      });
    } catch (error) {
      this.logger.error('Failed to leave voice channel', { error });

      await interaction.editReply({
        content: `❌ Failed to leave: ${error instanceof Error ? error.message : 'Unknown error'}`,
      }).catch(() => {
        // Ignore if edit fails
      });

      throw error;
    }
  }

  /**
   * Handle /translate-language command
   */
  private async handleLanguageCommand(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    if (!interaction.guildId) {
      await interaction.reply({
        content: 'This command can only be used in a server',
        ephemeral: true,
      });
      return;
    }

    const session = this.voiceManager.getSession(interaction.guildId);
    if (!session) {
      await interaction.reply({
        content: '❌ Not currently in a voice channel. Use `/translate-join` first',
        ephemeral: true,
      });
      return;
    }

    const newLanguage = interaction.options.get('language')?.value as string;
    this.voiceManager.setTargetLanguage(interaction.guildId, newLanguage);

    await interaction.reply({
      content: `🔄 Target language changed to **${this.getLanguageName(newLanguage)}**`,
      ephemeral: true,
    });

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
    if (!interaction.guildId) {
      await interaction.reply({
        content: 'This command can only be used in a server',
        ephemeral: true,
      });
      return;
    }

    const session = this.voiceManager.getSession(interaction.guildId);

    if (!session) {
      await interaction.reply({
        content: '❌ Not currently active in this server',
        ephemeral: true,
      });
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

    await interaction.reply({ embeds: [embed], ephemeral: true });
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
