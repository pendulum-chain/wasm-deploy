import { WsProvider, ApiPromise, Keyring } from "@polkadot/api";
import { CodePromise, ContractPromise } from "@polkadot/api-contract";
import { AccountId, AccountId32, DispatchInfo, Event, Weight, WeightV2 } from "@polkadot/types/interfaces";
import { DispatchError } from "@polkadot/types/interfaces";
import { INumber, ITuple } from "@polkadot/types-codec/types";

import { readFile } from "node:fs/promises";
import { ConfigFile, Deployment, DeploymentArguments, NamedAccount, TxOptions } from "./types";
import { DeploymentState, ExecutionState } from ".";
import { SubmittableExtrinsic } from "@polkadot/api/types";
import { ISubmittableResult } from "@polkadot/types/types";

type ChainApiPromise = ReturnType<typeof connectToChain>;
export type ChainApi = ChainApiPromise extends Promise<infer T> ? T : never;

export type SubmitTransactionResult<T> = {
  transactionFee: bigint | undefined;
  result: { type: "success"; value: T } | { type: "error"; error: string };
};

async function submitTransaction<T>(
  submitter: NamedAccount,
  extrinsic: SubmittableExtrinsic<"promise", ISubmittableResult>,
  onReadyToSubmit: () => void,
  onFinalized: (events: Event[]) => T
): Promise<SubmitTransactionResult<T>> {
  return submitter.mutex.exclusive<SubmitTransactionResult<T>>(async () => {
    onReadyToSubmit();

    return await new Promise<SubmitTransactionResult<T>>(async (resolve, reject) => {
      try {
        const unsub = await extrinsic.signAndSend(submitter.keypair, { nonce: -1 }, (update) => {
          const { status, events } = update;

          if (status.isInBlock || status.isFinalized) {
            let transactionFee: bigint | undefined = undefined;
            let successResult: T | undefined = undefined;
            let failureResult: string | undefined = undefined;

            for (const eventRecord of events) {
              const {
                event: { data, section, method },
              } = eventRecord;

              if (section === "transactionPayment" && method === "TransactionFeePaid") {
                const [, actualFee] = data as unknown as ITuple<[AccountId32, INumber, INumber]>;
                transactionFee = actualFee.toBigInt();
              }

              if (section === "system" && method === "ExtrinsicFailed") {
                const [dispatchError] = data as unknown as ITuple<[DispatchError, DispatchInfo]>;
                let message = dispatchError.type.toString();

                if (dispatchError.isModule) {
                  try {
                    const module = dispatchError.asModule;
                    const error = dispatchError.registry.findMetaError(module);

                    message = error.docs[0] ?? `${error.section}.${error.name}`;
                  } catch {}
                }

                failureResult = message;
              }

              if (section === "system" && method === "ExtrinsicSuccess") {
                try {
                  const finalResult = onFinalized(events.map(({ event }) => event));
                  successResult = finalResult;
                } catch (error) {
                  failureResult = (error as Error).message;
                }
              }
            }

            if (failureResult !== undefined) {
              resolve({ transactionFee, result: { type: "error", error: failureResult } });
            } else {
              resolve({ transactionFee, result: { type: "success", value: successResult! } });
            }

            unsub();
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  });
}

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
  const mainTokenSymbol: string | undefined = tokenSymbols[0];

  const chainNameString = chainName.toString();

  console.log(`Connected to chain "${chainNameString}", token symbol: ${mainTokenSymbol}`);
  const keyring = new Keyring({ type: "sr25519", ss58Format: parsedSs58Prefix });

  return {
    getKeyring() {
      return keyring;
    },

    async instantiateWithCode(
      compiledContractFileName: string,
      deploymentArguments: DeploymentArguments,
      configFile: ConfigFile,
      updateContractStatus: (status: DeploymentState) => void
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

      const extrinsic = code.tx[constructorName]({ gasLimit, storageDepositLimit }, ...deploymentArguments.args);

      return await submitTransaction<string>(
        deployer,
        extrinsic,
        () => {
          updateContractStatus("deploying");
        },
        (events: Event[]) => {
          for (const event of events) {
            const { data, section, method } = event;
            if (section === "contracts" && method === "Instantiated") {
              const [, contract] = data as unknown as ITuple<[AccountId, AccountId]>;
              return contract.toString();
            }
          }

          throw new Error("Contract address not found");
        }
      );
    },

    async executeContractFunction(
      name: Deployment,
      tx: TxOptions,
      functionName: string,
      configFile: ConfigFile,
      updateExecutionStatus: (state: ExecutionState, gasRequired?: WeightV2, transactionResult?: string) => void,
      ...rest: any[]
    ) {
      const { compiledContractFileName, address } = name;
      const deployer = tx.from;
      if (deployer === undefined) {
        throw new Error(`Unknown deployer account`);
      }

      updateExecutionStatus("dry running");

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

      updateExecutionStatus("gas estimated", queryResult.gasRequired);

      const extrinsic = contract.tx[functionName](
        {
          storageDepositLimit,
          gasLimit: queryResult.gasRequired,
        },
        ...rest
      );

      return await submitTransaction<void>(
        deployer,
        extrinsic,
        () => {
          updateExecutionStatus("submitting");
        },
        (_events: Event[]) => {}
      );
    },
  };
}
