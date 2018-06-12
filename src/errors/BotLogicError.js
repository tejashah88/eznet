"use strict";

module.exports = class BotLogicError extends Error {
  constructor(message) {
    // Calling parent constructor of base Error class.
    super(message);

    // Saving class name in the property of our custom error as a shortcut.
    this.name = this.constructor.name;

    // Capturing stack trace, excluding constructor call from it.
    Error.captureStackTrace(this, this.constructor);
  }

  setResetContextFields(...fields) {
    if (fields)
      this.resetContextFields = fields;
    return this;
  }

  clearResetContextFields() {
    delete this.resetContextFields;
    return this;
  }

  setFollowupEvent(event) {
    if (event)
      this.followupEvent = event;
    return this;
  }

  clearFollowupEvent() {
    delete this.followupEvent;
    return this;
  }

  getResponsePayload() {
    return {
      text: this.message,
      speech: this.message,
      resetContextFields: this.resetContextFields,
      followupEvent: this.followupEvent
    };
  }
};