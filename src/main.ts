import * as core from "@actions/core";

import { ActionOutputs, getConfig } from "./action.ts";
import * as api from "./api.ts";

export async function main(): Promise<void> {
  try {
    const startTime = Date.now();

    const config = getConfig();
    api.init(config);

    const dispatchedRun = await api.dispatchWorkflow();

    core.setOutput(ActionOutputs.runId, dispatchedRun.id);
    core.setOutput(ActionOutputs.runUrl, dispatchedRun.url);

    core.debug(`Completed (${Date.now() - startTime}ms)`);
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
