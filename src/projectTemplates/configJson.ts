export const generateConfigJson = (contracts: object): object => ({
    contracts,
    "repositories": {
    },
    "networks": {
        "foucoco": {
            "namedAccounts": {
                "deployer": "6iFKMtX29zYoHRgDkPTXKuRsHRbJ3Gnaxyc4dRrZTANHvZi3"
            },
            "rpcUrl": "wss://rpc-foucoco.pendulumchain.tech:443"
        },
        "local": {
            "namedAccounts": {
                "deployer": {
                    "address": "6mfqoTMHrMeVMyKwjqomUjVomPMJ4AjdCm1VReFtk7Be8wqr",
                    "suri": "//Alice"
                },
                "bob": {
                    "address": "6k6gXPB9idebCxqSJuqpjPaqfYLQbdLHhvsANH8Dg8GQN3tT",
                    "suri": "//Bob"
                },
                "root": {
                    "address": "6hc7e55FaBEbQAHB7hFFU39CPvcrsW7QhM3Qv15S9cWjkK6t",
                    "suri": "//AltoParaíso"
                }
            },
            "rpcUrl": "ws://127.0.0.1:9944"
        }
    },
    "tests": {
        "tester": "deployer",
        "root": "root"
    },
    "buildFolder": "../target",
    "limits": {
        "gas": {
            "refTime": "100000000000",
            "proofSize": "10000000"
        },
        "storageDeposit": "10000000000000"
    }
}
);