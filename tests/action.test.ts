import * as core from "@actions/core";
import { ActionConfig, getConfig } from "../src/action";

describe("Action", () => {
  describe("getConfig", () => {
    const mockEnvConfig = {
      token: "secret",
      ref: "feature_branch",
      repo: "repository",
      owner: "owner",
      workflow: "workflow_name",
      workflowTimeoutSeconds: "60",
    };

    beforeEach(() => {
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
      expect(config.workflowTimeoutSeconds).toStrictEqual(60);
    });

    it("should have a number for a workflow when given a workflow ID", () => {
      const originalWorkflow = mockEnvConfig.workflow;
      mockEnvConfig.workflow = "123456";
      const config: ActionConfig = getConfig();
      mockEnvConfig.workflow = originalWorkflow;

      expect(config.workflow).toStrictEqual(123456);
    });

    it("should provide a default workflow timeout if none is supplied", () => {
      const originalWorkflowTimeout = mockEnvConfig.workflowTimeoutSeconds;
      mockEnvConfig.workflowTimeoutSeconds = "";
      const config: ActionConfig = getConfig();
      mockEnvConfig.workflowTimeoutSeconds = originalWorkflowTimeout;

      expect(config.workflowTimeoutSeconds).toStrictEqual(300);
    });
  });
});
