import { spawn } from "node:child_process";

export async function runCommand(commandLine: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    try {
      const process = spawn(commandLine[0], commandLine.slice(1));

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
    } catch (error) {
      reject(error);
    }
  });
}
