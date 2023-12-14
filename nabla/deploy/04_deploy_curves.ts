import { WasmDeployEnvironment } from "../../src/index";

async function DeployCurves({ getNamedAccounts, deployments }: WasmDeployEnvironment) {
  const { deployer } = await getNamedAccounts();

  await deployments.deploy("amber-curve-0.0-0.01", {
    from: deployer,
    contract: "NablaCurve",
    args: [0, 100_000_000_000n],
    log: true,
  });
}

DeployCurves.tags = ["curves"];

DeployCurves.skip = async function skip({ deployments }: WasmDeployEnvironment): Promise<boolean> {
  const alreadyDeployed = Boolean(await deployments.getOrNull("amber-curve-0.0-0.01"));
  return alreadyDeployed;
};

export default DeployCurves;
