import { WasmDeployEnvironment } from "../../src/index";

const CURVE_PARAMETERS_LOW_SLIPPAGE = {
  alpha: 0.02,
  beta: 0.0011,
};

const CURVE_PARAMETERS_NO_SLIPPAGE = {
  alpha: 1,
  beta: 0.00001,
};

function calculateCurveParameters({ alpha, beta }: typeof CURVE_PARAMETERS_LOW_SLIPPAGE): [bigint, bigint] {
  const alphaN = BigInt(Math.round(alpha * 1e9)) * 10n ** 9n;
  const betaN = BigInt(Math.round(beta * 1e9)) * 10n ** 9n;
  return [alphaN, betaN];
}

async function DeployCurves({ getNamedAccounts, deployments }: WasmDeployEnvironment) {
  const { deployer } = await getNamedAccounts();

  await deployments.deploy("nablaCurveLowSlippage", {
    from: deployer,
    contract: "NablaCurve",
    args: calculateCurveParameters(CURVE_PARAMETERS_LOW_SLIPPAGE),
    log: true,
  });

  await deployments.deploy("nablaCurveNoSlippage", {
    from: deployer,
    contract: "NablaCurve",
    args: calculateCurveParameters(CURVE_PARAMETERS_NO_SLIPPAGE),
    log: true,
  });
}

DeployCurves.tags = ["curves"];

DeployCurves.skip = async function skip({ deployments }: WasmDeployEnvironment): Promise<boolean> {
  const alreadyDeployed = Boolean(await deployments.getOrNull("nablaCurve"));
  return alreadyDeployed;
};

export default DeployCurves;
