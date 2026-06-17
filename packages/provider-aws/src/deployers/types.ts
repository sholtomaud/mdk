export interface DeployResult {
  resourceType: string;
  resourceId:   string;
  arn:          string;
  region:       string;
  deployedAt:   number;
}

export interface DestroyResult {
  resourceType: string;
  resourceId:   string;
  destroyedAt:  number;
}

export interface DeployOptions {
  region:                   string;
  originDomainName?:        string;
  assumeRolePolicyDocument?: object;
  lambdaZipBuffer?:         Buffer;
  lambdaRoleArn?:           string;
}
