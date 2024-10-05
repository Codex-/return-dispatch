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

export function logInfoForBranchNameResult(
  branch: BranchNameResult,
  ref: string,
): void {
  if (branch.isTag) {
    core.info(`Tag found for '${ref}', branch filtering will not be used`);
  } else if (branch.branchName) {
    core.info(`Branch found for '${ref}': ${branch.branchName}`);
  } else {
    core.info(
      `Branch not found for '${ref}', branch filtering will not be used`,
    );
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Used to match `RegExp`
 * [syntax characters](http://ecma-international.org/ecma-262/7.0/#sec-patterns).
 *
 * https://github.com/lodash/lodash/blob/main/src/escapeRegExp.ts
 */
const reRegExpChar = /[\\^$.*+?()[\]{}|]/g;
const reHasRegExpChar = RegExp(reRegExpChar.source);

/**
 * Escapes the `RegExp` special characters "^", "$", "\", ".", "*", "+",
 * "?", "(", ")", "[", "]", "{", "}", and "|" in `string`.
 *
 * https://github.com/lodash/lodash/blob/main/src/escapeRegExp.ts
 */
export function escapeRegExp(str: string): string {
  return reHasRegExpChar.test(str)
    ? str.replace(reRegExpChar, "\\$&")
    : str || "";
}

/**
 * If the input distinct ID contains unescaped characters, log the
 * escaped distinct ID as a warning.
 */
export function createDistinctIdRegex(distinctId: string): RegExp {
  const escapedDistinctId = escapeRegExp(distinctId);
  if (distinctId !== escapedDistinctId) {
    core.warning(
      `Unescaped characters found in distinctId input, using: ${escapedDistinctId}`,
    );
  }

  return new RegExp(escapedDistinctId);
}
