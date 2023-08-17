import { WasmDeployEnvironment } from "../src/index";

async function DeploySwapsTests({ getNamedAccounts, deployments }: WasmDeployEnvironment) {
  const { deployer } = await getNamedAccounts();

  await deployments.deploy("swapsTests", {
    from: deployer,
    contract: "Swaps.t",
    args: [],
    log: true,
  });
}

DeploySwapsTests.tags = ["swapsTests"];

DeploySwapsTests.skip = async function skip({ deployments }: WasmDeployEnvironment): Promise<boolean> {
  const alreadyDeployed = Boolean(await deployments.getOrNull("swapsTests"));
  return alreadyDeployed;
};

export default DeploySwapsTests;
