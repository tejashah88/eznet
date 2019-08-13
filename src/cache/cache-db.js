"use strict";

// local modules
const utils = require("../helpers/utils");

const redis = utils.aquireRedisClient();

const cache = {
  orgs: {
    getAll: async () => {
      const orgs = await redis.hgetall("orgs");
      return utils.obj2arr(orgs);
    },
    getFuzzy: async orgName => {
      if (!orgName)
        throw new Error("Can't fuzzy search without an input parameter.");

      const orgsList = await cache.orgs.getAll();
      const org = utils.fuseSearch(orgsList, orgName, "name", "organization");
      return org;
    },
    setAll: async orgs => {
      const orgMap = utils.arr2obj(orgs);
      if (!utils.isEmptyObject(orgMap)) {
        await redis.del("orgs");
        await redis.hmset("orgs", orgMap);
      }
    }
  },
  networks: {
    getAll: async () => {
      const nets = await redis.hgetall("networks");
      return utils.obj2arr(nets);
    },
    getByOrgId: async orgId => {
      const nets = await redis.hgetall(`networks-${orgId}`);
      return utils.obj2arr(nets);
    },
    getFuzzy: async netName => {
      if (!netName)
        throw new Error("Can't fuzzy search without an input parameter.");

      const totalNetworks = await cache.networks.getAll();
      return utils.fuseSearch(totalNetworks, netName, "name", "network");
    },
    setAll: async networks => {
      const networkMap = utils.arr2obj(networks);
      if (!utils.isEmptyObject(networkMap)) {
        await redis.del("networks");
        await redis.hmset("networks", networkMap);
      }
    },
    setByOrgId: async (orgId, networks) => {
      const networkMap = utils.arr2obj(networks);
      if (!utils.isEmptyObject(networkMap)) {
        await redis.del(`networks-${orgId}`);
        await redis.hmset(`networks-${orgId}`, networkMap);
      }
    }
  },
  devices: {
    getByNetId: async netId => {
      const devices = await redis.hgetall(`devices-${netId}`);
      return utils.obj2arr(devices, "serial", value => {
        const parts = value.split(":");
        return {
          name: parts[0] === "null" ? null : parts[0],
          model: parts[1]
        };
      });
    },
    setByNetId: async (netId, devices) => {
      const deviceMap = utils.arr2obj(devices, "serial", cur => (cur.name || null) + ":" + cur.model);
      if (!utils.isEmptyObject(deviceMap)) {
        await redis.del(`devices-${netId}`);
        await redis.hmset(`devices-${netId}`, deviceMap);
      }
    }
  },
  admins: {
    getByOrgId: async orgId => {
      const admins = await redis.hgetall(`admins-${orgId}`);
      return utils.obj2arr(admins, "id", value => {
        const parts = value.split(":");
        return {
          name: parts[0],
          email: parts[1]
        };
      });
    },
    setByOrgId: async (orgId, admins) => {
      const adminMap = utils.arr2obj(admins, "id", cur => cur.name + ":" + cur.email);
      if (!utils.isEmptyObject(adminMap)) {
        await redis.del(`admins-${orgId}`);
        await redis.hmset(`admins-${orgId}`, adminMap);
      }
    }
  }
};

module.exports = cache;