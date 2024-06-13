import { WasmDeployEnvironment } from "../../src/index";
import { isTestnet } from "../_lib";

async function DeployMockTokens({ getNamedAccounts, deployments }: WasmDeployEnvironment) {
  const { deployer } = await getNamedAccounts();

  await deployments.deploy("nativeErc20Wrapper", {
    from: deployer,
    contract: "ERC20Wrapper",
    args: ["Mock AMPE", "AMPE", 12, [0], [0], [], []],
    log: true,
  });
  await deployments.deploy("xcm0Erc20Wrapper", {
    from: deployer,
    contract: "ERC20Wrapper",
    args: ["Mock USDC", "USDC", 7, [1], [0], [], []],
    log: true,
  });
  await deployments.deploy("xcm1Erc20Wrapper", {
    from: deployer,
    contract: "ERC20Wrapper",
    args: ["Mock BRL", "BRL", 18, [1], [1], [], []],
    log: true,
  });
  await deployments.deploy("xcm2Erc20Wrapper", {
    from: deployer,
    contract: "ERC20Wrapper",
    args: ["Mock EUR", "EURC", 15, [1], [2], [], []],
    log: true,
  });
  await deployments.deploy("xcm3Erc20Wrapper", {
    from: deployer,
    contract: "ERC20Wrapper",
    args: ["Mock USDT", "USDT", 10, [1], [3], [], []],
    log: true,
  });
}

DeployMockTokens.tags = ["tokens"];

DeployMockTokens.skip = async function skip({ deployments, network }: WasmDeployEnvironment): Promise<boolean> {
  const alreadyDeployed = Boolean(await deployments.getOrNull("mETH"));
  return !isTestnet(network) || alreadyDeployed;
};

export default DeployMockTokens;
