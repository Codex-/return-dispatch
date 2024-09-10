import { getConfig } from "./action.ts";
import * as api from "./api.ts";
import { returnDispatch } from "./return-dispatch.ts";

(async (): Promise<void> => {
  const config = getConfig();
  api.init(config);

  await returnDispatch(config);
})();
