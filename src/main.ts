import * as core from "@actions/core";
import { v4 as uuid } from "uuid";
import { ActionOutputs, getConfig } from "./action.ts";
import * as api from "./api.ts";

const DISTINCT_ID = uuid();
const WORKFLOW_FETCH_TIMEOUT_MS = 60 * 1000;
const WORKFLOW_JOB_STEPS_RETRY_MS = 5000;

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
        () => api.getWorkflowRunIds(workflowId),
        WORKFLOW_FETCH_TIMEOUT_MS > timeoutMs
          ? timeoutMs
          : WORKFLOW_FETCH_TIMEOUT_MS,
      );
      if (fetchWorkflowRunIds.timeout) {
        core.debug("Timed out while attempting to fetch Workflow Run IDs");
        await new Promise((resolve) =>
          setTimeout(resolve, WORKFLOW_JOB_STEPS_RETRY_MS),
        );
        continue;
      }

      const workflowRunIds = fetchWorkflowRunIds.value;
      core.debug(
        `Attempting to get step names for Run IDs: [${workflowRunIds.join(", ")}]`,
      );

      const idRegex = new RegExp(DISTINCT_ID);

      /**
       * Attempt to read the distinct ID in the steps
       * for each existing run ID.
       */
      for (const id of workflowRunIds) {
        try {
          const steps = await api.getWorkflowRunJobSteps(id);

          for (const step of steps) {
            if (idRegex.test(step)) {
              const url = await api.getWorkflowRunUrl(id);
              core.info(
                "Successfully identified remote Run:\n" +
                  `  Run ID: ${id}\n` +
                  `  URL: ${url}`,
              );
              core.setOutput(ActionOutputs.runId, id);
              core.setOutput(ActionOutputs.runUrl, url);
              return;
            }
          }
        } catch (error) {
          if (error instanceof Error && error.message !== "Not Found") {
            throw error;
          }
          core.debug(`Could not identify ID in run: ${id}, continuing...`);
        }
      }

      core.info(
        `Exhausted searching IDs in known runs, attempt ${attemptNo}...`,
      );

      await new Promise((resolve) =>
        setTimeout(resolve, WORKFLOW_JOB_STEPS_RETRY_MS),
      );
    }

    throw new Error("Timeout exceeded while attempting to get Run ID");
  } catch (error) {
    if (error instanceof Error) {
      core.error(`Failed to complete: ${error.message}`);
      core.warning("Does the token have the correct permissions?");
      core.debug(error.stack ?? "");
      core.setFailed(error.message);
    }
  }
}

((): Promise<void> => run())();
