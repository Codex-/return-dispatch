import * as core from "@actions/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type ActionConfig, getConfig } from "./action.ts";

vi.mock("@actions/core");

describe("Action", () => {
  const workflowInputs = {
    cake: "delicious",
  };

  describe("getConfig", () => {
    // Represent the process.env inputs.
    let mockEnvConfig: any;

    beforeEach(() => {
      mockEnvConfig = {
        token: "secret",
        ref: "feature_branch",
        repo: "repository",
        owner: "owner",
        workflow: "workflow_name",
        workflow_inputs: JSON.stringify(workflowInputs),
        workflow_timeout_seconds: "60",
      };

      vi.spyOn(core, "getInput").mockImplementation((input: string): string => {
        /* eslint-disable @typescript-eslint/no-unsafe-return */
        switch (input) {
          case "token":
            return mockEnvConfig.token;
          case "ref":
            return mockEnvConfig.ref;
          case "repo":
            return mockEnvConfig.repo;
          case "owner":
            return mockEnvConfig.owner;
          case "workflow":
            return mockEnvConfig.workflow;
          case "workflow_inputs":
            return mockEnvConfig.workflow_inputs;
          case "workflow_timeout_seconds":
            return mockEnvConfig.workflow_timeout_seconds;
          default:
            throw new Error("invalid input requested");
        }
        /* eslint-enable @typescript-eslint/no-unsafe-return */
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should return a valid config", () => {
      const config: ActionConfig = getConfig();

      // Assert that the numbers / types have been properly loaded.
      expect(config.token).toStrictEqual("secret");
      expect(config.ref).toStrictEqual("feature_branch");
      expect(config.repo).toStrictEqual("repository");
      expect(config.owner).toStrictEqual("owner");
      expect(config.workflow).toStrictEqual("workflow_name");
      expect(config.workflowInputs).toStrictEqual(workflowInputs);
      expect(config.workflowTimeoutSeconds).toStrictEqual(60);
    });

    it("should have a number for a workflow when given a workflow ID", () => {
      mockEnvConfig.workflow = "123456";
      const config: ActionConfig = getConfig();

      expect(config.workflow).toStrictEqual(123456);
    });

    it("should provide a default workflow timeout if none is supplied", () => {
      mockEnvConfig.workflow_timeout_seconds = "";
      const config: ActionConfig = getConfig();

      expect(config.workflowTimeoutSeconds).toStrictEqual(300);
    });

    it("should handle no inputs being provided", () => {
      mockEnvConfig.workflow_inputs = "";
      const config: ActionConfig = getConfig();

      expect(config.workflowInputs).toBeUndefined();
    });

    it("should throw if invalid workflow inputs JSON is provided", () => {
      mockEnvConfig.workflow_inputs = "{";

      expect(() => getConfig()).toThrowError();
    });

    it("should handle workflow inputs JSON containing strings numbers or booleans", () => {
      mockEnvConfig.workflow_inputs =
        '{"cake":"delicious","pie":9001,"parfait":false}';

      expect(() => getConfig()).not.toThrowError();
    });

    it("should throw if a workflow inputs JSON doesn't contain strings numbers or booleans", () => {
      mockEnvConfig.workflow_inputs = '{"pie":{"powerLevel":9001}}';
      expect(() => getConfig()).toThrowError('"pie" value is object');

      mockEnvConfig.workflow_inputs = '{"vegetable":null}';
      expect(() => getConfig()).toThrowError('"vegetable" value is null');

      mockEnvConfig.workflow_inputs = '{"fruit":[]}';
      expect(() => getConfig()).toThrowError('"fruit" value is Array');
    });
  });
});
