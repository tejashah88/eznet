"use strict";

// remote modules
const winston = require("winston");

const logger = winston.createLogger({
  level: "info",
  format: winston.format.simple(),
  exitOnError: false,
  transports: [ new winston.transports.Console() ],
  exceptionHandlers: [ new winston.transports.Console() ]
});

const jsonString = json => JSON.stringify(json, null, 2);

module.exports = {
  info: (...msgs) => msgs.forEach(msg => logger.info(typeof msg === "object" ? jsonString(msg) : msg)),
  error: (...msgs) => msgs.forEach(msg => logger.error(typeof msg === "object" ? jsonString(msg) : msg)),
};