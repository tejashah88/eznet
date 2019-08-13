"use strict";

// Certain devices cause a 400 error when retrieving its clients, since no clients are connected to phones or security
// cameras, and the Meraki Dashboard API doesn't send the device types with its list
const INVALID_CLIENTS = [ "MC74", "MV21", "MV71" ];

// keep cache for 15 minutes max
const CACHE_CRON_JOB_STRING = process.env.CACHE_CRON_JOB_STRING;

const DISPLAY_LIMIT = 10;

const ALLOWED_INPUT_TIME_UNITS = [ "s", "m", "h", "day", "wk", "mo", "yr" ];

const FUZZY_FAIL_REASONS = { NOT_ENOUGH: 1, TOO_MUCH: 2 };

// NOT for checking request platform source, use POSSIBLE_SOURCES_OFFICIAL
const POSSIBLE_SOURCES = [ "google", "facebook", "slack", "spark" ];
const POSSIBLE_SOURCES_OFFICIAL = [ "ACTIONS_ON_GOOGLE", "FACEBOOK", "SLACK", "spark"];

const SUPPORTED_SOURCES = {
  google: process.env.GOOGLE_SUPPORT === "true",
  facebook: process.env.FACEBOOK_SUPPORT === "true",
  slack: process.env.SLACK_SUPPORT === "true",
  spark: process.env.SPARK_SUPPORT === "true"
};

const HUMANIZE_CONFIG = {
  delimiter: " and ",
  largest: 2,
  units: ["w", "d", "h", "m", "s"],
  conjunction: " and "
};

const TIME_UNIT_IN_SECONDS = {
  s: 1,
  m: 60,
  h: 60 * 60,
  day: 24 * 60 * 60,
  wk: 7 * 24 * 60 * 60,
  mo: 30 * 24 * 60 * 60,
  yr: 12 * 30 * 24 * 60 * 60
};

module.exports = {
  INVALID_CLIENTS,
  CACHE_CRON_JOB_STRING,
  DISPLAY_LIMIT,
  TIME_UNIT_IN_SECONDS,
  ALLOWED_INPUT_TIME_UNITS,
  HUMANIZE_CONFIG,
  FUZZY_FAIL_REASONS,
  POSSIBLE_SOURCES,
  POSSIBLE_SOURCES_OFFICIAL,
  SUPPORTED_SOURCES
};