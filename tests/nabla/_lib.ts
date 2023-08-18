import { DeploymentsExtension, Network, TxOptions } from "../../src/types";

export function isTestnet(network: Network) {
  return ["foucoco"].includes(network.name.toLowerCase());
}

export async function registerAsset(
  deployments: DeploymentsExtension,
  tx: TxOptions,
  tokenAddr: string,
  oracleAddr: string
) {
  return await deployments.execute("router", tx, "setPriceOracle", tokenAddr, oracleAddr);
}

export async function registerPriceFeed(
  deployments: DeploymentsExtension,
  tx: TxOptions,
  assetAddr: string,
  priceFeedAddr: string
) {
  return await deployments.execute("compatOracle", tx, "registerPriceFeed", assetAddr, priceFeedAddr);
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
  /// in basis points (0.01%)
  lpFeeBps: number,
  /// in basis points (0.01%)
  backstopFeeBps: number,
  /// in basis points (0.01%)
  protocolFeeBps: number
) {
  return await deployments.execute(swapPool, tx, "setSwapFees", lpFeeBps, backstopFeeBps, protocolFeeBps);
}

// A quick hack to hopefully not crash the deployment procedure anymore after the
// last actual deploy script has been executed.
function NoOp() {
  // Do nothing
}

NoOp.skip = () => Promise.resolve(true);

export default NoOp;
