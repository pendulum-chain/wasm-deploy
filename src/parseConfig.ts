import {
  array,
  boolean,
  enumerate,
  FefeError,
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
    repository: optional(string()),
    path: string(),
    isPrecompiled: optional(boolean()),
    importpaths: optional(array(string())),
    importmaps: optional(array(validateImportMap)),
    mutatingOverwrites: optional(objectMap(boolean())),
    // the following is temporary workaround because Solang incorrectly labels overriden functions
    // see https://matrix.to/#/!SerycSiSddhaCAXosD:parity.io/$98F3bOdGQ_QRaYQE82LQxEDy_q2WNyYM6yysNdbJdlk?via=parity.io&via=matrix.org
    messageNameOverwrites: optional(objectMap(string())),
    // the following is a workaround for message arguments that have an empty name
    // as the generated code in the squid is erroneous
    // empty message arguments happen, e.g., for public contract variables of type mapping
    argumentNameOverwrites: optional(objectMap(array(string()))),
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

function prettyPrintFefeErrors(error: FefeError): string[] {
  switch (error.type) {
    case "leaf":
      return [`${error.reason}`];
    case "branch":
      return error.childErrors.map(
        (childError) => `${String(childError.key)} -> ${prettyPrintFefeErrors(childError.error)}`
      );
  }
}

export function parseConfigFile(configFileContent: string) {
  const parsedConfiguration: unknown = JSON.parse(configFileContent);

  const validatedConfiguration = validateConfigFile(parsedConfiguration);

  if (isFailure(validatedConfiguration) || !isSuccess(validatedConfiguration)) {
    console.log("Error in configuration file");

    console.log(
      prettyPrintFefeErrors(validatedConfiguration.left)
        .map((error) => `- ${error}`)
        .join("\n")
    );
    process.exit(1);
  }

  return validatedConfiguration.right;
}
