import { once } from "node:events";
import { EventEmitter } from "eventemitter3";
import * as discord from "discord.js";

export interface AppOptions {
  discordAppId: string;
  discordBotToken: string;
  commands: AppCommand[];
}

export interface AppCommand {
  command(builder: discord.SlashCommandBuilder): void;
  action(interaction: discord.ChatInputCommandInteraction, app: App): Promise<void>;
}

interface RegisteredAppCommand {
  command: ReturnType<discord.SlashCommandBuilder["toJSON"]>;
  action: (interaction: discord.ChatInputCommandInteraction, app: App) => Promise<void>;
}

export class App extends EventEmitter<{
  error: [unknown];
  command: [name: string];
}> {
  readonly discordClient = new discord.Client({
    intents: [
      discord.GatewayIntentBits.Guilds,
      discord.GatewayIntentBits.GuildMembers,
      discord.GatewayIntentBits.GuildPresences,
    ],
  });

  get inviteLink(): string {
    const scopes = discord.OAuth2Scopes;
    const permissions = discord.PermissionFlagsBits;

    return this.discordClient.generateInvite({
      scopes: [scopes.Bot, scopes.ApplicationsCommands],
      permissions: [
        permissions.ViewChannel,
        permissions.SendMessages,
        permissions.CreatePublicThreads,
        permissions.CreatePrivateThreads,
        permissions.SendMessagesInThreads,
        permissions.AttachFiles,
        permissions.AddReactions,
      ],
    });
  }

  constructor(readonly options: Readonly<AppOptions>) {
    super();
    this.discordClient.on("error", (e) => void this.emit("error", e));
    this._initCommands();
  }

  private _isRunning = false;

  get isRunning(): boolean {
    return this._isRunning;
  }

  async start(): Promise<void> {
    if (this._isRunning) return;
    this._isRunning = true;

    try {
      await this.discordClient.login(this.options.discordBotToken);
    } catch (error) {
      this._isRunning = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this._isRunning) return;

    this.discordClient.destroy();

    this._isRunning = false;
  }

  private readonly _registeredCommandsByName = new Map<string, RegisteredAppCommand>();

  private _initCommands(): void {
    for (const def of this.options.commands) {
      const builder = new discord.SlashCommandBuilder();
      def.command(builder);
      this._registeredCommandsByName.set(builder.name, {
        command: builder.toJSON(),
        action: def.action.bind(def),
      });
    }

    this.discordClient.on("interactionCreate", this._dispatchCommand);
  }

  private _dispatchCommand = async (interaction: discord.Interaction) => {
    try {
      if (!interaction.isChatInputCommand()) return;

      const command = this._registeredCommandsByName.get(interaction.commandName);
      if (!command) throw new Error(`command not found: ${interaction.commandName}`);

      this.emit("command", interaction.commandName);
      await command.action(interaction, this);
    } catch (error) {
      this.emit("error", error);
    }
  };

  async registerCommands(): Promise<void> {
    this.discordClient.rest.setToken(this.options.discordBotToken);

    await this.discordClient.rest.put(
      discord.Routes.applicationCommands(this.options.discordAppId),
      { body: [...this._registeredCommandsByName.values()].map((x) => x.command) }
    );
  }
}
