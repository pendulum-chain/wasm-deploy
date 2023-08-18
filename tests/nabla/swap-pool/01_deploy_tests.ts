import { WasmDeployEnvironment } from "../../../src";

async function DeploySwapPoolTests({ getNamedAccounts, deployments }: WasmDeployEnvironment) {
  const { deployer } = await getNamedAccounts();

  await deployments.deploy("swapPoolTests", {
    from: deployer,
    contract: "SwapPool.t",
    args: [],
    log: true,
  });
}

DeploySwapPoolTests.tags = ["swapPoolTests"];

DeploySwapPoolTests.skip = async function skip({ deployments }: WasmDeployEnvironment): Promise<boolean> {
  const alreadyDeployed = Boolean(await deployments.getOrNull("swapPoolTests"));
  return alreadyDeployed;
};

export default DeploySwapPoolTests;
