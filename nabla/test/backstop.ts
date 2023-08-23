import { TestContract, TestSuiteEnvironment } from "../../src/types";

export default async function ({ newContract }: TestSuiteEnvironment) {
  let router: TestContract;

  const setUp = async () => {
    router = await newContract("Router", "new");
  };

  const testPreventsDuplicateSwapPool = async () => {
    await router!.pause();
  };

  return {
    setUp,
    testPreventsDuplicateSwapPool,
  };
}
