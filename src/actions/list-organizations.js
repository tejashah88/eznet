"use strict";

// local modules
const cache = require("../cache/cache-db");
const { truncateList } = require("../dfutils/formatting");

module.exports = async function listOrganizations() {
  let orgsList = await cache.orgs.getAll();
  let orgNames = orgsList.map(org => org.name);

  let { text, speech } = truncateList({
    text: "You are in the following <bold>organizations<bold>:\n",
    speech: "You are in the following organizations: ",
    fallback: "You are not in any organizations!",
    resetCtxField: "org",
    list: orgNames,
    pluralNoun: "organizations"
  });

  return { text, speech };
};