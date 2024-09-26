import { getConfig } from "./action.ts";
import * as api from "./api.ts";
import { getWorkflowId, returnDispatch } from "./return-dispatch.ts";

(async (): Promise<void> => {
  const startTime = Date.now();

  const config = getConfig();
  api.init(config);

  const workflowId = await getWorkflowId(config);

  // Dispatch the action
  await api.dispatchWorkflow(config.distinctId);

  await returnDispatch(config, startTime, workflowId);
})();
