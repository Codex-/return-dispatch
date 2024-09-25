import * as core from "@actions/core";

function getBranchNameFromRef(ref: string): string | undefined {
  const refItems = ref.split(/\/?refs\/heads\//);
  if (refItems.length > 1 && (refItems[1]?.length ?? 0) > 0) {
    return refItems[1];
  }
}

function isTagRef(ref: string): boolean {
  return new RegExp(/\/?refs\/tags\//).test(ref);
}

interface RefBranch {
  branchName?: string;
  isTag: false;
  ref: string;
}

interface RefTag {
  isTag: true;
  ref: string;
}

export type BranchNameResult = RefBranch | RefTag;

export function getBranchName(ref: string): BranchNameResult {
  if (isTagRef(ref)) {
    core.debug(`Unable to filter branch, unsupported ref: ${ref}`);
    return { isTag: true, ref };
  }

  /**
   * The listRepoWorkflows request only accepts a branch name and not a ref (for some reason).
   *
   * Attempt to filter the branch name specifically and use that.
   */
  const branch = getBranchNameFromRef(ref);
  if (branch) {
    core.debug(`getBranchNameFromRef: Filtered branch name: ${ref}`);
  } else {
    core.debug(
      `getBranchName: failed to get branch for ref: ${ref}, please raise an issue with this git ref.`,
    );
  }
  return { branchName: branch, isTag: false, ref };
}
