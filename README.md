# wasm-deploy

Usage `npm start sample-project foucoco`

## Foucoco

# Required

```
brew install binaryen
```

TODO

- password
- transaction fee
- textwrap
- docs


# Local Setup

- Clone contract repos: (OR paste pre-compiled contracts in `wasm-deploy/target`. Ex: `AmberCurve.contract`, but you'll still need a `.sol` file for it in the expected path, containing only `abstract contract AmberCurve {}`)
    - Nabla contracts in `../clones/nabla-contracts`
    - Nabla curve in `../clones/nabla-curve` 
    - Pendulum-ink-wrapper in `../clones/pendulum-ink-wrapper`
- Create deployer account with polkadot.js extension. Make sure to write down the seed phrase, you will need it.

# Local Usage 

- Run zombienet
- In `nabla-testing/config.json`, update the port in `networks.local.rpcUrl`
- Call extrinsic: `tokenAllowance::addAllowedCurrencies`  to enable assets. (must be called by `RawOrigin::Root`) Add: `Native`, `XCM(0)`, `XCM(1)`
- Call extrinsic: `diaOracleModule::setUpdatedCoinInfos` to add price feeds. Add: 
    - Blockchain: `Native`, Symbol: `NAT`
    - Blockchain: `XCM0`, Symbol: `X0`
    - Blockchain: `XCM1`, Symbol: `X1`
- Provide funds to deployer
- Use `npm run local`, and paste seed phrase.