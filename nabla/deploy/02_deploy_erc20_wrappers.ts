import { WasmDeployEnvironment } from "../../src/index";
import { isTestnet } from "../_lib";

async function DeployMockTokens({ getNamedAccounts, deployments }: WasmDeployEnvironment) {
  const { deployer } = await getNamedAccounts();

  // we use different token decimals to better test that the frontend correctly
  // handles decimals
  await deployments.deploy("nativeErc20Wrapper", {
    from: deployer,
    contract: "ERC20Wrapper",
    args: ["Native", "NAT", 12, [0], [0], [], []],
    log: true,
  });
  await deployments.deploy("xcm0Erc20Wrapper", {
    from: deployer,
    contract: "ERC20Wrapper",
    args: ["XCM0", "X0", 6, [1], [0], [], []],
    log: true,
  });
  await deployments.deploy("xcm1Erc20Wrapper", {
    from: deployer,
    contract: "ERC20Wrapper",
    args: ["XCM1", "X1", 18, [1], [1], [], []],
    log: true,
  });
}

DeployMockTokens.tags = ["tokens"];

DeployMockTokens.skip = async function skip({ deployments, network }: WasmDeployEnvironment): Promise<boolean> {
  const alreadyDeployed = Boolean(await deployments.getOrNull("NativeErc20Wrapper"));
  return !isTestnet(network) || alreadyDeployed;
};

export default DeployMockTokens;
