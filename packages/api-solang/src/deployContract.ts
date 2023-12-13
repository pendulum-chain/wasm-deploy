import { ApiPromise } from "@polkadot/api";
import { CodePromise, Abi } from "@polkadot/api-contract";
import { AccountId, Event } from "@polkadot/types/interfaces";
import { ITuple } from "@polkadot/types-codec/types";

import { Limits, Address } from "./index.js";
import { Extrinsic, GenericSigner, KeyPairSigner, getSignerAddress, submitExtrinsic } from "./submitExtrinsic.js";
import { PanicCode, rpcInstantiate } from "./contractRpc.js";

export interface BasicDeployContractOptions {
  api: ApiPromise;
  abi: Abi;
  constructorArguments: unknown[];
  constructorName?: string;
  limits: Limits;
  signer: KeyPairSigner | GenericSigner;
  modifyExtrinsic?: (extrinsic: Extrinsic) => Extrinsic;
}

export type BasicDeployContractResult =
  | { type: "success"; events: Event[]; deploymentAddress: Address; transactionFee: bigint | undefined }
  | { type: "error"; error: string }
  | { type: "reverted"; description: string }
  | { type: "panic"; errorCode: PanicCode; explanation: string };

export async function basicDeployContract({
  api,
  abi,
  constructorArguments,
  constructorName,
  limits,
  signer,
  modifyExtrinsic,
}: BasicDeployContractOptions): Promise<BasicDeployContractResult> {
  const code = new CodePromise(api, abi, undefined);

  constructorName = constructorName ?? "new";
  try {
    abi.findConstructor(constructorName);
  } catch {
    throw new Error(`Contract has no constructor called ${constructorName}`);
  }

  const { gasRequired, output } = await rpcInstantiate({
    api,
    abi,
    callerAddress: getSignerAddress(signer),
    constructorName,
    limits,
    constructorArguments,
  });

  switch (output.type) {
    case "reverted":
    case "panic":
      return output;

    case "error":
      return { type: "error", error: output.description ?? "unknown" };
  }

  const { storageDeposit: storageDepositLimit } = limits;

  let extrinsic = code.tx[constructorName]({ gasLimit: gasRequired, storageDepositLimit }, ...constructorArguments);

  if (modifyExtrinsic) {
    extrinsic = modifyExtrinsic(extrinsic);
  }
  const { events, status, transactionFee } = await submitExtrinsic(extrinsic, signer);

  if (status.type === "error") {
    return { type: "error", error: `Contract could not be deployed: ${status.error}` };
  }

  let deploymentAddress: Address | undefined = undefined;

  for (const event of events) {
    const { data, section, method } = event;

    if (section === "contracts" && method === "Instantiated") {
      const [, contract] = data as unknown as ITuple<[AccountId, AccountId]>;
      deploymentAddress = contract.toString() as Address;
    }
  }

  if (deploymentAddress === undefined) {
    return { type: "error", error: "Contract address not found" };
  }

  return { type: "success", deploymentAddress, events, transactionFee };
}
