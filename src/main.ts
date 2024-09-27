import * as core from "@actions/core";

import { getConfig } from "./action.ts";
import * as api from "./api.ts";
import { getWorkflowId, returnDispatch } from "./return-dispatch.ts";
import { getBranchName, logInfoForBranchNameResult } from "./utils.ts";

(async (): Promise<void> => {
  const startTime = Date.now();

  const config = getConfig();
  api.init(config);

  const workflowId = await getWorkflowId(config);

  // Dispatch the action
  await api.dispatchWorkflow(config.distinctId);

  // Attempt to get the branch from config ref
  core.info("Attempt to extract branch name from ref...");
  const branch = getBranchName(config.ref);
  logInfoForBranchNameResult(branch, config.ref);

  await returnDispatch(config, startTime, branch, workflowId);
})();
