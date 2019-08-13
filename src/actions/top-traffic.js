"use strict";

// local modules
const { HUMANIZE_CONFIG } = require("../helpers/constants");
const logger = require("../helpers/logger");
const { retryablePromise } = require("../helpers/utils");
const dfutils = require("../dfutils/misc-utils");
const dfformat = require("../dfutils/formatting");

// local error classes
const BotLogicError = require("../errors/BotLogicError");

// remote modules
const randomColor = require("randomcolor");
const quiche = require("quiche");
const humanizeDuration = require("humanize-duration").humanizer(HUMANIZE_CONFIG);
const dashboard = require("node-meraki-dashboard")(process.env.MERAKI_API_KEY);

module.exports = async function topTraffic({ actionIncomplete, parameters, contexts }) {
  const inputs = dfutils.getInputs({ parameters, contexts, fields: ["network", "time-duration"] });

  // validation phase
  if (actionIncomplete) {
    // we still need the network and time duration references
    if (!inputs.network || contexts["invalid-network"])
      return await dfutils.handleMissingNetwork({ contexts, fnName: "toptraffic" });

    if (!dfutils.containsExistingTimeDuration({ parameters, contexts }))
      return dfutils.respondToInvalidTimeDuration(contexts["invalid-time-duration"], "data usage statistics");

    logger.error("Error: no handler to process remaining parameters during slot-filling process!");
    throw new BotLogicError("An error occurred while trying to process your request. Please try again later.");
  } else {
    const net = await dfutils.obtainNetwork({
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

    // processing stage
    const totalSeconds = dfutils.calcTotalSeconds(inputs["time-duration"]);
    const trafficData = await retryablePromise({
      networkFunc: dashboard.networks.getTrafficData,
      errorHandler: err => ({ error: err.data.errors.join(" ") })
    }, net.id, { timespan: totalSeconds });

    if (trafficData.error)
      throw new BotLogicError(trafficData.error).setResetContextFields("network");

    const timeDurText = dfformat.displayableTimeDuration(inputs["time-duration"]);

    if (!trafficData || !trafficData.length) {
      throw new BotLogicError(
        `No top traffic data has been found in the "${net.name}" network over the past ${timeDurText}!`
      ).setResetContextFields("network");
    }

    let text = `Your network, <bold>${net.name}<bold>, has the following top 10 sites/apps for traffic:\n`;
    let speech = `Your network, ${net.name}, has the following top 10 sites/apps for traffic: `;

    let topTraffic = trafficData.map(
      dataPiece => ({
        app: dataPiece.application,
        source: dataPiece.destination,
        time: dataPiece.activeTime
      })
    ).sort((a, b) => b.time - a.time);

    topTraffic = topTraffic.slice(0, 10);

    text += topTraffic.map((tt, index) => {
      const totalTime = humanizeDuration(tt.time);
      const dataSource = tt.app + (tt.source ? ` - ${tt.source}` : "");
      return `${index + 1}. ${dataSource}: ${totalTime}`;
    }).join("\n");

    speech += topTraffic.map(tt => {
      const totalTime = humanizeDuration(tt.time);
      const dataSource = tt.app + (tt.source ? ` from ${tt.source}` : "");
      return `${dataSource} used for ${totalTime}`;
    }).join(", ");

    const pie = new quiche("pie");
    pie.setHostname("image-charts.com");
    pie.setWidth(700);
    pie.setHeight(700);

    for (const tt of topTraffic) {
      const dataSource = tt.app + (tt.source ? ` @ ${tt.source}` : "");
      pie.addData(tt.time, dataSource, randomColor().slice(1));
    }

    // handling edge case where having only one data point breaks chart
    const imageUrl = pie.getUrl(true).replace(/(chd=t%3A(\d+(\.\d+)?))&/g,"$1%2C0&");

    // response phase
    return {
      text, speech, imageUrl,
      altText: `Top traffic in the ${net.name} network.`,
      contextOut: { net: net.name }
    };
  }
};