#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { runInitCommand } from "./init.js";
import { runUpdateCommand } from "./update.js";

const program = new Command();

program
  .name("readme-craft")
  .description("Generate high-quality README files with progressive project understanding")
  .version("0.1.0");

program
  .command("init")
  .argument("[target]", "project directory to analyze", process.cwd())
  .option("-c, --config <path>", "path to .readme-craft.yml")
  .option("-m, --model <model>", "override model name")
  .option("-l, --language <lang>", "output language", "zh")
  .option("-o, --output <file>", "output README path", "README.md")
  .option("-y, --yes", "skip final confirmation")
  .action(async (target: string, options) => {
    await runInitCommand({
      targetDir: target,
      configPath: options.config,
      model: options.model,
      language: options.language,
      output: options.output,
      yes: options.yes
    });
  });

program
  .command("update")
  .argument("[target]", "project directory to analyze", process.cwd())
  .option("-c, --config <path>", "path to .readme-craft.yml")
  .option("-m, --model <model>", "override model name")
  .option("-l, --language <lang>", "output language", "zh")
  .option("-o, --output <file>", "output README path", "README.md")
  .option("-y, --yes", "skip final confirmation")
  .action(async (target: string, options) => {
    await runUpdateCommand({
      targetDir: target,
      configPath: options.config,
      model: options.model,
      language: options.language,
      output: options.output,
      yes: options.yes
    });
  });

await program.parseAsync(process.argv);
