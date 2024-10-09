import { WasmDeployEnvironment } from "../../src/index";
import { selectDeployment } from "../deployments/selector";

async function DeployCurves({ getNamedAccounts, deployments, deploymentName }: WasmDeployEnvironment) {
  const { deployer } = await getNamedAccounts();

  const deploymentDescription = selectDeployment(deploymentName, deployer.accountId);

  for (const curveEntries of Object.entries(deploymentDescription.curves)) {
    const [curveName, curveDescription] = curveEntries;

    const rawAlpha = BigInt(Math.round(curveDescription.alpha * 1e9)) * 10n ** 9n;
    const rawBeta = BigInt(Math.round(curveDescription.beta * 1e9)) * 10n ** 9n;

    await deployments.deploy(`curve-${curveName}`, {
      from: deployer,
      contract: "NablaCurve",
      args: [rawAlpha, rawBeta],
      log: true,
    });
  }
}

DeployCurves.tags = ["curves"];

// eslint-disable-next-line @typescript-eslint/require-await
DeployCurves.skip = async function skip(_: WasmDeployEnvironment): Promise<boolean> {
  // the skip feature is not implemented yet in wasm-deploy
  return false;
};

export default DeployCurves;
