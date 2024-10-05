import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { mockLoggingFunctions } from "./test-utils/logging.mock.ts";
import { getBranchName, logInfoForBranchNameResult, sleep } from "./utils.ts";

vi.mock("@actions/core");

describe("utils", () => {
  const { coreDebugLogMock, coreInfoLogMock, assertOnlyCalled } =
    mockLoggingFunctions();

  afterEach(() => {
    vi.resetAllMocks();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe("getBranchNameFromRef", () => {
    // We want to assert that the props are properly set in
    // the union of the return type
    interface BranchNameResultUnion {
      branchName?: string;
      isTag: boolean;
      ref: string;
    }

    it("should return the branch name for a valid branch ref", () => {
      const branchName = "cool_feature";
      const ref = `/refs/heads/${branchName}`;
      const branch = getBranchName(ref) as BranchNameResultUnion;

      // Behaviour
      expect(branch.isTag).toStrictEqual(false);
      expect(branch.branchName).toStrictEqual(branchName);
      expect(branch.ref).toStrictEqual(ref);

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledOnce();
      expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `"getBranchNameFromRef: Filtered branch name: /refs/heads/cool_feature"`,
      );
    });

    it("should return the branch name for a valid branch ref without a leading slash", () => {
      const branchName = "cool_feature";
      const ref = `refs/heads/${branchName}`;
      const branch = getBranchName(ref) as BranchNameResultUnion;

      // Behaviour
      expect(branch.isTag).toStrictEqual(false);
      expect(branch.branchName).toStrictEqual(branchName);
      expect(branch.ref).toStrictEqual(ref);

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledOnce();
      expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `"getBranchNameFromRef: Filtered branch name: refs/heads/cool_feature"`,
      );
    });

    it("should return undefined for an invalid branch ref", () => {
      const ref = "refs/heads/";
      const branch = getBranchName(ref) as BranchNameResultUnion;

      // Behaviour
      expect(branch.isTag).toStrictEqual(false);
      expect(branch.branchName).toBeUndefined();
      expect(branch.ref).toStrictEqual(ref);

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledOnce();
      expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `"getBranchName: failed to get branch for ref: refs/heads/, please raise an issue with this git ref."`,
      );
    });

    it("should return isTag true if the ref is for a tag", () => {
      const ref = "refs/tags/v1.0.1";
      const branch = getBranchName(ref) as BranchNameResultUnion;

      // Behaviour
      expect(branch.isTag).toStrictEqual(true);
      expect(branch.branchName).toBeUndefined();
      expect(branch.ref).toStrictEqual(ref);

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledOnce();
      expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `"Unable to filter branch, unsupported ref: refs/tags/v1.0.1"`,
      );
    });

    it("should return isTag true if the ref is for an invalid tag", () => {
      const ref = "refs/tags/";
      const branch = getBranchName(ref) as BranchNameResultUnion;

      // Behaviour
      expect(branch.isTag).toStrictEqual(true);
      expect(branch.branchName).toBeUndefined();
      expect(branch.ref).toStrictEqual(ref);

      // Logging
      assertOnlyCalled(coreDebugLogMock);
      expect(coreDebugLogMock).toHaveBeenCalledOnce();
      expect(coreDebugLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `"Unable to filter branch, unsupported ref: refs/tags/"`,
      );
    });
  });

  describe("logInfoForBranchNameResult", () => {
    it("should log when finding a tag", () => {
      const ref = "refs/tags/v1.0.1";
      const branch = getBranchName(ref);
      coreDebugLogMock.mockReset();

      logInfoForBranchNameResult(branch, ref);

      // Logging
      assertOnlyCalled(coreInfoLogMock);
      expect(coreInfoLogMock).toHaveBeenCalledOnce();
      expect(coreInfoLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `"Tag found for 'refs/tags/v1.0.1', branch filtering will not be used"`,
      );
    });

    it("should log when finding a branch", () => {
      const branchName = "cool_feature";
      const ref = `/refs/heads/${branchName}`;
      const branch = getBranchName(ref);
      coreDebugLogMock.mockReset();

      logInfoForBranchNameResult(branch, ref);

      // Logging
      assertOnlyCalled(coreInfoLogMock);
      expect(coreInfoLogMock).toHaveBeenCalledOnce();
      expect(coreInfoLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `"Branch found for '/refs/heads/cool_feature': cool_feature"`,
      );
    });

    it("should log when nothing is found", () => {
      const ref = "refs/heads/";
      const branch = getBranchName(ref);
      coreDebugLogMock.mockReset();

      logInfoForBranchNameResult(branch, ref);

      // Logging
      assertOnlyCalled(coreInfoLogMock);
      expect(coreInfoLogMock).toHaveBeenCalledOnce();
      expect(coreInfoLogMock.mock.calls[0]?.[0]).toMatchInlineSnapshot(
        `"Branch not found for 'refs/heads/', branch filtering will not be used"`,
      );
    });
  });

  describe("sleep", () => {
    beforeAll(() => {
      vi.useFakeTimers();
    });

    afterAll(() => {
      vi.useRealTimers();
    });

    it("should sleep for n ms", async () => {
      const sleepTime = 1000;

      // This is more of a smoke test than anything else
      const sleepPromise = sleep(sleepTime);
      await vi.advanceTimersByTimeAsync(1000);

      await expect(sleepPromise).resolves.toBeUndefined();
    });
  });
});
