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
  let currentWorkflowRunIndex = 0;
  let currentGetWorkflowRunJobStepsAttempt = 0;
  while (currentWorkflowRunIndex < workflowRunIds.length) {
    const id = workflowRunIds[currentWorkflowRunIndex];
    if (id === undefined) {
      break;
    }

    try {
      const steps = await api.getWorkflowRunJobSteps(id);

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
        currentGetWorkflowRunJobStepsAttempt,
      );
      if (shouldRetry) {
        currentGetWorkflowRunJobStepsAttempt++;
        await sleep(constants.WORKFLOW_JOB_STEPS_SERVER_ERROR_RETRY_MS);
        // Continue without increasing the current index to retry the same ID.
        continue;
      }
    }

    currentGetWorkflowRunJobStepsAttempt = 0;
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

interface GetRunIdOpts {
  startTime: number;
  branch: BranchNameResult;
  distinctId: string;
  workflow: string | number;
  workflowId: number;
  workflowTimeoutSeconds: number;
}
export async function getRunId({
  startTime,
  branch,
  distinctId,
  workflow,
  workflowId,
  workflowTimeoutSeconds,
}: GetRunIdOpts): Promise<Result<{ id: number; url: string }>> {
  const timeoutMs = workflowTimeoutSeconds * 1000;
  const distinctIdRegex = new RegExp(distinctId);

  core.info("Attempt to identify run ID from steps...");
  core.debug(`Attempting to identify Run ID for ${workflow} (${workflowId})`);

  let attemptNo = 0;
  let elapsedTime = Date.now() - startTime;
  while (elapsedTime < timeoutMs) {
    attemptNo++;
    elapsedTime = Date.now() - startTime;

    // Get all runs for a given workflow ID
    const fetchWorkflowRunIds = await api.retryOrTimeout(
      () => api.getWorkflowRunIds(workflowId, branch),
      Math.max(constants.WORKFLOW_FETCH_TIMEOUT_MS, timeoutMs),
    );
    if (!fetchWorkflowRunIds.success) {
      core.debug(
        `Timed out while attempting to fetch Workflow Run IDs, waited ${Date.now() - startTime}ms`,
      );
      break;
    }

    const workflowRunIds = fetchWorkflowRunIds.value;
    core.debug(
      `Attempting to get step names for Run IDs: [${workflowRunIds.join(", ")}]`,
    );

    const result = await attemptToFindRunId(distinctIdRegex, workflowRunIds);
    if (result.success) {
      return result;
    }

    core.info(`Exhausted searching IDs in known runs, attempt ${attemptNo}...`);

    await sleep(constants.WORKFLOW_JOB_STEPS_RETRY_MS);
  }

  return { success: false, reason: "timeout" };
}
