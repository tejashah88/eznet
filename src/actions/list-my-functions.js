"use strict";

module.exports = function listMyFunctions() {
  const text = `
  Here's a list of the possible commands. If you would like me to clarify any of these commands, ask me "What does this command do?"
    <o> <bold>List organizations<bold> - Shows the organizations that you are a part of
    <o> <bold>List networks<bold> - Show the networks in an organization
    <o> <bold>List admins<bold> - Lists the admins that are registered in an organization
    <o> <bold>List devices<bold> - Shows the currently connected devices in a network
    <o> <bold>Data usage<bold> - Visualizes and presents some statistics of total data usage over a specified timeframe
    <o> <bold>Top app/website usage<bold> - Visualizes and lists the top 10 app/websites used in a specified timeframe
  `;

  const speech = [
    `Here's a list of the possible commands: list organizations, list networks, list admins, list devices, data usage, top app or website usage.`,
    `If you would like me to clarify any of these commands, just ask me "What does this command do?"`
  ].join(" ");

  return { text, speech };
};