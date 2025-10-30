# Discord Realtime Translator Bot

A Discord bot that provides real-time voice translation using Google Gemini API. The bot joins voice channels and translates speech in real-time, displaying translations in text channels.

## Features

- **Real-time Voice Translation**: Automatically translates speech as users speak in voice channels
- **Multi-language Support**: Supports 10+ languages including Japanese, English, Korean, Chinese, and more
- **Auto Language Detection**: Automatically detects the source language
- **Voice Activity Detection**: Only processes audio when someone is speaking
- **Test-Driven Development**: Built with comprehensive test coverage using Jest

## Supported Languages

- 🇯🇵 Japanese (日本語)
- 🇺🇸 English
- 🇰🇷 Korean (한국어)
- 🇨🇳 Chinese (中文)
- 🇪🇸 Spanish (Español)
- 🇫🇷 French (Français)
- 🇩🇪 German (Deutsch)
- 🇮🇹 Italian (Italiano)
- 🇵🇹 Portuguese (Português)
- 🇷🇺 Russian (Русский)

## Prerequisites

- Node.js 18 or higher
- Discord Bot Token
- Google Gemini API Key
- FFmpeg (for audio processing)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/lifegence/discord-aitranslate-bot.git
cd discord-aitranslate-bot
```

2. Install dependencies:
```bash
npm install
```

3. Install FFmpeg:

**Ubuntu/Debian:**
```bash
sudo apt-get install ffmpeg
```

**macOS:**
```bash
brew install ffmpeg
```

**Windows:**
Download from [ffmpeg.org](https://ffmpeg.org/download.html)

4. Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
```

5. Edit `.env` with your credentials:
```env
DISCORD_BOT_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id_here
GOOGLE_GEMINI_API_KEY=your_gemini_api_key_here
DEFAULT_TARGET_LANGUAGE=ja
```

## Getting API Keys

### Discord Bot Token

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to "Bot" section and create a bot
4. Copy the bot token
5. Enable these Privileged Gateway Intents:
   - Server Members Intent
   - Message Content Intent

### Invite URL

Use this URL format to invite the bot (replace CLIENT_ID):
```
https://discord.com/api/oauth2/authorize?client_id=CLIENT_ID&permissions=3164160&scope=bot%20applications.commands
```

Required permissions:
- View Channels
- Send Messages
- Connect to Voice
- Speak

### Google Gemini API Key

1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Sign in with your Google account
3. Create a new API key
4. Copy the API key

## Usage

### Build the Project

```bash
npm run build
```

### Deploy Commands to Discord

Before first use, deploy the slash commands:
```bash
npm run deploy-commands
```

### Start the Bot

```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

### Discord Commands

#### `/translate-join [language]`
Join your current voice channel and start translating.
- `language` (optional): Target language for translation (default: Japanese)

Example:
```
/translate-join language:en
```

#### `/translate-leave`
Leave the voice channel and stop translation.

Example:
```
/translate-leave
```

#### `/translate-language <language>`
Change the target language for translation.
- `language` (required): New target language

Example:
```
/translate-language language:ko
```

#### `/translate-status`
Check the current translation status.

Example:
```
/translate-status
```

## Development

### Run Tests

```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

Generate coverage report:
```bash
npm run test:coverage
```

### Project Structure

```
src/
├── bot/               # Discord bot components
│   ├── commands.ts    # Slash command definitions
│   └── command-handler.ts  # Command handlers
├── translation/       # Translation components
│   ├── gemini-client.ts    # Gemini API client
│   └── translation-pipeline.ts  # Translation orchestration
├── voice/             # Voice processing components
│   ├── voice-manager.ts    # Voice connection management
│   └── audio-processor.ts  # Audio processing
├── types/             # TypeScript type definitions
│   └── index.ts
├── utils/             # Utility functions
│   ├── logger.ts      # Logging
│   └── config.ts      # Configuration
├── index.ts           # Main entry point
└── deploy-commands.ts # Command deployment script

tests/
├── unit/              # Unit tests
│   ├── translation/
│   ├── voice/
│   └── utils/
└── integration/       # Integration tests
```

### Architecture

The bot is built using a modular architecture with clear separation of concerns:

1. **VoiceManager**: Manages Discord voice connections and audio streams
2. **AudioProcessor**: Processes audio data (Opus decoding, resampling, VAD)
3. **GeminiClient**: Interfaces with Google Gemini API for translation
4. **TranslationPipeline**: Orchestrates the translation workflow
5. **CommandHandler**: Handles Discord slash commands

### Configuration

All configuration is done through environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `DISCORD_BOT_TOKEN` | Discord bot token | Required |
| `DISCORD_CLIENT_ID` | Discord client ID | Required |
| `GOOGLE_GEMINI_API_KEY` | Gemini API key | Required |
| `DEFAULT_TARGET_LANGUAGE` | Default translation target | `ja` |
| `LOG_LEVEL` | Logging level | `info` |
| `AUDIO_CHUNK_SIZE_MS` | Audio chunk size in ms | `500` |
| `VAD_ENABLED` | Voice activity detection | `true` |
| `GEMINI_MODEL` | Gemini model to use | `gemini-2.0-flash-exp` |

## How It Works

1. User runs `/translate-join` in a Discord channel
2. Bot joins the user's voice channel
3. Bot receives audio streams from speaking users
4. Audio is processed and buffered into chunks
5. Chunks are sent to Gemini API for transcription and translation
6. Translations are posted in the text channel with format:
   ```
   **Username** 🇯🇵 → 🇺🇸
   📝 こんにちは
   🔄 Hello
   ```

## Troubleshooting

### Bot doesn't respond to commands
- Make sure commands are deployed: `npm run deploy-commands`
- Check bot permissions in Discord server
- Verify bot token is correct in `.env`

### No audio is being processed
- Check FFmpeg is installed: `ffmpeg -version`
- Verify bot has "Connect" and "Speak" permissions
- Check Voice Activity Detection settings in `.env`

### Translation errors
- Verify Gemini API key is valid
- Check internet connection
- Review logs for specific error messages

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch
3. Write tests for new features
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Acknowledgments

- Built with [discord.js](https://discord.js.org/)
- Translation powered by [Google Gemini API](https://ai.google.dev/)
- Audio processing with [prism-media](https://github.com/amishshah/prism-media)

## Support

For issues and questions:
- Open an issue on GitHub
- Check existing issues for solutions
- Review logs with `LOG_LEVEL=debug`
# discord-aitranslate-bot
