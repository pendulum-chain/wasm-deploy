import { DeploymentDescription, generateStellarToken } from "../types";

// this is deployment described on
// https://www.notion.so/satoshipay/24-11-14-USDC-Asset-Hub-Prototype-Deployment-13e8b1b29b2f801a874ae384dd36c4a6
// this instance can be accessed via
// https://deploy-preview-619--rococo-souffle-a625f5.netlify.app/pendulum/nabla/swap-pools
// this instance is defined in issues
// https://github.com/pendulum-chain/wasm-deploy/issues/53

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
      ars: generateStellarToken({
        name: "Stellar ARS",
        symbol: "ARS.s",
        code: "ARS",
        issuer: "0xb04f8bff207a0b001aec7b7659a8d106e54e659cdf9533528f468e079628fba1", // GCYE7C77EB5AWAA25R5XMWNI2EDOKTTFTTPZKM2SR5DI4B4WFD52DARS ( https://anclap.com)
        oracleBlockchain: "FIAT",
        oracleSymbol: "ARS-USD",
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
      token: "usdc",
      lpTokenName: "Backstop LP",
      lpTokenSymbol: "BSP-LP",
      poolCapUnits: 2_000,
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
      ars: {
        curve: "lowSlippage",
        treasuryAccount: deployerAddress,
        lpTokenName: "ARS Swap LP",
        lpTokenSymbol: "ARS-LP",
        insuranceFeeBasisPoints: 100,
        lpFeeBasisPoints: 6, // 0.06% = 0.1% * 60%
        backstopFeeBasisPoints: 4, // 0.04% = 0.1% * 40%
        protocolFeeBasisPoints: 0, // 0%
        insuranceWithdrawalTimelock: 7200,
        poolCapUnits: 20_000_000,
        maxCoverageRatioPercent: 200,
      },
      usdcAxl: {
        curve: "noSlippage",
        treasuryAccount: deployerAddress,
        lpTokenName: "USDC.axl Swap LP",
        lpTokenSymbol: "USDC.axl-LP",
        insuranceFeeBasisPoints: 100,
        lpFeeBasisPoints: 6, // 0.06% = 0.1% * 60%
        backstopFeeBasisPoints: 4, // 0.04% = 0.1% * 40%
        protocolFeeBasisPoints: 0, // 0%
        insuranceWithdrawalTimelock: 7200,
        poolCapUnits: 15_000,
        maxCoverageRatioPercent: 1_500,
      },
      usdc: {
        curve: "lowSlippage",
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
