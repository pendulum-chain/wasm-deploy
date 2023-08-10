import { WasmDeployEnvironment } from "../src/index";
import { isTestnet } from "./_lib";

async function DeployMockTokens({ getNamedAccounts, deployments }: WasmDeployEnvironment) {
  const { deployer } = await getNamedAccounts();

  await deployments.deploy("mUSD", {
    from: deployer,
    contract: "ERC20Wrapper",
    args: ["Native", "NAT", 12, [0], [0], [], []],
    log: true,
  });
  await deployments.deploy("mEUR", {
    from: deployer,
    contract: "ERC20Wrapper",
    args: ["XCM0", "X0", 12, [1], [0], [], []],
    log: true,
  });
  await deployments.deploy("mETH", {
    from: deployer,
    contract: "ERC20Wrapper",
    args: ["XCM1", "X1", 12, [1], [1], [], []],
    log: true,
  });
}

DeployMockTokens.tags = ["tokens"];

DeployMockTokens.skip = async function skip({ deployments, network }: WasmDeployEnvironment): Promise<boolean> {
  const alreadyDeployed = Boolean(await deployments.getOrNull("mETH"));
  return alreadyDeployed;
};

export default DeployMockTokens;
