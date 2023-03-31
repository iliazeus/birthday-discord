import { EventEmitter } from "eventemitter3";
import * as discord from "discord.js";

export interface AppOptions {
  discordAppId: string;
  discordBotToken: string;
  commands?: AppCommand[];
  buttons?: AppButton[];
}

export interface AppCommand {
  command(builder: discord.SlashCommandBuilder): void;
  action(interaction: discord.ChatInputCommandInteraction, app: App): void | Promise<void>;
}

export interface AppButton {
  id: string;
  action(interaction: discord.ButtonInteraction, app: App): void | Promise<void>;
}

interface RegisteredAppCommand {
  command: ReturnType<discord.SlashCommandBuilder["toJSON"]>;
  action: (interaction: discord.ChatInputCommandInteraction, app: App) => void | Promise<void>;
}

export class App extends EventEmitter<{
  error: [unknown];
  command: [name: string];
  button: [id: string];
}> {
  readonly client = new discord.Client({
    intents: [
      discord.GatewayIntentBits.Guilds,
      discord.GatewayIntentBits.GuildMembers,
      discord.GatewayIntentBits.GuildPresences,
    ],
  });

  get inviteLink(): string {
    const scopes = discord.OAuth2Scopes;
    const permissions = discord.PermissionFlagsBits;

    return this.client.generateInvite({
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
    this.client.on("error", (e) => void this.emit("error", e));
    this._initCommands();
    this._initButtons();
  }

  private _isRunning = false;

  get isRunning(): boolean {
    return this._isRunning;
  }

  async start(): Promise<void> {
    if (this._isRunning) return;
    this._isRunning = true;

    try {
      await this.client.login(this.options.discordBotToken);
    } catch (error) {
      this._isRunning = false;
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this._isRunning) return;

    this.client.destroy();

    this._isRunning = false;
  }

  private readonly _registeredCommandsByName = new Map<string, RegisteredAppCommand>();

  private _initCommands(): void {
    for (const def of this.options.commands ?? []) {
      const builder = new discord.SlashCommandBuilder();
      def.command(builder);
      this._registeredCommandsByName.set(builder.name, {
        command: builder.toJSON(),
        action: def.action.bind(def),
      });
    }

    this.client.on("interactionCreate", this._dispatchCommand);
  }

  private _dispatchCommand = async (interaction: discord.Interaction) => {
    if (!interaction.isChatInputCommand()) return;

    try {
      const command = this._registeredCommandsByName.get(interaction.commandName);
      if (!command) throw new Error(`command not found: ${interaction.commandName}`);

      this.emit("command", interaction.commandName);
      await command.action(interaction, this);
    } catch (error) {
      this.emit("error", error);
      void interaction.reply(`${error}`).catch(() => {});
    }
  };

  private readonly _buttonsById = new Map<string, AppButton>();

  private _initButtons(): void {
    for (const def of this.options.buttons ?? []) {
      this._buttonsById.set(def.id, def);
    }

    this.client.on("interactionCreate", this._dispatchButton);
  }

  private _dispatchButton = async (interaction: discord.Interaction) => {
    if (!interaction.isButton()) return;

    try {
      const button = this._buttonsById.get(interaction.customId);
      if (!button) throw new Error(`button not found: ${interaction.customId}`);

      this.emit("button", button.id);
      await button.action(interaction, this);
    } catch (error) {
      this.emit("error", error);
      void interaction.reply(`${error}`).catch(() => {});
    }
  };

  async registerCommands(): Promise<void> {
    this.client.rest.setToken(this.options.discordBotToken);

    await this.client.rest.put(discord.Routes.applicationCommands(this.options.discordAppId), {
      body: [...this._registeredCommandsByName.values()].map((x) => x.command),
    });
  }
}
