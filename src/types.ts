export type DeployedContractId = string;
export type ContractSourcecodeId = string;
export type NamedAccountId = string;
export type ScriptName = string;
export type Address = string;

export type NamedAccounts = Record<NamedAccountId, NamedAccount>;
export interface NamedAccount {
  accountId: Address;
}

export type ArgumentType = unknown;
