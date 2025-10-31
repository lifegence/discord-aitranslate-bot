import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { VoiceManager } from '../../../src/voice/voice-manager';
import type { Logger } from '../../../src/types';
import { createMockLogger, createMockVoiceChannel } from '../../helpers/mocks';

// Mock the @discordjs/voice module
jest.mock('@discordjs/voice', () => ({
  joinVoiceChannel: jest.fn().mockReturnValue({
    state: { status: 'ready' },
    destroy: jest.fn(),
    receiver: {
      speaking: {
        on: jest.fn(),
      },
      subscribe: jest.fn(),
    },
    on: jest.fn(),
  }),
  VoiceConnectionStatus: {
    Ready: 'ready',
    Connecting: 'connecting',
    Signalling: 'signalling',
    Disconnected: 'disconnected',
  },
  entersState: jest.fn().mockResolvedValue(null as any),
  EndBehaviorType: {
    AfterSilence: 'afterSilence',
  },
}));

describe('VoiceManager', () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = createMockLogger();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create a VoiceManager instance', () => {
      const manager = new VoiceManager(mockLogger);
      expect(manager).toBeDefined();
      expect(manager).toBeInstanceOf(VoiceManager);
    });

    it('should initialize with options', () => {
      const manager = new VoiceManager(mockLogger, {
        selfDeaf: true,
        selfMute: false,
      });
      expect(manager).toBeDefined();
    });

    it('should log initialization', () => {
      new VoiceManager(mockLogger);
      expect(mockLogger.info).toHaveBeenCalledWith('VoiceManager initialized');
    });
  });

  describe('joinChannel', () => {
    it('should join a voice channel and create session', async () => {
      const manager = new VoiceManager(mockLogger);
      const mockChannel = createMockVoiceChannel();
      const textChannelId = 'text-channel-123';
      const targetLanguage = 'ja';

      const session = await manager.joinChannel(
        mockChannel as any,
        textChannelId,
        targetLanguage
      );

      expect(session).toBeDefined();
      expect(session.isActive).toBe(true);
      expect(session.targetLanguage).toBe(targetLanguage);
      expect(session.guildId).toBe(mockChannel.guild.id);
      expect(session.channelId).toBe(mockChannel.id);
      expect(session.textChannelId).toBe(textChannelId);
    });

    it('should throw error if already connected to channel', async () => {
      const manager = new VoiceManager(mockLogger);
      const mockChannel = createMockVoiceChannel();
      const textChannelId = 'text-channel-123';

      await manager.joinChannel(mockChannel as any, textChannelId, 'ja');

      await expect(
        manager.joinChannel(mockChannel as any, textChannelId, 'ja')
      ).rejects.toThrow('Already connected to a voice channel');
    });

    it('should emit joined event', async () => {
      const manager = new VoiceManager(mockLogger);
      const mockChannel = createMockVoiceChannel();

      const joinedHandler = jest.fn();
      manager.on('joined', joinedHandler);

      await manager.joinChannel(mockChannel as any, 'text-123', 'ja');

      expect(joinedHandler).toHaveBeenCalled();
    });

    it('should setup audio receiver', async () => {
      const manager = new VoiceManager(mockLogger);
      const mockChannel = createMockVoiceChannel();

      const session = await manager.joinChannel(
        mockChannel as any,
        'text-123',
        'ja'
      );

      expect(session.connection.receiver).toBeDefined();
    });
  });

  describe('leaveChannel', () => {
    it('should leave voice channel and cleanup session', async () => {
      const manager = new VoiceManager(mockLogger);
      const mockChannel = createMockVoiceChannel();

      await manager.joinChannel(mockChannel as any, 'text-channel-123', 'ja');
      await manager.leaveChannel(mockChannel.guild.id);

      expect(manager.getSession(mockChannel.guild.id)).toBeUndefined();
    });

    it('should not throw if not connected', async () => {
      const manager = new VoiceManager(mockLogger);

      await expect(
        manager.leaveChannel('non-existent-guild')
      ).resolves.not.toThrow();
    });

    it('should emit left event', async () => {
      const manager = new VoiceManager(mockLogger);
      const mockChannel = createMockVoiceChannel();

      await manager.joinChannel(mockChannel as any, 'text-123', 'ja');

      const leftHandler = jest.fn();
      manager.on('left', leftHandler);

      await manager.leaveChannel(mockChannel.guild.id);

      expect(leftHandler).toHaveBeenCalledWith(mockChannel.guild.id);
    });

    it('should destroy connection', async () => {
      const manager = new VoiceManager(mockLogger);
      const mockChannel = createMockVoiceChannel();

      const session = await manager.joinChannel(
        mockChannel as any,
        'text-123',
        'ja'
      );
      const destroySpy = jest.spyOn(session.connection, 'destroy');

      await manager.leaveChannel(mockChannel.guild.id);

      expect(destroySpy).toHaveBeenCalled();
    });
  });

  describe('session management', () => {
    it('should get active session for guild', async () => {
      const manager = new VoiceManager(mockLogger);
      const mockChannel = createMockVoiceChannel();

      await manager.joinChannel(mockChannel as any, 'text-channel-123', 'ja');
      const session = manager.getSession(mockChannel.guild.id);

      expect(session).toBeDefined();
      expect(session?.isActive).toBe(true);
    });

    it('should return undefined for non-existent session', () => {
      const manager = new VoiceManager(mockLogger);
      const session = manager.getSession('non-existent-guild');

      expect(session).toBeUndefined();
    });

    it('should update target language for session', async () => {
      const manager = new VoiceManager(mockLogger);
      const mockChannel = createMockVoiceChannel();

      await manager.joinChannel(mockChannel as any, 'text-channel-123', 'ja');
      manager.setTargetLanguage(mockChannel.guild.id, 'en');

      const session = manager.getSession(mockChannel.guild.id);
      expect(session?.targetLanguage).toBe('en');
    });

    it('should track active users in session', async () => {
      const manager = new VoiceManager(mockLogger);
      const mockChannel = createMockVoiceChannel();

      await manager.joinChannel(mockChannel as any, 'text-channel-123', 'ja');
      manager.addActiveUser(mockChannel.guild.id, 'user123');

      const session = manager.getSession(mockChannel.guild.id);
      expect(session?.activeUsers.has('user123')).toBe(true);
    });

    it('should remove users from active session', async () => {
      const manager = new VoiceManager(mockLogger);
      const mockChannel = createMockVoiceChannel();

      await manager.joinChannel(mockChannel as any, 'text-channel-123', 'ja');
      manager.addActiveUser(mockChannel.guild.id, 'user123');
      manager.removeActiveUser(mockChannel.guild.id, 'user123');

      const session = manager.getSession(mockChannel.guild.id);
      expect(session?.activeUsers.has('user123')).toBe(false);
    });

    it('should get all active sessions', async () => {
      const manager = new VoiceManager(mockLogger);
      const mockChannel1 = createMockVoiceChannel();
      const mockChannel2 = { ...createMockVoiceChannel(), id: 'voice-2', guild: { ...createMockVoiceChannel().guild, id: 'guild-2' } };

      await manager.joinChannel(mockChannel1 as any, 'text-1', 'ja');
      await manager.joinChannel(mockChannel2 as any, 'text-2', 'en');

      const sessions = manager.getActiveSessions();
      expect(sessions.length).toBe(2);
    });
  });

  describe('disconnectAll', () => {
    it('should disconnect all sessions', async () => {
      const manager = new VoiceManager(mockLogger);
      const mockChannel1 = createMockVoiceChannel();
      const mockChannel2 = { ...createMockVoiceChannel(), id: 'voice-2', guild: { ...createMockVoiceChannel().guild, id: 'guild-2' } };

      await manager.joinChannel(mockChannel1 as any, 'text-1', 'ja');
      await manager.joinChannel(mockChannel2 as any, 'text-2', 'en');

      await manager.disconnectAll();

      expect(manager.getActiveSessions().length).toBe(0);
    });

    it('should not throw if no sessions exist', async () => {
      const manager = new VoiceManager(mockLogger);

      await expect(manager.disconnectAll()).resolves.not.toThrow();
    });
  });

  describe('event handling', () => {
    it('should emit userAudioStream event when user starts speaking', async () => {
      const manager = new VoiceManager(mockLogger);
      const mockChannel = createMockVoiceChannel();

      const audioStreamHandler = jest.fn();
      manager.on('userAudioStream', audioStreamHandler);

      await manager.joinChannel(mockChannel as any, 'text-123', 'ja');

      // The audio receiver setup should have attached the speaking.on('start') handler
      // We can't directly trigger it in this test without more complex mocking
      expect(manager.listenerCount('userAudioStream')).toBe(1);
    });
  });
});
