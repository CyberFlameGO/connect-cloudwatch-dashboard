import { ConnectClient, ListQueuesCommand, ListContactFlowsCommand } from "@aws-sdk/client-connect";
import { CloudWatchClient, PutDashboardCommand } from "@aws-sdk/client-cloudwatch";
import * as https from "https";
import * as url from "url";

const connectClient = new ConnectClient();
const cloudwatchClient = new CloudWatchClient();

const getQueues = async (instanceId) => {
  const queues = [];

  const params = {
    InstanceId: instanceId,
    /* required */
    MaxResults: 100,
    QueueTypes: [
      "STANDARD"
    ],
  };

  const execute = async (nextToken) => {
    try {
      params.NextToken = nextToken;

      const res = await connectClient.send(new ListQueuesCommand(params));

      queues.push(...res.QueueSummaryList);

      if (res.NextToken) {
        return execute(res.NextToken);
      }

    }
    catch (e) {
      console.log(e);
    }
  }

  await execute();

  console.log(queues);

  return queues;
}

const getFlows = async (instanceId) => {
  const flows = [];

  const params = {
    InstanceId: instanceId,
    /* required */
    MaxResults: 100,
    ContactFlowTypes: [
      "CONTACT_FLOW",
      "CUSTOMER_QUEUE",
      "CUSTOMER_HOLD",
      "CUSTOMER_WHISPER",
      "AGENT_HOLD",
      "AGENT_WHISPER",
      "OUTBOUND_WHISPER",
      "AGENT_TRANSFER",
      "QUEUE_TRANSFER",
    ]
  };

  const execute = async (nextToken) => {
    try {
      params.NextToken = nextToken;

      const res = await connectClient.send(new ListContactFlowsCommand(params));

      flows.push(...res.ContactFlowSummaryList);

      if (res.NextToken) {
        return execute(res.NextToken);
      }

    }
    catch (e) {
      console.log(e);
    }
  }

  await execute();

  return flows;
}

