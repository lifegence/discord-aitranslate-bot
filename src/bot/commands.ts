import { SlashCommandBuilder } from 'discord.js';

/**
 * Slash commands for the translator bot
 */
export const commands = [
  new SlashCommandBuilder()
    .setName('translate-join')
    .setDescription('Join voice channel and start real-time translation')
    .addStringOption((option) =>
      option
        .setName('language')
        .setDescription('Target language for translation')
        .setRequired(false)
        .addChoices(
          { name: 'Japanese (日本語)', value: 'ja' },
          { name: 'English', value: 'en' },
          { name: 'Korean (한국어)', value: 'ko' },
          { name: 'Chinese (中文)', value: 'zh' },
          { name: 'Spanish (Español)', value: 'es' },
          { name: 'French (Français)', value: 'fr' },
          { name: 'German (Deutsch)', value: 'de' },
          { name: 'Italian (Italiano)', value: 'it' },
          { name: 'Portuguese (Português)', value: 'pt' },
          { name: 'Russian (Русский)', value: 'ru' }
        )
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('translate-leave')
    .setDescription('Leave voice channel and stop translation')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('translate-language')
    .setDescription('Change translation target language')
    .addStringOption((option) =>
      option
        .setName('language')
        .setDescription('New target language')
        .setRequired(true)
        .addChoices(
          { name: 'Japanese (日本語)', value: 'ja' },
          { name: 'English', value: 'en' },
          { name: 'Korean (한국어)', value: 'ko' },
          { name: 'Chinese (中文)', value: 'zh' },
          { name: 'Spanish (Español)', value: 'es' },
          { name: 'French (Français)', value: 'fr' },
          { name: 'German (Deutsch)', value: 'de' },
          { name: 'Italian (Italiano)', value: 'it' },
          { name: 'Portuguese (Português)', value: 'pt' },
          { name: 'Russian (Русский)', value: 'ru' }
        )
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('translate-status')
    .setDescription('Check translation status')
    .toJSON(),
];
