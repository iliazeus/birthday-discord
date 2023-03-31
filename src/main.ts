import "source-map-support/register";
import "dotenv/config";
import packageJson from "../package.json";

import process from "process";
import { program } from "commander";

import { App } from "./app";
import { SlideGame } from "./modules/slide-game";
import { ChameleonGame } from "./modules/chameleon-game";

program
  .name(packageJson.name)
  .version(packageJson.version)
  .option("-r --register-commands")
  .action(async (options: { registerCommands?: boolean }) => {
    const slideGame = await SlideGame.create({
      imageDir: process.env.SLIDE_GAME_IMAGE_DIR!,
    });

    const chameleonGame = new ChameleonGame({
      cardFile: process.env.CHAMELEON_GAME_CARD_FILE!,
    });

    const app = new App({
      discordAppId: process.env.DISCORD_APP_ID!,
      discordBotToken: process.env.DISCORD_BOT_TOKEN!,
      commands: [...slideGame.commands, ...chameleonGame.commands],
      buttons: [...slideGame.buttons, ...chameleonGame.buttons],
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
