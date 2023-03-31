import "source-map-support/register";
import "dotenv/config";
import packageJson from "../package.json";

import process from "process";
import { program } from "commander";
import { App } from "./app";
import { Game } from "./game";

program
  .name(packageJson.name)
  .version(packageJson.version)
  .option("-r --register-commands")
  .action(async (options: { registerCommands?: boolean }) => {
    const game = await Game.create({
      imageDir: process.env.IMAGE_DIR!,
    });

    const app = new App({
      discordAppId: process.env.DISCORD_APP_ID!,
      discordBotToken: process.env.DISCORD_BOT_TOKEN!,
      commands: [...game.commands],
    });

    app.on("error", (e) => console.warn(e));
    app.on("command", (name) => console.log(`executing command ${name}`));

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
