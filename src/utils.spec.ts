import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { mockLoggingFunctions } from "./test-utils/logging.mock.ts";
import { getBranchName } from "./utils.ts";

vi.mock("@actions/core");

describe("utils", () => {
  const { coreDebugLogMock, assertOnlyCalled } = mockLoggingFunctions();

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
        `"getWorkflowRunIds: Filtered branch name: /refs/heads/cool_feature"`,
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
        `"getWorkflowRunIds: Filtered branch name: refs/heads/cool_feature"`,
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
        `"failed to get branch for ref: refs/heads/, please raise an issue with this git ref."`,
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
});
