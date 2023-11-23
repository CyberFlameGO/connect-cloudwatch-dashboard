import { ConnectClient, ListQueuesCommand, ListContactFlowsCommand } from "@aws-sdk/client-connect";
import { CloudWatchClient, PutDashboardCommand } from "@aws-sdk/client-cloudwatch";

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

export const handler = async (event) => {

  const queues = await getQueues(process.env.INSTANCE_ID);
  const flows = await getFlows(process.env.INSTANCE_ID);

  console.log(`Number of queues: ${queues.length}`);
  console.log(`Number of flows: ${flows.length}`);

  const queuesSizeTemplate = queues.map(queue => {
    return ["AWS/Connect", "QueueSize", "InstanceId", process.env.INSTANCE_ID, "MetricGroup", "Queue", "QueueName", queue.Name];
  });

  const queuesTimeTemplate = queues.map(queue => {
    return ["AWS/Connect", "LongestQueueWaitTime", "InstanceId", process.env.INSTANCE_ID, "MetricGroup", "Queue", "QueueName", queue.Name];
  });

  const flowsErrorTemplate = flows.map(flow => {
    return ["AWS/Connect", "ContactFlowErrors", "InstanceId", process.env.INSTANCE_ID, "MetricGroup", "ContactFlow", "ContactFlowName", flow.Name];
  });

  const flowsFatalErrorTemplate = flows.map(flow => {
    return ["AWS/Connect", "ContactFlowFatalErrors", "InstanceId", process.env.INSTANCE_ID, "MetricGroup", "ContactFlow", "ContactFlowName", flow.Name]
  });

  const dashboardBody = {
    "widgets": [{
        "height": 6,
        "width": 6,
        "y": 0,
        "x": 0,
        "type": "metric",
        "properties": {
          "metrics": [
            ["AWS/Connect", "ConcurrentCallsPercentage", "InstanceId", `${process.env.INSTANCE_ID}`, "MetricGroup", "VoiceCalls"]
          ],
          "view": "timeSeries",
          "stacked": false,
          "annotations": {
            "horizontal": [{
              "label": "High Watermark",
              "value": 0.8
            }]
          },
          "period": 60,
          "stat": "Maximum",
          "title": "Concurrent Calls (%)",
          "region": process.env.REGION,
        }
      },
      {
        "height": 6,
        "width": 6,
        "y": 6,
        "x": 18,
        "type": "metric",
        "properties": {
          "view": "timeSeries",
          "stacked": false,
          "metrics": [
            ["AWS/Connect", "ToInstancePacketLossRate", "Participant", "Agent", "Type of Connection", "WebRTC", "Instance ID", `${process.env.INSTANCE_ID}`, "Stream Type", "Voice"]
          ],
          "annotations": {
            "horizontal": [{
              "label": "Max Avg Packet Loss",
              "value": 0.02
            }]
          },
          "period": 60,
          "title": "Packet Loss Rate",
          "region": process.env.REGION,
        }
      },
      {
        "height": 6,
        "width": 6,
        "y": 0,
        "x": 12,
        "type": "metric",
        "properties": {
          "view": "timeSeries",
          "stacked": false,
          "metrics": [
            ["AWS/Connect", "ThrottledCalls", "InstanceId", `${process.env.INSTANCE_ID}`, "MetricGroup", "VoiceCalls"]
          ],
          "title": "Throttled Calls",
          "period": 60,
          "stat": "Maximum",
          "region": process.env.REGION,
        }
      },
      {
        "height": 6,
        "width": 6,
        "y": 0,
        "x": 18,
        "type": "metric",
        "properties": {
          "metrics": flowsErrorTemplate,
          "view": "timeSeries",
          "stacked": false,
          "stat": "Sum",
          "period": 60,
          "title": "Contact Flow Errors",
          "region": process.env.REGION,
        }
      },
      {
        "height": 6,
        "width": 6,
        "y": 6,
        "x": 0,
        "type": "metric",
        "properties": {
          "metrics": flowsFatalErrorTemplate,
          "view": "timeSeries",
          "stacked": false,
          "stat": "Sum",
          "period": 60,
          "title": "Contact Flow Fatal Errors",
          "region": process.env.REGION,
        }
      },
      {
        "height": 3,
        "width": 12,
        "y": 6,
        "x": 6,
        "type": "metric",
        "properties": {
          "metrics": queuesTimeTemplate,
          "view": "singleValue",
          "period": 60,
          "stat": "Maximum",
          "title": "Longest Queue Wait Time",
          "region": process.env.REGION,
        }
      },
      {
        "height": 3,
        "width": 12,
        "y": 9,
        "x": 6,
        "type": "metric",
        "properties": {
          "view": "singleValue",
          "stacked": false,
          "metrics": queuesSizeTemplate,
          "period": 60,
          "title": "Queue Size",
          "stat": "Maximum",
          "region": process.env.REGION,
        }
      },
      {
        "height": 6,
        "width": 6,
        "y": 0,
        "x": 6,
        "type": "metric",
        "properties": {
          "view": "timeSeries",
          "stacked": false,
          "metrics": [
            ["AWS/Connect", "ConcurrentCalls", "InstanceId", `${process.env.INSTANCE_ID}`, "MetricGroup", "VoiceCalls"]
          ],
          "region": process.env.REGION,
          "title": "Concurrent Calls",
          "period": 60,
          "stat": "Maximum"
        }
      },
      {
        "height": 3,
        "width": 6,
        "y": 12,
        "x": 0,
        "type": "metric",
        "properties": {
          "metrics": [
            ["AWS/Connect", "CallsPerInterval", "InstanceId", `${process.env.INSTANCE_ID}`, "MetricGroup", "VoiceCalls"]
          ],
          "view": "singleValue",
          "region": process.env.REGION,
          "period": 60,
          "stat": "Sum",
          "title": "Calls Per Interval"
        }
      },
      {
        "height": 3,
        "width": 6,
        "y": 12,
        "x": 12,
        "type": "metric",
        "properties": {
          "metrics": [
            ["AWS/Connect", "MisconfiguredPhoneNumbers", "InstanceId", `${process.env.INSTANCE_ID}`, "MetricGroup", "VoiceCalls"]
          ],
          "view": "singleValue",
          "region": process.env.REGION,
          "period": 60,
          "stat": "Sum",
          "title": "Misconfigured Phone Numbers"
        }
      },
      {
        "type": "metric",
        "x": 6,
        "y": 12,
        "width": 6,
        "height": 3,
        "properties": {
          "metrics": [
            ["AWS/Connect", "CallRecordingUploadError", "InstanceId", `${process.env.INSTANCE_ID}`, "MetricGroup", "CallRecordings"]
          ],
          "view": "singleValue",
          "stacked": false,
          "region": process.env.REGION,
          "stat": "Sum",
          "period": 60,
          "title": "Call Recording Upload Error"
        }
      },
      {
        "type": "metric",
        "x": 18,
        "y": 12,
        "width": 6,
        "height": 3,
        "properties": {
          "metrics": [
            ["AWS/Connect", "CallsBreachingConcurrencyQuota", "InstanceId", `${process.env.INSTANCE_ID}`, "MetricGroup", "VoiceCalls"]
          ],
          "view": "singleValue",
          "stacked": false,
          "region": process.env.REGION,
          "stat": "Sum",
          "period": 60,
          "title": "Calls Breaching Quota"
        }
      }
    ]
  };

  const res = await cloudwatchClient.send(new PutDashboardCommand({
    "DashboardName": "FANCY3",
    "DashboardBody": JSON.stringify(dashboardBody)
  }));

  return {};
};
