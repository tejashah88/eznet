"use strict";

require("make-promises-safe");
require("dotenv").config();

// check valid envs
const { checkSources } = require("./helpers/utils");
if (!checkSources()) {
  // no sources enabled, we cannot continue!
  throw new Error("Must have at least one source enabled!");
}

const express = require("express");
require("express-async-errors");
const bodyParser = require("body-parser");
const server = express();

const { WebhookClient } = require("dialogflow-fulfillment");
const processAction = require("./helpers/action-processor");
const logger = require("./helpers/logger");
const scheduleCronJob = require("./cache/cron-job");

const port = process.env.PORT || 8080;

server.use(bodyParser.json());

server.post("/chat", async (req, res) => {
  const agent = new WebhookClient({ request: req, response: res });
  agent.actionIncomplete = !req.body.queryResult.allRequiredParamsPresent;
  agent.intentDetectionConfidence = req.body.queryResult.intentDetectionConfidence;
  logger.info(`Intent detection confidence: ${agent.intentDetectionConfidence}`);

  const results = await processAction(agent);
  return res.json(results);
});

server.use((error, req, res, next) => {
  logger.error(error.stack);
  if (res.headersSent)
    return next(error);
  else
    return res.status(500).json({ error });
});

logger.info("Initializing cache DB...");
scheduleCronJob().then(() => {
  server.listen(port,
    () => logger.info(`EZNet server listening on port ${port}!`)
  );
});