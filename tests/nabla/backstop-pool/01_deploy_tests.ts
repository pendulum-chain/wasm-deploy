import { WasmDeployEnvironment } from "../../../src";

async function DeployBackstopPoolTests({ getNamedAccounts, deployments }: WasmDeployEnvironment) {
  const { deployer } = await getNamedAccounts();

  await deployments.deploy("backstopPoolTests", {
    from: deployer,
    contract: "BackstopPool.t",
    args: [],
    log: true,
  });
}

DeployBackstopPoolTests.tags = ["backstopPoolTests"];

DeployBackstopPoolTests.skip = async function skip({ deployments }: WasmDeployEnvironment): Promise<boolean> {
  const alreadyDeployed = Boolean(await deployments.getOrNull("backstopPoolTests"));
  return alreadyDeployed;
};

export default DeployBackstopPoolTests;
