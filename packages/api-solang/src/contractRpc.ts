import { ApiPromise } from "@polkadot/api";
import { Abi } from "@polkadot/api-contract";
import {
  ContractExecResult,
  ContractExecResultOk,
  ContractInstantiateResult,
  Weight,
} from "@polkadot/types/interfaces";
import { BN_ZERO } from "@polkadot/util";
import { TypeDef } from "@polkadot/types/types";

import { Address, Limits } from "./index.js";
import { extractDispatchErrorDescription } from "./dispatchError.js";

export interface QueryContractOptions {
  api: ApiPromise;
  abi: Abi;
  contractAddress: Address;
  callerAddress: Address;
  messageName: string;
  limits: Limits;
  messageArguments: unknown[];
}

export type PanicCode = number;

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

export type QueryContractOutput =
  | { type: "success"; value: any }
  | { type: "reverted"; description: string }
  | { type: "panic"; errorCode: PanicCode; explanation: string }
  | { type: "error"; description?: string };

export interface QueryContractResult {
  gasRequired: Weight;
  output: QueryContractOutput;
}

function extractContractExecutionOutput(
  api: ApiPromise,
  abi: Abi,
  result: ContractExecResultOk,
  returnType: TypeDef | null | undefined
): QueryContractOutput {
  const data = result.data.toU8a(true);
  if (!result.flags.isRevert) {
    const value = returnType
      ? abi.registry.createTypeUnsafe(returnType.lookupName || returnType.type, [data], {
          isPedantic: true,
        })
      : undefined;
    return { type: "success", value };
  } else {
    const dataView = new DataView(data.buffer);
    const prefix = data.buffer.byteLength >= 4 ? dataView.getUint32(0) : 0;
    switch (prefix) {
      case 0x08c379a0:
        return { type: "reverted", description: api.createType("String", data.slice(4)).toString() };

      case 0x4e487b71:
        try {
          const errorCode =
            data.buffer.byteLength >= 36
              ? dataView.getBigUint64(4, true) +
                2n ** 64n * dataView.getBigUint64(12, true) +
                2n ** 128n * dataView.getBigUint64(20, true) +
                2n ** 192n * dataView.getBigUint64(28, true)
              : -1n;

          return {
            type: "panic",
            errorCode: Number(errorCode),
            explanation: explainPanicError(Number(errorCode)),
          };
        } catch {}

      default:
        return { type: "error" };
    }
  }
}

export async function rpcCall({
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
        resolve({ gasRequired, output: extractContractExecutionOutput(api, abi, result.asOk, message.returnType) });
      } else {
        resolve({ gasRequired, output: { type: "error", description: extractDispatchErrorDescription(result.asErr) } });
      }
    });
  });
}

export interface QueryInstantiateContractOptions {
  api: ApiPromise;
  abi: Abi;
  callerAddress: Address;
  constructorName: string;
  limits: Limits;
  constructorArguments: unknown[];
}

export async function rpcInstantiate({
  api,
  abi,
  callerAddress,
  constructorName,
  limits,
  constructorArguments,
}: QueryInstantiateContractOptions): Promise<QueryContractResult> {
  let resolved = false;

  return new Promise<QueryContractResult>((resolve) => {
    const constructor = abi.findConstructor(constructorName);
    const data = constructor.toU8a(constructorArguments);
    const salt = new Uint8Array();

    //const code = api.createType("Code", { Upload: abi.info.source.wasm });

    const observable = api.rx.call.contractsApi.instantiate<ContractInstantiateResult>(
      callerAddress,
      BN_ZERO,
      api.createType("WeightV2", limits.gas),
      limits.storageDeposit,
      { Upload: abi.info.source.wasm },
      data,
      salt
    );

    observable.forEach((event) => {
      if (resolved) {
        return;
      }
      resolved = true;

      const { result, gasRequired } = event;

      if (result.isOk) {
        resolve({
          gasRequired,
          output: extractContractExecutionOutput(api, abi, result.asOk.result, constructor.returnType),
        });
      } else {
        resolve({ gasRequired, output: { type: "error", description: extractDispatchErrorDescription(result.asErr) } });
      }
    });
  });
}
