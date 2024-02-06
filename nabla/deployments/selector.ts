import { DeploymentDescription } from "./types";

import * as usdtVortexPrototype from "./pendulum/usdtVortexPrototype";
import * as usdcAxelarVortexPrototype from "./pendulum/usdcAxelarVortexPrototype";
import * as productionPendulum from "./pendulum/productionPendulum";
import * as mockTestnet from "./foucoco/mockTestnet";
import * as slippageTest from "./foucoco/slippageTest";

const DEPLOYMENT_DESCRIPTIONS: Record<string, (treasuryAccount: string) => DeploymentDescription> = {
  usdtVortexPrototype: usdtVortexPrototype.generateDeploymentDescription,
  usdcAxelarVortexPrototype: usdcAxelarVortexPrototype.generateDeploymentDescription,
  productionPendulum: productionPendulum.generateDeploymentDescription,
  mockTestnet: mockTestnet.generateDeploymentDescription,
  slippageTest: slippageTest.generateDeploymentDescription,
};

export function selectDeployment(deploymentName: string | undefined, deployerAddress: string): DeploymentDescription {
  if (deploymentName === undefined || DEPLOYMENT_DESCRIPTIONS[deploymentName] === undefined) {
    throw new Error(`Deployment name required, specify one of: ${Object.keys(DEPLOYMENT_DESCRIPTIONS).join(", ")}`);
  }

  return DEPLOYMENT_DESCRIPTIONS[deploymentName](deployerAddress);
}
