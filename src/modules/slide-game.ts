import { AppButton, AppCommand } from "../app";

import * as fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import * as path from "node:path";

import shuffle from "lodash.shuffle";

import * as discord from "discord.js";
import { Collection } from "discord.js";

export interface SlideGameOptions {
  imageDir: string;
}

function shuffleCollection<K, V>(coll: Collection<K, V>): void {
  const entries = shuffle([...coll.entries()]);
  coll.clear();
  for (const [k, v] of entries) coll.set(k, v);
}

export class SlideGame {
  static async create(options: Readonly<SlideGameOptions>): Promise<SlideGame> {
    const game = new SlideGame(options);
    await game.reset();
    return game;
  }

  private constructor(readonly options: Readonly<SlideGameOptions>) {}

  private _topics = new Collection<string, string>();
  private _topicIndex = 0;

  private _images = new Collection<string, string>();
  private _imageIndex = 0;

  private _people = new Collection<string, discord.GuildMember>();
  private _personIndex = 0;

  private _timerSeconds: number = 30;
  private _timerAbortController = new AbortController();
  private _abortTimer(): void {
    this._timerAbortController.abort();
    this._timerAbortController = new AbortController();
  }

  async setTimerDuration(seconds: number): Promise<void> {
    this._timerSeconds = seconds;
  }

  async reset(): Promise<void> {
    this._topics.clear();
    this._images.clear();
    this._people.clear();

    for (const entry of await fs.readdir(this.options.imageDir, { withFileTypes: true })) {
      if (entry.isDirectory()) this._topics.set(entry.name, entry.name);
    }

    if (this._topics.size === 0) throw new Error("no topics");

    this._topicIndex = this._topics.size - 1;
    this._imageIndex = this._images.size - 1;
    this._personIndex = this._people.size - 1;
  }

  get topic(): string {
    return this._topics.at(this._topicIndex)!;
  }

  async nextTopic(): Promise<void> {
    this._topicIndex += 1;

    if (this._topicIndex === this._topics.size) {
      shuffleCollection(this._topics);
      this._topicIndex = 0;
    }

    this._images.clear();

    const entries = await fs.readdir(path.join(this.options.imageDir, this.topic), {
      withFileTypes: true,
    });
    for (const entry of entries) {
      const imagePath = path.join(this.options.imageDir, this.topic, entry.name);
      if (entry.isFile()) this._images.set(entry.name, imagePath);
    }

    if (this._images.size === 0) throw new Error(`no images in topic: ${this.topic}`);
    this._imageIndex = this._images.size - 1;
  }

  get image(): string {
    return this._images.at(this._imageIndex)!;
  }

  get person(): discord.GuildMember {
    return this._people.at(this._personIndex)!;
  }

  async nextImage(channel: discord.Channel): Promise<void> {
    if (!channel || channel.type !== discord.ChannelType.GuildText) {
      throw new Error("not a text channel");
    }

    const channelPeople = channel.members
      .filter((m) => !m.user.bot)
      .filter((m) => m.presence?.status === "online");

    if (channelPeople.size === 0) {
      throw new Error("no people online in channel");
    }

    if (this._images.size === 0) await this.nextTopic();

    this._imageIndex += 1;

    if (this._imageIndex === this._images.size) {
      shuffleCollection(this._images);
      this._imageIndex = 0;
    }

    do {
      this._personIndex += 1;
      if (this._personIndex === this._people.size || this._personIndex >= channelPeople.size) {
        this._people = channelPeople.clone();
        shuffleCollection(this._people);
        this._personIndex = 0;
      }
    } while (!channelPeople.has(this.person.id));
  }

  private _nextSlideAction = async (
    int: discord.ChatInputCommandInteraction | discord.ButtonInteraction
  ) => {
    this._abortTimer();

    await this.nextImage(int.channel!);

    await int.reply({
      content: `${this.person.user}\nGame topic is: ${this.topic}`,
      files: [createReadStream(this.image)],
      components: [
        new discord.ActionRowBuilder<discord.ButtonBuilder>().addComponents(
          new discord.ButtonBuilder()
            .setCustomId("slide-next")
            .setStyle(discord.ButtonStyle.Primary)
            .setLabel("Next Slide")
        ),
      ],
    });

    if (this._timerSeconds) {
      await this._followUpWithTimer(int, this._timerSeconds, this._timerAbortController.signal);
    }
  };

  private async _followUpWithTimer(
    int: discord.ChatInputCommandInteraction | discord.ButtonInteraction,
    seconds: number,
    abort: AbortSignal
  ): Promise<void> {
    const text = () => `Time left: ${seconds.toFixed(0).padStart(2, "0")} seconds.`;

    const timerMsg = await int.followUp(text());

    const interval = setInterval(async () => {
      if (abort.aborted) {
        clearInterval(interval);
        return;
      }

      seconds -= 1;
      if (seconds <= 0) {
        clearInterval(interval);
        await timerMsg.edit(`Time is up!`);
        return;
      }

      await timerMsg.edit(text());
    }, 1000);
  }

  readonly commands: AppCommand[] = [
    {
      command: (c) =>
        c
          .setName("slide-timer")
          .setDescription("set slide timer")
          .addIntegerOption((o) =>
            o
              .setName("seconds")
              .setRequired(true)
              .setMinValue(0)
              .setMaxValue(300)
              .setDescription("0 disables timer")
          ),
      action: async (int) => {
        const seconds = int.options.getInteger("seconds", true);
        await this.setTimerDuration(seconds);
        if (seconds) await int.reply(`Timer duration is set to ${seconds} seconds.`);
        else await int.reply(`Timer is disabled.`);
      },
    },
    {
      command: (c) => c.setName("slide-topic").setDescription("next topic"),
      action: async (int) => {
        this._abortTimer();

        await this.nextTopic();
        await int.reply(`Game topic is: ${this.topic}`);
      },
    },
    {
      command: (c) => c.setName("slide-next").setDescription("get next image"),
      action: this._nextSlideAction,
    },
  ];

  readonly buttons: AppButton[] = [
    {
      id: "slide-next",
      action: this._nextSlideAction,
    },
  ];
}
