import * as core from "@actions/core";
import { v4 as uuid } from "uuid";
import { ActionOutputs, getConfig } from "./action.ts";
import * as api from "./api.ts";
import { getBranchName } from "./utils.ts";

const DISTINCT_ID = uuid();
const WORKFLOW_FETCH_TIMEOUT_MS = 60 * 1000;
const WORKFLOW_JOB_STEPS_RETRY_MS = 5000;
const WORKFLOW_JOB_STEPS_SERVER_ERROR_RETRY_MAX = 3;
const WORKFLOW_JOB_STEPS_SERVER_ERROR_RETRY_MS = 500;

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
async function attemptToFindRunId(
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
          const url = await api.getWorkflowRunUrl(id);
          return { found: true, value: { id, url } };
        }
      }
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }

      if (error.message === "Server Error") {
        if (
          currentGetWorkflowRunJobStepsAttempt <
          WORKFLOW_JOB_STEPS_SERVER_ERROR_RETRY_MAX
        ) {
          currentGetWorkflowRunJobStepsAttempt++;

          core.debug(
            "Encountered a Server Error while attempting to fetch steps, " +
              `retrying in ${WORKFLOW_JOB_STEPS_SERVER_ERROR_RETRY_MS}`,
          );
          await new Promise((resolve) =>
            setTimeout(resolve, WORKFLOW_JOB_STEPS_SERVER_ERROR_RETRY_MS),
          );

          // Continue without increasing the current index to retry the same ID.
          continue;
        }
      } else if (error.message === "Not Found") {
        core.debug(`Could not identify ID in run: ${id}, continuing...`);
      } else {
        throw error;
      }
    }

    currentGetWorkflowRunJobStepsAttempt = 0;
    currentWorkflowRunIndex++;
  }

  return { found: false };
}

async function run(): Promise<void> {
  try {
    const config = getConfig();
    const startTime = Date.now();
    api.init(config);

    let workflowId: number;
    // Get the workflow ID if give a string
    if (typeof config.workflow === "string") {
      core.info(`Fetching Workflow ID for ${config.workflow}...`);
      workflowId = await api.getWorkflowId(config.workflow);
      core.info(`Fetched Workflow ID: ${workflowId}`);
    } else {
      workflowId = config.workflow;
    }

    // Dispatch the action
    await api.dispatchWorkflow(config.distinctId ?? DISTINCT_ID);

    // Attempt to get the branch from config ref
    core.info("Attempt to extract branch name from ref...");
    const branch = getBranchName(config.ref);
    if (branch.isTag) {
      core.info(
        `Tag found for '${config.ref}', branch filtering will not be used`,
      );
    } else if (branch.branchName) {
      core.info(`Branch found for '${config.ref}': ${branch.branchName}`);
    } else {
      core.info(
        `Branch not found for '${config.ref}', branch filtering will not be used`,
      );
    }

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
        Math.max(WORKFLOW_FETCH_TIMEOUT_MS, timeoutMs),
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

      const idRegex = new RegExp(config.distinctId ?? DISTINCT_ID);

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
        setTimeout(resolve, WORKFLOW_JOB_STEPS_RETRY_MS),
      );
    }

    core.error("Failed: Timeout exceeded while attempting to get Run ID");
    core.setFailed("Timeout exceeded while attempting to get Run ID");
  } catch (error) {
    if (error instanceof Error) {
      core.error(`Failed: ${error.message}`);
      core.warning("Does the token have the correct permissions?");
      core.debug(error.stack ?? "");
      core.setFailed(error.message);
    }
  }
}

((): Promise<void> => run())();
