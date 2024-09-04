import * as core from "@actions/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getBranchName } from "./utils.ts";

describe("utils", () => {
  beforeAll(() => {
    vi.spyOn(core, "debug").mockImplementation(() => undefined);
    vi.spyOn(core, "warning").mockImplementation(() => undefined);
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

      expect(branch.isTag).toStrictEqual(false);
      expect(branch.branchName).toStrictEqual(branchName);
      expect(branch.ref).toStrictEqual(ref);
    });

    it("should return the branch name for a valid branch ref without a leading slash", () => {
      const branchName = "cool_feature";
      const ref = `refs/heads/${branchName}`;
      const branch = getBranchName(ref) as BranchNameResultUnion;

      expect(branch.isTag).toStrictEqual(false);
      expect(branch.branchName).toStrictEqual(branchName);
      expect(branch.ref).toStrictEqual(ref);
    });

    it("should return undefined for an invalid branch ref", () => {
      const ref = "refs/heads/";
      const branch = getBranchName(ref) as BranchNameResultUnion;

      expect(branch.isTag).toStrictEqual(false);
      expect(branch.branchName).toBeUndefined();
      expect(branch.ref).toStrictEqual(ref);
    });

    it("should return isTag true if the ref is for a tag", () => {
      const ref = "refs/tags/v1.0.1";
      const branch = getBranchName(ref) as BranchNameResultUnion;

      expect(branch.isTag).toStrictEqual(true);
      expect(branch.branchName).toBeUndefined();
      expect(branch.ref).toStrictEqual(ref);
    });

    it("should return isTag true if the ref is for an invalid tag", () => {
      const ref = "refs/tags/";
      const branch = getBranchName(ref) as BranchNameResultUnion;

      expect(branch.isTag).toStrictEqual(true);
      expect(branch.branchName).toBeUndefined();
      expect(branch.ref).toStrictEqual(ref);
    });
  });
});
