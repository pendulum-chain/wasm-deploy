import { WasmDeployEnvironment } from "wasm-deploy";

async function DeployCurves({ getNamedAccounts, deployments }: WasmDeployEnvironment) {
    const { deployer } = await getNamedAccounts();

    await deployments.deploy("erc20-0.1", {
        from: deployer,
        contract: "ERC20",
        args: ["MyToken", "MT", 12, 100_000_000n],
        log: true,
    });

}

DeployCurves.tags = ["token"];

DeployCurves.skip = async function skip({ deployments }: WasmDeployEnvironment): Promise<boolean> {
    const alreadyDeployed = Boolean(await deployments.getOrNull("erc20-0.1"));
    return alreadyDeployed;
};

export default DeployCurves;
