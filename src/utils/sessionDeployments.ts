import * as fs from 'fs'

import { Deployment } from '../commands/deploy';
import { ArgumentType } from "../types";
import crypto from "crypto";


export interface ContractDeploymentInfo extends Deployment {
    deployedArgs: ArgumentType[];
}

// value (allowing bigint) from string
function valueParser(key: any, value: any) {
    if (typeof value === 'string' && /n$/.test(value)) {
        return BigInt(value.slice(0, -1));
    }
    return value;
}

// value (allowing bigint) to string
function valueSaver(key: any, value: any) {
    if (typeof value === 'bigint') {
        return value.toString() + 'n';
    }
    return value;
}

function createHash(data: any) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

function transformDeployments(record: Record<string, ContractDeploymentInfo>): Record<string, ContractDeploymentInfo> {
    const newEntries = Object.entries(record).map(([key, value]) => {
        const newKey = getInstanceKey(key, value.deployedArgs);
        return [newKey, value];
    });

    return Object.fromEntries(newEntries) as Record<string, ContractDeploymentInfo>;
}


export function readPreviousDeploymentsInfo(file: string): Record<string, ContractDeploymentInfo> {
    let previousDeployments: Record<string, ContractDeploymentInfo> = {};
    try {
        const dataBuffer = fs.readFileSync(file);
        const dataJson = dataBuffer.toString();
        previousDeployments = JSON.parse(dataJson, valueParser);
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            // File does not exist, return an empty object
            return {};
        } else {
            // File exists but some other error occurred
            throw new Error("Could not read previous deployments");
        }
    }

    return previousDeployments;

}

export async function saveDeploymentsInfo(file: string, data: Record<string, ContractDeploymentInfo>): Promise<void> {

    let existingData = readPreviousDeploymentsInfo(file);
    let transformedData = transformDeployments(data);

    const mergedData = { ...existingData, ...transformedData };

    try {
        await fs.promises.writeFile(file, JSON.stringify(mergedData, valueSaver));
    } catch (err) {
        throw Error("could not save deployments information")
    }

}



export function getInstanceKey(instance_name: string, args: ArgumentType[]) {
    // Convert BigInt and other values 
    const argsString = args.map(arg => {
        if (arg === null || arg === undefined) {
            return '';
        } else if (typeof arg === 'object') {
            return JSON.stringify(arg);
        } else {
            return arg.toString();
        }
    }).join(',');

    const argsHash = createHash(argsString);

    // Concatenate instance_name and args 
    return `${instance_name}:${argsHash}`;
}

