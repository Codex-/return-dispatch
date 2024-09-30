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
import * as returnDispatch from "./return-dispatch.ts";
import { mockLoggingFunctions } from "./test-utils/logging.mock.ts";
import * as utils from "./utils.ts";

vi.mock("@actions/core");
vi.mock("./action.ts");
vi.mock("./api.ts");
vi.mock("./return-dispatch.ts");
vi.mock("./utils.ts");

describe("main", () => {
  const {
    coreDebugLogMock,
    coreErrorLogMock,
    coreInfoLogMock,
    assertOnlyCalled,
  } = mockLoggingFunctions();
  const testCfg: action.ActionConfig = {
    distinctId: "test-id",
    ref: "test-ref",
    workflow: "test-workflow",
  } satisfies Partial<action.ActionConfig> as action.ActionConfig;
  const testBranch: utils.BranchNameResult = {
    branchName: "test-branch",
    isTag: false,
    ref: testCfg.ref,
  };

  // Core
  let coreSetFailedMock: MockInstance<(typeof core)["setFailed"]>;

  // Action
  let actionGetConfigMock: MockInstance<(typeof action)["getConfig"]>;

  // API
  let apiDispatchWorkflowMock: MockInstance<(typeof api)["dispatchWorkflow"]>;
  let apiInitMock: MockInstance<(typeof api)["init"]>;

  // Utils
  let utilsGetBranchNameMock: MockInstance<(typeof utils)["getBranchName"]>;
  let utilsLogInfoForBranchNameResult: MockInstance<
    (typeof utils)["logInfoForBranchNameResult"]
  >;

  // Return Dispatch
  let returnDispatchMock: MockInstance<
    (typeof returnDispatch)["returnDispatch"]
  >;
  let returnDispatchGetWorkflowIdMock: MockInstance<
    (typeof returnDispatch)["getWorkflowId"]
  >;
  let returnDispatchHandleFailMock: MockInstance<
    (typeof returnDispatch)["handleActionFail"]
  >;
  let returnDispatchHandleSuccessMock: MockInstance<
    (typeof returnDispatch)["handleActionSuccess"]
  >;

  afterAll(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.useFakeTimers();

    coreSetFailedMock = vi.spyOn(core, "setFailed");

    actionGetConfigMock = vi
      .spyOn(action, "getConfig")
      .mockReturnValue(testCfg);

    apiDispatchWorkflowMock = vi.spyOn(api, "dispatchWorkflow");
    apiInitMock = vi.spyOn(api, "init");

    utilsGetBranchNameMock = vi.spyOn(utils, "getBranchName");
    utilsLogInfoForBranchNameResult = vi.spyOn(
      utils,
      "logInfoForBranchNameResult",
    );

    returnDispatchMock = vi.spyOn(returnDispatch, "returnDispatch");
    returnDispatchGetWorkflowIdMock = vi
      .spyOn(returnDispatch, "getWorkflowId")
      .mockResolvedValue(0);
    returnDispatchHandleFailMock = vi.spyOn(returnDispatch, "handleActionFail");
    returnDispatchHandleSuccessMock = vi.spyOn(
      returnDispatch,
      "handleActionSuccess",
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("should successfully complete", async () => {
    const returnDispatchSuccessResult = {
      success: true,
      value: {
        id: 0,
        url: "test-url",
      },
    } as const;

    utilsGetBranchNameMock.mockReturnValue(testBranch);
    returnDispatchGetWorkflowIdMock.mockResolvedValue(0);
    returnDispatchMock.mockResolvedValue(returnDispatchSuccessResult);

    await main();

    // Behaviour
    // Setup
    expect(actionGetConfigMock).toHaveBeenCalledOnce();
    expect(apiInitMock).toHaveBeenCalledOnce();
    expect(apiInitMock).toHaveBeenCalledWith(testCfg);

    // Workflow ID
    expect(returnDispatchGetWorkflowIdMock).toHaveBeenCalledOnce();
    expect(returnDispatchGetWorkflowIdMock).toHaveBeenCalledWith(
      testCfg.workflow,
    );

    // Dispatch
    expect(apiDispatchWorkflowMock).toHaveBeenCalledOnce();
    expect(apiDispatchWorkflowMock).toHaveBeenCalledWith(testCfg.distinctId);

    // Branch name
    expect(utilsGetBranchNameMock).toHaveBeenCalledOnce();
    expect(utilsGetBranchNameMock).toHaveBeenCalledWith(testCfg.ref);
    expect(utilsLogInfoForBranchNameResult).toHaveBeenCalledOnce();
    expect(utilsLogInfoForBranchNameResult).toHaveBeenCalledWith(
      testBranch,
      testCfg.ref,
    );

    // Return Dispatch
    expect(returnDispatchMock).toHaveBeenCalledOnce();
    expect(returnDispatchMock).toHaveBeenCalledWith(
      testCfg,
      Date.now(),
      testBranch,
      0,
    );

    // Result
    expect(coreSetFailedMock).not.toHaveBeenCalled();
    expect(returnDispatchHandleFailMock).not.toHaveBeenCalled();
    expect(returnDispatchHandleSuccessMock).toHaveBeenCalledOnce();
    expect(returnDispatchHandleSuccessMock).toHaveBeenCalledWith(
      returnDispatchSuccessResult.value.id,
      returnDispatchSuccessResult.value.url,
    );

    // Logging
    assertOnlyCalled(coreInfoLogMock, coreDebugLogMock);
    expect(coreInfoLogMock).toHaveBeenCalledOnce();
    expect(coreInfoLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
      `"Attempt to extract branch name from ref..."`,
    );
    expect(coreDebugLogMock).toHaveBeenCalledOnce();
    expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
      `"Completed (0ms)"`,
    );
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
    expect(returnDispatchGetWorkflowIdMock).not.toHaveBeenCalled();
    expect(apiDispatchWorkflowMock).not.toHaveBeenCalled();
    expect(utilsGetBranchNameMock).not.toHaveBeenCalled();
    expect(utilsLogInfoForBranchNameResult).not.toHaveBeenCalled();
    expect(returnDispatchMock).not.toHaveBeenCalled();
    expect(returnDispatchHandleFailMock).not.toHaveBeenCalled();
    expect(returnDispatchHandleSuccessMock).not.toHaveBeenCalled();

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
    expect(returnDispatchGetWorkflowIdMock).not.toHaveBeenCalled();
    expect(apiDispatchWorkflowMock).not.toHaveBeenCalled();
    expect(utilsGetBranchNameMock).not.toHaveBeenCalled();
    expect(utilsLogInfoForBranchNameResult).not.toHaveBeenCalled();
    expect(returnDispatchMock).not.toHaveBeenCalled();
    expect(returnDispatchHandleFailMock).not.toHaveBeenCalled();
    expect(returnDispatchHandleSuccessMock).not.toHaveBeenCalled();

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
