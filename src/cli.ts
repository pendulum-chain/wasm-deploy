#! /usr/bin/env node

const cryptoWaitReady = require("@polkadot/util-crypto");
const parseCommandLine = require("./commandLine");

async function main() {
    await cryptoWaitReady.cryptoWaitReady();
    parseCommandLine.parseCommandLine();
}

main().catch((error) => console.log(error));
