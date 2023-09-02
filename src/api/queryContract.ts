import { ApiPromise } from "@polkadot/api";
import { Abi } from "@polkadot/api-contract";
import { ContractExecResult, DispatchError, Weight } from "@polkadot/types/interfaces";

import { Address } from "../types";
import { LimitsConfig } from "../parseConfig";
import { BN_ZERO } from "@polkadot/util";

export interface QueryContractOptions {
  api: ApiPromise;
  abi: Abi;
  contractAddress: Address;
  callerAddress: Address;
  messageName: string;
  limits: LimitsConfig;
  messageArguments: unknown[];
}

export type PanicCode = number;
export type PanicError = { type: "panic"; errorCode: PanicCode };

// error explanations taken from https://docs.soliditylang.org/en/v0.8.20/control-structures.html#panic-via-assert-and-error-via-require
export function explainPanicError(errorCode: PanicCode): string {
  switch (errorCode) {
    case 0x00:
      return "Used for generic compiler inserted panics.";
    case 0x01:
      return "Assert called with an argument that evaluated to false.";
    case 0x11:
      return "Arithmetic operation resulted in underflow or overflow outside of an unchecked { ... } block.";
    case 0x12:
      return "Division or modulo by zero (e.g. 5 / 0 or 23 % 0).";
    case 0x21:
      return "Converted a value that is too big or negative into an enum type.";
    case 0x22:
      return "Accessed a storage byte array that is incorrectly encoded.";
    case 0x31:
      return "Called .pop() on an empty array.";
    case 0x32:
      return "Accessed an array, bytesN or an array slice at an out-of-bounds or negative index (i.e. x[i] where i >= x.length or i < 0).";
    case 0x41:
      return "Allocated too much memory or create an array that is too large.";
    case 0x51:
      return "Called a zero-initialized variable of internal function type.";
    default:
      return "Unknown panic error";
  }
}

export interface QueryContractResult {
  gasRequired: Weight;
  output:
    | { type: "success"; value: any }
    | { type: "reverted"; description: string }
    | PanicError
    | { type: "error"; error?: DispatchError };
}

// the following function is simpler than the one below and can be used when
// the following bug is fixed: https://github.com/polkadot-js/api/issues/5712
/*
export async function queryContract(
  { api, contract, callerAddress, messageName, limits }: QueryContractOptions,
  ...rest: any[]
): Promise<QueryContractResult> {
  const queryResult = await contract.query[messageName](
    callerAddress,
    {
      gasLimit: api.createType("WeightV2", limits.gas) as WeightV2,
      storageDepositLimit: limits.storageDeposit,
    },
    ...rest
  );

  return {
    gasRequired: queryResult.gasRequired,
  };
}
*/

export async function queryContract({
  api,
  abi,
  callerAddress,
  messageName,
  contractAddress,
  limits,
  messageArguments,
}: QueryContractOptions): Promise<QueryContractResult> {
  let resolved = false;
  return new Promise<QueryContractResult>((resolve) => {
    const message = abi.findMessage(messageName);

    const observable = api.rx.call.contractsApi.call<ContractExecResult>(
      callerAddress,
      api.createType("AccountId", contractAddress),
      BN_ZERO,
      api.createType("WeightV2", limits.gas),
      limits.storageDeposit,
      message.toU8a(messageArguments)
    );

    observable.forEach((event) => {
      if (resolved) {
        return;
      }
      resolved = true;

      const { result, gasRequired } = event;

      if (result.isOk) {
        const data = result.asOk.data.toU8a(true);
        if (!result.asOk.flags.isRevert) {
          const value = message.returnType
            ? abi.registry.createTypeUnsafe(message.returnType.lookupName || message.returnType.type, [data], {
                isPedantic: true,
              })
            : undefined;
          resolve({ gasRequired, output: { type: "success", value } });
        } else {
          const dataView = new DataView(data.buffer);
          const prefix = dataView.getUint32(0);
          switch (prefix) {
            case 0x08c379a0:
              resolve({
                gasRequired,
                output: { type: "reverted", description: api.createType("String", data.slice(4)).toString() },
              });
              break;

            case 0x4e487b71:
              try {
                const errorCode =
                  dataView.getBigUint64(4, true) +
                  2n ** 64n * dataView.getBigUint64(12, true) +
                  2n ** 128n * dataView.getBigUint64(20, true) +
                  2n ** 192n * dataView.getBigUint64(28, true);

                resolve({
                  gasRequired,
                  output: { type: "panic", errorCode: Number(errorCode) },
                });
                break;
              } catch {}

            default:
              resolve({ gasRequired, output: { type: "error" } });
              break;
          }
        }
      } else {
        resolve({ gasRequired, output: { type: "error", error: result.asErr } });
      }
    });
  });
}
