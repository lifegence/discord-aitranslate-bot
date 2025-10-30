import {
  joinVoiceChannel,
  VoiceConnection,
  VoiceConnectionStatus,
  entersState,
  EndBehaviorType,
} from '@discordjs/voice';
import type { VoiceBasedChannel } from 'discord.js';
import { EventEmitter } from 'events';
import type {
  VoiceSession,
  VoiceManagerOptions,
  Logger,
} from '../types';
import { ErrorType, TranslatorError } from '../types';

/**
 * Voice manager for handling Discord voice connections
 */
export class VoiceManager extends EventEmitter {
  private sessions: Map<string, VoiceSession>;
  private logger: Logger;
  private options: Required<VoiceManagerOptions>;

  constructor(logger: Logger, options?: Partial<VoiceManagerOptions>) {
    super();
    this.sessions = new Map();
    this.logger = logger;
    this.options = {
      selfDeaf: options?.selfDeaf !== undefined ? options.selfDeaf : true,
      selfMute: options?.selfMute !== undefined ? options.selfMute : false,
    };

    this.logger.info('VoiceManager initialized');
  }

  /**
   * Join a voice channel
   */
  async joinChannel(
    channel: VoiceBasedChannel,
    textChannelId: string,
    targetLanguage: string
  ): Promise<VoiceSession> {
    const guildId = channel.guild.id;

    // Check if already connected
    if (this.sessions.has(guildId)) {
      throw new TranslatorError(
        ErrorType.VOICE_CHANNEL_ERROR,
        `Already connected to a voice channel in guild ${guildId}`
      );
    }

    try {
      this.logger.info('Joining voice channel', {
        guildId,
        channelId: channel.id,
        channelName: channel.name,
      });

      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: guildId,
        adapterCreator: channel.guild.voiceAdapterCreator as any,
        selfDeaf: this.options.selfDeaf,
        selfMute: this.options.selfMute,
      });

      // Wait for connection to be ready
      await entersState(connection, VoiceConnectionStatus.Ready, 30_000);

      const session: VoiceSession = {
        guildId,
        channelId: channel.id,
        textChannelId,
        connection,
        targetLanguage,
        isActive: true,
        startedAt: Date.now(),
        activeUsers: new Set(),
      };

      this.sessions.set(guildId, session);

      // Set up connection event handlers
      this.setupConnectionHandlers(connection, guildId);

      // Set up audio receiver
      this.setupAudioReceiver(connection, guildId);

      this.logger.info('Successfully joined voice channel', {
        guildId,
        channelId: channel.id,
      });

      this.emit('joined', session);

      return session;
    } catch (error) {
      this.logger.error('Failed to join voice channel', {
        guildId,
        error,
      });

      throw new TranslatorError(
        ErrorType.VOICE_CHANNEL_ERROR,
        'Failed to join voice channel',
        error as Error
      );
    }
  }

  /**
   * Leave a voice channel
   */
  async leaveChannel(guildId: string): Promise<void> {
    const session = this.sessions.get(guildId);

    if (!session) {
      this.logger.warn('Attempted to leave non-existent session', { guildId });
      return;
    }

    try {
      this.logger.info('Leaving voice channel', { guildId });

      session.connection.destroy();
      session.isActive = false;
      this.sessions.delete(guildId);

      this.emit('left', guildId);

      this.logger.info('Successfully left voice channel', { guildId });
    } catch (error) {
      this.logger.error('Error leaving voice channel', {
        guildId,
        error,
      });

      throw new TranslatorError(
        ErrorType.VOICE_CHANNEL_ERROR,
        'Failed to leave voice channel',
        error as Error
      );
    }
  }

  /**
   * Get session for guild
   */
  getSession(guildId: string): VoiceSession | undefined {
    return this.sessions.get(guildId);
  }

  /**
   * Set target language for session
   */
  setTargetLanguage(guildId: string, language: string): void {
    const session = this.sessions.get(guildId);
    if (session) {
      session.targetLanguage = language;
      this.logger.info('Updated target language', { guildId, language });
    }
  }

  /**
   * Add active user to session
   */
  addActiveUser(guildId: string, userId: string): void {
    const session = this.sessions.get(guildId);
    if (session) {
      session.activeUsers.add(userId);
      this.logger.debug('Added active user', { guildId, userId });
    }
  }

  /**
   * Remove active user from session
   */
  removeActiveUser(guildId: string, userId: string): void {
    const session = this.sessions.get(guildId);
    if (session) {
      session.activeUsers.delete(userId);
      this.logger.debug('Removed active user', { guildId, userId });
    }
  }

  /**
   * Setup connection event handlers
   */
  private setupConnectionHandlers(
    connection: VoiceConnection,
    guildId: string
  ): void {
    connection.on('stateChange', (oldState, newState) => {
      this.logger.debug('Connection state changed', {
        guildId,
        from: oldState.status,
        to: newState.status,
      });

      this.emit('stateChange', {
        guildId,
        oldState: oldState.status,
        newState: newState.status,
      });
    });

    connection.on('error', (error) => {
      this.logger.error('Connection error', {
        guildId,
        error,
      });

      this.emit('error', {
        guildId,
        error,
      });
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
        // Seems to be reconnecting to a new channel
      } catch (error) {
        // Seems to be a permanent disconnect
        connection.destroy();
        this.sessions.delete(guildId);
        this.emit('disconnected', guildId);
      }
    });
  }

  /**
   * Setup audio receiver for voice connection
   */
  private setupAudioReceiver(
    connection: VoiceConnection,
    guildId: string
  ): void {
    const receiver = connection.receiver;

    receiver.speaking.on('start', (userId: string) => {
      this.logger.debug('User started speaking', { guildId, userId });
      this.addActiveUser(guildId, userId);

      // Subscribe to user audio
      const opusStream = receiver.subscribe(userId, {
        end: {
          behavior: EndBehaviorType.AfterSilence,
          duration: 300,
        },
      });

      // Emit audio stream for processing
      this.emit('userAudioStream', {
        guildId,
        userId,
        stream: opusStream,
      });
    });

    receiver.speaking.on('end', (userId: string) => {
      this.logger.debug('User stopped speaking', { guildId, userId });
      this.removeActiveUser(guildId, userId);
    });
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): VoiceSession[] {
    return Array.from(this.sessions.values()).filter(
      (session) => session.isActive
    );
  }

  /**
   * Disconnect all sessions
   */
  async disconnectAll(): Promise<void> {
    this.logger.info('Disconnecting all sessions');

    const disconnectPromises = Array.from(this.sessions.keys()).map((guildId) =>
      this.leaveChannel(guildId)
    );

    await Promise.all(disconnectPromises);

    this.logger.info('All sessions disconnected');
  }
}
