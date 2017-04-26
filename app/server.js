
var express = require('express');
var app = express();
var jwt = require("express-jwt");
var rsaValidation = require('auth0-api-jwt-rsa-validation');
var bodyParser = require('body-parser')

const Botkit = require('botkit');
const apiai = require('apiai');
const Entities = require('html-entities').XmlEntities;
const decoder = new Entities();
const apiAiAccessToken = process.env.ACCESSTOKEN;
const slackBotKey = process.env.SLACKKEY;


const sessionIds = new Map();

const botController = Botkit.slackbot({
    debug: false
    //include "log: false" to disable logging
});

var bot = botController.spawn({
    token: slackBotKey
}).startRTM();

const devConfig = process.env.DEVELOPMENT_CONFIG == 'true';

const apiaiOptions = {};
if (devConfig) {
    apiaiOptions.hostname = process.env.DEVELOPMENT_HOST;
    apiaiOptions.path = "/api/query";
}

const apiAiService = apiai(apiAiAccessToken, apiaiOptions);

function isDefined(obj) {
    if (typeof obj == 'undefined') {
        return false;
    }

    if (!obj) {
        return false;
    }

    return obj != null;
}

botController.hears(['.*'], ['direct_message', 'direct_mention', 'mention', 'ambient'], (bot, message) => {
    try {
        if (message.type == 'message') {
            if (message.user == bot.identity.id) {
                // message from bot can be skipped
            }
            else if (message.text.indexOf("<@U") == 0 && message.text.indexOf(bot.identity.id) == -1) {
                // skip other users direct mentions
            }
            else {

                let requestText = decoder.decode(message.text);
                requestText = requestText.replace("’", "'");

                let channel = message.channel;
                let messageType = message.event;
                let botId = '<@' + bot.identity.id + '>';
                let userId = message.user;

                console.log('requestText ', requestText);
                console.log('messageType', messageType);

                if (requestText.indexOf(botId) > -1) {
                    requestText = requestText.replace(botId, '');
                }

                if (!sessionIds.has(channel)) {
                    sessionIds.set(channel, uuid.v1());
                }

                console.log('Start request ', requestText);
                let apiAiRequest = apiAiService.textRequest(requestText,
                    {
                        sessionId: sessionIds.get(channel),
                        contexts: [
                            {
                                name: "generic",
                                parameters: {
                                    slack_user_id: userId,
                                    slack_channel: channel
                                }
                            }
                        ]
                    });

                apiAiRequest.on('response', (response) => {
                    console.log(response);

                    if (isDefined(response.result)) {
                        let responseText = response.result.fulfillment.speech;
                        let responseData = response.result.fulfillment.data;
                        let action = response.result.action;

                        if (isDefined(responseData) && isDefined(responseData.slack)) {
                            try{
                                bot.reply(message, responseData.slack);
                            } catch (err) {
                                bot.reply(message, err.message);
                            }
                        } else if (isDefined(responseText)) {
                            bot.reply(message, responseText, (err, resp) => {
                                if (err) {
                                    console.error(err);
                                }
                            });
                        }

                    }
                });

                apiAiRequest.on('error', (error) => console.error(error));
                apiAiRequest.end();
            }
        }
    } catch (err) {
        console.error(err);
    }
});



var PORT = process.env.PORT || 8000;

console.log("PORT: " + PORT);

app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());

app.post('/slackhook', function(req, res) {

  console.log("request: " + JSON.stringify(req.body));

  var c = req.body.challenge
  res.json({challenge: c})
})

app.get("/", function(req, res) {
  console.log("in get");
  res.send("hello!")
})


app.listen(PORT, null);
