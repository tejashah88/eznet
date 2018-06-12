"use strict";

const CMD_EXPLANATIONS = {
  "list organizations": "It shows the organizations that you are a part of.",
  "list networks": "It show the networks in an organization.",
  "list admins": "It lists the admins that are registered in an organization. If there are more than 10 admins, then it will list only the first 10.",
  "list devices": "It list the devices currently connected in a network. If there are more than 10 devices, then it will list only the first 10.",
  "data usage": "It visualizes and presents some statistics of the total data usage over a given timeframe in a network. Note that 'Traffic Analysis with Hostname Visibility' must be enabled on the specified network. The given timeframe cannot be less than 2 hours or more than 1 month.",
  "top app/website usage": "It visualizes and lists the top 10 app or websites used in a given timeframe. This is specific to networks only. The given timeframe cannot be less than 2 hours or more than 1 month.",
};

module.exports = function explainFunction({ parameters }) {
  let explanation = CMD_EXPLANATIONS[parameters.command];
  return { text: explanation, speech: explanation };
};