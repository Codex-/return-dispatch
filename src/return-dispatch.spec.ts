import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

import type { ActionConfig } from "./action.ts";
import * as api from "./api.ts";
import * as constants from "./constants.ts";
import { getWorkflowId, shouldRetryOrThrow } from "./return-dispatch.ts";
import { mockLoggingFunctions } from "./test-utils/logging.mock.ts";

vi.mock("@actions/core");
vi.mock("./api.ts");
vi.mock("./constants.ts");

describe("return-dispatch", () => {
  const {
    coreDebugLogMock,
    coreInfoLogMock,
    coreErrorLogMock,
    assertOnlyCalled,
    assertNoneCalled,
  } = mockLoggingFunctions();

  afterAll(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("fetchWorkflowId", () => {
    let fetchWorkflowIdMock: MockInstance<(typeof api)["fetchWorkflowId"]>;

    beforeAll(() => {
      fetchWorkflowIdMock = vi.spyOn(api, "fetchWorkflowId");
    });

    it("should return the workflow ID without calling the API if given a number", async () => {
      const workflowId = await getWorkflowId({ workflow: 123 } as ActionConfig);

      // Behaviour
      expect(workflowId).toStrictEqual(123);
      expect(fetchWorkflowIdMock).not.toHaveBeenCalled();

      // Logging
      assertNoneCalled();
    });

    it("should return the workflow ID from API if given a string", async () => {
      fetchWorkflowIdMock.mockImplementationOnce(() => Promise.resolve(123));
      const workflowId = await getWorkflowId({
        workflow: "hello.yml",
      } as ActionConfig);

      // Behaviour
      expect(workflowId).toStrictEqual(123);
      expect(fetchWorkflowIdMock).toHaveBeenCalled();

      // Logging
      assertOnlyCalled(coreInfoLogMock);
      expect(coreInfoLogMock).toHaveBeenCalledTimes(2);
      expect(coreInfoLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `"Fetching Workflow ID for hello.yml..."`,
      );
      expect(coreInfoLogMock.mock.calls[1]?.[0]).toMatchInlineSnapshot(
        `"Fetched Workflow ID: 123"`,
      );
    });

    it("should throw if any API error occurs", async () => {
      fetchWorkflowIdMock.mockImplementationOnce(() =>
        Promise.reject(new Error()),
      );
      const workflowIdPromise = getWorkflowId({
        workflow: "hello.yml",
      } as ActionConfig);

      // Behaviour
      await expect(workflowIdPromise).rejects.toThrowError();

      // Logging
      assertOnlyCalled(coreInfoLogMock);
      expect(coreInfoLogMock).toHaveBeenCalledOnce();
      expect(coreInfoLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `"Fetching Workflow ID for hello.yml..."`,
      );
    });
  });

  describe("shouldRetryOrThrow", () => {
    beforeEach(() => {
      vi.spyOn(
        constants,
        "WORKFLOW_JOB_STEPS_SERVER_ERROR_RETRY_MAX",
        "get",
      ).mockReturnValue(3);
    });

    it('should retry on "Server error" and max attempts not exceeded', () => {
      const testErr = new Error("Server Error");

      // Behaviour
      expect(shouldRetryOrThrow(testErr, 0)).toStrictEqual(true);

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledTimes(1);
      expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `"Encountered a Server Error while attempting to fetch steps, retrying in 500ms"`,
      );
    });

    it('should retry on "Server error" and max attempts not exceeded', () => {
      const testErr = new Error("Server Error");

      // Behaviour
      expect(shouldRetryOrThrow(testErr, 5)).toStrictEqual(false);

      // Logging
      assertNoneCalled();
    });

    it('should log on "Not Found"', () => {
      const testErr = new Error("Not Found");

      // Behaviour
      expect(shouldRetryOrThrow(testErr, 0)).toStrictEqual(false);

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledTimes(1);
      expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `"Could not identify ID in run, continuing..."`,
      );
    });

    it("re-throw on unhandled error", () => {
      const testErr = new Error("Unhandled Error");

      // Behaviour
      expect(() => shouldRetryOrThrow(testErr, 0)).toThrow(testErr);

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledTimes(1);
      expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `"Unhandled error has occurred: Unhandled Error"`,
      );
    });
  });
});
