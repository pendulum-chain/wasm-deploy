export interface DeploymentDescription {
  tokens: Record<string, TokenDescription>;
  curves: Record<string, CurveDescription>;
  backstop: BackstopDescription;
  swapPools: Record<string, SwapPoolDescription>;
}

export interface TokenDescription {
  name: string;
  symbol: string;
  decimals: number;
  variant: number[];
  index: number[];
  code: number[];
  issuer: number[];
  oracleBlockchain: string;
  oracleSymbol: string;
}

export interface CurveDescription {
  alpha: number;
  beta: number;
}

export interface BackstopDescription {
  token: string;
  lpTokenName: string;
  lpTokenSymbol: string;
  poolCapUnits: bigint | number;
}

export interface SwapPoolDescription {
  curve: string;
  treasuryAccount: string;
  lpTokenName: string;
  lpTokenSymbol: string;
  insuranceFeeBasisPoints: number;
  lpFeeBasisPoints: number;
  backstopFeeBasisPoints: number;
  protocolFeeBasisPoints: number;
  insuranceWithdrawalTimelock: number;
  poolCapUnits: bigint | number;
  maxCoverageRatioPercent: number;
}

interface GenerateStellarTokenOptions {
  name: string;
  symbol: string;
  code: string;
  issuer: string;
  oracleBlockchain: string;
  oracleSymbol: string;
}

export function generateStellarToken({
  name,
  symbol,
  code,
  issuer,
  oracleBlockchain,
  oracleSymbol,
}: GenerateStellarTokenOptions): TokenDescription {
  const codeArray = Array.from(Buffer.from(code.padEnd(12, "\0"), "ascii"));
  const issuerArray = Array.from(Buffer.from(issuer.slice(2), "hex"));

  return {
    name,
    symbol,
    decimals: 12,
    variant: [2],
    index: [1],
    code: codeArray,
    issuer: issuerArray,
    oracleBlockchain,
    oracleSymbol,
  };
}
