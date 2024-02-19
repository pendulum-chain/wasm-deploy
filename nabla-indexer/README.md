These are tests for the Subsquid indexer for Nabla.

This folder should be eventually moved to our subsquid repository https://github.com/pendulum-chain/pendulum-squids.

To run these tests:

- run foucoco-standalone from scratch locally
- run our subsquid indexer from scratch locally
  - this requires some changes that allow to run the indexer locally
  - `sqd down && sqd up && sqd process:foucoco`
- run this test suite here
  - `npx ts-node src/index.ts test nabla-indexer --network local`
