// Prints the deck as the prompt carries it, with its size. No model call.
//   node scripts/print-deck.mjs            catalog JSON + sizes
//   node scripts/print-deck.mjs --prompt   the whole system prompt + sizes
import { build } from "esbuild";

const out = await build({
  stdin: {
    contents: `export { catalogJson, deckPrompt, parseDeal, applyCard, placeCards } from "./src/lib/deck/index.ts";`,
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  logLevel: "error",
});
const deck = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);

const catalog = JSON.stringify(deck.catalogJson());
const prompt = deck.deckPrompt();
// Rough tokens at 3.9 chars each: the spike measured its 1,670-char v1 prompt at ~458
// prompt_tokens with the user turn and chat template, i.e. ~3.9 chars per token on Nemotron.
const tok = (s) => Math.round(s.length / 3.9);

console.log(process.argv.includes("--prompt") ? prompt : JSON.stringify(deck.catalogJson(), null, 1));
console.log(`\ncards ${deck.catalogJson().length}`);
console.log(`catalog JSON  ${catalog.length} chars · ~${tok(catalog)} tokens`);
console.log(`system prompt ${prompt.length} chars · ~${tok(prompt)} tokens (deck + format + one worked example)`);
