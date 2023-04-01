import { AppButton, AppCommand } from "../app";

import * as fs from "node:fs";
import * as readline from "node:readline";

import table from "text-table";

import chunk from "lodash.chunk";
import sample from "lodash.sample";

import * as discord from "discord.js";
import { Collection } from "discord.js";

export interface ChameleonCard {
  topic: string;
  words: string[];
}

export interface ChameleonGameOptions {
  cardFile: string;
}

interface _State {
  chameleon: discord.GuildMember;
  card: ChameleonCard;
  word: string;
}

export class ChameleonGame {
  private _usedTopics = new Set<string>();
  private _state: _State | null = null;

  constructor(readonly options: ChameleonGameOptions) {}

  private async _parseCards(): Promise<ChameleonCard[]> {
    const input = fs.createReadStream(this.options.cardFile);
    const lines = readline.createInterface({ input, crlfDelay: Infinity });
    const cards: ChameleonCard[] = [];

    for await (const line of lines) {
      const [topic, ...words] = line.split(",");

      if (this._usedTopics.has(topic)) continue;

      cards.push({
        topic: topic.trim(),
        words: words.map((w) => w.trim()),
      });
    }

    if (cards.length === 0 && this._usedTopics.size > 0) {
      this._usedTopics.clear();
      return await this._parseCards();
    }

    return cards;
  }

  async start(members: Collection<string, discord.GuildMember>): Promise<void> {
    const people = members
      .filter((m) => !m.user.bot)
      .filter((m) => m.presence?.status === "online");
    if (people.size <= 1) throw new Error("too few people online to start");

    const cards = await this._parseCards();

    const chameleon = people.random()!;

    const card = sample(cards)!;
    if (!card) throw new Error("no cards");

    const word = sample(card.words);
    if (!word) throw new Error("no words in card");

    this._state = { card, word, chameleon };
    this._usedTopics.add(card.topic);
  }

  stop(): void {
    this._state = null;
  }

  get card(): ChameleonCard {
    if (!this._state) throw new Error("game has not started");
    return this._state.card;
  }

  get chameleon(): discord.GuildMember {
    if (!this._state) throw new Error("game has not started");
    return this._state.chameleon;
  }

  getWord(member: discord.GuildMember): string | null {
    if (!this._state) throw new Error("game has not started");

    if (member.id === this._state.chameleon.id) return null;
    return this._state.word;
  }

  private _nextCardAction = async (
    int: discord.ChatInputCommandInteraction | discord.ButtonInteraction
  ) => {
    const channel = int.channel;
    if (!channel || channel.type !== discord.ChannelType.GuildText) {
      throw new Error("not a text channel");
    }

    await this.start(channel.members);

    await int.reply({
      content: `**${this.card.topic}**\n` + "```" + table(chunk(this.card.words, 4)) + "```",
      components: [
        new discord.ActionRowBuilder<discord.ButtonBuilder>().addComponents(
          new discord.ButtonBuilder()
            .setCustomId("chameleon-get-word")
            .setStyle(discord.ButtonStyle.Primary)
            .setLabel("Reveal Word"),
          new discord.ButtonBuilder()
            .setCustomId("chameleon-reveal")
            .setStyle(discord.ButtonStyle.Secondary)
            .setLabel("Reveal Chameleon")
        ),
      ],
    });
  };

  readonly commands: AppCommand[] = [
    {
      command: (c) => c.setName("chameleon-start").setDescription("start the game"),
      action: this._nextCardAction,
    },
  ];

  readonly buttons: AppButton[] = [
    {
      id: "chameleon-get-word",
      action: async (int) => {
        if (!int.member || !(int.member instanceof discord.GuildMember)) return;

        const word = this.getWord(int.member);

        if (word) await int.reply({ content: `The word is: **${word}**`, ephemeral: true });
        else await int.reply({ content: "*You are the chameleon!*", ephemeral: true });
      },
    },
    {
      id: "chameleon-reveal",
      action: async (int) => {
        await int.reply({
          content: `The chameleon was ${this.chameleon}!`,
          components: [
            new discord.ActionRowBuilder<discord.ButtonBuilder>().addComponents(
              new discord.ButtonBuilder()
                .setCustomId("chameleon-next")
                .setStyle(discord.ButtonStyle.Primary)
                .setLabel("Next Card")
            ),
          ],
        });
      },
    },
    {
      id: "chameleon-next",
      action: this._nextCardAction,
    },
  ];
}
