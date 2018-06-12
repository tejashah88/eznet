"use strict";

// local modules
const cache = require("../cache/cache-db");
const logger = require("../helpers/logger");
const dfutils = require("../dfutils/misc-utils");
const dfformat = require("../dfutils/formatting");

// local error classes
const BotLogicError = require("../errors/BotLogicError");

module.exports = async function listNetworks({ actionIncomplete, parameters, contexts }) {
  let inputs = dfutils.getInputs({ parameters, contexts, fields: ["org"] });

  // validation phase
  if (actionIncomplete) {
    // we still need the org and time duration references
    if (!inputs.org || contexts["invalid-org"])
      return await dfutils.handleMissingOrg({ contexts, fnName: "listnetworks" });

    // the given org could be ambiguous or non-existent
    await dfutils.obtainOrg({
      inputOrg: inputs.org,
      fnName: "listnetworks",
      invalidParam: "org"
    });

    logger.error("Error: no handler to process remaining parameters during slot-filling process!");
    throw new BotLogicError("An error occurred while trying to process your request. Please try again later.");
  } else {
    let org = await dfutils.obtainOrg({
      inputOrg: inputs.org,
      fnName: "listnetworks",
      invalidParam: "org"
    });

    // processing phase
    let networks = await cache.networks.getByOrgId(org.id);
    let networkNames = networks.map(network => network.name);

    let { text, speech } = dfformat.truncateList({
      text: `Your organization, <bold>${org.name}<bold>, has the following networks:\n`,
      speech: `Your organization, ${org.name}, has the following networks: `,
      fallback: `There are no networks in the "${org.name}" organization!`,
      resetCtxField: "org",
      list: networkNames,
      pluralNoun: "networks"
    });

    // response phase
    return {
      text, speech,
      contextOut: { org: org.name }
    };
  }
};