import * as fs from 'fs';
import * as path from 'path';

const configPath = path.join(__dirname, 'config.json');

const readConfig = (): any => {
    if (fs.existsSync(configPath)) {
        const rawData = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(rawData);
    }
    return {};
};

const writeConfig = (data: any): void => {
    const jsonData = JSON.stringify(data, null, 2);
    fs.writeFileSync(configPath, jsonData);
};

export function getSolangPath(): string {

    const currentConfig = readConfig();
    if (currentConfig.solangPath) {
        return currentConfig.solangPath;
    } else {
        return "solang";
    }

};

export function setSolangPath(path: string): void {

    let currentConfig = readConfig();
    currentConfig.solangPath = path;
    writeConfig(currentConfig);

}