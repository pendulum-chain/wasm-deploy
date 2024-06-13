These are tests for the Subsquid indexer for Nabla.

This folder should be eventually moved to our subsquid repository https://github.com/pendulum-chain/pendulum-squids.

To run these tests:

- run foucoco-standalone from scratch locally
- run our subsquid indexer from scratch locally
  - this requires some changes that allow to run the indexer locally
  - in the pendulum-squids project: `sqd down && sqd up && sqd process:local`
- run the graphql server locally
  - in the pendulum-squids project: `sqd serve`
- run this test suite here
  - `npx tsx src/index.ts test nabla-indexer --network local`
