import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // The PDF tools had pages of their own before they joined the PDF toolkit.
  async redirects() {
    return [
      ["pdf-merge", "merge"],
      ["pdf-split", "split"],
      ["pdf-organize", "organize"],
      ["images-to-pdf", "images"],
      ["pdf-stamp", "stamp"],
    ].map(([from, mode]) => ({ source: `/:locale(en|ar)/tools/${from}`, destination: `/:locale/tools/pdf?mode=${mode}`, permanent: false }));
  },
};

export default createNextIntlPlugin()(nextConfig);
