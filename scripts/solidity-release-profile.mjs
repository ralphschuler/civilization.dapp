// The only compiler profile permitted for CivilizationGame implementation
// artifacts. Keep this shared by release tooling and runtime compatibility
// tests: a test-only size profile would not protect deployable bytecode.
export const SOLIDITY_RELEASE_PROFILE = Object.freeze({
  optimizer: Object.freeze({ enabled: true, runs: 10 }),
  viaIR: true,
});

export const EIP170_RUNTIME_LIMIT = 24_576;
