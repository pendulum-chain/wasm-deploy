import { DeploymentDescription, generateStellarToken } from "../types";

// this is deployment described on
// https://www.notion.so/satoshipay/24-09-30-Nabla-Foucoco-Paseo-Deployment-1118b1b29b2f804eababf94383a56f7b

export function generateDeploymentDescription(deployerAddress: string): DeploymentDescription {
  return {
    tokens: {
      ampe: {
        name: "Mock AMPE",
        symbol: "AMPE",
        decimals: 12,
        variant: [0],
        index: [0],
        code: [],
        issuer: [],
        oracleBlockchain: "Native",
        oracleSymbol: "NAT",
      },
      usdc: generateStellarToken({
        name: "Mock USDC",
        symbol: "USDC",
        code: "USDC",
        issuer: "0x3b9911380efe988ba0a8900eb1cfe44f366f7dbe946bed077240f7f624df15c5", // GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN (centre.io)
        oracleBlockchain: "FIAT",
        oracleSymbol: "USD-USD",
      }),
      brl: generateStellarToken({
        name: "Mock BRL",
        symbol: "BRL",
        code: "BRL",
        issuer: "0xeaac68d4d0e37b4c24c2536916e830735f032d0d6b2a1c8fca3bc5a25e083e3a", // GDVKY2GU2DRXWTBEYJJWSFXIGBZV6AZNBVVSUHEPZI54LIS6BA7DVVSP (ntokens.com)
        oracleBlockchain: "FIAT",
        oracleSymbol: "BRL-USD",
      }),
      eurc: generateStellarToken({
        name: "Mock EURC",
        symbol: "EURC",
        code: "EURC",
        issuer: "0x2112ee863867e4e219fe254c0918b00bc9ea400775bfc3ab4430971ce505877c", //GAQRF3UGHBT6JYQZ7YSUYCIYWAF4T2SAA5237Q5LIQYJOHHFAWDXZ7NM (Mykobo)
        oracleBlockchain: "FIAT",
        oracleSymbol: "EUR-USD",
      }),
      usdt: {
        name: "Mock USDT",
        symbol: "USDT",
        decimals: 6,
        variant: [1],
        index: [1],
        code: [],
        issuer: [],
        oracleBlockchain: "FIAT",
        oracleSymbol: "USD-USD",
      },
    },

    curves: {
      default: {
        alpha: 0,
        beta: 0.01,
      },
    },

    backstop: {
      token: "usdc",
      lpTokenName: "Nabla Backstop LP",
      lpTokenSymbol: "BSP-LP",
      poolCapUnits: 1_000_000,
    },

    swapPools: {
      ampe: {
        curve: "default",
        treasuryAccount: deployerAddress,
        lpTokenName: "AMPE Swap LP",
        lpTokenSymbol: "AMPE-LP",
        insuranceFeeBasisPoints: 0,
        lpFeeBasisPoints: 15, // 0.15%
        backstopFeeBasisPoints: 30, // 0.30%
        protocolFeeBasisPoints: 5, // 0.05%
        insuranceWithdrawalTimelock: 1_000,
        poolCapUnits: 1_000_000,
        maxCoverageRatioPercent: 200,
      },
      usdc: {
        curve: "default",
        treasuryAccount: deployerAddress,
        lpTokenName: "USDC Swap LP",
        lpTokenSymbol: "USDC-LP",
        insuranceFeeBasisPoints: 0,
        lpFeeBasisPoints: 15, // 0.15%
        backstopFeeBasisPoints: 30, // 0.30%
        protocolFeeBasisPoints: 5, // 0.05%
        insuranceWithdrawalTimelock: 1_000,
        poolCapUnits: 1_000_000,
        maxCoverageRatioPercent: 200,
      },
      brl: {
        curve: "default",
        treasuryAccount: deployerAddress,
        lpTokenName: "BRL Swap LP",
        lpTokenSymbol: "BRL-LP",
        insuranceFeeBasisPoints: 0,
        lpFeeBasisPoints: 15, // 0.15%
        backstopFeeBasisPoints: 30, // 0.30%
        protocolFeeBasisPoints: 5, // 0.05%
        insuranceWithdrawalTimelock: 1_000,
        poolCapUnits: 1_000_000,
        maxCoverageRatioPercent: 200,
      },
      eurc: {
        curve: "default",
        treasuryAccount: deployerAddress,
        lpTokenName: "EURC Swap LP",
        lpTokenSymbol: "EURC-LP",
        insuranceFeeBasisPoints: 0,
        lpFeeBasisPoints: 15, // 0.15%
        backstopFeeBasisPoints: 30, // 0.30%
        protocolFeeBasisPoints: 5, // 0.05%
        insuranceWithdrawalTimelock: 1_000,
        poolCapUnits: 1_000_000,
        maxCoverageRatioPercent: 200,
      },
      usdt: {
        curve: "default",
        treasuryAccount: deployerAddress,
        lpTokenName: "USDT Swap LP",
        lpTokenSymbol: "USDT-LP",
        insuranceFeeBasisPoints: 0,
        lpFeeBasisPoints: 15, // 0.15%
        backstopFeeBasisPoints: 30, // 0.30%
        protocolFeeBasisPoints: 5, // 0.05%
        insuranceWithdrawalTimelock: 1_000,
        poolCapUnits: 1_000_000,
        maxCoverageRatioPercent: 200,
      },
    },
  };
}
