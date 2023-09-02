import { Event, AccountId32, DispatchError, DispatchInfo } from "@polkadot/types/interfaces";
import { SubmittableExtrinsic } from "@polkadot/api/types";
import { ISubmittableResult } from "@polkadot/types/types";
import { INumber, ITuple } from "@polkadot/types-codec/types";
import { Address } from "../types";
import { KeyringPair } from "@polkadot/keyring/types";
import { PromiseMutex } from "../helpers/promiseMutex";
import { ApiPromise } from "@polkadot/api";

export type Submitter = SigningSubmitter | ForceSubmitter;

export interface SigningSubmitter {
  type: "signing";
  keypair: KeyringPair;
  mutex: PromiseMutex;
}

export interface ForceSubmitter {
  type: "force";
  accountId: Address;
  rootSigningSubmitter: SigningSubmitter;
}

export function getSubmitterAddress(submitter: Submitter): Address {
  switch (submitter.type) {
    case "signing":
      return submitter.keypair.address;

    case "force":
      return submitter.accountId;
  }
}

export interface SubmitTransactionOptions {
  api: ApiPromise;
  submitter: Submitter;
  extrinsic: SubmittableExtrinsic<"promise", ISubmittableResult>;
  onReadyToSubmit?: () => void;
}

export type SubmitTransactionStatus = { type: "success" } | { type: "error"; error: string };

export interface SubmitTransactionResult {
  transactionFee: bigint | undefined;
  events: Event[];
  status: SubmitTransactionStatus;
}

export async function submitTransaction({
  api,
  submitter,
  extrinsic,
  onReadyToSubmit,
}: SubmitTransactionOptions): Promise<SubmitTransactionResult> {
  switch (submitter.type) {
    case "signing":
      return submitter.mutex.exclusive<SubmitTransactionResult>(async () => {
        onReadyToSubmit?.();
        return actuallySubmit(extrinsic, submitter.keypair);
      });

    case "force": {
      const wrappedExtrinsic = api.tx.utility.dispatchAs({ system: { signed: submitter.accountId } }, extrinsic);
      const sudoExtrinsic = api.tx.sudo.sudoUncheckedWeight(wrappedExtrinsic, 0);

      return submitTransaction({
        api,
        submitter: submitter.rootSigningSubmitter,
        extrinsic: sudoExtrinsic,
        onReadyToSubmit,
      });
    }
  }
}

async function actuallySubmit(
  extrinsic: SubmittableExtrinsic<"promise", ISubmittableResult>,
  keypair: KeyringPair
): Promise<SubmitTransactionResult> {
  return await new Promise<SubmitTransactionResult>(async (resolve, reject) => {
    try {
      const unsub = await extrinsic.signAndSend(keypair, { nonce: -1 }, (update) => {
        const { status, events: eventRecords } = update;

        const events = eventRecords.map(({ event }) => event);
        if (status.isInBlock || status.isFinalized) {
          let transactionFee: bigint | undefined = undefined;
          let status: SubmitTransactionStatus | undefined = undefined;

          for (const event of events) {
            const { data, section, method } = event;

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

              status = { type: "error", error: message };
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
