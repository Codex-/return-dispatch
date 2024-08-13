// @ts-check

import { fixupPluginRules } from "@eslint/compat";
import jsEslint from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
import eslintConfigPrettier from "eslint-config-prettier";
import tsEslint from "typescript-eslint";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
  recommendedConfig: jsEslint.configs.recommended,
  allConfig: jsEslint.configs.all,
});

/* eslint-disable @typescript-eslint/explicit-function-return-type */
/**
 * @param {string} name the pugin name
 * @param {string} alias the plugin alias
 * @returns {import("eslint").ESLint.Plugin}
 */
function legacyPlugin(name, alias = name) {
  const plugin = compat.plugins(name)[0]?.plugins?.[alias];

  if (!plugin) {
    throw new Error(`Unable to resolve plugin ${name} and/or alias ${alias}`);
  }

  return fixupPluginRules(plugin);
}
/* eslint-enable @typescript-eslint/explicit-function-return-type */

export default tsEslint.config(
  jsEslint.configs.recommended,
  ...tsEslint.configs.strictTypeChecked,
  ...tsEslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["*.js", "*.mjs"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ignores: [
      "**/coverage",
      "**/dist",
      "**/esbuild.config.mjs",
      "**/vitest.config.ts",
    ],
  },
  {
    plugins: {
      github: legacyPlugin("eslint-plugin-github", "github"), // pending https://github.com/github/eslint-plugin-github/issues/513
      import: legacyPlugin("eslint-plugin-import", "import"),
    },
    rules: {
      "@typescript-eslint/await-thenable": "warn",
      "@typescript-eslint/explicit-function-return-type": "warn",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-floating-promises": [
        "warn",
        { ignoreIIFE: true, ignoreVoid: false },
      ],
      "@typescript-eslint/no-shadow": "error",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        {
          allowNever: true,
          allowNumber: true,
        },
      ],
      camelcase: "off",
      "filenames/match-regex": "off",
      "github/array-foreach": "error",
      "github/no-implicit-buggy-globals": "error",
      "github/no-then": "error",
      "github/no-dynamic-script-tag": "error",
      "i18n-text/no-en": "off",
      "import/no-extraneous-dependencies": [
        "error",
        {
          devDependencies: true,
          optionalDependencies: true,
          peerDependencies: true,
        },
      ],
      "import/extensions": "off",
      "import/no-namespace": "off",
      "import/order": "warn",
      "import/prefer-default-export": "off",
      "no-console": ["warn"],
      "no-param-reassign": "off",
      "no-plusplus": "off",
      "no-shadow": "off",
      "no-unused-vars": "off",
      "object-shorthand": "off",
      "prefer-template": "off",
      radix: ["error", "as-needed"],
      "sort-imports": "off",
    },
  },
  {
    files: ["**/*.spec.ts"],
    rules: {
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
    },
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    ...tsEslint.configs.disableTypeChecked,
  },
  eslintConfigPrettier,
);
