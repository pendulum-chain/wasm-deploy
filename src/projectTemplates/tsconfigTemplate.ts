export const generateTsConfig = (distDir: string, projectName: string): object => ({
    "compilerOptions": {
        "target": "ES2020",
        "module": "commonjs",
        "moduleResolution": "node",
        "rootDir": `${projectName}`,
        "outDir": distDir,
        "declaration": true,
        "esModuleInterop": true,
        "typeRoots": [
            "./node_modules/@types"
        ],
        "types": [
            "node"
        ]
    },
    "include": [
        `${projectName}/**/*`
    ]
});