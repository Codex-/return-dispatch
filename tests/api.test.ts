import * as fs from "fs";
import * as path from "path";
import * as core from "@actions/core";
import * as github from "@actions/github";
import { v4 as uuid } from "uuid";

import {
  dispatchWorkflow,
  getWorkflowId,
  getWorkflowRunIds,
  getWorkflowRunLogs,
  init,
  retryOrDie,
} from "../src/api";

interface MockResponse {
  data: any;
  status: number;
}

const mockOctokit = {
  rest: {
    actions: {
      createWorkflowDispatch: async (_req?: any): Promise<MockResponse> => {
        throw new Error("Should be mocked");
      },
      listRepoWorkflows: async (_req?: any): Promise<MockResponse> => {
        throw new Error("Should be mocked");
      },
      listWorkflowRuns: async (_req?: any): Promise<MockResponse> => {
        throw new Error("Should be mocked");
      },
      downloadWorkflowRunLogs: async (_req?: any): Promise<MockResponse> => {
        throw new Error("Should be mocked");
      },
    },
  },
};

describe("API", () => {
  beforeEach(() => {
    jest.spyOn(core, "getInput").mockReturnValue("");
    jest.spyOn(github, "getOctokit").mockReturnValue(mockOctokit as any);
    init();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("dispatchWorkflow", () => {
    it("should resolve after a successful dispatch", async () => {
      jest
        .spyOn(mockOctokit.rest.actions, "createWorkflowDispatch")
        .mockReturnValue(
          Promise.resolve({
            data: undefined,
            status: 204,
          })
        );

      await dispatchWorkflow("");
    });

    it("should throw if a non-204 status is returned", async () => {
      const errorStatus = 401;
      jest
        .spyOn(mockOctokit.rest.actions, "createWorkflowDispatch")
        .mockReturnValue(
          Promise.resolve({
            data: undefined,
            status: errorStatus,
          })
        );

      await expect(dispatchWorkflow("")).rejects.toThrow(
        `Failed to dispatch action, expected 204 but received ${errorStatus}`
      );
    });

    it("should dispatch with a distinctId in the inputs", async () => {
      const distinctId = uuid();
      let dispatchedId: string | undefined;
      jest
        .spyOn(mockOctokit.rest.actions, "createWorkflowDispatch")
        .mockImplementation(async (req?: any) => {
          dispatchedId = req.inputs.distinct_id;

          return {
            data: undefined,
            status: 204,
          };
        });

      await dispatchWorkflow(distinctId);
      expect(dispatchedId).toStrictEqual(distinctId);
    });
  });

  describe("getWorkflowId", () => {
    it("should return the workflow ID for a given workflow filename", async () => {
      const mockData = {
        total_count: 3,
        workflows: [
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
        ],
      };
      jest.spyOn(mockOctokit.rest.actions, "listRepoWorkflows").mockReturnValue(
        Promise.resolve({
          data: mockData,
          status: 200,
        })
      );

      expect(await getWorkflowId("slice.yml")).toStrictEqual(
        mockData.workflows[2].id
      );
    });

    it("should throw if a non-200 status is returned", async () => {
      const errorStatus = 401;
      jest.spyOn(mockOctokit.rest.actions, "listRepoWorkflows").mockReturnValue(
        Promise.resolve({
          data: undefined,
          status: errorStatus,
        })
      );

      await expect(getWorkflowId("implode")).rejects.toThrow(
        `Failed to get workflows, expected 200 but received ${errorStatus}`
      );
    });

    it("should throw if a given workflow name cannot be found in the response", async () => {
      const workflowName = "slice";
      jest.spyOn(mockOctokit.rest.actions, "listRepoWorkflows").mockReturnValue(
        Promise.resolve({
          data: {
            total_count: 0,
            workflows: [],
          },
          status: 200,
        })
      );

      await expect(getWorkflowId(workflowName)).rejects.toThrow(
        `Unable to find ID for Workflow: ${workflowName}`
      );
    });
  });

  describe("getWorkflowRunIds", () => {
    const workflowIdCfg = {
      token: "secret",
      ref: "feature_branch",
      repo: "repository",
      owner: "owner",
      workflow: "workflow_name",
      workflowInputs: {},
      workflowTimeoutSeconds: 60,
    };

    beforeEach(() => {
      init(workflowIdCfg);
    });

    it("should get the run IDs for a given workflow ID", async () => {
      const mockData = {
        total_count: 3,
        workflow_runs: [{ id: 0 }, { id: 1 }, { id: 2 }],
      };
      jest.spyOn(mockOctokit.rest.actions, "listWorkflowRuns").mockReturnValue(
        Promise.resolve({
          data: mockData,
          status: 200,
        })
      );

      expect(await getWorkflowRunIds(0)).toStrictEqual(
        mockData.workflow_runs.map((run) => run.id)
      );
    });

    it("should throw if a non-200 status is returned", async () => {
      const errorStatus = 401;
      jest.spyOn(mockOctokit.rest.actions, "listWorkflowRuns").mockReturnValue(
        Promise.resolve({
          data: undefined,
          status: errorStatus,
        })
      );

      await expect(getWorkflowRunIds(0)).rejects.toThrow(
        `Failed to get Workflow runs, expected 200 but received ${errorStatus}`
      );
    });

    it("should return an empty array if there are no runs", async () => {
      const mockData = {
        total_count: 0,
        workflow_runs: [],
      };
      jest.spyOn(mockOctokit.rest.actions, "listWorkflowRuns").mockReturnValue(
        Promise.resolve({
          data: mockData,
          status: 200,
        })
      );

      expect(await getWorkflowRunIds(0)).toStrictEqual([]);
    });

    it("should filter by branch name", async () => {
      workflowIdCfg.ref = "/refs/heads/master";
      let parsedRef!: string;
      jest
        .spyOn(mockOctokit.rest.actions, "listWorkflowRuns")
        .mockImplementation(async (req: any) => {
          parsedRef = req.branch;
          const mockResponse: MockResponse = {
            data: {
              total_count: 0,
              workflow_runs: [],
            },
            status: 200,
          };
          return mockResponse;
        });

      await getWorkflowRunIds(0);
      expect(parsedRef).toStrictEqual("master");
    });

    it("should not use a branch filter if using a tag ref", async () => {
      workflowIdCfg.ref = "/refs/tags/1.5.0";
      let parsedRef!: string;
      jest
        .spyOn(mockOctokit.rest.actions, "listWorkflowRuns")
        .mockImplementation(async (req: any) => {
          parsedRef = req.branch;
          const mockResponse: MockResponse = {
            data: {
              total_count: 0,
              workflow_runs: [],
            },
            status: 200,
          };
          return mockResponse;
        });

      await getWorkflowRunIds(0);
      expect(parsedRef).toBeUndefined();
    });

    it("should not use a branch filter if non-standard ref", async () => {
      workflowIdCfg.ref = "/refs/cake";
      let parsedRef!: string;
      jest
        .spyOn(mockOctokit.rest.actions, "listWorkflowRuns")
        .mockImplementation(async (req: any) => {
          parsedRef = req.branch;
          const mockResponse: MockResponse = {
            data: {
              total_count: 0,
              workflow_runs: [],
            },
            status: 200,
          };
          return mockResponse;
        });

      await getWorkflowRunIds(0);
      expect(parsedRef).toBeUndefined();
    });
  });

  describe("getWorkflowRunLogs", () => {
    const zipPath = path.join(__dirname, "static", "logs.zip");
    let zipData: ArrayBuffer;

    beforeAll(() => {
      const zipBuffer = fs.readFileSync(zipPath);

      // Octokit returns an ArrayBuffer
      zipData = zipBuffer.buffer.slice(
        zipBuffer.byteOffset,
        zipBuffer.byteOffset + zipBuffer.byteLength
      );
    });

    it("should return the data as a raw string", async () => {
      jest
        .spyOn(mockOctokit.rest.actions, "downloadWorkflowRunLogs")
        .mockReturnValue(
          Promise.resolve({
            data: zipData,
            /**
             * Documentation states that this should be 302 but
             * I only got 200 when testing against the live API.
             */
            status: 200,
          })
        );

      const zipBuffer = await getWorkflowRunLogs(0);
      expect(zipBuffer.byteLength).toStrictEqual(zipData.byteLength);
      /**
       * Because one is of type Buffer and the other ArrayBuffer,
       * create primitive collections of their data.
       */
      expect(new Uint8Array(zipBuffer)).toEqual(new Uint8Array(zipData));
    });
  });

  describe("retryOrDie", () => {
    it("should return a populated array", async () => {
      const attempt = async () => {
        return [0];
      };

      expect(await retryOrDie(attempt, 1000)).toHaveLength(1);
    });

    it("should throw if the given timeout is exceeded", async () => {
      // Never return data.
      const attempt = async () => [];

      await expect(retryOrDie(attempt, 1000)).rejects.toThrow(
        "Timed out while attempting to fetch data"
      );
    });

    it("should retry to get a populated array", async () => {
      let attemptNo = 0;
      const attempt = async () => {
        switch (attemptNo) {
          case 0:
            attemptNo++;
            return [];
          case 1:
            attemptNo++;
            return [];
        }

        return [0];
      };

      expect(await retryOrDie(attempt, 1500)).toHaveLength(1);
    });
  });
});
