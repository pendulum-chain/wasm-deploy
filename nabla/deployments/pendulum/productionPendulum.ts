import { DeploymentDescription, generateStellarToken } from "../types";

const SECONDS_PER_BLOCK = 12;

// this is deployment described on
// https://www.notion.so/satoshipay/24-09-30-Public-Deployment-1118b1b29b2f807283dbd10e0a6ae8b9

export function generateDeploymentDescription(): DeploymentDescription {
  const treasuryAccount = "6bBWiUZpDKcecCbP3kjfYTRNToj8zHKugFxNs6yAP4j1u2ib";

  const daysInBlockNumbers = (days: number) => (days * 60 * 60 * 24) / SECONDS_PER_BLOCK;

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
      dot: {
        name: "Polkadot",
        symbol: "DOT",
        decimals: 10,
        variant: [1],
        index: [0],
        code: [],
        issuer: [],
        oracleBlockchain: "Polkadot",
        oracleSymbol: "DOT",
      },
      usdcAxelar: {
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
      usdc: {
        name: "USD Coin",
        symbol: "USDC",
        decimals: 6,
        variant: [1],
        index: [2],
        code: [],
        issuer: [],
        oracleBlockchain: "FIAT",
        oracleSymbol: "USD-USD",
      },
    },

    curves: {
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
      lpTokenName: "Backstop LP",
      lpTokenSymbol: "BSP-LP",
      poolCapUnits: 30_000,
    },

    swapPools: {
      eurc: {
        curve: "stable",
        treasuryAccount: treasuryAccount,
        lpTokenName: "EURC Swap LP",
        lpTokenSymbol: "EURC-LP",
        insuranceFeeBasisPoints: 50,
        lpFeeBasisPoints: 4, // 0.04%
        backstopFeeBasisPoints: 10, // 0.10%
        protocolFeeBasisPoints: 1, // 0.01%
        insuranceWithdrawalTimelock: daysInBlockNumbers(14),
        poolCapUnits: 13_500,
        maxCoverageRatioPercent: 200,
      },
      dot: {
        curve: "dot",
        treasuryAccount: treasuryAccount,
        lpTokenName: "DOT Swap LP",
        lpTokenSymbol: "DOT-LP",
        insuranceFeeBasisPoints: 200,
        lpFeeBasisPoints: 6, // 0.06%
        backstopFeeBasisPoints: 18, // 0.18%
        protocolFeeBasisPoints: 1, // 0.01%
        insuranceWithdrawalTimelock: daysInBlockNumbers(14),
        poolCapUnits: 3_500,
        maxCoverageRatioPercent: 200,
      },
      usdcAxelar: {
        curve: "stable",
        treasuryAccount: treasuryAccount,
        lpTokenName: "USDC.axl Swap LP",
        lpTokenSymbol: "USDC.axl-LP",
        insuranceFeeBasisPoints: 50,
        lpFeeBasisPoints: 4, // 0.04%
        backstopFeeBasisPoints: 10, // 0.10%
        protocolFeeBasisPoints: 1, // 0.01%
        insuranceWithdrawalTimelock: daysInBlockNumbers(14),
        poolCapUnits: 15_000,
        maxCoverageRatioPercent: 200,
      },
      usdc: {
        curve: "stable",
        treasuryAccount: treasuryAccount,
        lpTokenName: "USDC Swap LP",
        lpTokenSymbol: "USDC-LP",
        insuranceFeeBasisPoints: 50,
        lpFeeBasisPoints: 4, // 0.04%
        backstopFeeBasisPoints: 10, // 0.10%
        protocolFeeBasisPoints: 1, // 0.01%
        insuranceWithdrawalTimelock: daysInBlockNumbers(14),
        poolCapUnits: 15_000,
        maxCoverageRatioPercent: 200,
      },
    },
  };
}
