# wasm-deploy

Usage for the example project:

1. Pull the Solidity source files from git: `npx ts-node src/index.ts pull sample-project`
2. Deploy: `npx ts-node src/index.ts deploy sample-project --network foucoco`

Alternatively you can use the parameter `local` instead of `foucoco`. This expects that there is a local chain running on port `9944` – this is particularly useful to run together with the [foucoco-standalone](https://github.com/pendulum-chain/foucoco-standalone) node.

# Required

```
brew install binaryen
```
