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
  getWorkflowId,
  handleActionFail,
  handleActionSuccess,
  shouldRetryOrThrow,
} from "./return-dispatch.ts";
import { mockLoggingFunctions } from "./test-utils/logging.mock.ts";

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
      typeof api.getWorkflowRunJobSteps
    >;
    let fetchWorkflowRunUrlMock: MockInstance<typeof api.fetchWorkflowRunUrl>;

    beforeEach(() => {
      getWorkflowRunJobStepMock = vi.spyOn(api, "getWorkflowRunJobSteps");
      fetchWorkflowRunUrlMock = vi.spyOn(api, "fetchWorkflowRunUrl");
    });

    it("should return a not found result if there is nothing to iterate on", async () => {
      const result = await attemptToFindRunId(new RegExp(testId), []);
      if (result.success) {
        throw new Error("Failed, result found when none expected");
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
        throw new Error("Failed, result found when none expected");
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
        throw new Error("Failed, result not found when expected");
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
        throw new Error("Failed, result not found when expected");
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
        throw new Error("Failed, result not found when expected");
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
          throw new Error("Failed, result found when none expected");
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
    let setFailedSpy: MockInstance<(typeof core)["setFailed"]>;
    let setOutputSpy: MockInstance<(typeof core)["setOutput"]>;

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
  });
});
