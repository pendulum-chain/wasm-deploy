import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { distDir } from "../actions/compileScripts";
import { generateTsConfig } from '../projectTemplates/tsconfigTemplate';
import { generatePackageJson } from '../projectTemplates/packageJsonTemplate';
import { generateConfigJson } from '../projectTemplates/configJson';

export interface InitOptions {
    projectName: string;
    example: string;
}

export async function initializeProject({ projectName, example }: InitOptions): Promise<void> {
    // Create project directory
    const projectPath = path.join(process.cwd(), projectName);
    fs.mkdirSync(projectPath, { recursive: true });

    // Create subdirectories
    fs.mkdirSync(path.join(projectPath, 'deploy'));
    fs.mkdirSync(path.join(projectPath, 'test'));
    fs.mkdirSync(path.join(projectPath, 'contracts'));

    //populate example files
    let contractObject = {};
    if (example) {
        contractObject = await populateExample(projectName, example);
    }

    fs.mkdirSync(path.join(process.cwd(), 'target'));

    // Create and write config.json
    const configJson = generateConfigJson(contractObject);
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

async function populateExample(projectName: string, exampleName: string): Promise<object> {

    let rootDir = path.join(__dirname, '..');

    switch (exampleName) {
        case "erc20":
            //copy required contracts 
            const contracts = ['ERC20.sol', 'SafeMath.sol'];
            for (const contract of contracts) {
                let sourcePath = path.join(rootDir, `projectTemplates/rawFiles/contractSamples/${contract}`);
                let targetPath = path.join(process.cwd(), `./${projectName}/contracts/${contract}`);
                fs.copyFileSync(sourcePath, targetPath);
            }

            //copy deploy sample script
            let sourcePath = path.join(rootDir, 'projectTemplates/rawFiles/deploySamples/01_sample_deploy_erc20.ts');
            let targetPath = path.join(process.cwd(), `./${projectName}/deploy/01_sample_deploy_erc20.ts`);
            fs.copyFileSync(sourcePath, targetPath);

            //copy test files
            sourcePath = path.join(rootDir, 'projectTemplates/rawFiles/testSamples/sampleERC20Test.ts');
            targetPath = path.join(process.cwd(), `./${projectName}/test/sampleERC20Test.ts`);
            fs.copyFileSync(sourcePath, targetPath);

            //contracts object that need to be declared in config.json
            const contractsObj = {
                "ERC20": {
                    "path": "./contracts/ERC20.sol"
                }
            };

            return contractsObj

    }

    throw Error("example does not exists");
}