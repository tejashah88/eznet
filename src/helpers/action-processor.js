"use strict";

// local modules
const { POSSIBLE_SOURCES_OFFICIAL, POSSIBLE_SOURCES, SUPPORTED_SOURCES } = require("./constants");
const logger = require("./logger");
const { contextTransformer } = require("../dfutils/misc-utils");
const DialogflowResponseBuilder = require("./DialogflowResponseBuilder");
const generateCancelDetector = require("../nlp/cancel-detection");
const cancelDetector = generateCancelDetector();

// local error classes
const BotLogicError = require("../errors/BotLogicError");

let actionMap = {
  listOrganizations: require("../actions/list-organizations"),
  listNetworks: require("../actions/list-networks"),
  listDevices: require("../actions/list-devices"),
  listAdmins: require("../actions/list-admins"),
  topTraffic: require("../actions/top-traffic"),
  dataUsage: require("../actions/data-usage"),
  listMyFunctions: require("../actions/list-my-functions"),
  explainFunction: require("../actions/explain-function")
};

module.exports = async function processAction(agent) {
  let botResponsePayload;

  try {
    let actualSource;
    if (agent.requestSource != null) {
      // this is for restricting the bot to allowed platforms
      if (!POSSIBLE_SOURCES_OFFICIAL.includes(agent.requestSource))
        throw new BotLogicError("This platform is currently not supported.");

      // we map from the official sourse strings to internal ones
      actualSource = POSSIBLE_SOURCES[POSSIBLE_SOURCES_OFFICIAL.indexOf(agent.requestSource)];

      if (!SUPPORTED_SOURCES[actualSource])
        throw new BotLogicError("This platform is currently not supported.");
    } else {
      // if it's null, it's coming from the Dialogflow testing interface
      actualSource = "dialogflow";
    }

    if (!agent.action) {
      // user wanted to cancel an action
      logger.info("User wanted to cancel an incompleted action. See above logs for the actual action cancelled.");
      return null;
    } else if (!actionMap[agent.action]) {
      logger.error("An unimplemented action has been detected: " + agent.action);
      throw new BotLogicError("An unknown error occurred while processing your query.");
    } else {
      // this is where the cancel detection should kick in, since @sys.any will gobble any input as valid input
      if (cancelDetector.wants2Cancel(agent.query)) {
        logger.info("User wanted to cancel an incompleted action during the 'any input allowed' slot-filling. See above logs for the actual action cancelled.");
        const cancelResponsePhrases = [ "Sure, cancelling", "All right, cancelled.", "Okay, cancelled." ];
        let cancelResponse = cancelResponsePhrases[Math.floor(Math.random() * cancelResponsePhrases.length)];

        let resetContextFields = [];
        if (agent.parameters.org)
          resetContextFields.push("organization");
        if (agent.parameters.network)
          resetContextFields.push("network");

        let cancelBotResponsePayload = {
          text: cancelResponse,
          speech: cancelResponse,
          resetContextFields
        };

        return new DialogflowResponseBuilder(agent.session)
          .quickConfigure(cancelBotResponsePayload)
          .build();
      }

      // process action via action map
      logger.info(`Executing action ${agent.action} from "${actualSource}"...`);
      let results = await actionMap[agent.action]({
        actionIncomplete: agent.actionIncomplete,
        parameters: agent.parameters,
        contexts: contextTransformer(agent.contexts)
      });

      botResponsePayload = results;
    }
  } catch (error) {
    if (error instanceof BotLogicError) {
      botResponsePayload = error.getResponsePayload();
    } else {
      // this shouldn't be happening!!!
      throw error;
    }
  }

  return new DialogflowResponseBuilder(agent.session)
    .quickConfigure(botResponsePayload)
    .build();
};