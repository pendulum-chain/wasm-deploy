import { WasmDeployEnvironment } from "../../src/index";
import { selectDeployment } from "../deployments/selector";

async function DeployRouter({ getNamedAccounts, deployments, deploymentName }: WasmDeployEnvironment) {
  const { deployer } = await getNamedAccounts();

  // just check early that deploymentName is valid
  selectDeployment(deploymentName, deployer.accountId);

  await deployments.deploy("router", {
    from: deployer,
    contract: "Router",
    args: [],
    log: true,
  });
}

DeployRouter.tags = ["router"];

// eslint-disable-next-line @typescript-eslint/require-await
DeployRouter.skip = async function skip(_: WasmDeployEnvironment): Promise<boolean> {
  // the skip feature is not implemented yet in wasm-deploy
  return false;
};

export default DeployRouter;
