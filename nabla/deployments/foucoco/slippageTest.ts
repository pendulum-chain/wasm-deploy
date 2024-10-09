import { DeploymentDescription, generateStellarToken } from "../types";

// this deployment was used to validate the prediction about the slippage on the Pendulum production deployment
// See here: https://www.notion.so/satoshipay/24-09-30-Public-Deployment-1118b1b29b2f807283dbd10e0a6ae8b9?pvs=4#1158b1b29b2f80bc8be8efb7bc5197b4

export function generateDeploymentDescription(deployerAddress: string): DeploymentDescription {
  return {
    tokens: {
      usdc: generateStellarToken({
        name: "Mock USDC",
        symbol: "USDC",
        code: "USDC",
        issuer: "0x3b9911380efe988ba0a8900eb1cfe44f366f7dbe946bed077240f7f624df15c5", // GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN (centre.io)
        oracleBlockchain: "FIAT",
        oracleSymbol: "USD-USD",
      }),
      stable: {
        name: "Stable",
        symbol: "Stable",
        decimals: 12,
        variant: [1],
        index: [2],
        code: [],
        issuer: [],
        oracleBlockchain: "FIAT",
        oracleSymbol: "USD-USD",
      },
      dot: {
        name: "DOT",
        symbol: "DOT",
        decimals: 12,
        variant: [1],
        index: [3],
        code: [],
        issuer: [],
        oracleBlockchain: "FIAT",
        oracleSymbol: "USD-USD",
      },
    },

    curves: {
      noSlippage: {
        alpha: 0,
        beta: 0.00001,
      },
      stable: {
        alpha: 6.91861,
        beta: 0.04592,
      },
      dot: {
        alpha: 4.28516,
        beta: 0.12199,
      },
    },

    backstop: {
      token: "usdc",
      lpTokenName: "Nabla Backstop LP",
      lpTokenSymbol: "BSP-LP",
      poolCapUnits: 1_000_000,
    },

    swapPools: {
      usdc: {
        curve: "noSlippage",
        treasuryAccount: deployerAddress,
        lpTokenName: "USDC Swap LP",
        lpTokenSymbol: "USDC-LP",
        insuranceFeeBasisPoints: 0,
        lpFeeBasisPoints: 0,
        backstopFeeBasisPoints: 0,
        protocolFeeBasisPoints: 0,
        insuranceWithdrawalTimelock: 1_000,
        poolCapUnits: 1_000_000,
        maxCoverageRatioPercent: 200,
      },
      stable: {
        curve: "stable",
        treasuryAccount: deployerAddress,
        lpTokenName: "Stable LP",
        lpTokenSymbol: "STB-LP",
        insuranceFeeBasisPoints: 0,
        lpFeeBasisPoints: 0,
        backstopFeeBasisPoints: 0,
        protocolFeeBasisPoints: 0,
        insuranceWithdrawalTimelock: 1_000,
        poolCapUnits: 1_000_000,
        maxCoverageRatioPercent: 400,
      },
      dot: {
        curve: "dot",
        treasuryAccount: deployerAddress,
        lpTokenName: "DOT LP",
        lpTokenSymbol: "DOT-LP",
        insuranceFeeBasisPoints: 0,
        lpFeeBasisPoints: 0,
        backstopFeeBasisPoints: 0,
        protocolFeeBasisPoints: 0,
        insuranceWithdrawalTimelock: 1_000,
        poolCapUnits: 1_000_000,
        maxCoverageRatioPercent: 400,
      },
    },
  };
}
