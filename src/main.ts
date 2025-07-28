import * as core from "@actions/core";

import { getConfig } from "./action.ts";
import * as api from "./api.ts";
import {
  getWorkflowId,
  handleActionFail,
  handleActionSuccess,
  getRunIdAndUrl,
} from "./return-dispatch.ts";
import {
  createDistinctIdRegex,
  getBranchName,
  logInfoForBranchNameResult,
} from "./utils.ts";

export async function main(): Promise<void> {
  try {
    const startTime = Date.now();

    const config = getConfig();
    api.init(config);

    const workflowId = await getWorkflowId(config.workflow);

    // Dispatch the action
    await api.dispatchWorkflow(config.distinctId);

    // Attempt to get the branch from config ref
    core.info("Attempt to extract branch name from ref...");
    const branch = getBranchName(config.ref);
    logInfoForBranchNameResult(branch, config.ref);

    const distinctIdRegex = createDistinctIdRegex(config.distinctId);

    core.info("Attempting to identify run ID from steps...");
    core.debug(
      `Attempting to identify run ID for ${config.workflow} (${workflowId})`,
    );

    const result = await getRunIdAndUrl({
      startTime,
      branch,
      distinctIdRegex,
      workflowId,
      workflowTimeoutMs: config.workflowTimeoutSeconds * 1000,
      workflowJobStepsRetryMs: config.workflowJobStepsRetrySeconds * 1000,
    });

    // If we find the run id we need then determine if we need to follow the job status
    // or just return the run id and url.
    if (result.success) {
      if (config.waitForRunCompleted) {
        // Wait for the workflow run to complete
        await api.waitForDispatch(result.value.id, result.value.url);
      } else {
        handleActionSuccess(result.value.id, result.value.url);
        core.debug(`Completed (${Date.now() - startTime}ms)`);
      }
    } else {
      handleActionFail();
      core.debug(`Timed out (${Date.now() - startTime}ms)`);
    }


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

if (!process.env.VITEST) {
  await main();
}
