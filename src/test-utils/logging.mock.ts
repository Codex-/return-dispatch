import * as core from "@actions/core";
import { type MockInstance, vi, expect } from "vitest";

// Consuming test suites must first call:
// vi.mock("@actions/core");

interface MockedLoggingFunctions {
  coreDebugLogMock: MockInstance<(message: string) => void>;
  coreInfoLogMock: MockInstance<(message: string) => void>;
  coreErrorLogMock: MockInstance<(message: string) => void>;
  assertOnlyCalled: (
    ...coreLogMocks: MockInstance<(message: string) => void>[]
  ) => void;
}

export function mockLoggingFunctions(): MockedLoggingFunctions {
  const coreDebugLogMock: MockInstance<(typeof core)["debug"]> = vi
    .spyOn(core, "debug")
    .mockImplementation(() => undefined);
  const coreInfoLogMock: MockInstance<(typeof core)["info"]> = vi
    .spyOn(core, "info")
    .mockImplementation(() => undefined);
  const coreErrorLogMock: MockInstance<(typeof core)["error"]> = vi
    .spyOn(core, "error")
    .mockImplementation(() => undefined);

  const coreLogMockSet = new Set<MockInstance<(message: string) => void>>([
    coreDebugLogMock,
    coreInfoLogMock,
    coreErrorLogMock,
  ]);
  const assertOnlyCalled = (
    ...coreLogMocks: MockInstance<(message: string) => void>[]
  ): void => {
    assertOnlyCalledInner(coreLogMockSet, ...coreLogMocks);
  };

  return {
    coreDebugLogMock,
    coreInfoLogMock,
    coreErrorLogMock,
    assertOnlyCalled,
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
  const diff = coreLogMockSet.symmetricDifference(new Set(coreLogMocks));

  for (const logMock of diff) {
    expect(logMock).not.toHaveBeenCalled();
  }
}
