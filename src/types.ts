import { Submitter } from "./api/api";

export type DeployedContractId = string;
export type ContractSourcecodeId = string;
export type NamedAccountId = string;
export type ScriptName = string;
export type Address = string;

export type NamedAccounts = Record<NamedAccountId, Submitter>;

export type ArgumentType = unknown;
