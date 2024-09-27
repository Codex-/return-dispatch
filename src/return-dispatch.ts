import * as core from "@actions/core";

import { ActionOutputs, type ActionConfig } from "./action.ts";
import * as api from "./api.ts";
import * as constants from "./constants.ts";
import { getBranchName, type BranchNameResult } from "./utils.ts";

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type Result = ResultFound | ResultNotFound;

interface ResultFound {
  found: true;
  value: {
    id: number;
    url: string;
  };
}

interface ResultNotFound {
  found: false;
}

/**
 * Attempt to read the distinct ID in the steps for each existing run ID.
 */
export async function attemptToFindRunId(
  idRegex: RegExp,
  workflowRunIds: number[],
): Promise<Result> {
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
          return { found: true, value: { id, url } };
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

  return { found: false };
}

/**
 * Attempt to get the upstream workflow ID if given a string, otherwise
 * use the workflow config as the ID number.
 */
export async function getWorkflowId(config: ActionConfig): Promise<number> {
  if (typeof config.workflow === "number") {
    // Already asserted is a non-NaN number during config construction
    return config.workflow;
  }

  core.info(`Fetching Workflow ID for ${config.workflow}...`);
  const workflowId = await api.fetchWorkflowId(config.workflow);
  core.info(`Fetched Workflow ID: ${workflowId}`);
  return workflowId;
}

export async function returnDispatch(
  config: ActionConfig,
  startTime: number,
  branch: BranchNameResult,
  workflowId: number,
): Promise<void> {
  try {
    const timeoutMs = config.workflowTimeoutSeconds * 1000;
    let attemptNo = 0;
    let elapsedTime = Date.now() - startTime;
    core.info("Attempt to extract run ID from steps...");
    while (elapsedTime < timeoutMs) {
      attemptNo++;
      elapsedTime = Date.now() - startTime;

      core.debug(`Attempting to fetch Run IDs for Workflow ID ${workflowId}`);

      // Get all runs for a given workflow ID
      const fetchWorkflowRunIds = await api.retryOrTimeout(
        () => api.getWorkflowRunIds(workflowId, branch),
        Math.max(constants.WORKFLOW_FETCH_TIMEOUT_MS, timeoutMs),
      );
      if (fetchWorkflowRunIds.timeout) {
        core.debug(
          `Timed out while attempting to fetch Workflow Run IDs, waited ${Date.now() - startTime}ms`,
        );
        break;
      }

      const workflowRunIds = fetchWorkflowRunIds.value;
      core.debug(
        `Attempting to get step names for Run IDs: [${workflowRunIds.join(", ")}]`,
      );

      const idRegex = new RegExp(config.distinctId);

      const result = await attemptToFindRunId(idRegex, workflowRunIds);
      if (result.found) {
        core.info(
          "Successfully identified remote Run:\n" +
            `  Run ID: ${result.value.id}\n` +
            `  URL: ${result.value.url}`,
        );
        core.setOutput(ActionOutputs.runId, result.value.id);
        core.setOutput(ActionOutputs.runUrl, result.value.url);
        core.debug(`Completed in ${Date.now() - startTime}ms`);
        return;
      }

      core.info(
        `Exhausted searching IDs in known runs, attempt ${attemptNo}...`,
      );

      await new Promise((resolve) =>
        setTimeout(resolve, constants.WORKFLOW_JOB_STEPS_RETRY_MS),
      );
    }

    core.error("Failed: Timeout exceeded while attempting to get Run ID");
    core.setFailed("Timeout exceeded while attempting to get Run ID");
  } catch (error) {
    if (error instanceof Error) {
      const failureMsg = `Failed: An unhandled error has occurred: ${error.message}`;
      core.setFailed(failureMsg);
      core.error(failureMsg);
      core.debug(error.stack ?? "");
    } else {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      const failureMsg = `Failed: An unknown error has occurred: ${error}`;
      core.setFailed(failureMsg);
      core.error(failureMsg);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      core.debug(error as any);
    }
  }
}
