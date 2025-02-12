import * as core from "@actions/core";
import { symDiff } from "@opentf/std";
import { type MockInstance, vi, expect } from "vitest";

// Consuming test suites must first call:
// vi.mock("@actions/core");

interface MockedLoggingFunctions {
  coreDebugLogMock: MockInstance<(message: string) => void>;
  coreInfoLogMock: MockInstance<(message: string) => void>;
  coreWarningLogMock: MockInstance<(message: string) => void>;
  coreErrorLogMock: MockInstance<(message: string) => void>;
  assertOnlyCalled: (
    ...coreLogMocks: MockInstance<(message: string) => void>[]
  ) => void;
  assertNoneCalled: () => void;
}

export function mockLoggingFunctions(): MockedLoggingFunctions {
  const coreDebugLogMock: MockInstance<typeof core.debug> = vi
    .spyOn(core, "debug")
    .mockImplementation(() => undefined);
  const coreInfoLogMock: MockInstance<typeof core.info> = vi
    .spyOn(core, "info")
    .mockImplementation(() => undefined);
  const coreWarningLogMock: MockInstance<typeof core.error> = vi.spyOn(
    core,
    "warning",
  );
  const coreErrorLogMock: MockInstance<typeof core.error> = vi
    .spyOn(core, "error")
    .mockImplementation(() => undefined);

  const coreLogMockSet = new Set<MockInstance<(message: string) => void>>([
    coreDebugLogMock,
    coreInfoLogMock,
    coreWarningLogMock,
    coreErrorLogMock,
  ]);
  const assertOnlyCalled = (
    ...coreLogMocks: MockInstance<(message: string) => void>[]
  ): void => {
    assertOnlyCalledInner(coreLogMockSet, ...coreLogMocks);
  };

  const assertNoneCalled = (): void => {
    assertNoneCalledInner(coreLogMockSet);
  };

  return {
    coreDebugLogMock,
    coreInfoLogMock,
    coreWarningLogMock,
    coreErrorLogMock,
    assertOnlyCalled,
    assertNoneCalled,
  };
}

/**
 * Explicitly assert no rogue log calls are made
 * that are not correctly asserted in these tests
 */
function assertOnlyCalledInner(
  coreLogMockSet: Set<MockInstance<(message: string) => void>>,
  ...coreLogMocks: MockInstance<(message: string) => void>[]
): void {
  if (coreLogMocks.length <= 0) {
    throw new Error(
      "assertOnlyCalled must be called with at least one mock to assert",
    );
  }

  // Once Node 22 is LTS, this can be:
  // const diff = coreLogMockSet.symmetricDifference(new Set(coreLogMocks));

  const notCalled = symDiff([[...coreLogMockSet], coreLogMocks]);
  for (const logMock of notCalled) {
    expect(logMock).not.toHaveBeenCalled();
  }
  for (const logMock of coreLogMocks) {
    expect(logMock).toHaveBeenCalled();
  }
}

function assertNoneCalledInner(
  coreLogMockSet: Set<MockInstance<(message: string) => void>>,
): void {
  for (const logMock of coreLogMockSet) {
    expect(logMock).not.toHaveBeenCalled();
  }
}
