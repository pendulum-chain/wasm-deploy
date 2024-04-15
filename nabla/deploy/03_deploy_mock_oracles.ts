import { WasmDeployEnvironment } from "../../src/index";
import { isTestnet, registerAsset } from "../_lib";

async function DeployMockOracles({ getNamedAccounts, deployments }: WasmDeployEnvironment) {
  const { deployer } = await getNamedAccounts();

  const [native, xcm0, xcm1, xcm2, xcm3] = await Promise.all([
    deployments.get("nativeErc20Wrapper"),
    deployments.get("xcm0Erc20Wrapper"),
    deployments.get("xcm1Erc20Wrapper"),
    deployments.get("xcm2Erc20Wrapper"),
    deployments.get("xcm3Erc20Wrapper"),
  ]);

  const priceFeedWrapper = await deployments.deploy("priceFeedWrapper", {
    from: deployer,
    contract: "PriceOracleWrapper",
    args: [
      [
        { asset: native.address, blockchain: "Native", symbol: "NAT" },
        { asset: xcm0.address, blockchain: "XCM0", symbol: "X0" },
        { asset: xcm1.address, blockchain: "XCM1", symbol: "X1" },
        { asset: xcm2.address, blockchain: "Polkadot", symbol: "DOT" },
        { asset: xcm3.address, blockchain: "Stellar", symbol: "XLM" },
      ],
    ],
    log: true,
  });

  await registerAsset(deployments, { from: deployer, log: true }, native.address, priceFeedWrapper.address);
  await registerAsset(deployments, { from: deployer, log: true }, xcm0.address, priceFeedWrapper.address);
  await registerAsset(deployments, { from: deployer, log: true }, xcm1.address, priceFeedWrapper.address);
  await registerAsset(deployments, { from: deployer, log: true }, xcm2.address, priceFeedWrapper.address);
  await registerAsset(deployments, { from: deployer, log: true }, xcm3.address, priceFeedWrapper.address);
}

DeployMockOracles.tags = ["oracles"];

DeployMockOracles.skip = async function skip({ deployments, network }: WasmDeployEnvironment): Promise<boolean> {
  const alreadyDeployed = Boolean(await deployments.getOrNull("priceFeedWrapper"));
  return !isTestnet(network) || alreadyDeployed;
};

export default DeployMockOracles;
