/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import dockerfileText from '../Dockerfile?raw';
import templateText from '../template.yaml?raw';

/** A file's lines without its comments: prose may name anything; only live wiring counts. */
const withoutComments = (text: string): string[] =>
  text.split('\n').filter((line) => !line.trimStart().startsWith('#'));

const templateLines = withoutComments(templateText);
const template = templateLines.join('\n');

/**
 * The block under a key at a given indent: every following line indented
 * deeper, up to the next line at that indent or shallower.
 */
const blockOf = (lines: readonly string[], key: string, indent: number): string => {
  const heading = `${' '.repeat(indent)}${key}:`;
  const start = lines.findIndex((line) => line.startsWith(heading));
  if (start === -1) {
    return '';
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.trim() !== '' && line.search(/\S/) <= indent);

  return rest.slice(0, end === -1 ? rest.length : end).join('\n');
};

/** A resource's block. */
const resource = (name: string): string => blockOf(templateLines, name, 2);

/** One statement of a policy block, found by its `Sid`. */
const statement = (block: string, sid: string): string => {
  const [, after = ''] = block.split(`Sid: ${sid}\n`);
  const [body = ''] = after.split(/\n\s*- Sid: /);
  return body;
};

/** Every IAM action a block names. */
const actionsIn = (block: string): string[] =>
  [...block.matchAll(/\b(?:s3|ssm|kms|secretsmanager|lambda|logs|iam|sts):[A-Za-z*]+/g)]
    .map(([action]) => action)
    .toSorted();

describe('template.yaml function', () => {
  const fn = resource('ReencoderFunction');

  it('is a container image on arm64', () => {
    expect(fn).toContain('PackageType: Image');
    expect(fn).toMatch(/Architectures:\s+- arm64/);
  });

  it('has the Lambda maximum to transcode in, and the memory and disk a video needs', () => {
    expect(fn).toContain('Timeout: 900');
    expect(fn).toContain('MemorySize: 3008');
    expect(Number(fn.match(/EphemeralStorage:\s+Size: (\d+)/)?.[1])).toBeGreaterThanOrEqual(2048);
  });

  it('is never retried by Lambda: a file that kills a decoder must not be decoded again', () => {
    expect(fn).toMatch(/EventInvokeConfig:\s+MaximumRetryAttempts: 0/);
  });

  it('builds from this directory’s Dockerfile', () => {
    expect(fn).toContain('Dockerfile: Dockerfile');
    expect(fn).toContain('DockerContext: .');
  });
});

describe('template.yaml function role', () => {
  const policies = blockOf(resource('ReencoderFunction').split('\n'), 'Policies', 6);

  it('may read and delete uploads, write copies, and do nothing else', () => {
    expect(actionsIn(policies)).toEqual(['s3:DeleteObject', 's3:GetObject', 's3:PutObject']);
  });

  it('reads and deletes only under uploads/ of the uploads bucket', () => {
    expect(statement(policies, 'ReadAndDeleteUploads')).toMatch(
      /Action:\s+- s3:GetObject\s+- s3:DeleteObject\s+Resource: !Sub '\$\{UploadsBucket\.Arn\}\/uploads\/\*'/
    );
  });

  it('writes only under copies/ of the uploads bucket', () => {
    expect(statement(policies, 'WriteCopies')).toMatch(
      /Action:\s+- s3:PutObject\s+Resource: !Sub '\$\{UploadsBucket\.Arn\}\/copies\/\*'/
    );
  });

  it('names no resource but those two prefixes', () => {
    const resources = [...policies.matchAll(/Resource: (.+)/g)].map(([, value]) => value);

    expect(resources).toEqual([
      "!Sub '${UploadsBucket.Arn}/uploads/*'",
      "!Sub '${UploadsBucket.Arn}/copies/*'",
    ]);
  });

  it('holds no secret, no parameter and no network placement', () => {
    expect(template).not.toMatch(/ssm:|secretsmanager:|kms:/);
    expect(template).not.toContain('VpcConfig');
    expect(template).not.toMatch(/SECRET|TOKEN|API_KEY/);
  });
});

