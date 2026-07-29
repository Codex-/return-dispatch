import * as core from "@actions/core";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

import * as action from "./action.ts";
import * as api from "./api.ts";
import { main } from "./main.ts";
import { mockLoggingFunctions } from "./test-utils/logging.mock.ts";

vi.mock("@actions/core");
vi.mock("./action.ts");
vi.mock("./api.ts");

describe("main", () => {
  const { coreDebugLogMock, coreErrorLogMock, assertOnlyCalled } =
    mockLoggingFunctions();
  const testCfg: action.ActionConfig = {
    ref: "test-ref",
    workflow: "test-workflow",
  } satisfies Partial<action.ActionConfig> as action.ActionConfig;

  // Core
  let coreSetFailedMock: MockInstance<typeof core.setFailed>;
  let coreSetOutputMock: MockInstance<typeof core.setOutput>;

  // Action
  let actionGetConfigMock: MockInstance<typeof action.getConfig>;

  // API
  let apiDispatchWorkflowMock: MockInstance<typeof api.dispatchWorkflow>;
  let apiInitMock: MockInstance<typeof api.init>;

  afterAll(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.useFakeTimers();

    coreSetFailedMock = vi.spyOn(core, "setFailed");
    coreSetOutputMock = vi.spyOn(core, "setOutput");

    actionGetConfigMock = vi
      .spyOn(action, "getConfig")
      .mockReturnValue(testCfg);

    apiDispatchWorkflowMock = vi.spyOn(api, "dispatchWorkflow");
    apiInitMock = vi.spyOn(api, "init");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("should output the run ID and URL returned by the dispatch", async () => {
    apiDispatchWorkflowMock.mockResolvedValue({ id: 123, url: "test-url" });

    await main();

    // Behaviour
    expect(actionGetConfigMock).toHaveBeenCalledOnce();
    expect(apiInitMock).toHaveBeenCalledOnce();
    expect(apiInitMock).toHaveBeenCalledWith(testCfg);

    expect(apiDispatchWorkflowMock).toHaveBeenCalledOnce();

    // Result
    expect(coreSetFailedMock).not.toHaveBeenCalled();
    expect(coreSetOutputMock).toHaveBeenCalledTimes(2);
    expect(coreSetOutputMock).toHaveBeenCalledWith(
      action.ActionOutputs.runId,
      123,
    );
    expect(coreSetOutputMock).toHaveBeenCalledWith(
      action.ActionOutputs.runUrl,
      "test-url",
    );

    // Logging
    assertOnlyCalled(coreDebugLogMock);
    expect(coreDebugLogMock).toHaveBeenCalledOnce();
    expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
      `"Completed (0ms)"`,
    );
  });

  it("should fail without setting outputs if the dispatch throws", async () => {
    const testError = new Error("dispatch failed");
    apiDispatchWorkflowMock.mockRejectedValue(testError);

    await main();

    // Behaviour
    expect(apiDispatchWorkflowMock).toHaveBeenCalledOnce();
    expect(coreSetOutputMock).not.toHaveBeenCalled();

    expect(coreSetFailedMock).toHaveBeenCalledOnce();
    expect(coreSetFailedMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
      `"Failed: An unhandled error has occurred: dispatch failed"`,
    );

    // Logging
    assertOnlyCalled(coreDebugLogMock, coreErrorLogMock);
    expect(coreErrorLogMock).toHaveBeenCalledOnce();
    expect(coreDebugLogMock.mock.calls[0]?.[0]).toStrictEqual(testError.stack);
  });

  it("should fail for an unhandled error", async () => {
    const testError = new Error("test error");
    actionGetConfigMock.mockImplementation(() => {
      throw testError;
    });

    await main();

    // Behaviour
    expect(actionGetConfigMock).toHaveBeenCalledOnce();

    expect(apiInitMock).not.toHaveBeenCalled();
    expect(apiDispatchWorkflowMock).not.toHaveBeenCalled();
    expect(coreSetOutputMock).not.toHaveBeenCalled();

    expect(coreSetFailedMock).toHaveBeenCalledOnce();
    expect(coreSetFailedMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
      `"Failed: An unhandled error has occurred: test error"`,
    );

    // Logging
    assertOnlyCalled(coreDebugLogMock, coreErrorLogMock);
    expect(coreErrorLogMock).toHaveBeenCalledOnce();
    expect(coreErrorLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
      `"Failed: An unhandled error has occurred: test error"`,
    );
    expect(coreDebugLogMock).toHaveBeenCalledOnce();
    expect(coreDebugLogMock.mock.calls[0]?.[0]).toStrictEqual(testError.stack);
  });

  it("should fail for an unhandled unknown", async () => {
    const testError = "some other error";
    actionGetConfigMock.mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw testError;
    });

    await main();

    // Behaviour
    expect(actionGetConfigMock).toHaveBeenCalledOnce();

    expect(apiInitMock).not.toHaveBeenCalled();
    expect(apiDispatchWorkflowMock).not.toHaveBeenCalled();
    expect(coreSetOutputMock).not.toHaveBeenCalled();

    expect(coreSetFailedMock).toHaveBeenCalledOnce();
    expect(coreSetFailedMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
      `"Failed: An unknown error has occurred: some other error"`,
    );

    // Logging
    assertOnlyCalled(coreDebugLogMock, coreErrorLogMock);
    expect(coreErrorLogMock).toHaveBeenCalledOnce();
    expect(coreErrorLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
      `"Failed: An unknown error has occurred: some other error"`,
    );
    expect(coreDebugLogMock).toHaveBeenCalledOnce();
    expect(coreDebugLogMock.mock.calls[0]?.[0]).toStrictEqual(testError);
  });
});
