import * as core from "@actions/core";

import { getConfig } from "./action.ts";
import * as api from "./api.ts";
import {
  getWorkflowId,
  handleActionFail,
  handleActionSuccess,
  getRunId,
} from "./return-dispatch.ts";
import { getBranchName, logInfoForBranchNameResult } from "./utils.ts";

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

    const result = await getRunId({
      startTime,
      branch,
      distinctId: config.distinctId,
      workflow: config.workflow,
      workflowId,
      workflowTimeoutSeconds: config.workflowTimeoutSeconds,
    });
    if (result.success) {
      handleActionSuccess(result.value.id, result.value.url);
      core.debug(`Completed (${Date.now() - startTime}ms)`);
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
