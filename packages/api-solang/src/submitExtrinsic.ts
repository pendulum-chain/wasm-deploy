import { Event, AccountId32, DispatchError, DispatchInfo } from "@polkadot/types/interfaces";
import { AddressOrPair, SignerOptions, SubmittableExtrinsic } from "@polkadot/api/types";
import { ISubmittableResult, Signer } from "@polkadot/types/types";
import { INumber, ITuple } from "@polkadot/types-codec/types";
import { KeyringPair } from "@polkadot/keyring/types";

import { extractDispatchErrorDescription } from "./dispatchError.js";
import { Address } from "./index.js";

export type Extrinsic = SubmittableExtrinsic<"promise", ISubmittableResult>;

export type SubmitExtrinsicStatus = { type: "success" } | { type: "error"; error: string };

export interface SubmitExtrinsicResult {
  transactionFee: bigint | undefined;
  events: Event[];
  status: SubmitExtrinsicStatus;
}

export interface KeyPairSigner {
  type: "keypair";
  keypair: KeyringPair;
}

export interface GenericSigner {
  type: "signer";
  address: Address;
  signer: Signer;
}

export function getSignerAddress(signer: KeyPairSigner | GenericSigner) {
  switch (signer.type) {
    case "keypair":
      return signer.keypair.address;

    case "signer":
      return signer.address;
  }
}

export async function submitExtrinsic(
  extrinsic: Extrinsic,
  signer: KeyPairSigner | GenericSigner
): Promise<SubmitExtrinsicResult> {
  return await new Promise<SubmitExtrinsicResult>(async (resolve, reject) => {
    try {
      let account: AddressOrPair;
      let signerOptions: Partial<SignerOptions>;

      switch (signer.type) {
        case "keypair":
          account = signer.keypair;
          signerOptions = { nonce: -1 };
          break;

        case "signer":
          account = signer.address;
          signerOptions = { nonce: -1, signer: signer.signer };
          break;
      }

      const unsub = await extrinsic.signAndSend(account, signerOptions, (update) => {
        const { status, events: eventRecords } = update;

        const events = eventRecords.map(({ event }) => event);
        if (status.isInBlock || status.isFinalized) {
          let transactionFee: bigint | undefined = undefined;
          let status: SubmitExtrinsicStatus | undefined = undefined;

          for (const event of events) {
            const { data, section, method } = event;

            if (section === "transactionPayment" && method === "TransactionFeePaid") {
              const [, actualFee] = data as unknown as ITuple<[AccountId32, INumber, INumber]>;
              transactionFee = actualFee.toBigInt();
            }

            if (section === "system" && method === "ExtrinsicFailed") {
              const [dispatchError] = data as unknown as ITuple<[DispatchError, DispatchInfo]>;
              status = { type: "error", error: extractDispatchErrorDescription(dispatchError) };
            }

            if (section === "system" && method === "ExtrinsicSuccess") {
              status = { type: "success" };
            }
          }

          if (status !== undefined) {
            unsub();
            resolve({ transactionFee, events, status });
          }
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}
