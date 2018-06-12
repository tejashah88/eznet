"use strict";

// local modules
const logger = require("../helpers/logger");
const utils = require("../helpers/utils");
const dfutils = require("../dfutils/misc-utils");
const dfformat = require("../dfutils/formatting");

// local error classes
const BotLogicError = require("../errors/BotLogicError");

// remote modules
const randomColor = require("randomcolor");
const quiche = require("quiche");
const bytes = require("bytes");
const dashboard = require("node-meraki-dashboard")(process.env.MERAKI_API_KEY);

module.exports = async function dataUsage({ actionIncomplete, parameters, contexts }) {
  let inputs = dfutils.getInputs({ parameters, contexts, fields: ["network", "time-duration"] });

  // validation phase
  if (actionIncomplete) {
    // we still need the network and time duration references
    if (!inputs.network || contexts["invalid-network"])
      return await dfutils.handleMissingNetwork({ contexts, fnName: "datausage" });

    if (!dfutils.containsExistingTimeDuration({ parameters, contexts }))
      return dfutils.respondToInvalidTimeDuration(contexts["invalid-time-duration"], "data usage statistics");

    logger.error("Error: no handler to process remaining parameters during slot-filling process!");
    throw new BotLogicError("An error occurred while trying to process your request. Please try again later.");
  } else {
    let net = await dfutils.obtainNetwork({
      inputNet: inputs.network,
      fnName: "datausage",
      invalidParam: "network",
      extraParams: {
        "time-duration": inputs["time-duration"]
      }
    });

    if (!dfutils.isValidTimeDuration({ parameters, contexts })) {
      throw new BotLogicError("Sorry, but you can only get data usage statistics between 2 hours and 1 month.")
        .setFollowupEvent({
          eventName: "datausage-repromptparams",
          parameters: { "time-duration": "", "network": net.name, "invalid-time-duration": "true" }
        });
    }

    // processing phase
    let totalSeconds = dfutils.calcTotalSeconds(inputs["time-duration"]);
    let trafficData = await utils.retryablePromise({
      networkFunc: dashboard.networks.getTrafficData,
      errorHandler: err => ({ error: err.data.errors.join(" ") })
    }, net.id, { timespan : totalSeconds });

    if (trafficData.error)
      throw new BotLogicError(trafficData.error).setResetContextFields("network");

    let timeDurText = dfformat.displayableTimeDuration(inputs["time-duration"]);

    if (!trafficData || !trafficData.length) {
      throw new BotLogicError(
        `No data usage has been found in the "${net.name}" network over the past ${timeDurText}!`
      ).setResetContextFields("network");
    }

    let topDataUsage = trafficData.map(
      dataPiece => ({
        app: dataPiece.application,
        source: dataPiece.destination,
        numClients: dataPiece.numClients,
        data: {
          sent: dataPiece.sent,
          received: dataPiece.recv,
          combined: dataPiece.sent + dataPiece.recv,
        }
      })
    ).sort((a, b) => b.data.combined - a.data.combined);

    topDataUsage = topDataUsage.slice(0, 10);

    let pie = new quiche("pie");
    pie.setHostname("image-charts.com");
    pie.setWidth(700);
    pie.setHeight(700);

    let clientCount = 0;
    let totalData = {
      sent: 0,
      received: 0,
      combined: 0
    };

    for (let { numClients, data, app, source} of topDataUsage) {
      clientCount += numClients;

      totalData.sent += data.sent;
      totalData.received += data.received;
      totalData.combined += data.combined;

      pie.addData(data.combined, app || source, randomColor().slice(1));
    }

    // handling edge case where having only one data point breaks chart
    let imageUrl = pie.getUrl(true).replace(/(chd=t%3A(\d+(\.\d+)?))&/g,"$1%2C0&");

    let bytesOpts = { unitSeparator: " " };
    let bytesTotal = bytes(totalData.combined, bytesOpts);
    let avgByteTotalClient = bytes(totalData.combined / clientCount, bytesOpts);
    let bytesSent = bytes(totalData.sent, bytesOpts);
    let bytesReceived = bytes(totalData.received, bytesOpts);

    // response phase
    let text = `
      <o> Total data usage with ${clientCount} clients over ${timeDurText}: ${bytesTotal}
      <o> Average data usage over ${timeDurText}: ${avgByteTotalClient} per client
      <o> Total data sent over ${timeDurText}: ${bytesSent}
      <o> Total data received over ${timeDurText}: ${bytesReceived}
    `;
    let speech = [
      `The total data usage with ${clientCount} clients over ${timeDurText} was ${bytesTotal}.`,
      `On average, most clients used about ${avgByteTotalClient}.`,
      `The total data sent over the same time period was ${bytesSent} and the total data received was ${bytesReceived}.`
    ].join(" ");

    return {
      text, speech, imageUrl,
      altText: `Data usage in the ${net.name} network.`,
      contextOut: { net: net.name }
    };
  }
};