import {WasmDeployEnvironment} from "../src/index"

async function DeployRouter({ getNamedAccounts, deployments }: WasmDeployEnvironment) {
  const { deployer } = await getNamedAccounts();

  await deployments.deploy("router", {
    from: deployer,
    contract: "Router",
    args: [],
    log: true,
  });
};

DeployRouter.tags = ["router"];

DeployRouter.skip = async function skip({ deployments }: WasmDeployEnvironment): Promise<boolean> {
  const alreadyDeployed = Boolean(await deployments.getOrNull("router"));
  return alreadyDeployed;
}

export default DeployRouter;
