import { REST, Routes } from 'discord.js';
import { loadConfig } from './utils/config';
import { createLogger } from './utils/logger';
import { commands } from './bot/commands';

/**
 * Deploy slash commands to Discord
 */
async function deployCommands() {
  const config = loadConfig();
  const logger = createLogger({ level: config.logLevel });

  logger.info('Starting command deployment');

  const rest = new REST().setToken(config.discordToken);

  try {
    logger.info(`Deploying ${commands.length} commands...`);

    // Register commands globally
    const data = await rest.put(
      Routes.applicationCommands(config.discordClientId),
      { body: commands }
    ) as any[];

    logger.info(`Successfully deployed ${data.length} commands globally`);

    // List deployed commands
    data.forEach((command) => {
      logger.info(`  - /${command.name}: ${command.description}`);
    });

    logger.info('Command deployment complete');
  } catch (error) {
    logger.error('Failed to deploy commands', { error });
    process.exit(1);
  }
}

deployCommands();
