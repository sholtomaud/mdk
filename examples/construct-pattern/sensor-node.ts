// @ts-nocheck — design sketch using the proposed @mdk/core v1 API (not yet implemented)
/**
 * SensorNode — site-bound sensor with AWS IoT integration
 *
 * This construct answers three questions:
 *   1. WHAT hardware? (RasPi 4B + solar, modelled as BG power circuit)
 *   2. WHERE?         (a Site — physical location + Hydstra data source)
 *   3. HOW does data egress? (AWS IoT Core → S3 / TimeStream)
 *
 * ── AWS CDK Interoperability ──────────────────────────────────────
 *
 * Both @mdk/core (ModelConstruct) and aws-cdk-lib build on the same
 * `constructs` npm package. They share the same base class. This means
 * you can place AWS CDK constructs and MDK constructs in the SAME scope
 * tree with no adapter layer.
 *
 * Two patterns:
 *
 * Pattern A — Side-by-side stacks (recommended for large systems):
 *
 *   ┌─ MdkApp / cdk.App ──────────────────────────────────────────┐
 *   │  EcosystemSimStack extends ModelStack                        │
 *   │    → synthesizes to simulation JSON (MDK)                   │
 *   │                                                             │
 *   │  EcosystemInfraStack extends cdk.Stack                      │
 *   │    → synthesizes to CloudFormation template (CDK)           │
 *   │    → references outputs from SimStack (e.g. S3 bucket ARN)  │
 *   └─────────────────────────────────────────────────────────────┘
 *
 *   Use when: sim model and infra are independently deployable,
 *   different lifecycles, or managed by different teams.
 *
 * Pattern B — Single CDK Stack containing both MDK + CDK constructs:
 *
 *   export class EcosystemStack extends cdk.Stack {
 *     constructor(scope: Construct, id: string, props: cdk.StackProps) {
 *       super(scope, id, props);
 *       // MDK construct — shares scope with CDK constructs
 *       const hydro = new HydrologicalSystem(this, 'Hydro', {...});
 *       // CDK construct — same scope
 *       const bucket = new s3.Bucket(this, 'TimeseriesStore');
 *     }
 *   }
 *
 *   Use when: the sim model and infra are tightly coupled and always
 *   deployed together (common for single-site prototype / field pilots).
 *
 * This file demonstrates Pattern A:
 *   SensorNode is an MDK ModelConstruct (physics + site binding).
 *   SensorInfraConstruct is a CDK Construct (IoT Thing, cert, policy, rule).
 *   EcosystemInfraStack is a CDK Stack that hosts SensorInfraConstruct.
 *   Both stacks live in the same App.
 */

import { ModelConstruct } from '@mdk/core';
import type { ModelStack } from '@mdk/core';
import { SensorNetwork } from './sensor-network.js';
import type { SensorNetworkProps } from './sensor-network.js';
import type { Site } from './site.js';

// aws-cdk-lib imports — only used in the CDK infra stack (Pattern A).
// In Pattern B they would be used directly within ModelStack.

import * as cdk from 'aws-cdk-lib';
import * as iot from 'aws-cdk-lib/aws-iot';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3  from 'aws-cdk-lib/aws-s3';
import * as iotactions from 'aws-cdk-lib/aws-iot-actions';
import { Construct } from 'constructs';

// ── MDK SensorNode (Pattern A — pure physics + location) ──────────

export interface SensorNodeProps {
  /** The physical site this sensor is installed at. */
  site: Site;
  /** Hardware physics parameters (power circuit model). */
  hardware: SensorNetworkProps;
  /** MQTT topic prefix for this node. Defaults to `mdk/{site_id}/sensor`. */
  mqttTopicPrefix?: string;
}

export class SensorNode extends ModelConstruct {
  readonly site: Site;
  readonly power: SensorNetwork;

  /** MQTT topic this sensor publishes to. Used by the infra stack to create the IoT rule. */
  readonly mqttTopic: string;

  constructor(
    scope: ModelConstruct | ModelStack,
    id: string,
    props: SensorNodeProps,
  ) {
    super(scope, id);

    this.site = props.site;

    // Physics sub-construct — still pure MDK, no cloud
    this.power = new SensorNetwork(this, 'Power', props.hardware);

    this.mqttTopic = props.mqttTopicPrefix
      ?? `mdk/${props.site.config.site_id}/sensor`;
  }
}

// ── CDK SensorInfraConstruct (Pattern A — cloud infrastructure) ───
//
// This lives in a CDK Stack, NOT in an MDK ModelStack.

