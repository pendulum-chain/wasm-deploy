import { ChainApi } from "../api";

export function rawAddressesAreEqual(address1: Uint8Array, address2: Uint8Array): boolean {
  if (address1.byteLength !== address2.byteLength) {
    return false;
  }

  for (let i = 0; i < address1.byteLength; i++) {
    if (address1[i] !== address2[i]) {
      return false;
    }
  }

  return true;
}

export function addressesAreEqual(address1: string, address2: string, chainApi: ChainApi): boolean {
  const rawAddress1 = chainApi.getKeyring().addFromAddress(address1).addressRaw;
  const rawAddress2 = chainApi.getKeyring().addFromAddress(address2).addressRaw;

  return rawAddressesAreEqual(rawAddress1, rawAddress2);
}
