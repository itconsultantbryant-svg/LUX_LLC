import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Identity tests run repeated memory-hard scrypt derivations. Under the
    // parallel worker pool those can exceed the 5s default on a loaded machine,
    // so allow the same headroom the heavier suites already request explicitly.
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
});
