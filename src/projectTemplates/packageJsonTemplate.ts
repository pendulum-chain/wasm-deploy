export const generatePackageJson = (): object => ({
    "name": "wasm-deploy-package-test",
    "version": "1.0.0",
    "description": "",
    "main": "index.js",
    "type": "commonjs",
    "dependencies": {
        "wasm-deploy": "^1.0.0"
    },
    "devDependencies": {
        "@types/node": "^20.6.3"
    },
    "scripts": {
        "build": "npx tsc"
    },
    "author": "",
    "license": "ISC"
});