////&&&& Why? Why can't I have an interoperable MDK-CDK? 
////&&&& The reason I ask this is that we are building out a Stack/Model which will injest data from a timeseries store somewhere. This is where the CDKd https://github.com/sholtomaud/cdkd comes into it. The CDKd design basically means that it does not just puke out Cloudformation which you then forget about. It is a living document which can be run in a Lambda to check that the stack is performing as per the design parameters. Not just, "is the stack secure?", but also, "is the stack within the forecast budget, is the user base within the forecast userbase, is the stack reporting errors within error rate?" Etc. LIke it could be used for SRE metrics. But this also requires modelling prior to deployment. "How it started vs How it is going". That's the concept of MDK. we have the timeseries modelling engine, the synth of the model which could synth the infrastructure and the cloudformation, or even no cloudformation, in the CDKd design, you just call the APIs directly.  





////&&&& I've uncommented the code to get an idea of what it looks like. 


// It takes the MDK SensorNode as input to read config (site_id, mqttTopic)
// but produces only CloudFormation resources — no physics.
//
// Uncomment and install aws-cdk-lib to activate.


export interface SensorInfraProps extends cdk.StackProps {
  node: SensorNode;
  timeseriesBucket: s3.IBucket;
}

export class SensorInfraConstruct extends Construct {
  readonly iotThing: iot.CfnThing;
  readonly iotPolicy: iot.CfnPolicy;

  constructor(scope: Construct, id: string, props: SensorInfraProps) {
    super(scope, id);

    ////&&&& So again. While this kind of feels right. What happens when there are 100s or 1000s or even more sites in a region? 
    ////&&&& How do we define all the iot.CfnThings when there are so many sites? Do we just loop through a list? And have the list as like a yaml file or sqlite db or get all sites from the Hydstra API? 
    ////&&&& What happens if it's an industrial location with 1000s of sensor-sites?
     


    const siteId = props.node.site.config.site_id;

    // Register a named IoT Thing for this sensor node.
    this.iotThing = new iot.CfnThing(this, 'Thing', {
      thingName: `mdk-sensor-${siteId}`,
      attributePayload: {
        attributes: {
          site_id:   siteId,
          latitude:  String(props.node.site.config.latitude),
          longitude: String(props.node.site.config.longitude),
          network:   props.node.site.config.network ?? 'unknown',
        },
      },
    });

    // IoT Policy: allow the device to connect and publish on its topic only.
    this.iotPolicy = new iot.CfnPolicy(this, 'Policy', {
      policyName: `mdk-sensor-${siteId}-policy`,
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: ['iot:Connect'],
            Resource: `arn:aws:iot:*:*:client/mdk-sensor-${siteId}`,
          },
          {
            Effect: 'Allow',
            Action: ['iot:Publish'],
            Resource: `arn:aws:iot:*:*:topic/${props.node.mqttTopic}`,
          },
        ],
      },
    });

    // IoT Topic Rule: forward MQTT messages → S3 as CBOR objects.
    // The S3 key embeds site_id and ISO timestamp from the message payload.
    new iot.CfnTopicRule(this, 'ToS3Rule', {
      topicRulePayload: {
        sql:          `SELECT * FROM '${props.node.mqttTopic}'`,
        awsIotSqlVersion: '2016-03-23',
        actions: [{
          s3: {
            bucketName: props.timeseriesBucket.bucketName,
            key:        `timeseries/${siteId}/\${timestamp()}.cbor`,
            roleArn:    new iam.Role(this, 'IotS3Role', {
              assumedBy: new iam.ServicePrincipal('iot.amazonaws.com'),
              managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
              ],
            }).roleArn,
          },
        }],
      },
    });
  }
}

// ── CDK Infra Stack (Pattern A — side-by-side with EcosystemSimStack) ─
//
// Uncomment when aws-cdk-lib is installed.
// Note: synthesizes to CloudFormation, not MDK simulation JSON.

export interface EcosystemInfraStackProps extends cdk.StackProps {
  simNodes: SensorNode[];   // MDK nodes, read for config — not simulated here
  region: string;
}

export class EcosystemInfraStack extends cdk.Stack {
  readonly timeseriesBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: EcosystemInfraStackProps) {
    super(scope, id, props);

    // One S3 bucket for all site timeseries (CBOR objects, keyed by site_id + timestamp).
    this.timeseriesBucket = new s3.Bucket(this, 'TimeseriesBucket', {
      bucketName:        `mdk-timeseries-${cdk.Aws.ACCOUNT_ID}`,
      versioned:         false,
      lifecycleRules:    [{ expiration: cdk.Duration.days(3650) }],  // 10-year retention
      removalPolicy:     cdk.RemovalPolicy.RETAIN,
    });

    // One IoT Thing + rule per sensor node — driven from the MDK config.
    for (const node of props.simNodes) {
      new SensorInfraConstruct(this, `Sensor-${node.site.config.site_id}`, {
        node,
        timeseriesBucket: this.timeseriesBucket,
      });
    }
  }
}
