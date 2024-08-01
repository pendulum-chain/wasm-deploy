import { WasmDeployEnvironment } from "../../src/index";

const EURC = {
  name: "Stellar EURC (Circle)",
  symbol: "EURC.s",
  code: "EURC",
  issuer: "0xcf4f5a26e2090bb3adcf02c7a9d73dbfe6659cc690461475b86437fa49c71136", // GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2
};

const BRL = {
  name: "Stellar BRL",
  symbol: "BRL.s",
  code: "BRL",
  issuer: "0xeaac68d4d0e37b4c24c2536916e830735f032d0d6b2a1c8fca3bc5a25e083e3a",
};

function generateStellarAssetArgs({ name, symbol, code, issuer }: typeof EURC) {
  const codeArray = Array.from(Buffer.from(code.padEnd(12, "\0"), "ascii"));
  const issuerArray = Array.from(Buffer.from(issuer.slice(2), "hex"));
  return [name, symbol, 12, [2], [1], codeArray, issuerArray];
}

async function DeployTokenWrappers({ getNamedAccounts, deployments }: WasmDeployEnvironment) {
  const { deployer } = await getNamedAccounts();

  await deployments.deploy("usdcErc20Wrapper", {
    from: deployer,
    contract: "ERC20Wrapper",
    args: ["USDC (Axelar)", "USDC.axl", 6, [1], [12], [], []],
    log: true,
  });
  await deployments.deploy("eurcErc20Wrapper", {
    from: deployer,
    contract: "ERC20Wrapper",
    args: generateStellarAssetArgs(EURC),
    log: true,
  });
  await deployments.deploy("brlErc20Wrapper", {
    from: deployer,
    contract: "ERC20Wrapper",
    args: generateStellarAssetArgs(BRL),
    log: true,
  });
}

DeployTokenWrappers.tags = ["tokens"];

DeployTokenWrappers.skip = async function skip({ deployments }: WasmDeployEnvironment): Promise<boolean> {
  const alreadyDeployed = Boolean(await deployments.getOrNull("mETH"));
  return alreadyDeployed;
};

export default DeployTokenWrappers;
