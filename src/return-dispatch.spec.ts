import * as core from "@actions/core";
import { v4 as uuid } from "uuid";
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

import { ActionOutputs } from "./action.ts";
import * as api from "./api.ts";
import * as constants from "./constants.ts";
import {
  attemptToFindRunId,
  getRunIdAndUrl,
  getWorkflowId,
  handleActionFail,
  handleActionSuccess,
  shouldRetryOrThrow,
  type GetRunIdAndUrlOpts,
} from "./return-dispatch.ts";
import { mockLoggingFunctions } from "./test-utils/logging.mock.ts";
import * as utils from "./utils.ts";

vi.mock("@actions/core");
vi.mock("./api.ts");

describe("return-dispatch", () => {
  const {
    coreDebugLogMock,
    coreErrorLogMock,
    coreInfoLogMock,
    assertOnlyCalled,
    assertNoneCalled,
  } = mockLoggingFunctions();

  function resetLogMocks(): void {
    for (const logMock of [
      coreDebugLogMock,
      coreInfoLogMock,
      coreErrorLogMock,
    ]) {
      logMock.mockReset();
    }
  }

  afterAll(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("fetchWorkflowId", () => {
    let fetchWorkflowIdMock: MockInstance<typeof api.fetchWorkflowId>;

    beforeAll(() => {
      fetchWorkflowIdMock = vi.spyOn(api, "fetchWorkflowId");
    });

    it("should return the workflow ID without calling the API if given a number", async () => {
      const workflowId = await getWorkflowId(123);

      // Behaviour
      expect(workflowId).toStrictEqual(123);
      expect(fetchWorkflowIdMock).not.toHaveBeenCalled();

      // Logging
      assertNoneCalled();
    });

    it("should return the workflow ID from API if given a string", async () => {
      fetchWorkflowIdMock.mockImplementationOnce(() => Promise.resolve(123));
      const workflowId = await getWorkflowId("hello.yml");

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
      const workflowIdPromise = getWorkflowId("hello.yml");

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
      expect(coreDebugLogMock).toHaveBeenCalledOnce();
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
      expect(coreDebugLogMock).toHaveBeenCalledOnce();
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
      expect(coreDebugLogMock).toHaveBeenCalledOnce();
      expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `"Unhandled error has occurred: Unhandled Error"`,
      );
    });
  });

  describe("attemptToFindRunId", () => {
    const testId = uuid();

    let getWorkflowRunJobStepMock: MockInstance<
      typeof api.fetchWorkflowRunJobSteps
    >;
    let fetchWorkflowRunUrlMock: MockInstance<typeof api.fetchWorkflowRunUrl>;

    beforeEach(() => {
      getWorkflowRunJobStepMock = vi.spyOn(api, "fetchWorkflowRunJobSteps");
      fetchWorkflowRunUrlMock = vi.spyOn(api, "fetchWorkflowRunUrl");
    });

    it("should return a not found result if there is nothing to iterate on", async () => {
      const result = await attemptToFindRunId(new RegExp(testId), []);
      if (result.success) {
        expect.fail("result found when none expected");
      }

      // Behaviour
      expect(result.success).toStrictEqual(false);
      expect(getWorkflowRunJobStepMock).not.toHaveBeenCalled();
      expect(fetchWorkflowRunUrlMock).not.toHaveBeenCalled();

      // Logging
      assertNoneCalled();
    });

    it("should return a not found result if there is only undefined to iterate on", async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const result = await attemptToFindRunId(new RegExp(testId), [
        undefined as any,
      ]);
      if (result.success) {
        expect.fail("result found when none expected");
      }

      // Behaviour
      expect(result.success).toStrictEqual(false);
      expect(getWorkflowRunJobStepMock).not.toHaveBeenCalled();
      expect(fetchWorkflowRunUrlMock).not.toHaveBeenCalled();

      // Logging
      assertNoneCalled();
    });

    it("finds the ID on the first iteration", async () => {
      getWorkflowRunJobStepMock.mockResolvedValueOnce([testId]);
      fetchWorkflowRunUrlMock.mockResolvedValue("test-url");

      const result = await attemptToFindRunId(new RegExp(testId), [0]);
      if (!result.success) {
        expect.fail("result not found when expected");
      }

      // Behaviour
      expect(result.success).toStrictEqual(true);
      expect(result.value.id).toStrictEqual(0);
      expect(result.value.url).toStrictEqual("test-url");
      expect(getWorkflowRunJobStepMock).toHaveBeenCalledOnce();
      expect(fetchWorkflowRunUrlMock).toHaveBeenCalledOnce();

      // Logging
      assertNoneCalled();
    });

    it("finds the ID on the second iteration", async () => {
      getWorkflowRunJobStepMock
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([testId]);
      fetchWorkflowRunUrlMock.mockResolvedValue("test-url");

      const result = await attemptToFindRunId(new RegExp(testId), [0, 0]);
      if (!result.success) {
        expect.fail("result not found when expected");
      }

      // Behaviour
      expect(result.success).toStrictEqual(true);
      expect(result.value.id).toStrictEqual(0);
      expect(result.value.url).toStrictEqual("test-url");
      expect(getWorkflowRunJobStepMock).toHaveBeenCalledTimes(2);
      expect(fetchWorkflowRunUrlMock).toHaveBeenCalledOnce();

      // Logging
      assertNoneCalled();
    });

    it("finds the ID among many steps", async () => {
      getWorkflowRunJobStepMock.mockResolvedValueOnce([
        "first",
        "second",
        "third",
        testId,
      ]);
      fetchWorkflowRunUrlMock.mockResolvedValue("test-url");

      const result = await attemptToFindRunId(new RegExp(testId), [0]);
      if (!result.success) {
        expect.fail("result not found when expected");
      }

      // Behaviour
      expect(result.success).toStrictEqual(true);
      expect(result.value.id).toStrictEqual(0);
      expect(result.value.url).toStrictEqual("test-url");
      expect(getWorkflowRunJobStepMock).toHaveBeenCalledOnce();
      expect(fetchWorkflowRunUrlMock).toHaveBeenCalledOnce();

      // Logging
      assertNoneCalled();
    });

    it("does nothing if called with an empty array", async () => {
      const result = await attemptToFindRunId(new RegExp(testId), []);
      if (result.success) {
        expect.fail("result found when none expected");
      }

      // Behaviour
      expect(result.success).toStrictEqual(false);
      expect(result.reason).toStrictEqual("invalid input");
      expect(getWorkflowRunJobStepMock).not.toHaveBeenCalled();
      expect(fetchWorkflowRunUrlMock).not.toHaveBeenCalled();

      // Logging
      assertNoneCalled();
    });

    describe("server error retries", () => {
      beforeEach(() => {
        vi.spyOn(
          constants,
          "WORKFLOW_JOB_STEPS_SERVER_ERROR_RETRY_MAX",
          "get",
        ).mockReturnValue(3);
        vi.spyOn(
          constants,
          "WORKFLOW_JOB_STEPS_SERVER_ERROR_RETRY_MS",
          "get",
        ).mockReturnValue(500);

        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it("fails on exceeded server errors", async () => {
        vi.spyOn(
          constants,
          "WORKFLOW_JOB_STEPS_SERVER_ERROR_RETRY_MAX",
          "get",
        ).mockReturnValue(3);
        vi.spyOn(
          constants,
          "WORKFLOW_JOB_STEPS_SERVER_ERROR_RETRY_MS",
          "get",
        ).mockReturnValue(500);

        getWorkflowRunJobStepMock.mockRejectedValue(new Error("Server Error"));

        const attemptToFindRunIdPromise = attemptToFindRunId(
          new RegExp(testId),
          [0],
        );

        // Advance past the sleeps
        await vi.runAllTimersAsync();

        const result = await attemptToFindRunIdPromise;
        if (result.success) {
          expect.fail("result found when none expected");
        }

        // Behaviour
        expect(result.success).toStrictEqual(false);
        expect(getWorkflowRunJobStepMock).toHaveBeenCalledTimes(4); // initial + retries
        expect(fetchWorkflowRunUrlMock).not.toHaveBeenCalled();

        // Logging
        assertOnlyCalled(coreDebugLogMock);
        expect(coreDebugLogMock).toHaveBeenCalledTimes(3);
        const debugLineSnapshot = `"Encountered a Server Error while attempting to fetch steps, retrying in 500ms"`;
        expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
          debugLineSnapshot,
        );
        expect(coreDebugLogMock.mock.calls[1]?.[0]).toMatchInlineSnapshot(
          debugLineSnapshot,
        );
        expect(coreDebugLogMock.mock.calls[2]?.[0]).toMatchInlineSnapshot(
          debugLineSnapshot,
        );
      });
    });

    it("should throw an unhandled error", async () => {
      const unhandledError = new Error("Unhandled Error");
      getWorkflowRunJobStepMock.mockRejectedValue(unhandledError);

      await expect(() =>
        attemptToFindRunId(new RegExp(testId), [0]),
      ).rejects.toThrowError(unhandledError);

      // Behaviour
      expect(getWorkflowRunJobStepMock).toHaveBeenCalledOnce();
      expect(fetchWorkflowRunUrlMock).not.toHaveBeenCalled();

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledOnce();
      expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `"Unhandled error has occurred: Unhandled Error"`,
      );
    });

    it("should throw a non-error", async () => {
      const thrownValue = "thrown";
      getWorkflowRunJobStepMock.mockRejectedValue(thrownValue);

      await expect(() =>
        attemptToFindRunId(new RegExp(testId), [0]),
      ).rejects.toThrow(thrownValue);

      // Behaviour
      expect(getWorkflowRunJobStepMock).toHaveBeenCalledOnce();
      expect(fetchWorkflowRunUrlMock).not.toHaveBeenCalled();

      // Logging
      assertNoneCalled();
    });
  });

  describe("handleAction", () => {
    let setFailedSpy: MockInstance<typeof core.setFailed>;
    let setOutputSpy: MockInstance<typeof core.setOutput>;

    beforeEach(() => {
      setFailedSpy = vi.spyOn(core, "setFailed");
      setOutputSpy = vi.spyOn(core, "setOutput");
    });

    describe("handleActionSuccess", () => {
      it("should set the action output and status", () => {
        handleActionSuccess(0, "test-url");

        // Behaviour
        expect(setFailedSpy).not.toHaveBeenCalled();
        expect(setOutputSpy).toHaveBeenCalledTimes(2);
        expect(setOutputSpy.mock.calls[0]?.[0]).toStrictEqual(
          ActionOutputs.runId,
        );
        expect(setOutputSpy.mock.calls[0]?.[1]).toStrictEqual(0);
        expect(setOutputSpy.mock.calls[1]?.[0]).toStrictEqual(
          ActionOutputs.runUrl,
        );
        expect(setOutputSpy.mock.calls[1]?.[1]).toStrictEqual("test-url");

        // Logging
        assertOnlyCalled(coreInfoLogMock);
        expect(coreInfoLogMock).toHaveBeenCalledOnce();
        expect(coreInfoLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
          `
        "Successfully identified remote Run:
          Run ID: 0
          URL: test-url"
      `,
        );
      });
    });

    describe("handleActionFail", () => {
      it("should set the action output and status", () => {
        handleActionFail();

        // Behaviour
        expect(setFailedSpy).toHaveBeenCalled();
        expect(setOutputSpy).not.toHaveBeenCalled();

        // Logging
        assertOnlyCalled(coreErrorLogMock);
        expect(coreErrorLogMock).toHaveBeenCalledOnce();
        expect(coreErrorLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
          `"Failed: Timeout exceeded while attempting to get Run ID"`,
        );
      });
    });

    describe("getRunIdAndUrl", () => {
      const distinctId = crypto.randomUUID();
      const distinctIdRegex = new RegExp(distinctId);
      const workflowId = 123;
      const branch: utils.BranchNameResult = Object.freeze({
        isTag: false,
        ref: "/refs/heads/main",
        branchName: "main",
      });
      const defaultOpts: GetRunIdAndUrlOpts = {
        startTime: Date.now(),
        branch: branch,
        distinctIdRegex: distinctIdRegex,
        workflowId: workflowId,
        workflowTimeoutMs: 100,
      };

      let apiFetchWorkflowRunIdsMock: MockInstance<
        typeof api.fetchWorkflowRunIds
      >;
      let apiFetchWorkflowRunJobStepsMock: MockInstance<
        typeof api.fetchWorkflowRunJobSteps
      >;
      let apiFetchWorkflowRunUrlMock: MockInstance<
        typeof api.fetchWorkflowRunUrl
      >;
      let apiRetryOrTimeoutMock: MockInstance<typeof api.retryOrTimeout>;
      let utilSleepMock: MockInstance<typeof utils.sleep>;

      beforeEach(() => {
        vi.useFakeTimers();

        apiFetchWorkflowRunIdsMock = vi.spyOn(api, "fetchWorkflowRunIds");
        apiFetchWorkflowRunJobStepsMock = vi.spyOn(
          api,
          "fetchWorkflowRunJobSteps",
        );
        apiFetchWorkflowRunUrlMock = vi.spyOn(api, "fetchWorkflowRunUrl");
        apiRetryOrTimeoutMock = vi.spyOn(api, "retryOrTimeout");

        utilSleepMock = vi
          .spyOn(utils, "sleep")
          .mockImplementation(
            (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
          );
      });

      afterEach(() => {
        vi.useRealTimers();

        vi.resetAllMocks();
      });

      it("should return the ID when found", async () => {
        const runId = 0;
        const runUrl = "test-url";
        apiRetryOrTimeoutMock.mockResolvedValue({
          success: true,
          value: [runId],
        });
        apiFetchWorkflowRunJobStepsMock.mockResolvedValue([distinctId]);
        apiFetchWorkflowRunUrlMock.mockResolvedValue(runUrl);

        const run = await getRunIdAndUrl({
          ...defaultOpts,
          workflowTimeoutMs: 1000,
        });

        if (!run.success) {
          expect.fail("expected call to succeed");
        }

        // Behaviour
        expect(run.value.id).toStrictEqual(runId);
        expect(run.value.url).toStrictEqual(runUrl);

        expect(apiRetryOrTimeoutMock).toHaveBeenCalledOnce();
        expect(apiFetchWorkflowRunJobStepsMock).toHaveBeenCalledOnce();
        expect(apiFetchWorkflowRunIdsMock).not.toHaveBeenCalled();
        expect(utilSleepMock).not.toHaveBeenCalled();

        // Logging
        assertOnlyCalled(coreDebugLogMock);
        expect(coreDebugLogMock).toHaveBeenCalledOnce();
        expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchSnapshot();
        expect(coreDebugLogMock.mock.calls[1]?.[0]).toMatchSnapshot();
      });

      it("should call retryOrTimeout with the larger WORKFLOW_FETCH_TIMEOUT_MS timeout value", async () => {
        const workflowFetchTimeoutMs = 1000;
        const workflowTimeoutMs = 100;
        apiRetryOrTimeoutMock.mockResolvedValue({
          success: true,
          value: [0],
        });
        apiFetchWorkflowRunJobStepsMock.mockResolvedValue([distinctId]);
        vi.spyOn(constants, "WORKFLOW_FETCH_TIMEOUT_MS", "get").mockReturnValue(
          workflowFetchTimeoutMs,
        );

        await getRunIdAndUrl({
          ...defaultOpts,
          workflowTimeoutMs: workflowTimeoutMs,
        });

        // Behaviour
        expect(apiRetryOrTimeoutMock).toHaveBeenCalledOnce();
        expect(apiRetryOrTimeoutMock.mock.calls[0]?.[1]).toStrictEqual(
          workflowFetchTimeoutMs,
        );
        expect(apiFetchWorkflowRunJobStepsMock).toHaveBeenCalledOnce();
        expect(apiFetchWorkflowRunIdsMock).not.toHaveBeenCalled();
        expect(utilSleepMock).not.toHaveBeenCalled();

        // Logging
        assertOnlyCalled(coreDebugLogMock);
        expect(coreDebugLogMock).toHaveBeenCalledOnce();
        expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
          `"Attempting to get step names for Run IDs: [0]"`,
        );
      });

      it("should call retryOrTimeout with the larger workflowTimeoutMs timeout value", async () => {
        const workflowFetchTimeoutMs = 100;
        const workflowTimeoutMs = 1000;
        apiRetryOrTimeoutMock.mockResolvedValue({
          success: true,
          value: [0],
        });
        apiFetchWorkflowRunJobStepsMock.mockResolvedValue([distinctId]);
        vi.spyOn(constants, "WORKFLOW_FETCH_TIMEOUT_MS", "get").mockReturnValue(
          workflowFetchTimeoutMs,
        );

        await getRunIdAndUrl({
          ...defaultOpts,
          workflowTimeoutMs: workflowTimeoutMs,
        });

        // Behaviour
        expect(apiRetryOrTimeoutMock).toHaveBeenCalledOnce();
        expect(apiRetryOrTimeoutMock.mock.calls[0]?.[1]).toStrictEqual(
          workflowTimeoutMs,
        );
        expect(apiFetchWorkflowRunJobStepsMock).toHaveBeenCalledOnce();
        expect(apiFetchWorkflowRunIdsMock).not.toHaveBeenCalled();
        expect(utilSleepMock).not.toHaveBeenCalled();

        // Logging
        assertOnlyCalled(coreDebugLogMock);
        expect(coreDebugLogMock).toHaveBeenCalledOnce();
        expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchSnapshot();
      });

      it("called fetchWorkflowRunIds with the provided workflowId and branch", async () => {
        apiRetryOrTimeoutMock.mockImplementation(async (retryFunc) => {
          await retryFunc();
          return {
            success: true,
            value: [0],
          };
        });
        apiFetchWorkflowRunJobStepsMock.mockResolvedValue([distinctId]);
        apiFetchWorkflowRunUrlMock.mockResolvedValue("test-url");

        await getRunIdAndUrl(defaultOpts);

        // Behaviour
        expect(apiRetryOrTimeoutMock).toHaveBeenCalledOnce();
        expect(apiFetchWorkflowRunJobStepsMock).toHaveBeenCalledOnce();

        expect(apiFetchWorkflowRunIdsMock).toHaveBeenCalledOnce();
        expect(apiFetchWorkflowRunIdsMock.mock.lastCall?.[0]).toStrictEqual(
          workflowId,
        );
        expect(apiFetchWorkflowRunIdsMock.mock.lastCall?.[1]).toStrictEqual(
          branch,
        );

        // Logging
        assertOnlyCalled(coreDebugLogMock);
        expect(coreDebugLogMock).toHaveBeenCalledOnce();
        expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchSnapshot();
      });

      it("should retry until an ID is found", async () => {
        const runId = 0;
        const runUrl = "test-url";
        apiRetryOrTimeoutMock
          .mockResolvedValue({
            success: true,
            value: [runId],
          })
          .mockResolvedValueOnce({ success: true, value: [] })
          .mockResolvedValueOnce({ success: true, value: [] });
        apiFetchWorkflowRunJobStepsMock.mockResolvedValue([distinctId]);
        apiFetchWorkflowRunUrlMock.mockResolvedValue(runUrl);
        vi.spyOn(
          constants,
          "WORKFLOW_JOB_STEPS_RETRY_MS",
          "get",
        ).mockReturnValue(5000);

        const getRunIdAndUrlPromise = getRunIdAndUrl({
          ...defaultOpts,
          workflowTimeoutMs: 60 * 60 * 1000,
        });

        // First attempt
        expect(apiRetryOrTimeoutMock).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(1); // deplete queue

        assertOnlyCalled(coreDebugLogMock, coreInfoLogMock);

        expect(coreInfoLogMock).toHaveBeenCalledOnce();
        expect(coreInfoLogMock.mock.calls[0]?.[0]).toMatchSnapshot();

        expect(utilSleepMock).toHaveBeenCalledOnce();
        expect(utilSleepMock).toHaveBeenCalledWith(5000);

        resetLogMocks();
        await vi.advanceTimersByTimeAsync(5000);

        // Second attempt
        expect(apiRetryOrTimeoutMock).toHaveBeenCalledTimes(2);

        assertOnlyCalled(coreInfoLogMock);

        expect(coreInfoLogMock).toHaveBeenCalledOnce();
        expect(coreInfoLogMock.mock.calls[0]?.[0]).toMatchSnapshot();

        expect(utilSleepMock).toHaveBeenCalledTimes(2);
        expect(utilSleepMock).toHaveBeenCalledWith(5000);

        resetLogMocks();
        await vi.advanceTimersByTimeAsync(5000);

        // Third attempt
        expect(apiRetryOrTimeoutMock).toHaveBeenCalledTimes(3);
        expect(apiFetchWorkflowRunJobStepsMock).toHaveBeenCalledOnce();
        expect(apiFetchWorkflowRunUrlMock).toHaveBeenCalledOnce();

        assertOnlyCalled(coreDebugLogMock);

        expect(coreDebugLogMock).toHaveBeenCalledOnce();
        expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchSnapshot();

        expect(utilSleepMock).toHaveBeenCalledTimes(2);
        resetLogMocks();

        // Result
        const run = await getRunIdAndUrlPromise;
        if (!run.success) {
          expect.fail("expected call to succeed");
        }
        expect(run.value.id).toStrictEqual(runId);
        expect(run.value.url).toStrictEqual(runUrl);
        expect(apiRetryOrTimeoutMock).toHaveBeenCalledTimes(3);
        expect(apiFetchWorkflowRunJobStepsMock).toHaveBeenCalledOnce();
        expect(apiFetchWorkflowRunIdsMock).not.toHaveBeenCalled();
        expect(apiFetchWorkflowRunUrlMock).toHaveBeenCalledOnce();
        assertNoneCalled();
      });

      it("should timeout when unable failing to get the run IDs", async () => {
        apiRetryOrTimeoutMock.mockResolvedValue({
          success: false,
          reason: "timeout",
        });

        // Behaviour
        const getRunIdAndUrlPromise = getRunIdAndUrl({
          ...defaultOpts,
        });
        await vi.advanceTimersByTimeAsync(1000);

        const run = await getRunIdAndUrlPromise;

        if (run.success) {
          expect.fail("expected call to fail");
        }

        // Behaviour
        expect(run.reason).toStrictEqual("timeout");

        expect(apiRetryOrTimeoutMock).toHaveBeenCalledOnce();
        expect(apiFetchWorkflowRunJobStepsMock).not.toHaveBeenCalled();
        expect(apiFetchWorkflowRunIdsMock).not.toHaveBeenCalled();
        expect(apiFetchWorkflowRunUrlMock).not.toHaveBeenCalled();
        expect(utilSleepMock).not.toHaveBeenCalled();

        // Logging
        assertOnlyCalled(coreDebugLogMock);
        expect(coreDebugLogMock).toHaveBeenCalledOnce();
        expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatch(
          /Timed out while attempting to fetch Workflow Run IDs, waited [0-9]+ms/,
        );
      });

      it("should timeout when unable to find over time", async () => {
        const runId = 0;
        const runUrl = "test-url";
        apiRetryOrTimeoutMock.mockResolvedValue({
          success: true,
          value: [runId],
        });
        apiFetchWorkflowRunJobStepsMock.mockResolvedValue([]);
        apiFetchWorkflowRunUrlMock.mockResolvedValue(runUrl);
        vi.spyOn(
          constants,
          "WORKFLOW_JOB_STEPS_RETRY_MS",
          "get",
        ).mockReturnValue(5000);

        const getRunIdAndUrlPromise = getRunIdAndUrl({
          ...defaultOpts,
          workflowTimeoutMs: 10 * 1000,
        });

        // First attempt
        expect(apiRetryOrTimeoutMock).toHaveBeenCalledOnce();
        await vi.advanceTimersByTimeAsync(1); // deplete queue
        expect(apiFetchWorkflowRunJobStepsMock).toHaveBeenCalledOnce();
        assertOnlyCalled(coreDebugLogMock, coreInfoLogMock);

        expect(coreInfoLogMock).toHaveBeenCalledOnce();
        expect(coreInfoLogMock.mock.calls[0]?.[0]).toMatchSnapshot();

        expect(coreDebugLogMock).toHaveBeenCalledOnce();
        expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchSnapshot();

        expect(utilSleepMock).toHaveBeenCalledOnce();
        expect(utilSleepMock).toHaveBeenCalledWith(5000);

        resetLogMocks();
        await vi.advanceTimersByTimeAsync(5000);

        // Second attempt
        expect(apiRetryOrTimeoutMock).toHaveBeenCalledTimes(2);
        expect(apiFetchWorkflowRunJobStepsMock).toHaveBeenCalledTimes(2);
        assertOnlyCalled(coreDebugLogMock, coreInfoLogMock);

        expect(coreInfoLogMock).toHaveBeenCalledOnce();
        expect(coreInfoLogMock.mock.calls[0]?.[0]).toMatchSnapshot();

        expect(coreDebugLogMock).toHaveBeenCalledOnce();
        expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchSnapshot();

        expect(utilSleepMock).toHaveBeenCalledTimes(2);
        expect(utilSleepMock).toHaveBeenCalledWith(5000);

        resetLogMocks();
        await vi.advanceTimersByTimeAsync(5000);

        // Timeout attempt
        expect(apiRetryOrTimeoutMock).toHaveBeenCalledTimes(3);
        expect(apiFetchWorkflowRunJobStepsMock).toHaveBeenCalledTimes(3);
        assertOnlyCalled(coreDebugLogMock, coreInfoLogMock);

        expect(coreInfoLogMock).toHaveBeenCalledOnce();
        expect(coreInfoLogMock.mock.calls[0]?.[0]).toMatchSnapshot();

        expect(coreDebugLogMock).toHaveBeenCalledOnce();
        expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchSnapshot();

        expect(utilSleepMock).toHaveBeenCalledTimes(3);
        expect(utilSleepMock).toHaveBeenCalledWith(5000);

        resetLogMocks();
        await vi.advanceTimersByTimeAsync(5000);

        // Result
        const run = await getRunIdAndUrlPromise;
        if (run.success) {
          expect.fail("expected call to fail");
        }
        expect(run.reason).toStrictEqual("timeout");
        expect(apiRetryOrTimeoutMock).toHaveBeenCalledTimes(3);
        expect(apiFetchWorkflowRunJobStepsMock).toHaveBeenCalledTimes(3);
        expect(apiFetchWorkflowRunIdsMock).not.toHaveBeenCalled();
        expect(apiFetchWorkflowRunUrlMock).not.toHaveBeenCalled();
        assertNoneCalled();
      });
    });
  });
});
