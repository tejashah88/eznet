"use strict";

// local modules
const { FUZZY_FAIL_REASONS, POSSIBLE_SOURCES, SUPPORTED_SOURCES } = require("./constants");

// local error modules
const FuzzySearchError = require("../errors/FuzzySearchError");

// remote modules
const Fuse = require("fuse.js");
const pRetry = require("p-retry");

const RedisClient = require("ioredis");
const isDocker = require("is-docker")();
const isHeroku = require("is-heroku");

// NOTE: entityContext is used for bot error reporting
function fuseSearch(list, target, searchKey, entityContext = "entity") {
  const fuseOptions = {
    shouldSort: true,
    tokenize: true,
    includeScore: true,
    threshold: 0.4,
    distance: 100,
    maxPatternLength: 64,
    minMatchCharLength: 1,
    location: 0,
    keys: [searchKey]
  };

  const fuse = new Fuse(list, fuseOptions);
  const results = fuse.search(target);

  // we are looking for exactly one candidate
  if (results.length) {
    const lowestScore = results[0].score;
    const possibleCandidates = results.filter(result => lowestScore === result.score);
    if (possibleCandidates.length > 1) {
      // too many canididates with the same lowest score
      throw new FuzzySearchError({
        reason: FUZZY_FAIL_REASONS.TOO_MUCH,
        entity: entityContext,
        candidates: possibleCandidates.map(candidate => candidate.item[searchKey])
      });
    } else {
      return possibleCandidates[0].item;
    }
  } else {
    // not enough canididates
    throw new FuzzySearchError({
      reason: FUZZY_FAIL_REASONS.NOT_ENOUGH,
      entity: entityContext
    });
  }
}

// this is used for translating json for redis w/o JSON.stringify
function arr2obj(arr, key = "id", valueGen = cur => cur.name) {
  return arr.reduce((acc, cur) => {
    acc[cur[key]] = valueGen(cur);
    return acc;
  }, {});
}

// this is used for translating json for redis w/o JSON.stringify
function obj2arr(obj, key = "id", valueAppend = value => ({ name: value })) {
  return Object.entries(obj).map(entry => {
    const initialObj = { [key]: entry[0] };
    const obj = Object.assign(initialObj, valueAppend(entry[1]));
    return obj;
  });
}

const isEmptyObject = obj => !Object.entries(obj).length;

// this is used for network calls to the Meraki API
function retryablePromise(opts, ...args) {
  const { networkFunc, errorHandler, retries = 10, minTimeout = 1000 } = opts;
  return pRetry(() => networkFunc(...args).catch(errorHandler), { retries, minTimeout });
}

const cleanJSON = json => JSON.parse(JSON.stringify(json));

function parseBool(str) {
  if (typeof str === "boolean")
    return str;

  switch (str.toLowerCase()) {
    case "true":
      return true;
    case "false":
      return false;
    default:
      throw new Error("Invalid boolean string given!");
  }
}

const checkSources = () => POSSIBLE_SOURCES
  .map(source => SUPPORTED_SOURCES[source])
  .reduce((acc, cur) => acc || cur, false);

function aquireRedisClient() {
  if (isDocker) {
    // docker mode
    return new RedisClient("6379", "redis");
  } else if (isHeroku) {
    // heroku mode
    return new RedisClient(process.env.REDIS_URL);
  } else {
    // local mode
    return new RedisClient();
  }
}

module.exports = {
  fuseSearch,
  arr2obj,
  obj2arr,
  isEmptyObject,
  retryablePromise,
  cleanJSON,
  parseBool,
  checkSources,
  aquireRedisClient
};