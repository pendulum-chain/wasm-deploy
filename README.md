# wasm-deploy

Usage `npm start sample-project foucoco`

## Foucoco

# Required
To install 'wasm-opt' on macOS, use:
```
brew install binaryen
```

TODO

- password
- transaction fee
- textwrap
- docs

# Local Setup

- To get started you need to clone contract repos OR paste pre-compiled contracts in `wasm-deploy/target`.
- The cloned repositories should live in the `../clones` directory, relative to the `wasm-deploy` directory.
  - Nabla contracts
    in `../clones/nabla-contracts` (`git clone https://github.com/0xamberhq/contracts.git ../clones/nabla-contracts`)
  - Nabla curve in `../clones/nabla-curve` (`git clone https://github.com/0xamberhq/curve.git ../clones/nabla-curve`)
  - Pendulum-ink-wrapper
    in `../clones/pendulum-ink-wrapper` (`git clone https://github.com/pendulum-chain/pendulum-ink-wrapper.git ../clones/pendulum-ink-wrapper`)
- To use pre-compiled contracts, you'll still need a `.sol` file for it in the expected path, for example for `AmberCurve.sol`, containing only `abstract contract AmberCurve {}`)
- Create deployer account with polkadot.js extension. Make sure to write down the seed phrase, as you will need it.

# Local Usage

- Run zombienet
- In `nabla-deploy/config.json`, update the port in `networks.local.rpcUrl`
- Call extrinsic: `tokenAllowance::addAllowedCurrencies`  to enable assets. (must be called by `RawOrigin::Root`)
  Add: `Native`, `XCM(0)`, `XCM(1)`
- Call extrinsic: `diaOracleModule::addCurrency` and `diaOracleModule::setUpdatedCoinInfos` to add price feeds for the
  following currencies:
    - Blockchain: `Native`, Symbol: `NAT`
    - Blockchain: `XCM0`, Symbol: `X0`
    - Blockchain: `XCM1`, Symbol: `X1`
    - For this, you can pick a price of `1000000000000` for all currencies. You should also use
      the `lastUpdateTimestamp` field.
- Provide funds to deployer
- To deploy Nabla, `npm run deploy-local`, and paste seed phrase.
- To run Nabla tests:
    - `npm run test-backstop-local`, and paste seed phrase.
    - `npm run test-swappool-local`, and paste seed phrase.
    - `npm run test-swaps-local`, and paste seed phrase.