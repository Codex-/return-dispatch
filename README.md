# GitHub Action: return-dispatch

![GitHub Workflow Status](https://img.shields.io/github/workflow/status/codex-/return-dispatch/build-test?style=flat-square) [![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier) [![GitHub Marketplace](https://img.shields.io/badge/Marketplace-return–dispatch-blue.svg?colorA=24292e&colorB=0366d6&style=flat-square&longCache=true&logo=data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAM6wAADOsB5dZE0gAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAERSURBVCiRhZG/SsMxFEZPfsVJ61jbxaF0cRQRcRJ9hlYn30IHN/+9iquDCOIsblIrOjqKgy5aKoJQj4O3EEtbPwhJbr6Te28CmdSKeqzeqr0YbfVIrTBKakvtOl5dtTkK+v4HfA9PEyBFCY9AGVgCBLaBp1jPAyfAJ/AAdIEG0dNAiyP7+K1qIfMdonZic6+WJoBJvQlvuwDqcXadUuqPA1NKAlexbRTAIMvMOCjTbMwl1LtI/6KWJ5Q6rT6Ht1MA58AX8Apcqqt5r2qhrgAXQC3CZ6i1+KMd9TRu3MvA3aH/fFPnBodb6oe6HM8+lYHrGdRXW8M9bMZtPXUji69lmf5Cmamq7quNLFZXD9Rq7v0Bpc1o/tp0fisAAAAASUVORK5CYII=)](https://github.com/marketplace/actions/return-dispatch)

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
      token: ${{ secrets.TOKEN }} # Note this is NOT GITHUB_TOKEN but a PAT
      ref: target_branch # or refs/heads/target_branch
      repo: repository-name
      owner: repository-owner
      workflow: automation-test.yml
      workflow_inputs: { "some_input": "value" }
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

## Token

To be able to use dispatch we need to use a token which has `repo` permissions. `GITHUB_TOKEN` currently does not allow adding permissions for `repo` level permissions currently so a Personal Access Token (PAT) must be used.

The scope required to dispatch the action is `repo:public_repo` or `repo` if the repository is private.

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
