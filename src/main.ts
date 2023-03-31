import "source-map-support/register";
import "dotenv/config";
import packageJson from "../package.json";

import process from "process";
import { program } from "commander";
import { App } from "./app";

const app = new App({
  discordAppId: process.env.DISCORD_APP_ID!,
  discordBotToken: process.env.DISCORD_BOT_TOKEN!,
  commands: [
    {
      command: (c) => c.setName("ping").setDescription("ping"),
      action: async (int) => {
        if (!int.isRepliable()) return;
        await int.reply("pong");
      },
    },
  ],
});

app.on("error", (e) => console.warn(e));
app.on("command", (name) => console.log(`executing command ${name}`));

program
  .name(packageJson.name)
  .version(packageJson.version)
  .option("-r --register-commands")
  .action(async (options: { registerCommands?: boolean }) => {
    if (options.registerCommands) {
      console.log("registering commands");
      await app.registerCommands();
      console.log("done registering commands");
    }

    console.log("starting app");
    await app.start();
    console.log("done starting app");

    console.log(`invite link is: ${app.inviteLink}`);

    process.once("SIGINT", async () => {
      console.log("stopping app");
      await app.stop();
    });
  });

program.parseAsync().catch((error) => {
  console.error(error);
  process.exitCode = error.exitCode ?? 1;
});
