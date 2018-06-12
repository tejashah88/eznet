"use strict";

// local modules
const dfutils = require("../dfutils/misc-utils");
const dfformat = require("../dfutils/formatting");
const utils = require("./utils");

/**
 * This class is for building responses that'll work better for 2nd class supported integrations (like Cisco Spark).
 * It handles some of the nuances with sending consistently formatted messages to each supported integration.
 */
module.exports = class DialogflowResponseBuilder {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.response = {
      fulfillmentMessages: []
    };
  }

  quickConfigure(payload) {
    if (!payload)
      throw new Error("Cannot quick configure without a valid payload");

    let { text, speech, imageUrl, altText, contextOut, resetContextFields, followupEvent } = payload;
    if (typeof text !== "string" || typeof speech !== "string")
      throw new Error("Must specify both 'text' and 'speech'.");

    this.addGoogleContent({ text, speech, imageUrl, altText });

    if (imageUrl)
      this.addImageUrl({ imageUrl, altText });

    this.addFormattedText({ text, speech });

    if (resetContextFields)
      this.clearOutgoingContexts(resetContextFields);
    else if (contextOut)
      this.addOutgoingContext(contextOut);

    if (followupEvent)
      this.setFollowupEvent(followupEvent);

    return this;
  }

  addGoogleContent({ text, speech, imageUrl, altText = "random text" }) {
    let googleFulfillMsg;

    if (typeof text !== "string" || typeof speech !== "string")
      throw new Error("Must specify both 'text' and 'speech' for responding with text and speech.");

    if (imageUrl) {
      googleFulfillMsg = {
        payload: {
          google: {
            richResponse: {
              items: [
                { simpleResponse: { textToSpeech: speech.trim() } },
                {
                  basicCard: {
                    formattedText: dfformat.markdownExpander(text).google,
                    image: { url: imageUrl, accessibilityText: altText }
                  }
                },
              ]
            }
          }
        }
      };
    } else {
      googleFulfillMsg = {
        payload: {
          google: {
            richResponse: {
              items: [
                { simpleResponse: { textToSpeech: speech.trim() } },
                { basicCard: { formattedText: dfformat.markdownExpander(text).google } }
              ]
            }
          }
        }
      };
    }

    this.response.fulfillmentMessages.push(googleFulfillMsg);
    return this;
  }

  addFormattedText({ text, speech }) {
    if (typeof text !== "string" || typeof speech !== "string")
      throw new Error("Must specify both 'text' and 'speech' for responding with text and speech.");

    let finalTexts = dfformat.markdownExpander(text);
    let fulfillMsg = utils.cleanJSON({
      payload: {
        facebook: { text: finalTexts.facebook },
        slack: { text: finalTexts.slack },
        spark: { markdown: finalTexts.spark }
      }
    });

    this.response.fulfillmentMessages.push(fulfillMsg);
    return this;
  }

  addImageUrl({ imageUrl, altText = "random text" }) {
    if (!imageUrl)
      throw new Error("Must specify the image URL for responding with an image.");

    let fulfillMsg = utils.cleanJSON({
      payload: {
        facebook: {
          attachment: {
            type: "image",
            payload: { url: imageUrl, is_reusable: true }
          }
        },
        slack: {
          attachments: [ { text: altText, image_url: imageUrl } ]
        },
        spark: { files: [ imageUrl ] },
      }
    });

    this.response.fulfillmentMessages.push(fulfillMsg);
    return this;
  }

  addOutgoingContext(contextObj, lifespan = 5) {
    if (!this.response.outputContexts)
      this.response.outputContexts = [];

    if (typeof contextObj.organization !== "undefined") {
      let orgContext = dfutils.createContextObject({
        sessionId: this.sessionId,
        contextId: "organization",
        lifespan,
        parameters: { org: contextObj.organization }
      });

      this.response.outputContexts.push(orgContext);
    }

    if (typeof contextObj.network !== "undefined") {
      let netContext = dfutils.createContextObject({
        sessionId: this.sessionId,
        contextId: "network",
        lifespan,
        parameters: { network: contextObj.network }
      });

      this.response.outputContexts.push(netContext);
    }

    return this;
  }

  clearOutgoingContexts(ctxFields) {
    for (let contextField of ctxFields)
      this.addOutgoingContext({ [contextField]: "" }, 0);
    return this;
  }

  setFollowupEvent({ eventName, parameters }) {
    this.response.followupEventInput = {
      name: eventName,
      languageCode: "en-US",
      parameters
    };

    return this;
  }

  clearFollowupEvent() {
    delete this.response.followupEventInput;
    return this;
  }

  build() {
    return this.response;
  }
};