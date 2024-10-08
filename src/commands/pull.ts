import { mkdir, rm } from "node:fs/promises";

import { initializeProject } from "../project";
import { runCommand } from "../utils/childProcess";

export interface PullOptions {
  projectFolder: string;
}

export async function pull({ projectFolder }: PullOptions) {
  const project = await initializeProject(projectFolder);

  await mkdir(project.getGitFolder(), { recursive: true });

  const alreadyProcessed = new Set<string>();
  for (const contractId of project.getContracts()) {
    const repository = project.getContractConfiguration(contractId).repository;

    if (repository === undefined) {
      continue;
    }

    if (alreadyProcessed.has(repository)) {
      continue;
    }
    alreadyProcessed.add(repository);

    const gitClonePath = project.getGitCloneFolder(contractId);
    const repositoryConfig = project.getRepositoryConfig(contractId);
    if (repositoryConfig === undefined) {
      throw new Error(`Repository definition for contract "${contractId}" does not exist`);
    }

    const { branch, git, init } = repositoryConfig;
    console.log(`Clone git ${git} for branch ${branch}`);

    await rm(gitClonePath, { recursive: true, force: true });
    const gitCloneResult = await runCommand(["git", "clone", git, gitClonePath]);

    if (gitCloneResult.exitCode !== 0) {
      throw new Error(`Git error: ${gitCloneResult.stdout}, ${gitCloneResult.stderr}`);
    }

    const gitCheckoutResult = await runCommand(["git", "checkout", branch], { cwd: gitClonePath });
    if (gitCheckoutResult.exitCode !== 0) {
      throw new Error(`Git error: ${gitCheckoutResult.stdout}, ${gitCheckoutResult.stderr}`);
    }

    switch (init) {
      case "npm": {
        console.log(`  Run npm install`);
        const npmResult = await runCommand(["npm", "install"], { cwd: gitClonePath });

        if (npmResult.exitCode !== 0) {
          throw new Error(`Npm error: ${npmResult.stdout}, ${npmResult.stderr}`);
        }

        break;
      }

      case "yarn": {
        console.log(`  Run yarn install`);
        try {
          const yarnResult = await runCommand(["yarn", "install"], { cwd: gitClonePath });
          if (yarnResult.exitCode !== 0) {
            throw new Error(`Yarn error: ${yarnResult.stdout}, ${yarnResult.stderr}`);
          }
        } catch (error) {
          console.error(`ERROR: There was a problem calling yarn for the repository ${repository}`);
          console.error(error);
        }

        break;
      }
    }
  }
}
