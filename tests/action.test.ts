import * as core from "@actions/core";
import { ActionConfig, getConfig } from "../src/action";

describe("Action", () => {
  const workflowInputs = {
    cake: "delicious",
  };

  describe("getConfig", () => {
    let mockEnvConfig: any;

    beforeEach(() => {
      mockEnvConfig = {
        token: "secret",
        ref: "feature_branch",
        repo: "repository",
        owner: "owner",
        workflow: "workflow_name",
        workflowInputs: JSON.stringify(workflowInputs),
        workflowTimeoutSeconds: "60",
      };

      jest.spyOn(core, "getInput").mockImplementation((input: string) => {
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
            return mockEnvConfig.workflowInputs;
          case "workflow_timeout_seconds":
            return mockEnvConfig.workflowTimeoutSeconds;
          default:
            throw new Error("invalid input requested");
        }
      });
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it("should return a valid config", () => {
      const config: ActionConfig = getConfig();

      // Assert that the numbers / types have been properly loaded.
      expect(config.token).toStrictEqual("secret");
      expect(config.ref).toStrictEqual("feature_branch");
      expect(config.repo).toStrictEqual("repository");
      expect(config.owner).toStrictEqual("owner");
      expect(config.workflow).toStrictEqual("workflow_name");
      expect(config.workflow_inputs).toStrictEqual(workflowInputs);
      expect(config.workflowTimeoutSeconds).toStrictEqual(60);
    });

    it("should have a number for a workflow when given a workflow ID", () => {
      mockEnvConfig.workflow = "123456";
      const config: ActionConfig = getConfig();

      expect(config.workflow).toStrictEqual(123456);
    });

    it("should provide a default workflow timeout if none is supplied", () => {
      mockEnvConfig.workflowTimeoutSeconds = "";
      const config: ActionConfig = getConfig();

      expect(config.workflowTimeoutSeconds).toStrictEqual(300);
    });

    it("should handle no inputs being provided", () => {
      mockEnvConfig.workflowInputs = "";
      const config: ActionConfig = getConfig();

      expect(config.workflow_inputs).toBeUndefined();
    });

    it("should throw if invalid workflow inputs JSON is provided", () => {
      mockEnvConfig.workflowInputs = "{";

      expect(() => getConfig()).toThrowError();
    });

    it("should throw if a workflow inputs JSON is contains non-strings", () => {
      mockEnvConfig.workflowInputs =
        '{"cake":"delicious","pie":{"powerLevel":9001}}';

      expect(() => getConfig()).toThrowError();
    });
  });
});
