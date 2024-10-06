import * as core from "@actions/core";

import { ActionOutputs } from "./action.ts";
import * as api from "./api.ts";
import * as constants from "./constants.ts";
import type { Result } from "./types.ts";
import { sleep, type BranchNameResult } from "./utils.ts";

export function shouldRetryOrThrow(
  error: Error,
  currentAttempts: number,
): boolean {
  switch (error.message) {
    case "Server Error": {
      if (
        currentAttempts < constants.WORKFLOW_JOB_STEPS_SERVER_ERROR_RETRY_MAX
      ) {
        core.debug(
          "Encountered a Server Error while attempting to fetch steps, " +
            `retrying in ${constants.WORKFLOW_JOB_STEPS_SERVER_ERROR_RETRY_MS}ms`,
        );

        return true;
      }
      return false;
    }
    case "Not Found": {
      core.debug("Could not identify ID in run, continuing...");
      return false;
    }
    default: {
      core.debug(`Unhandled error has occurred: ${error.message}`);
      throw error;
    }
  }
}

/**
 * Attempt to read the distinct ID in the steps for each existing run ID.
 */
export async function attemptToFindRunId(
  idRegex: RegExp,
  workflowRunIds: number[],
): Promise<Result<{ id: number; url: string }>> {
  if (workflowRunIds.length === 0) {
    return {
      success: false,
      reason: "invalid input",
    };
  }

  let currentWorkflowRunIndex = 0;
  let currentFetchWorkflowRunJobStepsAttempt = 0;
  while (currentWorkflowRunIndex < workflowRunIds.length) {
    const id = workflowRunIds[currentWorkflowRunIndex];
    if (id === undefined) {
      break;
    }

    try {
      const steps = await api.fetchWorkflowRunJobSteps(id);

      for (const step of steps) {
        if (idRegex.test(step)) {
          const url = await api.fetchWorkflowRunUrl(id);
          return { success: true, value: { id, url } };
        }
      }
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }

      const shouldRetry = shouldRetryOrThrow(
        error,
        currentFetchWorkflowRunJobStepsAttempt,
      );
      if (shouldRetry) {
        currentFetchWorkflowRunJobStepsAttempt++;
        await sleep(constants.WORKFLOW_JOB_STEPS_SERVER_ERROR_RETRY_MS);
        // Continue without increasing the current index to retry the same ID.
        continue;
      }
    }

    currentFetchWorkflowRunJobStepsAttempt = 0;
    currentWorkflowRunIndex++;
  }

  return { success: false, reason: "timeout" };
}

/**
 * Attempt to get the upstream workflow ID if given a string, otherwise
 * use the workflow config as the ID number.
 */
export async function getWorkflowId(
  workflow: string | number,
): Promise<number> {
  if (typeof workflow === "number") {
    // Already asserted is a non-NaN number during config construction
    return workflow;
  }

  core.info(`Fetching Workflow ID for ${workflow}...`);
  const workflowId = await api.fetchWorkflowId(workflow);
  core.info(`Fetched Workflow ID: ${workflowId}`);
  return workflowId;
}

export function handleActionSuccess(id: number, url: string): void {
  core.info(
    "Successfully identified remote Run:\n" +
      `  Run ID: ${id}\n` +
      `  URL: ${url}`,
  );
  core.setOutput(ActionOutputs.runId, id);
  core.setOutput(ActionOutputs.runUrl, url);
}

export function handleActionFail(): void {
  core.error("Failed: Timeout exceeded while attempting to get Run ID");
  core.setFailed("Timeout exceeded while attempting to get Run ID");
}

export interface GetRunIdAndUrlOpts {
  startTime: number;
  branch: BranchNameResult;
  distinctIdRegex: RegExp;
  workflowId: number;
  workflowTimeoutMs: number;
}
export async function getRunIdAndUrl({
  startTime,
  branch,
  distinctIdRegex,
  workflowId,
  workflowTimeoutMs,
}: GetRunIdAndUrlOpts): Promise<Result<{ id: number; url: string }>> {
  const retryTimeout = Math.max(
    constants.WORKFLOW_FETCH_TIMEOUT_MS,
    workflowTimeoutMs,
  );

  let attemptNo = 0;
  let elapsedTime = Date.now() - startTime;
  while (elapsedTime < workflowTimeoutMs) {
    attemptNo++;
    elapsedTime = Date.now() - startTime;

    // Get all runs for a given workflow ID
    const fetchWorkflowRunIds = await api.retryOrTimeout(
      () => api.fetchWorkflowRunIds(workflowId, branch),
      retryTimeout,
    );
    if (!fetchWorkflowRunIds.success) {
      core.debug(
        `Timed out while attempting to fetch Workflow Run IDs, waited ${Date.now() - startTime}ms`,
      );
      break;
    }

    const workflowRunIds = fetchWorkflowRunIds.value;

    if (workflowRunIds.length > 0) {
      core.debug(
        `Attempting to get step names for Run IDs: [${workflowRunIds.join(", ")}]`,
      );

      const result = await attemptToFindRunId(distinctIdRegex, workflowRunIds);
      if (result.success) {
        return result;
      }

      core.info(
        `Exhausted searching IDs in known runs, attempt ${attemptNo}...`,
      );
    } else {
      core.info(`No Run IDs found for workflow, attempt ${attemptNo}...`);
    }

    await sleep(constants.WORKFLOW_JOB_STEPS_RETRY_MS);
  }

  return { success: false, reason: "timeout" };
}
