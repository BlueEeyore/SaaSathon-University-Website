import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  // Trims the server bundle for a small self-hosted host, and is what a
  // container or VPS deployment would use. `next start` is unaffected.
  output: "standalone",
};
export default config;
