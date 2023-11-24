// # Copyright 2023 - TTEC Digital (VoiceFoundry)

// #    Licensed under the Apache License, Version 2.0 (the "License");
// #    you may not use this file except in compliance with the License.
// #    You may obtain a copy of the License at

// #        http://www.apache.org/licenses/LICENSE-2.0

// #    Unless required by applicable law or agreed to in writing, software
// #    distributed under the License is distributed on an "AS IS" BASIS,
// #    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// #    See the License for the specific language governing permissions and
// #    limitations under the License.
// #====================================================================================================
// # Description : Creates Cloudwatch Dashboards for Amazon Connect for infrastructure and capacity planning management
// # Author      : TTEC Digital - AWS Practice (@karl-mentzer-vf) & AWS (@aurelienaws)
// # Date        : 23/11/2023
// # Version     : 0.0.1
// #====================================================================================================

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
        QueueTypes: ["STANDARD"],
    };

    const execute = async (nextToken) => {
        try {
            params.NextToken = nextToken;

            const res = await connectClient.send(new ListQueuesCommand(params));

            queues.push(...res.QueueSummaryList);

            if (res.NextToken) {
                return execute(res.NextToken);
            }
        } catch (e) {
            console.log(e);
        }
    };

    await execute();

    console.log(queues);

    return queues;
};

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
        ],
    };

    const execute = async (nextToken) => {
        try {
            params.NextToken = nextToken;

            const res = await connectClient.send(new ListContactFlowsCommand(params));

            flows.push(...res.ContactFlowSummaryList);

            if (res.NextToken) {
                return execute(res.NextToken);
            }
        } catch (e) {
            console.log(e);
        }
    };

    await execute();

    return flows;
};

export const handler = async (event) => {
    if (event.RequestType == "Delete") {
        const deleteParams = {
            DashboardNames: event(process.env.DASHBOARD_NAME),
        };

        try {
            const res = await cloudwatchClient.send(new DeleteDashboardsCommand(deleteParams));
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

    const dashboardInfraBody = {
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
        await cloudwatchClient.send(
            new PutDashboardCommand({
                DashboardName: "FANCY-INFRA",
                DashboardBody: JSON.stringify(dashboardInfraBody),
            })
        );
    } catch (e) {
      await send(event, context, "FAILED");
    }

    const dashboardOpsBody = {
        widgets: [
            {
                height: 5,
                width: 20,
                y: 0,
                x: 0,
                type: "metric",
                properties: {
                    metrics: [
                        [
                            "AWS/Connect",
                            "ConcurrentCalls",
                            "InstanceId",
                            `${process.env.INSTANCE_ID}`,
                            "MetricGroup",
                            "VoiceCalls",
                            {
                                label: "Max Active Calls",
                            },
                        ],
                    ],
                    view: "timeSeries",
                    stacked: true,
                    period: 900,
                    stat: "Maximum",
                    title: "Weekly Pattern - Max Concurrent Calls",
                    region: process.env.REGION,
                    start: "-PT168H",
                    end: "P0D",
                },
            },
            {
                height: 5,
                width: 20,
                y: 5,
                x: 0,
                type: "metric",
                properties: {
                    metrics: [
                        [
                            "AWS/Connect",
                            "ConcurrentTasks",
                            "InstanceId",
                            `${process.env.INSTANCE_ID}`,
                            "MetricGroup",
                            "Tasks",
                            {
                                color: "#ff7f0e",
                                label: "Max Active Tasks",
                            },
                        ],
                    ],
                    view: "timeSeries",
                    stacked: true,
                    period: 900,
                    stat: "Maximum",
                    title: "Weekly Pattern - Max Concurrent Tasks",
                    region: process.env.REGION,
                    start: "-PT168H",
                    end: "P0D",
                },
            },
            {
                height: 5,
                width: 20,
                y: 5,
                x: 0,
                type: "metric",
                properties: {
                    metrics: [
                        [
                            "AWS/Connect",
                            "ConcurrentActiveChats",
                            "InstanceId",
                            `${process.env.INSTANCE_ID}`,
                            "MetricGroup",
                            "Chats",
                            {
                                color: "#2ca02c",
                                label: "Max Active Chats",
                            },
                        ],
                    ],
                    view: "timeSeries",
                    stacked: true,
                    period: 900,
                    stat: "Maximum",
                    title: "Weekly Pattern - Max Concurrent Chats",
                    region: process.env.REGION,
                    start: "-PT168H",
                    end: "P0D",
                },
            },
            {
                height: 5,
                width: 4,
                y: 0,
                x: 20,
                type: "metric",
                properties: {
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
                    view: "singleValue",
                    stacked: true,
                    period: 5,
                    stat: "Maximum",
                    title: "Active Calls Now",
                    region: process.env.REGION,
                    start: "-PT1M",
                    end: "P0D",
                },
            },
            {
                height: 5,
                width: 4,
                y: 5,
                x: 20,
                type: "metric",
                properties: {
                    metrics: [
                        [
                            "AWS/Connect",
                            "ConcurrentTasks",
                            "InstanceId",
                            `${process.env.INSTANCE_ID}`,
                            "MetricGroup",
                            "Tasks",
                            {
                                color: "#ff7f0e",
                            },
                        ],
                    ],
                    view: "singleValue",
                    stacked: true,
                    period: 5,
                    stat: "Maximum",
                    title: "Active Tasks Now",
                    region: process.env.REGION,
                    start: "-PT1M",
                    end: "P0D",
                },
            },
            {
                height: 5,
                width: 4,
                y: 10,
                x: 20,
                type: "metric",
                properties: {
                    metrics: [
                        [
                            "AWS/Connect",
                            "ConcurrentActiveChats",
                            "InstanceId",
                            `${process.env.INSTANCE_ID}`,
                            "MetricGroup",
                            "Chats",
                            {
                                color: "#2ca02c",
                            },
                        ],
                    ],
                    view: "singleValue",
                    stacked: true,
                    period: 5,
                    stat: "Maximum",
                    title: "Active Chats Now",
                    region: process.env.REGION,
                    start: "-PT1M",
                    end: "P0D",
                },
            },
        ],
    };

    try {
        await cloudwatchClient.send(
            new PutDashboardCommand({
                DashboardName: "FANCY-OPS",
                DashboardBody: JSON.stringify(dashboardOpsBody),
            })
        );
    } catch (e) {
      await send(event, context, "FAILED");
    }

    await send(event, context, "SUCCESS");


    /**
     * A re-implementation of send() from cfn-response module to make sure we don't rely on importing cfn-response.
     * @param {*} event
     * @param {*} context
     * @param {*} responseStatus
     * @param {*} responseData
     * @param {*} physicalResourceId
     * @param {*} noEcho
     */
    async function send(event, context, responseStatus, responseData, physicalResourceId, noEcho) {
        var responseBody = JSON.stringify({
            Status: responseStatus,
            Reason: "See the details in CloudWatch Log Stream: " + context.logStreamName,
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

        const sendPromise = new Promise((_res) => {
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
