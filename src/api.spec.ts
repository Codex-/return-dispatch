import * as core from "@actions/core";
import * as github from "@actions/github";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { dispatchWorkflow, init } from "./api.ts";
import { mockLoggingFunctions } from "./test-utils/logging.mock.ts";

vi.mock("@actions/core");
vi.mock("@actions/github");

interface MockResponse {
  data: any;
  status: number;
  headers: Record<string, string>;
}

const mockOctokit = {
  rest: {
    actions: {
      createWorkflowDispatch: (_req?: any): Promise<MockResponse> => {
        throw new Error("Should be mocked");
      },
    },
  },
};

const runDetails = {
  workflow_run_id: 123456,
  run_url: "https://api.github.com/repos/owner/repo/actions/runs/123456",
  html_url: "https://github.com/owner/repo/actions/runs/123456",
};

describe("API", () => {
  const {
    coreDebugLogMock,
    coreInfoLogMock,
    coreErrorLogMock,
    assertOnlyCalled,
  } = mockLoggingFunctions();

  afterAll(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.spyOn(core, "getInput").mockImplementation((key: string) => {
      switch (key) {
        case "token":
          return "token";
        case "ref":
          return "ref";
        case "repo":
          return "repo";
        case "owner":
          return "owner";
        case "workflow":
          return "workflow";
        case "workflow_inputs":
          return JSON.stringify({ testInput: "test" });
        default:
          return "";
      }
    });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    vi.spyOn(github, "getOctokit").mockReturnValue(mockOctokit as any);
    init();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("dispatchWorkflow", () => {
    it("should return the run ID and html_url from the dispatch response", async () => {
      let dispatchedRequest: Record<string, unknown> | undefined;
      vi.spyOn(
        mockOctokit.rest.actions,
        "createWorkflowDispatch",
      ).mockImplementation((req?: any) => {
        dispatchedRequest = req as Record<string, unknown>;

        return Promise.resolve({
          data: runDetails,
          status: 200,
          headers: {},
        });
      });

      // Behaviour
      await expect(dispatchWorkflow()).resolves.toStrictEqual({
        id: 123456,
        url: "https://github.com/owner/repo/actions/runs/123456",
      });

      // The run details are opt-in, so the request must ask for them
      expect(dispatchedRequest?.return_run_details).toStrictEqual(true);
      // Only the caller's inputs are forwarded, nothing is injected
      expect(dispatchedRequest?.inputs).toStrictEqual({ testInput: "test" });

      // Logging
      assertOnlyCalled(coreInfoLogMock);
      expect(coreInfoLogMock).toHaveBeenCalledOnce();
      expect(coreInfoLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(`
        "Successfully dispatched workflow:
          Repository: owner/repo
          Branch: ref
          Workflow: workflow
          Workflow Inputs: {"testInput":"test"}
          Run ID: 123456
          Run URL: https://github.com/owner/repo/actions/runs/123456"
      `);
    });

    it("should throw for an empty 204, as returned by servers without return_run_details support", async () => {
      vi.spyOn(
        mockOctokit.rest.actions,
        "createWorkflowDispatch",
      ).mockReturnValue(
        Promise.resolve({
          data: undefined,
          status: 204,
          headers: {},
        }),
      );

      // Behaviour
      await expect(dispatchWorkflow()).rejects.toThrow(
        "Dispatch did not return the run details, this action requires github.com or GHES >=3.21",
      );

      // Logging
      assertOnlyCalled(coreErrorLogMock, coreDebugLogMock);
      expect(coreErrorLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `"dispatchWorkflow: An unexpected error has occurred: Dispatch did not return the run details, this action requires github.com or GHES >=3.21"`,
      );
    });

    it("should restate the server requirement for a 400 rejecting the unknown field", async () => {
      // Servers predating `return_run_details` reject it outright rather than
      // ignoring it, so the empty 204 path is never reached.
      const requestError = Object.assign(
        new Error('Unknown request body field: "return_run_details"'),
        { status: 400 },
      );
      vi.spyOn(
        mockOctokit.rest.actions,
        "createWorkflowDispatch",
      ).mockRejectedValue(requestError);

      // Behaviour
      await expect(dispatchWorkflow()).rejects.toThrow(
        "Dispatch did not return the run details, this action requires github.com or GHES >=3.21",
      );
      // The original message is retained for diagnosis
      await expect(dispatchWorkflow()).rejects.toThrow(
        'Unknown request body field: "return_run_details"',
      );

      // Logging
      assertOnlyCalled(coreErrorLogMock, coreDebugLogMock);
    });

    it("should not restate the server requirement for other failures", async () => {
      const requestError = Object.assign(new Error("No ref found"), {
        status: 422,
      });
      vi.spyOn(
        mockOctokit.rest.actions,
        "createWorkflowDispatch",
      ).mockRejectedValue(requestError);

      // Behaviour
      await expect(dispatchWorkflow()).rejects.toThrow("No ref found");
      await expect(dispatchWorkflow()).rejects.not.toThrow("GHES");

      // Logging
      assertOnlyCalled(coreErrorLogMock, coreDebugLogMock);
    });

    it.each([
      ["an empty body", {}],
      ["a body missing the run ID", { html_url: "https://github.com" }],
      ["a body missing the URL", { workflow_run_id: 123456 }],
      ["a non-numeric run ID", { workflow_run_id: "123456", html_url: "url" }],
    ])("should throw for %s", async (_label, data) => {
      vi.spyOn(
        mockOctokit.rest.actions,
        "createWorkflowDispatch",
      ).mockReturnValue(
        Promise.resolve({
          data,
          status: 200,
          headers: {},
        }),
      );

      // Behaviour
      await expect(dispatchWorkflow()).rejects.toThrow(
        "Dispatch did not return the run details",
      );
    });

    it("should throw if a non-200 or non-204 status is returned", async () => {
      const errorStatus = 401;
      vi.spyOn(
        mockOctokit.rest.actions,
        "createWorkflowDispatch",
      ).mockReturnValue(
        Promise.resolve({
          data: undefined,
          status: errorStatus,
          headers: {},
        }),
      );

      // Behaviour
      await expect(dispatchWorkflow()).rejects.toThrow(
        `Failed to dispatch action, expected 200 or 204 but received ${errorStatus}`,
      );

      // Logging
      assertOnlyCalled(coreErrorLogMock, coreDebugLogMock);
      expect(coreErrorLogMock).toHaveBeenCalledOnce();
      expect(coreErrorLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `"dispatchWorkflow: An unexpected error has occurred: Failed to dispatch action, expected 200 or 204 but received 401"`,
      );
      expect(coreDebugLogMock).toHaveBeenCalledOnce();
    });

    it("should omit the inputs from the log when none are configured", async () => {
      vi.spyOn(core, "getInput").mockImplementation((key: string) => {
        switch (key) {
          case "token":
            return "token";
          case "ref":
            return "ref";
          case "repo":
            return "repo";
          case "owner":
            return "owner";
          case "workflow":
            return "workflow";
          default:
            return "";
        }
      });
      init();

      vi.spyOn(
        mockOctokit.rest.actions,
        "createWorkflowDispatch",
      ).mockReturnValue(
        Promise.resolve({
          data: runDetails,
          status: 200,
          headers: {},
        }),
      );

      // Behaviour
      await expect(dispatchWorkflow()).resolves.toStrictEqual({
        id: 123456,
        url: "https://github.com/owner/repo/actions/runs/123456",
      });

      // Logging
      assertOnlyCalled(coreInfoLogMock);
      expect(coreInfoLogMock.mock.calls[0]?.[0]).not.toContain(
        "Workflow Inputs",
      );
    });
  });
});
