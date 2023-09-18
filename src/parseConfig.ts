import {
  array,
  enumerate,
  isFailure,
  isSuccess,
  number,
  object,
  objectMap,
  optional,
  string,
  union,
  ValidatorReturnType,
} from "fefe";

export type ImportMap = ValidatorReturnType<typeof validateImportMap>;
const validateImportMap = object(
  {
    from: string(),
    to: string(),
  },
  { allowExcessProperties: false }
);

export type ContractConfiguration = ValidatorReturnType<typeof validateContractSourceReference>;
const validateContractSourceReference = object(
  {
    repository: string(),
    path: string(),
    importpaths: optional(array(string())),
    importmaps: optional(array(validateImportMap)),
  },
  { allowExcessProperties: false }
);

export type NamedAccountConfig = ValidatorReturnType<typeof validateNamedAccount>;
const validateNamedAccount = union(
  string(),
  object(
    {
      address: string(),
      suri: optional(string()),
    },
    { allowExcessProperties: false }
  )
);

export type NetworkConfig = ValidatorReturnType<typeof validateNetworkConfig>;
const validateNetworkConfig = object(
  {
    namedAccounts: objectMap(validateNamedAccount),
    rpcUrl: string(),
  },
  { allowExcessProperties: false }
);

export type LimitsConfig = ValidatorReturnType<typeof validateLimitsConfig>;
const validateLimitsConfig = object(
  {
    gas: object(
      {
        refTime: union(number(), string()),
        proofSize: union(number(), string()),
      },
      { allowExcessProperties: false }
    ),
    storageDeposit: optional(union(number(), string())),
  },
  { allowExcessProperties: false }
);

export type RepositoryConfig = ValidatorReturnType<typeof validateRepositoryConfig>;
const validateRepositoryConfig = object(
  {
    git: string(),
    branch: string(),
    init: optional(enumerate("npm", "yarn")),
    importpaths: optional(array(string())),
    importmaps: optional(array(validateImportMap)),
  },
  { allowExcessProperties: false }
);

export type RepositoryConfigMap = ValidatorReturnType<typeof validateRepositoryConfigMap>;
const validateRepositoryConfigMap = objectMap(validateRepositoryConfig);

export type TestSuiteConfig = ValidatorReturnType<typeof validateTestSuiteConfig>;
const validateTestSuiteConfig = object(
  {
    tester: string(),
    root: string(),
  },
  { allowExcessProperties: false }
);

export type Configuration = ValidatorReturnType<typeof validateConfigFile>;
const validateConfigFile = object(
  {
    contracts: objectMap(validateContractSourceReference),
    repositories: validateRepositoryConfigMap,
    networks: objectMap(validateNetworkConfig),
    tests: optional(validateTestSuiteConfig),
    buildFolder: string(),
    limits: validateLimitsConfig,
  },
  { allowExcessProperties: false }
);

export function parseConfigFile(configFileContent: string) {
  const parsedConfiguration: unknown = JSON.parse(configFileContent);

  const validatedConfiguration = validateConfigFile(parsedConfiguration);

  if (isFailure(validatedConfiguration) || !isSuccess(validatedConfiguration)) {
    console.log(validatedConfiguration.left);
    process.exit(1);
  }

  return validatedConfiguration.right;
}
