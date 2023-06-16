import { WsProvider, ApiPromise, Keyring } from "@polkadot/api";
import { CodePromise, ContractPromise } from "@polkadot/api-contract";
import { WeightV2 } from "@polkadot/types/interfaces";
import { DispatchError } from "@polkadot/types/interfaces";
import { ITuple } from "@polkadot/types-codec/types";

import { readFile } from "node:fs/promises";
import { ConfigFile, Deployment, DeploymentArguments, TxOptions } from "./types";

type ChainApiPromise = ReturnType<typeof connectToChain>;
export type ChainApi = ChainApiPromise extends Promise<infer T> ? T : never;

export async function connectToChain(rpcUrl: string) {
  const provider = new WsProvider(rpcUrl);

  const api = await ApiPromise.create({
    provider: provider,
    noInitWarn: true,
  });

  const [chainProperties, ss58Prefix, chainName] = await Promise.all([
    api.rpc.system.properties(),
    api.consts.system.ss58Prefix,
    api.rpc.system.chain(),
  ]);

  const parsedSs58Prefix = Number.parseInt(ss58Prefix.toString() || "0", 10);

  const tokenDecimals = chainProperties.tokenDecimals
    .unwrapOrDefault()
    .toArray()
    .map((i) => i.toNumber());

  const tokenSymbols = chainProperties.tokenSymbol
    .unwrapOrDefault()
    .toArray()
    .map((i) => i.toString());

  const chainNameString = chainName.toString();

  const keyring = new Keyring({ type: "sr25519", ss58Format: parsedSs58Prefix });

  return {
    getKeyring() {
      return keyring;
    },

    async instantiateWithCode(
      name: string,
      compiledContractFileName: string,
      deploymentArguments: DeploymentArguments,
      configFile: ConfigFile
    ) {
      const deployer = deploymentArguments.from;
      if (deployer === undefined) {
        throw new Error(`Unknown deployer account`);
      }

      const compiledContractFile = await readFile(compiledContractFileName);
      const compiledContract = JSON.parse(compiledContractFile.toString("utf8"));
      const abi = compiledContract;
      const wasm = compiledContract.source?.wasm;

      const code = new CodePromise(api, abi, wasm);
      const constructorName = deploymentArguments.constructorName ?? "new";

      if (typeof code.tx[constructorName] !== "function") {
        throw new Error(`Contract has no constructor called ${constructorName}`);
      }

      const { gas, storageDeposit: storageDepositLimit } = configFile.limits;

      const gasLimit = api.createType("WeightV2", gas) as WeightV2;

      const tx = code.tx[constructorName]({ gasLimit, storageDepositLimit }, ...deploymentArguments.args);

      return await deployer.mutex.exclusive<string>(async () => {
        console.log(`  Instantiate contract ${name} from ${deploymentArguments.contract}`);

        return await new Promise<string>(async (resolve, reject) => {
          const unsub = await tx.signAndSend(deployer.keypair, { nonce: -1 }, ({ status, events }) => {
            // handle transaction errors
            events
              .filter((record): boolean => Boolean(record.event) && record.event.section !== "democracy")
              .forEach(({ event: { data, method, section } }) => {
                if (section === "system" && method === "ExtrinsicFailed") {
                  const [dispatchError] = data as unknown as ITuple<[DispatchError]>;
                  let message = dispatchError.type.toString();

                  if (dispatchError.isModule) {
                    try {
                      const mod = dispatchError.asModule;
                      const error = dispatchError.registry.findMetaError(mod);

                      message = `${error.section}.${error.name}`;
                    } catch (error) {
                      console.error(error);
                    }
                  } else if (dispatchError.isToken) {
                    message = `${dispatchError.type}.${dispatchError.asToken.type}`;
                  }

                  const errorMessage = `${section}.${method} ${message}`;
                  console.error(`error: ${errorMessage}`);
                }
              });

            if (status.isInBlock || status.isFinalized) {
              const instantiateEvent = events.find(({ event }: any) => event.method === "Instantiated");

              const addresses = instantiateEvent?.event.data.toHuman() as {
                contract: string;
                deployer: string;
              };

              if (!addresses || !addresses.contract) {
                reject(new Error("Unable to get the contract address"));
              } else {
                resolve(addresses.contract);
              }
              unsub();
            }
          });
        });
      });
    },

    async executeContractFunction(
      name: Deployment,
      tx: TxOptions,
      functionName: string,
      configFile: ConfigFile,
      ...rest: any[]
    ) {
      const { compiledContractFileName, address } = name;
      const deployer = tx.from ?? name.deployer;
      if (deployer === undefined) {
        throw new Error(`Unknown deployer account`);
      }

      if (tx.log) {
        console.log(`  Execute function ${functionName} with arguments ${rest}`);
      }

      const compiledContractFile = await readFile(compiledContractFileName);
      const metadata = JSON.parse(compiledContractFile.toString("utf8"));

      const contract = new ContractPromise(api, metadata, address);

      const { gas, storageDeposit: storageDepositLimit } = configFile.limits;
      const queryResult = await contract.query[functionName](
        deployer.keypair.address,
        {
          gasLimit: api.createType("WeightV2", gas) as WeightV2,
          storageDepositLimit,
        },
        ...rest
      );

      if (tx.log) {
        console.log(
          `  Gas required: ${queryResult.gasRequired["refTime"]} (proofSize: ${queryResult.gasRequired["proofSize"]})`
        );
      }

      const txResult = contract.tx[functionName](
        {
          storageDepositLimit,
          gasLimit: queryResult.gasRequired,
        },
        ...rest
      );

      await deployer.mutex.exclusive<void>(async () => {
        await new Promise<void>(async (resolve) => {
          const unsub = await txResult.signAndSend(deployer.keypair, async (result: any) => {
            if (result.status.isFinalized || result.status.isInBlock) {
              if (tx.log) {
                console.log("  Tx result:");
                console.log(`  ${JSON.stringify(result.toHuman())}`);
              }

              resolve();
              unsub();
            }
          });
        });
      });
    },
  };
}
