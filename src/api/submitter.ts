import { Address } from "../types";
import { KeyringPair } from "@polkadot/keyring/types";
import { PromiseMutex } from "../utils/promiseMutex";
import { ApiPromise } from "@polkadot/api";
import { Extrinsic } from "@pendulum-chain/api-solang";

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

export function modifyExtrinsic(api: ApiPromise, submitter: Submitter, extrinsic: Extrinsic): Extrinsic {
  switch (submitter.type) {
    case "signing":
      return extrinsic;

    case "force": {
      const wrappedExtrinsic = api.tx.utility.dispatchAs({ system: { signed: submitter.accountId } }, extrinsic);
      return api.tx.sudo.sudoUncheckedWeight(wrappedExtrinsic, 0);
    }
  }
}

export function extractSigningSubmitter(submitter: Submitter): SigningSubmitter {
  switch (submitter.type) {
    case "signing":
      return submitter;

    case "force": {
      return submitter.rootSigningSubmitter;
    }
  }
}
