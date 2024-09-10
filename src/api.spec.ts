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

import type { ActionConfig } from "./action.ts";
import {
  dispatchWorkflow,
  fetchWorkflowId,
  getWorkflowRunIds,
  getWorkflowRunJobSteps,
  fetchWorkflowRunUrl,
  init,
  retryOrTimeout,
} from "./api.ts";
import { mockLoggingFunctions } from "./test-utils/logging.mock.ts";
import { getBranchName } from "./utils.ts";

vi.mock("@actions/core");
vi.mock("@actions/github");

interface MockResponse {
  data: any;
  status: number;
}

function* mockPageIterator<T, P>(
  apiMethod: (params: P) => T,
  params: P,
): Generator<T, void> {
  yield apiMethod(params);
}

const mockOctokit = {
  rest: {
    actions: {
      createWorkflowDispatch: (_req?: any): Promise<MockResponse> => {
        throw new Error("Should be mocked");
      },
      getWorkflowRun: (_req?: any): Promise<MockResponse> => {
        throw new Error("Should be mocked");
      },
      listRepoWorkflows: (_req?: any): Promise<MockResponse> => {
        throw new Error("Should be mocked");
      },
      listWorkflowRuns: (_req?: any): Promise<MockResponse> => {
        throw new Error("Should be mocked");
      },
      downloadWorkflowRunLogs: (_req?: any): Promise<MockResponse> => {
        throw new Error("Should be mocked");
      },
      listJobsForWorkflowRun: (_req?: any): Promise<MockResponse> => {
        throw new Error("Should be mocked");
      },
    },
  },
  paginate: {
    iterator: mockPageIterator,
  },
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
        case "workflow_timeout_seconds":
          return "30";
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
    it("should resolve after a successful dispatch", async () => {
      vi.spyOn(
        mockOctokit.rest.actions,
        "createWorkflowDispatch",
      ).mockReturnValue(
        Promise.resolve({
          data: undefined,
          status: 204,
        }),
      );

      // Behaviour
      await expect(dispatchWorkflow("")).resolves.not.toThrow();

      // Logging
      assertOnlyCalled(coreInfoLogMock);
      expect(coreInfoLogMock).toHaveBeenCalledOnce();
      expect(coreInfoLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(`
        "Successfully dispatched workflow:
          Repository: owner/repo
          Branch: ref
          Workflow ID: workflow
          Workflow Inputs: {"testInput":"test"}
          Distinct ID: "
      `);
    });

    it("should throw if a non-204 status is returned", async () => {
      const errorStatus = 401;
      vi.spyOn(
        mockOctokit.rest.actions,
        "createWorkflowDispatch",
      ).mockReturnValue(
        Promise.resolve({
          data: undefined,
          status: errorStatus,
        }),
      );

      // Behaviour
      await expect(dispatchWorkflow("")).rejects.toThrow(
        `Failed to dispatch action, expected 204 but received ${errorStatus}`,
      );

      // Logging
      assertOnlyCalled(coreErrorLogMock, coreDebugLogMock);
      expect(coreErrorLogMock).toHaveBeenCalledOnce();
      expect(coreErrorLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `"dispatchWorkflow: An unexpected error has occurred: Failed to dispatch action, expected 204 but received 401"`,
      );
      expect(coreDebugLogMock).toHaveBeenCalledOnce();
    });

    it("should dispatch with a distinctId in the inputs", async () => {
      const distinctId = "50b4f5fa-f9ce-4661-80e6-6d660a4a3a0d";
      let dispatchedId: string | undefined;
      vi.spyOn(
        mockOctokit.rest.actions,
        "createWorkflowDispatch",
      ).mockImplementation((req?: any) => {
        dispatchedId = req.inputs.distinct_id;

        return Promise.resolve({
          data: undefined,
          status: 204,
        });
      });

      // Behaviour
      await expect(dispatchWorkflow(distinctId)).resolves.not.toThrow();
      expect(dispatchedId).toStrictEqual(distinctId);

      // Logging
      assertOnlyCalled(coreInfoLogMock);
      expect(coreInfoLogMock).toHaveBeenCalledOnce();
      expect(coreInfoLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `
        "Successfully dispatched workflow:
          Repository: owner/repo
          Branch: ref
          Workflow ID: workflow
          Workflow Inputs: {"testInput":"test"}
          Distinct ID: 50b4f5fa-f9ce-4661-80e6-6d660a4a3a0d"
      `,
      );
    });
  });

  describe("fetchWorkflowId", () => {
    it("should return the workflow ID for a given workflow filename", async () => {
      const mockData = [
        {
          id: 0,
          path: ".github/workflows/cake.yml",
        },
        {
          id: 1,
          path: ".github/workflows/pie.yml",
        },
        {
          id: 2,
          path: ".github/workflows/slice.yml",
        },
      ];
      vi.spyOn(mockOctokit.rest.actions, "listRepoWorkflows").mockReturnValue(
        Promise.resolve({
          data: mockData,
          status: 200,
        }),
      );

      // Behaviour
      expect(await fetchWorkflowId("slice.yml")).toStrictEqual(mockData[2]!.id);

      // Logging
      assertOnlyCalled(coreInfoLogMock);
      expect(coreInfoLogMock).toHaveBeenCalledOnce();
      expect(coreInfoLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `
        "Fetched Workflow ID:
          Repository: owner/repo
          Workflow ID: '2'
          Input Filename: 'slice.yml'
          Sanitised Filename: 'slice\\.yml'
          URL: undefined"
      `,
      );
    });

    it("should throw if a non-200 status is returned", async () => {
      const errorStatus = 401;
      vi.spyOn(mockOctokit.rest.actions, "listRepoWorkflows").mockReturnValue(
        Promise.resolve({
          data: undefined,
          status: errorStatus,
        }),
      );

      // Behaviour
      await expect(fetchWorkflowId("implode")).rejects.toThrow(
        `Failed to get workflows, expected 200 but received ${errorStatus}`,
      );

      // Logging
      assertOnlyCalled(coreErrorLogMock, coreDebugLogMock);
      expect(coreErrorLogMock).toHaveBeenCalledOnce();
      expect(coreErrorLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `"fetchWorkflowId: An unexpected error has occurred: Failed to get workflows, expected 200 but received 401"`,
      );
    });

    it("should throw if a given workflow name cannot be found in the response", async () => {
      const workflowName = "slice";
      vi.spyOn(mockOctokit.rest.actions, "listRepoWorkflows").mockReturnValue(
        Promise.resolve({
          data: [],
          status: 200,
        }),
      );

      // Behaviour
      await expect(fetchWorkflowId(workflowName)).rejects.toThrow(
        `Unable to find ID for Workflow: ${workflowName}`,
      );

      // Logging
      assertOnlyCalled(coreErrorLogMock, coreDebugLogMock);
      expect(coreErrorLogMock).toHaveBeenCalledOnce();
      expect(coreErrorLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `"fetchWorkflowId: An unexpected error has occurred: Unable to find ID for Workflow: slice"`,
      );
    });
  });

  describe("getWorkflowRunIds", () => {
    const workflowIdCfg: ActionConfig = {
      token: "secret",
      ref: "/refs/heads/feature_branch",
      repo: "repository",
      owner: "owner",
      workflow: "workflow_name",
      workflowInputs: { testInput: "test" },
      workflowTimeoutSeconds: 60,
      distinctId: "test-uuid",
    };

    beforeEach(() => {
      init(workflowIdCfg);
    });

    it("should get the run IDs for a given workflow ID", async () => {
      const branch = getBranchName(workflowIdCfg.ref);
      coreDebugLogMock.mockReset();

      const mockData = {
        total_count: 3,
        workflow_runs: [{ id: 0 }, { id: 1 }, { id: 2 }],
      };
      vi.spyOn(mockOctokit.rest.actions, "listWorkflowRuns").mockReturnValue(
        Promise.resolve({
          data: mockData,
          status: 200,
        }),
      );

      // Behaviour
      await expect(getWorkflowRunIds(0, branch)).resolves.toStrictEqual(
        mockData.workflow_runs.map((run) => run.id),
      );

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledTimes(1);
      expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `
        "Fetched Workflow Runs:
          Repository: owner/repository
          Branch Filter: true (feature_branch)
          Workflow ID: 0
          Runs Fetched: [0, 1, 2]"
      `,
      );
    });

    it("should throw if a non-200 status is returned", async () => {
      const branch = getBranchName(workflowIdCfg.ref);
      coreDebugLogMock.mockReset();

      const errorStatus = 401;
      vi.spyOn(mockOctokit.rest.actions, "listWorkflowRuns").mockReturnValue(
        Promise.resolve({
          data: undefined,
          status: errorStatus,
        }),
      );

      // Behaviour
      await expect(getWorkflowRunIds(0, branch)).rejects.toThrow(
        `Failed to get Workflow runs, expected 200 but received ${errorStatus}`,
      );

      // Logging
      assertOnlyCalled(coreErrorLogMock, coreDebugLogMock);
      expect(coreErrorLogMock).toHaveBeenCalled();
      expect(coreErrorLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `"getWorkflowRunIds: An unexpected error has occurred: Failed to get Workflow runs, expected 200 but received 401"`,
      );
    });

    it("should return an empty array if there are no runs", async () => {
      const branch = getBranchName(workflowIdCfg.ref);
      coreDebugLogMock.mockReset();

      const mockData = {
        total_count: 0,
        workflow_runs: [],
      };
      vi.spyOn(mockOctokit.rest.actions, "listWorkflowRuns").mockReturnValue(
        Promise.resolve({
          data: mockData,
          status: 200,
        }),
      );

      // Behaviour
      await expect(getWorkflowRunIds(0, branch)).resolves.toStrictEqual([]);

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledTimes(1);
      expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `
        "Fetched Workflow Runs:
          Repository: owner/repository
          Branch Filter: true (feature_branch)
          Workflow ID: 0
          Runs Fetched: []"
      `,
      );
    });

    it("should filter by branch name", async () => {
      const branch = getBranchName("/refs/heads/master");
      coreDebugLogMock.mockReset();

      let parsedRef!: string;
      vi.spyOn(mockOctokit.rest.actions, "listWorkflowRuns").mockImplementation(
        (req: any) => {
          parsedRef = req.branch;
          const mockResponse: MockResponse = {
            data: {
              total_count: 0,
              workflow_runs: [],
            },
            status: 200,
          };
          return Promise.resolve(mockResponse);
        },
      );

      // Behaviour
      await expect(getWorkflowRunIds(0, branch)).resolves.not.toThrow();
      expect(parsedRef).toStrictEqual("master");

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledTimes(1);
      expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `
        "Fetched Workflow Runs:
          Repository: owner/repository
          Branch Filter: true (master)
          Workflow ID: 0
          Runs Fetched: []"
      `,
      );
    });

    it("should not use a branch filter if using a tag ref", async () => {
      const branch = getBranchName("/refs/tags/1.5.0");
      coreDebugLogMock.mockReset();

      let parsedRef!: string;
      vi.spyOn(mockOctokit.rest.actions, "listWorkflowRuns").mockImplementation(
        (req: any) => {
          parsedRef = req.branch;
          const mockResponse: MockResponse = {
            data: {
              total_count: 0,
              workflow_runs: [],
            },
            status: 200,
          };
          return Promise.resolve(mockResponse);
        },
      );

      // Behaviour
      await expect(getWorkflowRunIds(0, branch)).resolves.not.toThrow();
      expect(parsedRef).toBeUndefined();

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledTimes(1);
      expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `
        "Fetched Workflow Runs:
          Repository: owner/repository
          Branch Filter: false (/refs/tags/1.5.0)
          Workflow ID: 0
          Runs Fetched: []"
      `,
      );
    });

    it("should not use a branch filter if non-standard ref", async () => {
      const branch = getBranchName("/refs/cake");
      coreDebugLogMock.mockReset();

      let parsedRef!: string;
      vi.spyOn(mockOctokit.rest.actions, "listWorkflowRuns").mockImplementation(
        (req: any) => {
          parsedRef = req.branch;
          const mockResponse: MockResponse = {
            data: {
              total_count: 0,
              workflow_runs: [],
            },
            status: 200,
          };
          return Promise.resolve(mockResponse);
        },
      );

      // Behaviour
      await expect(getWorkflowRunIds(0, branch)).resolves.not.toThrow();
      expect(parsedRef).toBeUndefined();

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledTimes(1);
      expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `
        "Fetched Workflow Runs:
          Repository: owner/repository
          Branch Filter: false (/refs/cake)
          Workflow ID: 0
          Runs Fetched: []"
      `,
      );
    });
  });

  describe("getWorkflowRunJobSteps", () => {
    it("should get the step names for a given Workflow Run ID", async () => {
      const mockData = {
        total_count: 1,
        jobs: [
          {
            id: 0,
            steps: [
              {
                name: "Test Step 1",
                number: 1,
              },
              {
                name: "Test Step 2",
                number: 2,
              },
            ],
          },
        ],
      };
      vi.spyOn(
        mockOctokit.rest.actions,
        "listJobsForWorkflowRun",
      ).mockReturnValue(
        Promise.resolve({
          data: mockData,
          status: 200,
        }),
      );

      // Behaviour
      await expect(getWorkflowRunJobSteps(0)).resolves.toStrictEqual([
        "Test Step 1",
        "Test Step 2",
      ]);

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledTimes(1);
      expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `
        "Fetched Workflow Run Job Steps:
          Repository: owner/repo
          Workflow Run ID: 0
          Jobs Fetched: [0]
          Steps Fetched: [Test Step 1, Test Step 2]"
      `,
      );
    });

    it("should throw if a non-200 status is returned", async () => {
      const errorStatus = 401;
      vi.spyOn(
        mockOctokit.rest.actions,
        "listJobsForWorkflowRun",
      ).mockReturnValue(
        Promise.resolve({
          data: undefined,
          status: errorStatus,
        }),
      );

      // Behaviour
      await expect(getWorkflowRunJobSteps(0)).rejects.toThrow(
        `Failed to get Workflow Run Jobs, expected 200 but received ${errorStatus}`,
      );

      // Logging
      assertOnlyCalled(coreErrorLogMock, coreDebugLogMock);
      expect(coreErrorLogMock).toHaveBeenCalledTimes(1);
      expect(coreErrorLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `"getWorkflowRunJobSteps: An unexpected error has occurred: Failed to get Workflow Run Jobs, expected 200 but received 401"`,
      );
    });

    it("should return an empty array if there are no steps", async () => {
      const mockData = {
        total_count: 1,
        jobs: [
          {
            id: 0,
            steps: undefined,
          },
        ],
      };
      vi.spyOn(
        mockOctokit.rest.actions,
        "listJobsForWorkflowRun",
      ).mockReturnValue(
        Promise.resolve({
          data: mockData,
          status: 200,
        }),
      );

      // Behaviour
      await expect(getWorkflowRunJobSteps(0)).resolves.toStrictEqual([]);

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledTimes(1);
      expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `
        "Fetched Workflow Run Job Steps:
          Repository: owner/repo
          Workflow Run ID: 0
          Jobs Fetched: [0]
          Steps Fetched: []"
      `,
      );
    });
  });

  describe("fetchWorkflowRunUrl", () => {
    it("should return the workflow run state for a given run ID", async () => {
      const mockData = {
        html_url: "master sword",
      };
      vi.spyOn(mockOctokit.rest.actions, "getWorkflowRun").mockReturnValue(
        Promise.resolve({
          data: mockData,
          status: 200,
        }),
      );

      const url = await fetchWorkflowRunUrl(123456);
      expect(url).toStrictEqual(mockData.html_url);
    });

    it("should throw if a non-200 status is returned", async () => {
      const errorStatus = 401;
      vi.spyOn(mockOctokit.rest.actions, "getWorkflowRun").mockReturnValue(
        Promise.resolve({
          data: undefined,
          status: errorStatus,
        }),
      );

      // Behaviour
      await expect(fetchWorkflowRunUrl(0)).rejects.toThrow(
        `Failed to get Workflow Run state, expected 200 but received ${errorStatus}`,
      );

      // Logging
      assertOnlyCalled(coreErrorLogMock, coreDebugLogMock);
      expect(coreErrorLogMock).toHaveBeenCalledTimes(1);
      expect(coreErrorLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `"fetchWorkflowRunUrl: An unexpected error has occurred: Failed to get Workflow Run state, expected 200 but received 401"`,
      );
    });
  });

  describe("retryOrTimeout", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should return a result", async () => {
      const attemptResult = [0];
      const attempt = () => Promise.resolve(attemptResult);

      const result = await retryOrTimeout(attempt, 1000);
      if (result.timeout) {
        expect.fail("expected retryOrTimeout not to timeout");
      }

      expect(result.timeout).toStrictEqual(false);
      expect(result.value).toStrictEqual(attemptResult);
    });

    it("should return a timeout result if the given timeout is exceeded", async () => {
      // Never return data.
      const attempt = () => Promise.resolve([]);

      const retryOrTimeoutPromise = retryOrTimeout(attempt, 1000);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      vi.advanceTimersByTimeAsync(2000);

      const result = await retryOrTimeoutPromise;
      if (!result.timeout) {
        expect.fail("expected retryOrTimeout to timeout");
      }

      expect(result.timeout).toStrictEqual(true);
    });

    it("should retry to get a populated array", async () => {
      const attemptResult = [0];
      const attempt = vi
        .fn()
        .mockResolvedValue(attemptResult)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const retryOrDiePromise = retryOrTimeout(attempt, 5000);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      vi.advanceTimersByTimeAsync(3000);

      const result = await retryOrDiePromise;
      if (result.timeout) {
        expect.fail("expected retryOrTimeout not to timeout");
      }

      expect(result.timeout).toStrictEqual(false);
      expect(result.value).toStrictEqual(attemptResult);
      expect(attempt).toHaveBeenCalledTimes(3);
    });
  });
});
