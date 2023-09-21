# wasm-deploy

Usage:

1. Install the `wasm-deploy` tool globally: `npm install -g wasm-deploy`

2. Initiate a project by moving to the desired folder, and running: `wasm-deploy init <project-name>`
    This will create a local typescript project, and add `wasm-deploy` dependency to it. 

3. Edit `config.json` in the root project folder.

4. Write deploy/tests scripts in corresponding project folders.

5. Deploy or Test:
    - Deploy: `wasm-deploy deploy <project-name> --network <network>`
    - Test: `wasm-deploy test <project-name> --network <network>`

Alternatively you can use the parameter `local` instead of `foucoco`. This expects that there is a local chain running on port `9944` – this is particularly useful to run together with the [foucoco-standalone](https://github.com/pendulum-chain/foucoco-standalone) node.

### Running with typescript
Alternatively, clone this repo and run the following commands:

```npx ts-node src/cli.ts <command> <project-name> ...```

# Required

```
brew install binaryen
```


# Project Config
## Contracts
Inside the config.json created in your project root folder, add the conctract information that will be used in deployments or testing.

Contracts can either be pulled from a remote repository (defined elsewhere in config.json), or added to the project precompiled.

Example pulling contract from remote repository:
``` 
"contracts": {
    "MyContract": {
      "repository": "MyContracts",
      "path": "path/to/my_contract.sol"
    },
    ...
```


Example using a pre-compiled version of the contract, including the metadata:
``` 
"contracts": {
    "MyPcContract": {
      "path": "/local/path/to/myPcContract.contract",
      "isPrecompiled": true
    },
    ...
```