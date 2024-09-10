import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";

import type { ActionConfig } from "./action.ts";
import * as api from "./api.ts";
import { getWorkflowId } from "./return-dispatch.ts";
import { mockLoggingFunctions } from "./test-utils/logging.mock.ts";

vi.mock("@actions/core");
vi.mock("./api.ts");

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
});
