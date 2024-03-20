import * as core from "@actions/core";

function getBranchNameFromRef(ref: string): string | undefined {
  const refItems = ref.split(/\/?refs\/heads\//);
  if (refItems.length > 1 && refItems[1]!.length > 0) {
    return refItems[1];
  }
}

function isTagRef(ref: string): boolean {
  return new RegExp(/\/?refs\/tags\//).test(ref);
}

export function getBranchName(ref: string): string | undefined {
  let branchName: string | undefined = undefined;
  if (!isTagRef(ref)) {
    /**
     * The listRepoWorkflows request only accepts a branch name and not a ref (for some reason).
     *
     * Attempt to filter the branch name specifically and use that.
     */
    const branch = getBranchNameFromRef(ref);
    if (branch) {
      branchName = branch;

      core.debug(`getWorkflowRunIds: Filtered branch name: ${ref}`);
    } else {
      core.debug(
        `failed to get branch for ref: ${ref}, please raise an issue with this git ref.`,
      );
    }
  } else {
    core.debug(`Unable to filter branch, unsupported ref: ${ref}`);
  }

  return branchName;
}
