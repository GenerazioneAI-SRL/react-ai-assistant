import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    sourcemap: true,
    outDir: "dist",
  },
  {
    entry: { index: "src/react/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    outDir: "dist/react",
    external: ["react", "react-dom"],
    // Next.js App Router needs this directive preserved on the client bundle.
    banner: { js: '"use client";' },
  },
  {
    entry: { index: "src/server/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    outDir: "dist/server",
  },
]);
