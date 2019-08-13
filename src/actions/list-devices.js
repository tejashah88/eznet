"use strict";

// local modules
const cache = require("../cache/cache-db");
const dfutils = require("../dfutils/misc-utils");
const logger = require("../helpers/logger");
const dfformat = require("../dfutils/formatting");

// local error classes
const BotLogicError = require("../errors/BotLogicError");

module.exports = async function listDevices({ actionIncomplete, parameters, contexts }) {
  const inputs = dfutils.getInputs({ parameters, contexts, fields: ["network"] });

  // validation phase
  if (actionIncomplete) {
    // we still need the network references
    if (!inputs.network || contexts["invalid-network"])
      return await dfutils.handleMissingNetwork({ contexts, fnName: "listdevices" });

    logger.error("Error: no handler to process remaining parameters during slot-filling process!");
    throw new BotLogicError("An error occurred while trying to process your request. Please try again later.");
  } else {
    const net = await dfutils.obtainNetwork({
      inputNet: inputs.network,
      fnName: "listdevices",
      invalidParam: "network"
    });

    // processing stage
    const devices = await cache.devices.getByNetId(net.id);
    const deviceNames = devices.map(device => device.name || device.model);

    const { text, speech } = dfformat.truncateList({
      text: `Your network, <bold>${net.name}<bold>, has the following devices:\n`,
      speech: `Your network, ${net.name}, has the following devices: `,
      fallback: `There are no devices in the "${net.name}" network!`,
      resetCtxField: "net",
      list: deviceNames,
      pluralNoun: "devices"
    });

    // response phase
    return {
      text, speech,
      contextOut: { net: net.name }
    };
  }
};