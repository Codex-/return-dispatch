import type { Config } from "@jest/types";

const config: Config.InitialOptions = {
  clearMocks: true,
  globals: {
    "ts-jest": {
      tsconfig: "tsconfig.json",
    },
  },
  moduleFileExtensions: ["js", "ts"],
  testEnvironment: "node",
  testRunner: "jest-circus/runner",
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
  testRegex: "\\.spec\\.[jt]s$",
  verbose: true,
};

export default config;
