import { readFile } from "fs/promises";
import { join } from "path";

export interface LocalConfiguration {
  solangPath: string;
}

const DEFAULT_LOCAL_CONFIGURATION: LocalConfiguration = {
  solangPath: "solang",
};

let localConfiguration: LocalConfiguration | undefined = undefined;

export async function getLocalConfiguration(): Promise<LocalConfiguration> {
  if (localConfiguration !== undefined) {
    return localConfiguration;
  }

  const localConfigurationFile = join(import.meta.dirname, "../../localConfig.json");

  try {
    const localConfigurationContent = await readFile(localConfigurationFile, { encoding: "utf-8" });
    const parsedLocalConfiguration = JSON.parse(localConfigurationContent) as LocalConfiguration;
    localConfiguration = { ...DEFAULT_LOCAL_CONFIGURATION, ...parsedLocalConfiguration };
    return localConfiguration;
  } catch {
    localConfiguration = DEFAULT_LOCAL_CONFIGURATION;
    return localConfiguration;
  }
}
