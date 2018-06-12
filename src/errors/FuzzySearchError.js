"use strict";

// local modules
const { FUZZY_FAIL_REASONS } = require("../helpers/constants");

// local error modules
const BotLogicError = require("./BotLogicError");

module.exports = class FuzzySearchError extends BotLogicError {
  constructor({ reason = "Unknown fuzzy search error", entity, candidates }) {
    // Calling parent constructor of base BotLogicError class.
    if (FUZZY_FAIL_REASONS.NOT_ENOUGH === reason)
      super(`Unable to find the specified ${entity}!`);
    else if (FUZZY_FAIL_REASONS.TOO_MUCH === reason)
      super(`Too many candidates to interpolate from the specified ${entity}!`);
    else
      super(reason);

    if (Object.values(FUZZY_FAIL_REASONS).includes(reason))
      this.reason = reason;

    if (candidates)
      this.candidates = candidates;

    if (["organization", "network"].includes(entity))
      this.setResetContextFields(entity);

    // Saving class name in the property of our custom error as a shortcut.
    this.name = this.constructor.name;

    // Capturing stack trace, excluding constructor call from it.
    Error.captureStackTrace(this, this.constructor);
  }
};