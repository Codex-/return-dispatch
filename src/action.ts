import * as core from "@actions/core";

/**
 * action.yaml definition.
 */
export interface ActionConfig {
  /**
   * GitHub API token for making requests.
   */
  token: string;

  /**
   * The git reference for the workflow. The reference can be a branch or tag name.
   */
  ref: string;

  /**
   * Repository of the action to await.
   */
  repo: string;

  /**
   * Owner of the given repository.
   */
  owner: string;

  /**
   * Workflow to return an ID for. Can be the ID or the workflow filename.
   */
  workflow: string | number;

  /**
   * A flat JSON object, only supports strings (as per workflow inputs API).
   */
  workflowInputs?: ActionWorkflowInputs;
}

type ActionWorkflowInputs = Record<string, string | number | boolean>;

export enum ActionOutputs {
  runId = "run_id",
  runUrl = "run_url",
}

export function getConfig(): ActionConfig {
  return {
    token: core.getInput("token", { required: true }),
    ref: core.getInput("ref", { required: true }),
    repo: core.getInput("repo", { required: true }),
    owner: core.getInput("owner", { required: true }),
    workflow: tryGetWorkflowAsNumber(
      core.getInput("workflow", { required: true }),
    ),
    workflowInputs: getWorkflowInputs(core.getInput("workflow_inputs")),
  };
}

function getWorkflowInputs(
  workflowInputs: string,
): ActionWorkflowInputs | undefined {
  if (workflowInputs === "") {
    return undefined;
  }

  try {
    const parsedJson = JSON.parse(workflowInputs) as Record<string, unknown>;
    for (const key of Object.keys(parsedJson)) {
      const value = parsedJson[key];
      const type =
        value === null ? "null" : Array.isArray(value) ? "Array" : typeof value;

      if (!["string", "number", "boolean"].includes(type)) {
        throw new Error(
          `Expected value to be string, number, or boolean. "${key}" value is ${type}`,
        );
      }
    }
    return parsedJson as ActionWorkflowInputs;
  } catch (error) {
    core.error("Failed to parse workflow_inputs JSON");
    if (error instanceof Error) {
      core.debug(error.stack ?? "");
    }
    throw error;
  }
}

function tryGetWorkflowAsNumber(workflowInput: string): string | number {
  // Only an all-digit input is an ID. parseInt would accept a numeric prefix
  // and turn a filename such as "01-build.yml" into the ID 1.
  return /^\d+$/.test(workflowInput) ? Number(workflowInput) : workflowInput;
}
