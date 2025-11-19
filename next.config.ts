import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  compiler: {
    // Enables the styled-components SWC transform
    styledComponents: true,
    // relay: {
    //   src: "./src",
    //   artifactDirectory: "./__generated__",
    //   language: "typescript",
    //   eagerEsModules: false,
    // },
    reactRemoveProperties: true,
    removeConsole: {
      exclude: ["error"],
    },
  }
};

export default nextConfig;
