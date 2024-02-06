import { WasmDeployEnvironment } from "../../src/index";
import {
  registerSwapPool,
  setSwapFees,
  setInsuranceWithdrawalTimelock,
  setPoolCap,
  setMaxCoverageRatio,
} from "../_lib";

import { selectDeployment } from "../deployments/selector";

async function DeploySwapPools({ getNamedAccounts, deployments, deploymentName }: WasmDeployEnvironment) {
  const { deployer } = await getNamedAccounts();

  const deploymentDescription = selectDeployment(deploymentName, deployer.accountId);

  const tokens = Object.entries(deploymentDescription.tokens);
  const curves = Object.entries(deploymentDescription.curves);

  const [backstop, router, curveDeployments, tokenDeployments] = await Promise.all([
    deployments.get("backstop"),
    deployments.get("router"),
    Promise.all(curves.map(async ([curveName, _]) => deployments.get(`curve-${curveName}`))),
    Promise.all(tokens.map(async ([tokenName, _]) => deployments.get(`${tokenName}Erc20Wrapper`))),
  ]);

  for (const swapPoolEntry of Object.entries(deploymentDescription.swapPools)) {
    const [token, poolDescription] = swapPoolEntry;
    const {
      curve,
      treasuryAccount,
      lpTokenName,
      lpTokenSymbol,
      insuranceFeeBasisPoints,
      lpFeeBasisPoints,
      backstopFeeBasisPoints,
      protocolFeeBasisPoints,
      insuranceWithdrawalTimelock,
      poolCapUnits,
      maxCoverageRatioPercent,
    } = poolDescription;

    const tokenIndex = tokens.findIndex(([tokenName, _]) => tokenName === token);
    const tokenDeployment = tokenDeployments[tokenIndex];

    const curveIndex = curves.findIndex(([curveName, _]) => curveName === curve);
    const curveDeployment = curveDeployments[curveIndex];

    const poolTokenDescription = deploymentDescription.tokens[token];

    const deploymentName = `swap-${token}`;

    const poolDeployment = await deployments.deploy(deploymentName, {
      from: deployer,
      contract: "SwapPool",
      args: [
        tokenDeployment.address,
        curveDeployment.address,
        router.address,
        backstop.address,
        treasuryAccount,
        lpTokenName,
        lpTokenSymbol,
      ],
      log: true,
    });

    await registerSwapPool(
      deployments,
      { from: deployer, log: true },
      tokenDeployment.address,
      poolDeployment.address,
      insuranceFeeBasisPoints
    );

    const rawLpFee = Math.round(lpFeeBasisPoints * 100);
    const rawBackstopFee = Math.round(backstopFeeBasisPoints * 100);
    const rawProtocolFee = Math.round(protocolFeeBasisPoints * 100);
    await setSwapFees(
      deployments,
      { from: deployer, log: true },
      deploymentName,
      rawLpFee,
      rawBackstopFee,
      rawProtocolFee
    );

    await setInsuranceWithdrawalTimelock(
      deployments,
      { from: deployer, log: true },
      deploymentName,
      insuranceWithdrawalTimelock
    );

    const rawPoolCap = BigInt(poolCapUnits) * 10n ** BigInt(poolTokenDescription.decimals);
    await setPoolCap(deployments, { from: deployer, log: true }, deploymentName, rawPoolCap);

    await setMaxCoverageRatio(
      deployments,
      { from: deployer, log: true },
      deploymentName,
      BigInt(maxCoverageRatioPercent)
    );
  }
}

DeploySwapPools.tags = ["swap-pools"];

// eslint-disable-next-line @typescript-eslint/require-await
DeploySwapPools.skip = async function skip(_: WasmDeployEnvironment): Promise<boolean> {
  // the skip feature is not implemented yet in wasm-deploy
  return false;
};

export default DeploySwapPools;
