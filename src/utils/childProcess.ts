import { spawn } from "node:child_process";

export interface RunCommandOptions {
  cwd?: string;
}

export async function runCommand(
  commandLine: string[],
  options: RunCommandOptions = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    try {
      const process = spawn(commandLine[0], commandLine.slice(1), options);

      let stdout = "";
      let stderr = "";

      process.stdout.on("data", (data: Buffer) => {
        stdout += data.toString("utf-8");
      });

      process.stderr.on("data", (data: Buffer) => {
        stderr += data.toString("utf-8");
      });

      process.on("close", (exitCode: number) => {
        resolve({
          stdout,
          stderr,
          exitCode,
        });
      });

      process.on("error", (error: string) => {
        reject(error);
      });
    } catch (error) {
      reject(error);
    }
  });
}
