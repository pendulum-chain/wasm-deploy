# wasm-deploy

Usage for the example project:

1. Pull the Solidity source files from git: `npx tsx src/index.ts pull nabla`
2. Deploy: `npx tsx src/index.ts deploy nabla --network foucoco --deployment mockTestnet`

Alternatively you can use the parameter `local` instead of `foucoco`. This expects that there is a local chain running
on port `9944` – this is particularly useful to run together with
the [foucoco-standalone](https://github.com/pendulum-chain/foucoco-standalone) node.

## General deployment instructions

The `deploy` command takes two required arguments:

- `--network`: one of the networks defined in the file `nabla/config.json` (`pendulum`, `foucoco` or `local`)
- `--deployment`: one of the deployment definitions, see `nabla/deployments/selector.ts`:
  - `usdtVortexPrototype`: described [on Notion](https://www.notion.so/satoshipay/24-05-16-USDT-Prototype-Deployment-1118b1b29b2f806f9070e734a10162d3)
  - `usdcAxelarVortexPrototype`: described [on Notion](https://www.notion.so/satoshipay/24-07-04-USDC-axl-Prototype-Deployment-1118b1b29b2f80c7ba3ad321c6bb3e8b)
  - `productionPendulum`: described [on Notion](https://www.notion.so/satoshipay/24-09-30-Public-Deployment-1118b1b29b2f807283dbd10e0a6ae8b9)
  - `mockTestnet`: described [on Notion](https://www.notion.so/satoshipay/24-09-30-Nabla-Foucoco-Paseo-Deployment-1118b1b29b2f804eababf94383a56f7b)
  - `slippageTest`: used for validating slippage calulcations, see [this page on Notion](https://www.notion.so/satoshipay/24-09-30-Public-Deployment-1118b1b29b2f807283dbd10e0a6ae8b9?pvs=4#1158b1b29b2f80bc8be8efb7bc5197b4)

# Required

```
brew install binaryen
```

## Install solang

You can find the installation instructions for solang [here](https://solang.readthedocs.io/en/v0.3.3/installing.html).

### Build from source

If you want to test a specific version, you can build solang from source.

#### Install Rust

Make sure you have at least rust v1.74 or later installed.
You can install it with rustup using

```shell
rustup install 1.74
rustup default <that_version>
```

#### LLVM

You need to have a custom version of LLVM available.
To install it, please follow the
steps [here](https://solang.readthedocs.io/en/v0.3.3/installing.html#step-1-install-the-llvm-libraries).

#### Build solang

Clone the solang repository and build it:

```shell
mkdir clones
cd clones
git clone https://github.com/hyperledger/solang/
cd solang
cargo build --release
```

### Troubleshooting

If you encounter issues during the compilation, consider switching to the
latest [release](https://github.com/hyperledger/solang/releases) version instead of building directly from `main`
branch.

# Deploying the contracts

Before deploying the contracts, you need to make sure that the contracts are available in the `target/git` directory.
To do this, run the following command:

```shell
npm run pull:nabla
```

This will clone the contracts from the git repository and place them in the `target/git` directory.

Then, you can deploy the contracts using the following command:

```shell
# Deploy to Foucoco
npm run deploy:foucoco
# Deploy to local chain
npm run deploy:local
```

### Troubleshooting

#### 'file not found '@openzeppelin/contracts/token/ERC20/ERC20.sol' (or similar)

If you encounter the errors about missing contract files, you need to make sure that the Solidity files are present in
the
`target/git` directory.
In the `nabla/config.json` file, you can find configuration of import paths for additional Solidity files.
In order for this to work, you need to make sure that the `node_modules` folder is present in each of the cloned
subdirectories of `target/git`.
These are only available if the `npm install` or `yarn install` command was executed successfully in the respective
directory.
This should automatically be done by the 'deploy' script though, so if you encounter this issue, try debugging
dependency issues in the respective `package.json` file.
