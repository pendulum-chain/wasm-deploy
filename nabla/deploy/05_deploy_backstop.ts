import { WasmDeployEnvironment } from "../../src/index";
import { setPoolCap } from "../_lib";

import { selectDeployment } from "../deployments/selector";

async function DeployBackstopPool({ getNamedAccounts, deployments, deploymentName }: WasmDeployEnvironment) {
  const { deployer } = await getNamedAccounts();

  const deploymentDescription = selectDeployment(deploymentName, deployer.accountId);

  const backstopDescription = deploymentDescription.backstop;
  const poolTokenDescription = deploymentDescription.tokens[backstopDescription.token];

  const [router, backstopPoolToken] = await Promise.all([
    deployments.get("router"),
    deployments.get(`${backstopDescription.token}Erc20Wrapper`),
  ]);

  await deployments.deploy("backstop", {
    from: deployer,
    contract: "BackstopPool",
    args: [
      router.address,
      backstopPoolToken.address,
      backstopDescription.lpTokenName,
      backstopDescription.lpTokenSymbol,
    ],
    log: true,
  });

  const rawPoolCap = BigInt(backstopDescription.poolCapUnits) * 10n ** BigInt(poolTokenDescription.decimals);
  await setPoolCap(deployments, { from: deployer, log: true }, "backstop", rawPoolCap);
}

DeployBackstopPool.tags = ["backstop"];

// eslint-disable-next-line @typescript-eslint/require-await
DeployBackstopPool.skip = async function skip(_: WasmDeployEnvironment): Promise<boolean> {
  // the skip feature is not implemented yet in wasm-deploy
  return false;
};

export default DeployBackstopPool;
