# GitHub Action: return-dispatch

![GitHub Workflow Status](https://img.shields.io/github/workflow/status/codex-/return-dispatch/build-test?style=flat-square) [![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)

Dispatch an action to a foreign repository and output the newly created run ID.

This Action exists as a workaround for the issue where dispatching an action to foreign repository does not return any kind of identifier.

## Usage

Ensure you have configured your remote action correctly, see below for an example.

### Dispatching Repository Action

```yaml
steps:
  - name: Dispatch an action and get the run ID
    uses: codex-/return-dispatch@v1
    id: return-dispatch
    with:
      token: ${{ secrets.GITHUB_TOKEN }}
      ref: Target_Branch
      repo: repository-name
      owner: repository-owner
      workflow: automation-test.yml
      workflow_timeout_seconds: 300

  - name: Use the output run ID
    run: echo ${{steps.return-dispatch.outputs.runId}}
```

### Receiving Repository Action

Simply `echo` the input as early as possible in the run.

```yaml
name: action-test
on:
  workflow_dispatch:
    inputs:
      distinct_id:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - name: echo distinct ID.
        run: echo ${{ github.event.inputs.distinct_id }}
```

## Where does this help?

If you have an action in a repository that dispatches an action on a foreign repository currently with Github API there is no way to know what the foreign run you've just dispatched is. Identifying this can be cumbersome and tricky.

The consequence of not being provided with something to identify the run is that you cannot easily wait for this run or poll the run for it's completion status (success, failure, etc).

## Flow

```ascii
┌─────────────────┐
│                 │
│ Dispatch Action │
│                 │
│ with unique ID  │
│                 │
└───────┬─────────┘
        │
        │
        ▼                          ┌───────────────┐
┌────────────────┐                 │               │
│                │                 │ Download logs │
│ Request top 10 ├────────────────►│               │
│                │                 │ for each run  │
│ workflow runs  │                 │               │
│                │◄────────────────┤ and search    │
└───────┬────────┘     Retry       │               │
        │                          └───────┬───────┘
        │                                  │
Timeout │                                  │
        │                                  │
        ▼                                  ▼
     ┌──────┐                      ┌───────────────┐
     │ Fail │                      │ Output run ID │
     └──────┘                      └───────────────┘
```
