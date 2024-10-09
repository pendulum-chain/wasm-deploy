import { DeploymentDescription, generateStellarToken } from "../types";

// this is deployment described on
// https://www.notion.so/satoshipay/24-07-04-USDC-axl-Prototype-Deployment-1118b1b29b2f80c7ba3ad321c6bb3e8b

export function generateDeploymentDescription(deployerAddress: string): DeploymentDescription {
  return {
    tokens: {
      eurc: generateStellarToken({
        name: "Stellar EURC (Circle)",
        symbol: "EURC.s",
        code: "EURC",
        issuer: "0xcf4f5a26e2090bb3adcf02c7a9d73dbfe6659cc690461475b86437fa49c71136", // GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2 (circle.com)
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
      lowSlippage: {
        alpha: 0.001,
        beta: 0.001,
      },
      noSlippage: {
        alpha: 1,
        beta: 0.00001,
      },
    },

    backstop: {
      token: "usdcAxl",
      lpTokenName: "Backstop LP",
      lpTokenSymbol: "BSP-LP",
      poolCapUnits: 1_000,
    },

    swapPools: {
      eurc: {
        curve: "lowSlippage",
        treasuryAccount: deployerAddress,
        lpTokenName: "EURC Swap LP",
        lpTokenSymbol: "EURC-LP",
        insuranceFeeBasisPoints: 100,
        lpFeeBasisPoints: 6, // 0.06% = 0.1% * 60%
        backstopFeeBasisPoints: 4, // 0.04% = 0.1% * 40%
        protocolFeeBasisPoints: 0, // 0%
        insuranceWithdrawalTimelock: 7200,
        poolCapUnits: 20_000,
        maxCoverageRatioPercent: 200,
      },
      brl: {
        curve: "lowSlippage",
        treasuryAccount: deployerAddress,
        lpTokenName: "BRL Swap LP",
        lpTokenSymbol: "BRL-LP",
        insuranceFeeBasisPoints: 100,
        lpFeeBasisPoints: 6, // 0.06% = 0.1% * 60%
        backstopFeeBasisPoints: 4, // 0.04% = 0.1% * 40%
        protocolFeeBasisPoints: 0, // 0%
        insuranceWithdrawalTimelock: 7200,
        poolCapUnits: 140_000,
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
        poolCapUnits: 15_000,
        maxCoverageRatioPercent: 1_500,
      },
    },
  };
}
