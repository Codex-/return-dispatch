import core from "@actions/core";
import { v4 as uuid } from "uuid";
import { getConfig } from "./action";
import {
  dispatchWorkflow,
  getWorkflowId,
  getWorkflowRunIds,
  getWorkflowRunLogs,
  retryOrDie,
} from "./api";
import { LogZip } from "./zip";

enum Outputs {
  runId = "run_id",
}

const DISTINCT_ID = uuid();
const TIMEOUT = 5 * 60 * 1000;

async function run(): Promise<void> {
  try {
    const config = getConfig();
    const startTime = Date.now();

    let workflowId: number;
    // Get the workflow ID if give a string
    if (typeof config.workflow === "string") {
      workflowId = await getWorkflowId(config.workflow);
    } else {
      workflowId = config.workflow;
    }

    // Dispatch the action
    await dispatchWorkflow(DISTINCT_ID);

    let attemptNo = 0;
    let elapsedTime = 0;
    while (elapsedTime < TIMEOUT) {
      attemptNo++;
      elapsedTime = Date.now() - startTime;

      // Get all runs for a given workflow ID
      const workflowRunIds = await retryOrDie(
        () => getWorkflowRunIds(workflowId),
        60 * 1000
      );

      /**
       * Attempt to read the distinct ID in the logs
       * for each existing run ID.
       */
      for (const id of workflowRunIds) {
        const logs = new LogZip();
        await logs.init(await getWorkflowRunLogs(id));

        for (const file of logs.getFiles()) {
          if (logs.fileContainsStr(file, DISTINCT_ID)) {
            core.info(`Successfully identified remote Run ID: ${id}`);
            core.setOutput(Outputs.runId, id);
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
