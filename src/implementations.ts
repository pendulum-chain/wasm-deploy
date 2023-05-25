import { Deployment, DeploymentArguments, TxOptions } from "./types";

export async function deployContract(name: string, args: DeploymentArguments): Promise<Deployment> {
  // actual deployment

  // replace the following lines
  await new Promise((resolve) => setTimeout(resolve, 500));

  let fakeAddress = "0x";
  for (let i = 0; i < 32; i++)
    fakeAddress += Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0");

  return { address: fakeAddress };
}

export async function executeContractFunction(name: Deployment, tx: TxOptions, functionName: string, ...rest: any[]) {
  // TODO
}
