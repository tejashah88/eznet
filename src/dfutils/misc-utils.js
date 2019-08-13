"use strict";

// local modules
const {
  FUZZY_FAIL_REASONS,
  ALLOWED_INPUT_TIME_UNITS,
  TIME_UNIT_IN_SECONDS
} = require("../helpers/constants");
const { parseBool } = require("../helpers/utils");
const cache = require("../cache/cache-db");
const dfformat = require("./formatting");

function isValidTimeDuration({ parameters, contexts }) {
  const timeDur = parameters["time-duration"] || contexts["time-duration"] || null;
  if (!timeDur || !timeDur.amount || !timeDur.unit || !ALLOWED_INPUT_TIME_UNITS.includes(timeDur.unit))
    return false;
  const totalSeconds = calcTotalSeconds(timeDur);
  return (totalSeconds >= (2 * TIME_UNIT_IN_SECONDS["h"]) && totalSeconds <= TIME_UNIT_IN_SECONDS["mo"]);
}

const calcTotalSeconds = timeDur => timeDur.amount * TIME_UNIT_IN_SECONDS[timeDur.unit];

function respondToInvalidTimeDuration(processingInvalidInput, mainEntityDescriptor) {
  const msg = processingInvalidInput ?
    `Sorry, but you can only get ${mainEntityDescriptor} between 2 hours and 1 month. What time duration?` :
    "What time duration? You can choose between a range of 2 hours and 1 month.";
  return { text: msg, speech: msg };
}

const containsExistingOrg = async ({ inputOrg, contexts }) =>
  inputOrg && !contexts["invalid-org"] &&
  await cache.orgs.getFuzzy(inputOrg).then(() => true).catch(() => false);

// used when prompting for an org while displaying a list of possible ones
async function handleMissingOrg({ contexts, fnName }) {
  const repromptOrg = contexts[fnName + "-invalid-org"];
  const possibleOrgs = contexts[fnName + "-possible-orgs"];
  if (repromptOrg) {
    return dfformat.truncateList({
      text: "Sorry, but there are multiple similarly named organizations:\n",
      speech: "Sorry, but there are multiple similarly named organizations: ",
      endText: "\n Which organization?",
      endSpeech: " Which organization?",
      fallback: "Sorry, but there are multiple similarly named organizations. Which organization?",
      throwError: false,
      list: possibleOrgs,
      pluralNoun: "organizations"
    });
  } else {
    const orgsList = await cache.orgs.getAll();
    const orgNames = orgsList.map(org => org.name);

    return dfformat.truncateList({
      text: "Which organization? You can choose from the following orgs:\n",
      speech: "Which organization? You can choose from the following orgs: ",
      fallback: "Which organization?",
      throwError: false,
      resetCtxField: "org",
      list: orgNames,
      pluralNoun: "organizations"
    });
  }
}

const containsExistingNetwork = async ({ inputNet, contexts }) =>
  inputNet && !contexts["invalid-network"] &&
  await cache.networks.getFuzzy(inputNet).then(() => true).catch(() => false);

// used when prompting for a network while displaying a list of possible ones
async function handleMissingNetwork({ contexts }) {
  const repromptNetwork = contexts["invalid-network"];
  const possibleNetworks = contexts["possible-networks"];
  if (repromptNetwork) {
    return dfformat.truncateList({
      text: "Sorry, but there are multiple similarly named networks:\n",
      speech: "Sorry, but there are multiple similarly named networks: ",
      endText: "\n Which network?",
      endSpeech: " Which network?",
      fallback: "Sorry, but there are multiple similarly named networks. Which network?",
      throwError: false,
      list: possibleNetworks,
      pluralNoun: "networks"
    });
  } else {
    const totalNetworks = await cache.networks.getAll();
    const netNames = totalNetworks.map(net => net.name);

    return dfformat.truncateList({
      text: "Which network? You can choose from the following networks:\n",
      speech: "Which network? You can choose from the following networks: ",
      fallback: "Which network?",
      throwError: false,
      resetCtxField: "net",
      list: netNames,
      pluralNoun: "networks"
    });
  }
}

const containsExistingTimeDuration = ({ parameters, contexts }) => parameters["time-duration"]
  && !contexts["invalid-time-duration"]
  && isValidTimeDuration({ parameters, contexts });

// This is used for eliminating the unnecessary contexts and zeroing on the valid ones
// Mainly, it's a mess to deal with them directly
function contextTransformer(ctxs) {
  const finalCtxs = {};
  for (const ctx of ctxs) {
    if (ctx.name.endsWith("organization") && ctx.parameters.org)
      finalCtxs.org = ctx.parameters.org;
    else if (ctx.name.endsWith("network") && ctx.parameters.network)
      finalCtxs.network = ctx.parameters.network;
    else if (ctx.name.endsWith("repromptparams")) {
      finalCtxs["invalid-org"] = parseBool(ctx.parameters["invalid-org"] || false);
      finalCtxs["invalid-network"] = parseBool(ctx.parameters["invalid-network"] || false);
      finalCtxs["invalid-time-duration"] = parseBool(ctx.parameters["invalid-time-duration"] || false);

      if (finalCtxs["invalid-org"])
        finalCtxs["possible-orgs"] = ctx.parameters["possible-candidates"].split("|");
      else if (finalCtxs["invalid-network"])
        finalCtxs["possible-networks"] = ctx.parameters["possible-candidates"].split("|");
    } else
      continue;
  }

  return finalCtxs;
}

async function obtainOrg({ inputOrg = null, fnName, invalidParam, extraParams  = {}}) {
  try {
    return await cache.orgs.getFuzzy(inputOrg);
  } catch (error) {
    if (FUZZY_FAIL_REASONS.TOO_MUCH === error.reason) {
      const followupEvent = repromptFollowupEvent(fnName, invalidParam, extraParams, error.candidates);
      error.setFollowupEvent(followupEvent);
    }

    throw error;
  }
}

async function obtainNetwork({ inputNet, fnName, invalidParam, extraParams  = {}}) {
  try {
    return await cache.networks.getFuzzy(inputNet);
  } catch (error) {
    if (FUZZY_FAIL_REASONS.TOO_MUCH === error.reason) {
      const followupEvent = repromptFollowupEvent(fnName, invalidParam, extraParams, error.candidates);
      error.setFollowupEvent(followupEvent);
    }

    throw error;
  }
}

const repromptFollowupEvent = (fnName, invalidParam, extraParams, candidates) => ({
  eventName: `${fnName}-repromptparams`,
  parameters: Object.assign({}, {
    [invalidParam]: "",
    [`invalid-${invalidParam}`]: "true",
    "possible-candidates": candidates ? candidates.join("|") : undefined
  }, extraParams)
});

const createContextObject = args => ({
  name: `${args.sessionId}/contexts/${args.contextId}`,
  lifespanCount: args.lifespan,
  parameters: args.parameters
});

const getInputs = ({ parameters, contexts, defaultValue = "", fields }) => Object.assign({},
  ...fields.map(
    field => ({ [field]: parameters[field] || contexts[field] || defaultValue })
  )
);

module.exports = {
  isValidTimeDuration,
  calcTotalSeconds,
  handleMissingOrg,
  handleMissingNetwork,
  contextTransformer,
  obtainOrg,
  obtainNetwork,
  createContextObject,
  respondToInvalidTimeDuration,
  containsExistingOrg,
  containsExistingNetwork,
  containsExistingTimeDuration,
  getInputs
};