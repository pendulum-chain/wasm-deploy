import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { distDir } from "../actions/compileScripts";
import { generateTsConfig } from '../projectTemplates/tsconfigTemplate';
import { generatePackageJson } from '../projectTemplates/packageJsonTemplate';
import { generateConfigJson } from '../projectTemplates/configJson';

export interface InitOptions {
    projectName: string;
}

export function initializeProject({ projectName }: InitOptions): void {
    // Create project directory
    const projectPath = path.join(process.cwd(), projectName);
    fs.mkdirSync(projectPath, { recursive: true });

    // Create subdirectories
    fs.mkdirSync(path.join(projectPath, 'deploy'));
    fs.mkdirSync(path.join(projectPath, 'test'));
    fs.mkdirSync(path.join(process.cwd(), 'target'));

    // Create and write config.json
    const configJson = generateConfigJson();
    fs.writeFileSync(path.join(projectPath, 'config.json'), JSON.stringify(configJson, null, 2));

    // Create and write tsconfig.json
    const tsConfigJson = generateTsConfig(distDir, projectName);

    fs.writeFileSync(path.join(process.cwd(), 'tsconfig.json'), JSON.stringify(tsConfigJson, null, 2));

    // Create and write package.json
    const packageJson = generatePackageJson();
    fs.writeFileSync(path.join(process.cwd(), 'package.json'), JSON.stringify(packageJson, null, 2));

    // Execute npm install in the project directory
    execSync('npm install', { cwd: process.cwd() });
    execSync('npm install --save-dev @types/node', { cwd: process.cwd() });

}