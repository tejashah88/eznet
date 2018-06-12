"use-strict";

// local modules
const {
  ALLOWED_INPUT_TIME_UNITS,
  POSSIBLE_SOURCES,
  DISPLAY_LIMIT
} = require("../helpers/constants");

// local error modules
const BotLogicError = require("../errors/BotLogicError");

// remote modules
const outdent = require("outdent").string;

// constants
const TIME_UNIT_SINGULAR_NOUN = {
  s: "second",
  m: "minute",
  h: "hour",
  day: "day",
  wk: "week",
  mo: "month",
  yr: "year"
};

const TIME_UNIT_PLURAL_NOUN = {
  s: "seconds",
  m: "minutes",
  h: "hours",
  day: "days",
  wk: "weeks",
  mo: "months",
  yr: "years"
};

const bulletedList = arr => arr.map((item) => "<o> " + item).join("\n").trim();
const numberedList = arr => arr.map((item, index) => `${index + 1}. ` + item).join("\n").trim();

function displayableTimeDuration(timeDur) {
  if (!timeDur.amount || !timeDur.unit || !ALLOWED_INPUT_TIME_UNITS.includes(timeDur.unit))
    throw new BotLogicError("Invalid time duration input given. The time duration must be a positive amount with a valid unit.");

  let finalPluralNoun = timeDur.amount === 1 ? TIME_UNIT_SINGULAR_NOUN[timeDur.unit] : TIME_UNIT_PLURAL_NOUN[timeDur.unit];
  return timeDur.amount + " " + finalPluralNoun;
}

function truncateList(params) {
  let {
    text, speech, endText, endSpeech,
    fallback, throwError = true, resetCtxField,
    list, limit = DISPLAY_LIMIT, pluralNoun,
  } = params;

  if (!list.length) {
    if (throwError)
      throw new BotLogicError(fallback).setResetContextFields(resetCtxField);
    else
      return { text: fallback, speech: fallback };
  }

  text += numberedList(list.slice(0, limit));
  speech += list.slice(0, limit).join(", ").trim();

  if (list.length > limit) {
    text += `\n\n and ${list.length - limit} other ${pluralNoun}.`;
    speech += ` and ${list.length - limit} other ${pluralNoun}.`;
  }

  if (endText) text += endText;
  if (endSpeech) speech += endSpeech;

  return { text, speech };
}

function truncateDoubleList(params) {
  let {
    text, speech, endText, endSpeech,
    fallback, throwError = true, resetCtxField,
    textList, speechList,
    limit = DISPLAY_LIMIT, pluralNoun
  } = params;

  if (textList.length !== speechList.length)
    throw new Error("The text and speech lists have different sizes.");

  if (!textList.length) {
    if (throwError)
      throw new BotLogicError(fallback).setResetContextFields(resetCtxField);
    else
      return { text: fallback, speech: fallback };
  }

  text += numberedList(textList.slice(0, limit));
  speech += speechList.slice(0, limit).join(", ").trim();

  // since both lists have the same length, it doesn"t matter which one we use
  if (textList.length > limit) {
    text += `\n\n and ${textList.length - limit} other ${pluralNoun}.`;
    speech += ` and ${speechList.length - limit} other ${pluralNoun}.`;
  }

  if (endText) text += endText;
  if (endSpeech) speech += endSpeech;

  return { text, speech };
}

function markdownExpander(text) {
  let finalText = outdent(text);

  let boldFormatMap = {
    google: "**",
    facebook: "*",
    slack: "*",
    spark: "**"
  };

  let bulletFormatMap = {
    google: "*",
    facebook: "•",
    slack: "•",
    spark: "•"
  };

  let lineEndingModifications = {
    google: "  \n",
    facebook: "\n",
    slack: "\n",
    spark: "  \n"
  };

  let finalMsgs = {};

  for (let source of POSSIBLE_SOURCES) {
    finalMsgs[source] = finalText
      .replace(/<bold>/g, boldFormatMap[source])
      .replace(/<o>/g, bulletFormatMap[source])
      .replace(/\n/g, lineEndingModifications[source]);
  }

  return finalMsgs;
}

module.exports = {
  displayableTimeDuration,
  truncateList,
  truncateDoubleList,
  markdownExpander,
  bulletedList,
  numberedList,
};