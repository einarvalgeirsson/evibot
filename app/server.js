
var express = require('express');
var app = express();
var jwt = require("express-jwt");
var rsaValidation = require('auth0-api-jwt-rsa-validation');
var bodyParser = require('body-parser')
var http = require('http')
var fs = require('fs')


const Botkit = require('botkit');
const apiai = require('apiai');
const Entities = require('html-entities').XmlEntities;
const decoder = new Entities();
const uuid = require('node-uuid');

const apiAiAccessToken = process.env.ACCESSTOKEN;
const slackBotKey = process.env.SLACKKEY;

var PORT = process.env.PORT || 8000;

console.log("PORT: " + PORT);


const sessionIds = new Map();

const botController = Botkit.slackbot({
    debug: false
    //include "log: false" to disable logging
});
console.log('slackBotKey', slackBotKey);
var bot = botController.spawn({
    token: slackBotKey
}).startRTM(function(err) {
  if (err) {
   console.log(err);
   throw new Error('Could not connect to Slack', err);
 }
});

const apiaiOptions = {};

apiaiOptions.hostname = process.env.DEVELOPMENT_HOST;
apiaiOptions.path = "/api/query";

console.log('hostname', apiaiOptions.hostname);

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


                        if (isDefined(responseData)) {
                            try{
                                bot.reply(message, responseData.slack);
                            } catch (err) {
                                bot.reply(message, err.message);
                            }
                        } else if (isDefined(responseText)) {

                          if (action === "listCompetences") {
                            let competence = response.result.parameters.competence.toLowerCase();
                            let data = JSON.parse(fs.readFileSync('data/competences.json', 'utf8'));

                            for (var i = 0; i < data.length; i++) {
                             if (data[i].name.toLowerCase() === competence) {
                               var emails = "";
                               data[i].active_memberships.forEach(function(member) {
                                 emails += member.email + " \n";
                                console.log(member.email);
                                });
                             }
                            }
                            console.log('emails ', emails);
                          }
                            bot.reply(message, responseText + "\n" + emails, (err, resp) => {
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

//Create a server to prevent Heroku kills the bot
const server = http.createServer((req, res) => res.end());

//Lets start our server
server.listen((process.env.port || 8000, () => console.log("Server listening")));
