import { mkdir, rm } from "node:fs/promises";

import { initializeProject } from "../project";
import { runCommand } from "../helpers/childProcess";

export interface PullOptions {
  projectFolder: string;
}

export async function pull({ projectFolder }: PullOptions) {
  const project = await initializeProject(projectFolder);

  await mkdir(project.getGitFolder(), { recursive: true });

  const alreadyPulled = new Set<string>();
  for (const contractId of project.getContracts()) {
    const gitClonePath = project.getGitCloneFolder(contractId);

    if (alreadyPulled.has(gitClonePath)) {
      continue;
    }
    alreadyPulled.add(gitClonePath);

    const { branch, git } = project.getContractSourceReference(contractId);
    console.log(`Clone git ${git} for branch ${branch}`);

    await rm(gitClonePath, { recursive: true, force: true });
    const gitCloneResult = await runCommand(["git", "clone", "-b", branch, git, gitClonePath]);

    if (gitCloneResult.exitCode !== 0) {
      throw new Error(`Git error: ${gitCloneResult.stdout}, ${gitCloneResult.stderr}`);
    }
  }
}
