import * as core from "@actions/core";
import { v4 as uuid } from "uuid";
import { ActionOutputs, getConfig } from "./action";
import * as api from "./api";
import { LogZip } from "./zip";

const DISTINCT_ID = uuid();

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
    await api.dispatchWorkflow(DISTINCT_ID);

    const timeoutMs = config.workflowTimeoutSeconds * 1000;
    const workflowFetchTimeoutMs = 60 * 1000;
    let attemptNo = 0;
    let elapsedTime = Date.now() - startTime;
    core.info("Attempt to extract run ID from logs...");
    while (elapsedTime < timeoutMs) {
      attemptNo++;
      elapsedTime = Date.now() - startTime;

      core.debug(`Attempting to fetch Run IDs for Workflow ID ${workflowId}`);

      // Get all runs for a given workflow ID
      const workflowRunIds = await api.retryOrDie(
        () => api.getWorkflowRunIds(workflowId),
        workflowFetchTimeoutMs > timeoutMs ? timeoutMs : workflowFetchTimeoutMs
      );

      core.debug(`Attempting to get logs for Run IDs ${workflowRunIds}`);

      /**
       * Attempt to read the distinct ID in the logs
       * for each existing run ID.
       */
      for (const id of workflowRunIds) {
        const logs = new LogZip();
        await logs.init(await api.getWorkflowRunLogs(id));

        for (const file of logs.getFiles()) {
          if (await logs.fileContainsStr(file, DISTINCT_ID)) {
            core.info(`Successfully identified remote Run ID: ${id}`);
            core.setOutput(ActionOutputs.runId, id);
            return;
          }
        }
      }

      core.info(
        `Exhausted fetched logs for known runs, attempt ${attemptNo}...`
      );

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error("Timeout exceeded while attempting to get Run ID");
  } catch (error) {
    core.error(`Failed to complete: ${error.message}`);
    error.stack && core.debug(error.stack);
    core.setFailed(error.message);
  }
}

(() => run())();
