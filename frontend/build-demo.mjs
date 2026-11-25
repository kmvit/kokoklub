// Vite bundles the stylesheet and scripts. The original renderer also builds image URLs at runtime.
import { cp } from "node:fs/promises";
for (const dir of ["ds", "img", "hf", "fonts"]) {
  await cp(new URL(`./demo/${dir}`, import.meta.url), new URL(`./dist/${dir}`, import.meta.url), { recursive: true });
}
await cp(new URL("./public/brand", import.meta.url), new URL("./dist/brand", import.meta.url), { recursive: true });
