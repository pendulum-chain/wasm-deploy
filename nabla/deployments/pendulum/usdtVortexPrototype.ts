import { DeploymentDescription, generateStellarToken } from "../types";

// this is deployment described on
// https://www.notion.so/satoshipay/24-05-16-USDT-Prototype-Deployment-1118b1b29b2f806f9070e734a10162d3

export function generateDeploymentDescription(deployerAddress: string): DeploymentDescription {
  return {
    tokens: {
      eurc: generateStellarToken({
        name: "Stellar EURC",
        symbol: "EURC.s",
        code: "EURC",
        issuer: "0x2112ee863867e4e219fe254c0918b00bc9ea400775bfc3ab4430971ce505877c", // GAQRF3UGHBT6JYQZ7YSUYCIYWAF4T2SAA5237Q5LIQYJOHHFAWDXZ7NM (mykobo.co)
        oracleBlockchain: "FIAT",
        oracleSymbol: "EUR-USD",
      }),
      brl: generateStellarToken({
        name: "Stellar BRL",
        symbol: "BRL.s",
        code: "BRL",
        issuer: "0xeaac68d4d0e37b4c24c2536916e830735f032d0d6b2a1c8fca3bc5a25e083e3a", // GDVKY2GU2DRXWTBEYJJWSFXIGBZV6AZNBVVSUHEPZI54LIS6BA7DVVSP (ntokens.com)
        oracleBlockchain: "FIAT",
        oracleSymbol: "BRL-USD",
      }),
      usdt: {
        name: "Tether USD",
        symbol: "USDT",
        decimals: 6,
        variant: [1],
        index: [1],
        code: [],
        issuer: [],
        oracleBlockchain: "FIAT",
        oracleSymbol: "USD-USD",
      },
      usdcAxl: {
        name: "USDC (Axelar)",
        symbol: "USDC.axl",
        decimals: 6,
        variant: [1],
        index: [12],
        code: [],
        issuer: [],
        oracleBlockchain: "FIAT",
        oracleSymbol: "USD-USD",
      },
    },

    curves: {
      normalSlippage: {
        alpha: 0.661,
        beta: 0.008,
      },
      noSlippage: {
        alpha: 1,
        beta: 0.00001,
      },
    },

    backstop: {
      token: "usdt",
      lpTokenName: "Backstop LP",
      lpTokenSymbol: "BSP-LP",
      poolCapUnits: 1_000,
    },

    swapPools: {
      eurc: {
        curve: "normalSlippage",
        treasuryAccount: deployerAddress,
        lpTokenName: "EURC Swap LP",
        lpTokenSymbol: "EURC-LP",
        insuranceFeeBasisPoints: 100,
        lpFeeBasisPoints: 3, // 0.03%
        backstopFeeBasisPoints: 2, // 0.02%
        protocolFeeBasisPoints: 0, // 0%
        insuranceWithdrawalTimelock: 7200,
        poolCapUnits: 1_000,
        maxCoverageRatioPercent: 200,
      },
      brl: {
        curve: "normalSlippage",
        treasuryAccount: deployerAddress,
        lpTokenName: "BRL Swap LP",
        lpTokenSymbol: "BRL-LP",
        insuranceFeeBasisPoints: 100,
        lpFeeBasisPoints: 3, // 0.03%
        backstopFeeBasisPoints: 2, // 0.02%
        protocolFeeBasisPoints: 0, // 0%
        insuranceWithdrawalTimelock: 7200,
        poolCapUnits: 5_000,
        maxCoverageRatioPercent: 200,
      },
      usdt: {
        curve: "normalSlippage",
        treasuryAccount: deployerAddress,
        lpTokenName: "USDC Swap LP",
        lpTokenSymbol: "USDC-LP",
        insuranceFeeBasisPoints: 100,
        lpFeeBasisPoints: 3, // 0.03%
        backstopFeeBasisPoints: 2, // 0.02%
        protocolFeeBasisPoints: 0, // 0%
        insuranceWithdrawalTimelock: 7200,
        poolCapUnits: 1_000,
        maxCoverageRatioPercent: 200,
      },
      usdcAxl: {
        curve: "noSlippage",
        treasuryAccount: deployerAddress,
        lpTokenName: "USDC Swap LP",
        lpTokenSymbol: "USDC-LP",
        insuranceFeeBasisPoints: 100,
        lpFeeBasisPoints: 6, // 0.06% = 0.1% * 60%
        backstopFeeBasisPoints: 4, // 0.04% = 0.1% * 40%
        protocolFeeBasisPoints: 0, // 0%
        insuranceWithdrawalTimelock: 7200,
        poolCapUnits: 1_000,
        maxCoverageRatioPercent: 1_500,
      },
    },
  };
}
