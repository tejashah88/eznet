"use strict";

// local modules
const cache = require("../cache/cache-db");
const logger = require("../helpers/logger");
const dfutils = require("../dfutils/misc-utils");
const dfformat = require("../dfutils/formatting");

// local error classes
const BotLogicError = require("../errors/BotLogicError");

module.exports = async function listAdmins({ actionIncomplete, parameters, contexts }) {
  let inputs = dfutils.getInputs({ parameters, contexts, fields: ["org"] });

  // validation phase
  if (actionIncomplete) {
    // we still need the org and time duration references
    if (!inputs.org || contexts["invalid-org"])
      return await dfutils.handleMissingOrg({ contexts, fnName: "listadmins" });

    // the given org could be ambiguous or non-existent
    await dfutils.obtainOrg({
      inputOrg: inputs.org,
      fnName: "listadmins",
      invalidParam: "org"
    });

    logger.error("Error: no handler to process remaining parameters during slot-filling process!");
    throw new BotLogicError("An error occurred while trying to process your request. Please try again later.");
  } else {
    let org = await dfutils.obtainOrg({
      inputOrg: inputs.org,
      fnName: "listadmins",
      invalidParam: "org"
    });


    let admins = await cache.admins.getByOrgId(org.id);
    let adminNames = admins.map(admin => admin.name);
    let adminInfos = admins.map(admin => admin.name + " - " + admin.email);

    let { text, speech } = dfformat.truncateDoubleList({
      text: `Your organization, <bold>${org.name}<bold>, has the following administrators:\n`,
      speech: `Your organization, ${org.name}, has the following administrators: `,
      fallback: `There are no administrators in the "${org.name}" organization!`,
      resetCtxField: "org",
      textList: adminInfos,
      speechList: adminNames,
      pluralNoun: "administrators"
    });

    return {
      text, speech,
      contextOut: { org: org.name }
    };
  }
};