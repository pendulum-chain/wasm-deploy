import { DispatchError } from "@polkadot/types/interfaces";

export function extractDispatchErrorDescription(dispatchError: DispatchError): string {
  if (dispatchError.isModule) {
    try {
      const module = dispatchError.asModule;
      const error = dispatchError.registry.findMetaError(module);

      return `${error.section}.${error.name}: ${error.docs[0]}` ?? `${error.section}.${error.name}`;
    } catch {}
  }

  return dispatchError.type.toString();
}
