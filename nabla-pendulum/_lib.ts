import { DeploymentsExtension, Network, TxOptions } from "../src/index";

export function isTestnet(network: Network) {
  return ["foucoco", "local"].includes(network.name.toLowerCase());
}

export async function registerAsset(
  deployments: DeploymentsExtension,
  tx: TxOptions,
  tokenAddr: string,
  oracleAddr: string
) {
  return await deployments.execute("router", tx, "setPriceOracle", tokenAddr, oracleAddr);
}

export async function registerSwapPool(
  deployments: DeploymentsExtension,
  tx: TxOptions,
  tokenAddr: string,
  swapPoolAddr: string,
  insuranceFeeBps: number = 0
) {
  const registerWithRouter = await deployments.execute("router", tx, "registerPool", tokenAddr, swapPoolAddr);
  const registerWithBackstop = await deployments.execute("backstop", tx, "addSwapPool", swapPoolAddr, insuranceFeeBps);

  return [registerWithRouter, registerWithBackstop];
}

export async function setSwapFees(
  deployments: DeploymentsExtension,
  tx: TxOptions,
  /// Deployment name
  swapPool: string,
  /// in 1/100 of basis points (0.0001%)
  lpFee: number,
  /// in 1/100 of basis points (0.0001%)
  backstopFee: number,
  /// in 1/100 of basis points (0.0001%)
  protocolFee: number
) {
  return await deployments.execute(swapPool, tx, "setSwapFees", lpFee, backstopFee, protocolFee);
}

export async function setInsuranceWithdrawalTimelock(
  deployments: DeploymentsExtension,
  tx: TxOptions,
  /// Deployment name
  swapPool: string,
  /// timelock in blocks
  blocks: number
) {
  return await deployments.execute(swapPool, tx, "setInsuranceWithdrawalTimelock", blocks);
}

export async function setPoolCap(
  deployments: DeploymentsExtension,
  tx: TxOptions,
  /// Deployment name
  pool: string,
  /// timelock in blocks
  maxTokens: bigint
) {
  return await deployments.execute(pool, tx, "setPoolCap", maxTokens);
}

// A quick hack to hopefully not crash the deployment procedure anymore after the
// last actual deploy script has been executed.
function NoOp() {
  // Do nothing
}

NoOp.skip = () => Promise.resolve(true);

export default NoOp;
