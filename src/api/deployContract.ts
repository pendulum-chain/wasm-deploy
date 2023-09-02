import { ApiPromise } from "@polkadot/api";
import { CodePromise, Abi } from "@polkadot/api-contract";
import { AccountId, WeightV2, Event } from "@polkadot/types/interfaces";
import { ITuple } from "@polkadot/types-codec/types";

import { LimitsConfig } from "../parseConfig";
import { Address } from "../types";
import { SubmitTransactionStatus, Submitter, submitTransaction } from "./submitTransaction";

interface BasicDeployContractOptions {
  api: ApiPromise;
  contractMetadata: Abi;
  constructorArguments: unknown[];
  constructorName?: string;
  limits: LimitsConfig;
  submitter: Submitter;
  onStartingDeployment?: () => void;
}

interface BasicDeployContractResult {
  events: Event[];
  deploymentAddress: Address;
  transactionFee: bigint | undefined;
  status: SubmitTransactionStatus;
}

export async function basicDeployContract({
  api,
  contractMetadata,
  constructorArguments,
  constructorName,
  limits,
  submitter,
  onStartingDeployment,
}: BasicDeployContractOptions): Promise<BasicDeployContractResult> {
  const code = new CodePromise(api, contractMetadata, undefined);

  constructorName = constructorName ?? "new";
  try {
    contractMetadata.findConstructor(constructorName);
  } catch {
    throw new Error(`Contract has no constructor called ${constructorName}`);
  }

  const { gas, storageDeposit: storageDepositLimit } = limits;
  const gasLimit = api.createType("WeightV2", gas) as WeightV2;

  const extrinsic = code.tx[constructorName]({ gasLimit, storageDepositLimit }, ...constructorArguments);

  const { events, status, transactionFee } = await submitTransaction({
    api,
    submitter,
    extrinsic,
    onReadyToSubmit: onStartingDeployment,
  });

  let deploymentAddress: Address | undefined = undefined;

  for (const event of events) {
    const { data, section, method } = event;
    if (section === "contracts" && method === "Instantiated") {
      const [, contract] = data as unknown as ITuple<[AccountId, AccountId]>;
      deploymentAddress = contract.toString() as Address;
    }
  }

  if (deploymentAddress === undefined) {
    throw new Error("Contract address not found");
  }

  return { deploymentAddress, events, status, transactionFee };
}
