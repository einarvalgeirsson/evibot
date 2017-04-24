var express = require('express');
var app = express();
var jwt = require("express-jwt");
var rsaValidation = require('auth0-api-jwt-rsa-validation');
var bodyParser = require('body-parser')

app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());

app.post('/', function(req, res) {

  console.log("request: " + JSON.stringify(req.body));

  var c = req.body.challenge
  res.json({challenge: c})
})

app.listen(8080)
