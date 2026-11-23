// Publish the standalone prototype as supplied, including its classic scripts.
import { cp, mkdir, readdir, rename } from "node:fs/promises";

const source = new URL("./demo/", import.meta.url);
const output = new URL("./dist/", import.meta.url);
await mkdir(output, { recursive: true });

for (const name of await readdir(source)) {
  if (name !== "index.html") {
    await cp(new URL(name, source), new URL(name, output), { recursive: true });
  }
}
const entry = new URL("index.html", output);
const staged = new URL(".index-next.html", output);
await cp(new URL("index.html", source), staged);
await rename(staged, entry);
