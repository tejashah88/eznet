"use strict";

// local modules
const BotLogicError = require("./BotLogicError");

module.exports = class ResourceNotFoundError extends BotLogicError {
  constructor(entity) {
    // Calling parent constructor of base BotLogicError class.
    super(`Unable to find the specified ${entity}!`);

    if (entity === "organization")
      this.setResetContextFields("org");
    else if (entity === "network")
      this.setResetContextFields("net");

    // Saving class name in the property of our custom error as a shortcut.
    this.name = this.constructor.name;

    // Capturing stack trace, excluding constructor call from it.
    Error.captureStackTrace(this, this.constructor);
  }
};