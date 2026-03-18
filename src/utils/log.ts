const cyan = "\u001b[36m";
const yellow = "\u001b[33m";
const green = "\u001b[32m";
const red = "\u001b[31m";
const reset = "\u001b[0m";

export const log = {
  info(message: string): void {
    console.log(`${cyan}ℹ${reset} ${message}`);
  },
  step(message: string): void {
    console.log(`${cyan}▶${reset} ${message}`);
  },
  success(message: string): void {
    console.log(`${green}✓${reset} ${message}`);
  },
  warn(message: string): void {
    console.warn(`${yellow}⚠${reset} ${message}`);
  },
  error(message: string): void {
    console.error(`${red}✖${reset} ${message}`);
  }
};