describe('template.yaml wildcards', () => {
  it('grants nothing on every resource', () => {
    expect(template).not.toMatch(/Resource:\s*['"]?\*['"]?\s*$/m);
  });

  it('uses an action wildcard only to deny plain HTTP', () => {
    const wildcardActions = templateLines.filter((line) => /['"\s]s3:\*/.test(line));

    expect(wildcardActions).toHaveLength(1);
    expect(statement(resource('UploadsBucketPolicy'), 'DenyInsecureTransport')).toMatch(
      /Effect: Deny[\s\S]+Action: 's3:\*'[\s\S]+'aws:SecureTransport': 'false'/
    );
  });

  it('names every principal it allows', () => {
    const allowedToAnyone = /Effect: Allow\s+Principal:\s*['"]?\*/;

    expect(template).not.toMatch(allowedToAnyone);
  });
});

describe('template.yaml uploads bucket', () => {
  const bucket = resource('UploadsBucket');

  it('blocks every kind of public access', () => {
    const block = blockOf(bucket.split('\n'), 'PublicAccessBlockConfiguration', 6);

    expect(block.split('\n').map((line) => line.trim())).toEqual([
      'BlockPublicAcls: true',
      'BlockPublicPolicy: true',
      'IgnorePublicAcls: true',
      'RestrictPublicBuckets: true',
    ]);
  });

  it('turns ACLs off, so no object can be made public one at a time', () => {
    expect(bucket).toContain('ObjectOwnership: BucketOwnerEnforced');
  });

  it('encrypts at rest', () => {
    expect(bucket).toMatch(/ServerSideEncryptionByDefault:\s+SSEAlgorithm: AES256/);
  });

  it('outlives the stack: the copies are the only ones kept', () => {
    expect(bucket).toContain('DeletionPolicy: Retain');
    expect(bucket).toContain('UpdateReplacePolicy: Retain');
  });

  it('expires uploads/ after one day', () => {
    expect(bucket).toMatch(/Prefix: uploads\/\s+Status: Enabled\s+ExpirationInDays: 1\b/);
  });

  it('never expires copies/', () => {
    expect(bucket).not.toMatch(/Prefix: copies\//);
    expect([...bucket.matchAll(/ExpirationInDays/g)]).toHaveLength(1);
  });

  it('aborts incomplete multipart uploads after one day', () => {
    expect(bucket).toMatch(/AbortIncompleteMultipartUpload:\s+DaysAfterInitiation: 1\b/);
  });

  it('lets a browser PUT, GET and HEAD from the allowed origins only', () => {
    const cors = blockOf(bucket.split('\n'), 'CorsConfiguration', 6);

    expect(cors).toMatch(/AllowedMethods:\s+- PUT\s+- GET\s+- HEAD\s/);
    expect(cors).toContain('AllowedOrigins: !Ref AllowedOrigins');
    expect(cors).not.toMatch(/AllowedOrigins:\s*\n?\s*-?\s*['"]\*['"]/);
  });

  it('defaults the allowed origins to the production site', () => {
    expect(blockOf(templateLines, 'AllowedOrigins', 2)).toContain(
      "Default: 'https://fakefourrecords.com,https://www.fakefourrecords.com'"
    );
  });

  it('is named from a parameter, falling back to a name with the account id', () => {
    expect(bucket).toMatch(
      /BucketName: !If\s+- HasBucketName\s+- !Ref BucketName\s+- !Sub 'fakefour-submission-uploads-\$\{AWS::AccountId\}'/
    );
  });
});

describe('template.yaml bucket policy for the web app', () => {
  const policy = resource('UploadsBucketPolicy');

  it('grants the app nothing unless its principal is given', () => {
    const grants = [...policy.matchAll(/- !If\s+- HasAppPrincipal\s+- Sid: (\w+)/g)].map(
      ([, sid]) => sid
    );

    expect(grants).toEqual(['AppUploads', 'AppCopies', 'AppList']);
    expect(template).toMatch(/HasAppPrincipal: !Not \[!Equals \[!Ref AppPrincipalArn, ''\]\]/);
  });

  it('lets the app put, get and delete under uploads/', () => {
    const uploads = statement(policy, 'AppUploads');

    expect(actionsIn(uploads)).toEqual(['s3:DeleteObject', 's3:GetObject', 's3:PutObject']);
    expect(uploads).toContain("Resource: !Sub '${UploadsBucket.Arn}/uploads/*'");
  });

  it('lets the app get and delete, but never write, under copies/', () => {
    const copies = statement(policy, 'AppCopies');

    expect(actionsIn(copies)).toEqual(['s3:DeleteObject', 's3:GetObject']);
    expect(copies).toContain("Resource: !Sub '${UploadsBucket.Arn}/copies/*'");
  });

  it('lets the app list the bucket', () => {
    const list = statement(policy, 'AppList');

    expect(actionsIn(list)).toEqual(['s3:ListBucket']);
    expect(list).toContain('Resource: !GetAtt UploadsBucket.Arn');
  });

  it('grants only to the app’s principal', () => {
    const principals = [...policy.matchAll(/AWS: (.+)/g)].map(([, value]) => value);

    expect(principals).toEqual([
      '!Ref AppPrincipalArn',
      '!Ref AppPrincipalArn',
      '!Ref AppPrincipalArn',
    ]);
  });
});

describe('template.yaml invoke permission for the web app', () => {
  const permission = resource('AppInvokePermission');

  it('lets the app’s principal invoke the function, and only invoke it', () => {
    expect(permission).toContain('Type: AWS::Lambda::Permission');
    expect(permission).toContain('Action: lambda:InvokeFunction');
    expect(permission).toContain('Principal: !Ref AppPrincipalArn');
    expect(permission).toContain('FunctionName: !Ref ReencoderFunction');
  });

  it('grants nothing unless the app’s principal is given', () => {
    expect(permission).toContain('Condition: HasAppPrincipal');
  });
});

describe('template.yaml alarm', () => {
  it('alarms on the function’s errors', () => {
    const alarm = resource('ReencoderErrorAlarm');

    expect(alarm).toContain('MetricName: Errors');
    expect(alarm).toContain('Value: !Ref ReencoderFunction');
  });

  it('emails only when an address is given', () => {
    expect(resource('AlarmTopic')).toContain('Condition: HasAlarmEmail');
  });
});

describe('template.yaml outputs', () => {
  const outputs = blockOf(templateLines, 'Outputs', 0).split('\n');

  it('answers the function name, naming the app variable it feeds', () => {
    const output = blockOf(outputs, 'FunctionName', 2);

    expect(output).toContain('SUBMISSION_REENCODER_LAMBDA_NAME');
    expect(output).toContain('Value: !Ref ReencoderFunction');
  });

  it('answers the bucket name, naming the app variable it feeds', () => {
    const output = blockOf(outputs, 'UploadsBucketName', 2);

    expect(output).toContain('SUBMISSION_UPLOADS_BUCKET');
    expect(output).toContain('Value: !Ref UploadsBucket');
  });
});

describe('Dockerfile', () => {
  const dockerfile = withoutComments(dockerfileText);
  const froms = dockerfile.filter((line) => line.startsWith('FROM '));

  it('takes ffmpeg from an image pinned by digest', () => {
    expect(froms.at(0)).toMatch(
      /^FROM mwader\/static-ffmpeg:[\w.]+@sha256:[0-9a-f]{64} AS ffmpeg$/
    );
  });

  it('runs on the AWS Lambda Node.js 24 base image', () => {
    expect(froms.at(-1)).toBe('FROM public.ecr.aws/lambda/nodejs:24');
  });

  it('puts ffmpeg and ffprobe on the runtime’s PATH', () => {
    expect(dockerfile).toContain('COPY --from=ffmpeg /ffmpeg /ffprobe /usr/local/bin/');
  });

  it('installs sharp from the lockfile, production dependencies only', () => {
    expect(dockerfile).toContain('RUN pnpm install --prod --frozen-lockfile');
  });

  it('starts the handler the template deploys', () => {
    expect(dockerfile.at(-1) || dockerfile.at(-2)).toBe('CMD ["handler.lambdaHandler"]');
  });
});