export const handler = async (event, context) => {
  if (event.RequestType == "Delete") {
    const deleteParams = {
      DashboardNames: event(process.env.DASHBOARD_NAME),
    };

    try {
      const res = await cloudwatchClient.send(
        new DeleteDashboardsCommand(deleteParams)
      );
      await send(event, context, "SUCCESS");
    } catch (e) {
      console.log(e);
      await send(event, context, "FAILED");
    }

    return;
  }

  const queues = await getQueues(process.env.INSTANCE_ID);
  const flows = await getFlows(process.env.INSTANCE_ID);

  console.log(`Number of queues: ${queues.length}`);
  console.log(`Number of flows: ${flows.length}`);

  const queuesSizeTemplate = queues.map((queue) => {
    return [
      "AWS/Connect",
      "QueueSize",
      "InstanceId",
      process.env.INSTANCE_ID,
      "MetricGroup",
      "Queue",
      "QueueName",
      queue.Name,
    ];
  });

  const queuesTimeTemplate = queues.map((queue) => {
    return [
      "AWS/Connect",
      "LongestQueueWaitTime",
      "InstanceId",
      process.env.INSTANCE_ID,
      "MetricGroup",
      "Queue",
      "QueueName",
      queue.Name,
    ];
  });

  const flowsErrorTemplate = flows.map((flow) => {
    return [
      "AWS/Connect",
      "ContactFlowErrors",
      "InstanceId",
      process.env.INSTANCE_ID,
      "MetricGroup",
      "ContactFlow",
      "ContactFlowName",
      flow.Name,
    ];
  });

  const flowsFatalErrorTemplate = flows.map((flow) => {
    return [
      "AWS/Connect",
      "ContactFlowFatalErrors",
      "InstanceId",
      process.env.INSTANCE_ID,
      "MetricGroup",
      "ContactFlow",
      "ContactFlowName",
      flow.Name,
    ];
  });

  const dashboardBody = {
    widgets: [
      {
        height: 6,
        width: 6,
        y: 0,
        x: 0,
        type: "metric",
        properties: {
          metrics: [
            [
              "AWS/Connect",
              "ConcurrentCallsPercentage",
              "InstanceId",
              `${process.env.INSTANCE_ID}`,
              "MetricGroup",
              "VoiceCalls",
            ],
          ],
          view: "timeSeries",
          stacked: false,
          annotations: {
            horizontal: [
              {
                label: "High Watermark",
                value: 0.8,
              },
            ],
          },
          period: 60,
          stat: "Maximum",
          title: "Concurrent Calls (%)",
          region: process.env.REGION,
        },
      },
      {
        height: 6,
        width: 6,
        y: 6,
        x: 18,
        type: "metric",
        properties: {
          view: "timeSeries",
          stacked: false,
          metrics: [
            [
              "AWS/Connect",
              "ToInstancePacketLossRate",
              "Participant",
              "Agent",
              "Type of Connection",
              "WebRTC",
              "Instance ID",
              `${process.env.INSTANCE_ID}`,
              "Stream Type",
              "Voice",
            ],
          ],
          annotations: {
            horizontal: [
              {
                label: "Max Avg Packet Loss",
                value: 0.02,
              },
            ],
          },
          period: 60,
          title: "Packet Loss Rate",
          region: process.env.REGION,
        },
      },
      {
        height: 6,
        width: 6,
        y: 0,
        x: 12,
        type: "metric",
        properties: {
          view: "timeSeries",
          stacked: false,
          metrics: [
            [
              "AWS/Connect",
              "ThrottledCalls",
              "InstanceId",
              `${process.env.INSTANCE_ID}`,
              "MetricGroup",
              "VoiceCalls",
            ],
          ],
          title: "Throttled Calls",
          period: 60,
          stat: "Maximum",
          region: process.env.REGION,
        },
      },
      {
        height: 6,
        width: 6,
        y: 0,
        x: 18,
        type: "metric",
        properties: {
          metrics: flowsErrorTemplate,
          view: "timeSeries",
          stacked: false,
          stat: "Sum",
          period: 60,
          title: "Contact Flow Errors",
          region: process.env.REGION,
        },
      },
      {
        height: 6,
        width: 6,
        y: 6,
        x: 0,
        type: "metric",
        properties: {
          metrics: flowsFatalErrorTemplate,
          view: "timeSeries",
          stacked: false,
          stat: "Sum",
          period: 60,
          title: "Contact Flow Fatal Errors",
          region: process.env.REGION,
        },
      },
      {
        height: 3,
        width: 12,
        y: 6,
        x: 6,
        type: "metric",
        properties: {
          metrics: queuesTimeTemplate,
          view: "singleValue",
          period: 60,
          stat: "Maximum",
          title: "Longest Queue Wait Time",
          region: process.env.REGION,
        },
      },
      {
        height: 3,
        width: 12,
        y: 9,
        x: 6,
        type: "metric",
        properties: {
          view: "singleValue",
          stacked: false,
          metrics: queuesSizeTemplate,
          period: 60,
          title: "Queue Size",
          stat: "Maximum",
          region: process.env.REGION,
        },
      },
      {
        height: 6,
        width: 6,
        y: 0,
        x: 6,
        type: "metric",
        properties: {
          view: "timeSeries",
          stacked: false,
          metrics: [
            [
              "AWS/Connect",
              "ConcurrentCalls",
              "InstanceId",
              `${process.env.INSTANCE_ID}`,
              "MetricGroup",
              "VoiceCalls",
            ],
          ],
          region: process.env.REGION,
          title: "Concurrent Calls",
          period: 60,
          stat: "Maximum",
        },
      },
      {
        height: 3,
        width: 6,
        y: 12,
        x: 0,
        type: "metric",
        properties: {
          metrics: [
            [
              "AWS/Connect",
              "CallsPerInterval",
              "InstanceId",
              `${process.env.INSTANCE_ID}`,
              "MetricGroup",
              "VoiceCalls",
            ],
          ],
          view: "singleValue",
          region: process.env.REGION,
          period: 60,
          stat: "Sum",
          title: "Calls Per Interval",
        },
      },
      {
        height: 3,
        width: 6,
        y: 12,
        x: 12,
        type: "metric",
        properties: {
          metrics: [
            [
              "AWS/Connect",
              "MisconfiguredPhoneNumbers",
              "InstanceId",
              `${process.env.INSTANCE_ID}`,
              "MetricGroup",
              "VoiceCalls",
            ],
          ],
          view: "singleValue",
          region: process.env.REGION,
          period: 60,
          stat: "Sum",
          title: "Misconfigured Phone Numbers",
        },
      },
      {
        type: "metric",
        x: 6,
        y: 12,
        width: 6,
        height: 3,
        properties: {
          metrics: [
            [
              "AWS/Connect",
              "CallRecordingUploadError",
              "InstanceId",
              `${process.env.INSTANCE_ID}`,
              "MetricGroup",
              "CallRecordings",
            ],
          ],
          view: "singleValue",
          stacked: false,
          region: process.env.REGION,
          stat: "Sum",
          period: 60,
          title: "Call Recording Upload Error",
        },
      },
      {
        type: "metric",
        x: 18,
        y: 12,
        width: 6,
        height: 3,
        properties: {
          metrics: [
            [
              "AWS/Connect",
              "CallsBreachingConcurrencyQuota",
              "InstanceId",
              `${process.env.INSTANCE_ID}`,
              "MetricGroup",
              "VoiceCalls",
            ],
          ],
          view: "singleValue",
          stacked: false,
          region: process.env.REGION,
          stat: "Sum",
          period: 60,
          title: "Calls Breaching Quota",
        },
      },
    ],
  };

  try {
    const res = await cloudwatchClient.send(
      new PutDashboardCommand({
        DashboardName: process.env.DASHBOARD_NAME,
        DashboardBody: JSON.stringify(dashboardBody),
      })
    );

    await send(event, context, "SUCCESS");
  } catch (e) {
    await send(event, context, "FAILED");
  }

  return;

  /**
   * A re-implementation of send() from cfn-response module to make sure we don't rely on importing cfn-response.
   * @param {*} event
   * @param {*} context
   * @param {*} responseStatus
   * @param {*} responseData
   * @param {*} physicalResourceId
   * @param {*} noEcho
   */
  async function send(
    event,
    context,
    responseStatus,
    responseData,
    physicalResourceId,
    noEcho
  ) {
    var responseBody = JSON.stringify({
      Status: responseStatus,
      Reason:
        "See the details in CloudWatch Log Stream: " + context.logStreamName,
      PhysicalResourceId: physicalResourceId || context.logStreamName,
      StackId: event.StackId,
      RequestId: event.RequestId,
      LogicalResourceId: event.LogicalResourceId,
      NoEcho: noEcho || false,
      Data: responseData,
    });

    console.log("Response body:\n", responseBody);

    var parsedUrl = url.parse(event.ResponseURL);
    var options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.path,
      method: "PUT",
      headers: {
        "content-type": "",
        "content-length": responseBody.length,
      },
    };

    const sendPromise = new Promise((res, rej) => {
      try {
        var request = https.request(options, function (response) {
          console.log("Status code: " + response.statusCode);
          console.log("Status message: " + response.statusMessage);
          context.done();
        });

        request.on("error", function (error) {
          console.log("send(..) failed executing https.request(..): " + error);
          context.done();
        });

        request.write(responseBody);
        request.end();
      } catch (e) {
        console.log(e);
      }
    });

    return await sendPromise;
  }
};
