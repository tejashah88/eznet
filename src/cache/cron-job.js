"use strict";

// local modules
const constants = require("../helpers/constants");
const utils = require("../helpers/utils");
const logger = require("../helpers/logger");
const cache = require("./cache-db");

// remote modules
const dashboard = require("node-meraki-dashboard")(process.env.MERAKI_API_KEY);
const diehard = require("diehard");
const { scheduleJob } = require("node-schedule");

const redis = utils.aquireRedisClient();

function throwOnError429(err) {
  if (err.status === 429) {
    logger.error("Detected too many requests being sent to the organization. Retrying...");
    throw new Error(err.data.errors[0]);
  } else {
    logger.error(err);
    throw err;
  }
}

async function populateData() {
  const orgs = await utils.retryablePromise({
    networkFunc: dashboard.organizations.list,
    errorHandler: throwOnError429
  });

  logger.info("Got the orgs!");
  await cache.orgs.setAll(orgs);

  const allNets = [];
  for (const org of orgs) {
    const nets = await utils.retryablePromise({
      networkFunc: dashboard.networks.list,
      errorHandler: throwOnError429
    }, org.id);
    logger.info("  Got some networks from an org!");
    await cache.networks.setByOrgId(org.id, nets);
    allNets.push(...nets);

    const admins = await utils.retryablePromise({
      networkFunc: dashboard.admins.list,
      errorHandler: throwOnError429
    }, org.id);
    logger.info("  Got some admins from an org!");
    await cache.admins.setByOrgId(org.id, admins);


    for (const net of nets) {
      const devices = await utils.retryablePromise({
        networkFunc: dashboard.devices.listByNetwork,
        errorHandler: throwOnError429
      }, net.id);
      logger.info("    Got some devices from a network!");
      await cache.devices.setByNetId(net.id, devices);
    }
  }

  await cache.networks.setAll(allNets);
  logger.info("Finished caching job!");
}

module.exports = async function scheduleCronJob() {
  try {
    await populateData();
  } catch (err) {
    logger.error("Unable to initially populate cache data:");
    logger.error(err);
    process.exit(1);
  }

  logger.info("creating job schedule");
  const job = scheduleJob(constants.CACHE_CRON_JOB_STRING, () => populateData().catch(logger.error));

  diehard.register(async done => {
    try {
      logger.info("cleaning up cron job...");
      job.cancel();
      await redis.quit();
      logger.info("done!");
    } catch (err) {
      logger.error("A fatal exception occurred while trying to clean up!");
      logger.error(err);
      process.exit(1);
    } finally {
      done();
    }
  });

  // don't fire on an uncaught exception
  diehard.listen({ uncaughtException: false });
};