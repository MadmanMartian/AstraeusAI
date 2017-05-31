var Discord = require("discord.js");
var http = require('http');
var querystring = require('querystring');
var crypto = require('crypto');
var net = require('net');
var flow = require('flow.js');
var exec = require('child_process').exec;
var sys = require('util');
var fs = require('fs');
var http2byond = require('http2byond');
var mysql = require('mysql2');

var bot = new Discord.Client();
var eyes = '👀';

var lastMerge = 0;

var {channels, server_comms_key, bot_key} = require('./config.js'); 

bot.on('message', function(msg)
{
    console.log(msg.content)
    var smsg = " " + msg.content + " "
    if(smsg.search(/[\t !?\.,\-_\*]@?ast(raeus|reaus)?[\t !?\.,\-_\*]/i) >= 0)
    {
        msg.reply('You best not be talking about me, you little punk.');
    }
    if(smsg.search(/ftl station/i) >= 0)
    {
        msg.reply('Reeee its a ship not a station get it right');
    }
    if(msg.content.startsWith(eyes + "help"))
    {
        msg.reply('Fuck off, I\'m not helping you.');
    }
    if(smsg.search(/(could|would|should|may|might) +of +(?!course)/i) >= 0) {
        msg.reply('It\'s could HAVE or would HAVE, never could *of* or would *of*');
    }
    if(msg.content.startsWith(eyes + "status"))
    {
        http2byond({'ip':'ftl13.com','port':'7777','topic':'?status'}, function(body, err) {
            if(err) { msg.reply(err); } else {
            body = ''+body;
            dataObj = querystring.parse(body);
            var roundDuration = (Math.floor(dataObj.round_duration/3600)+12)+":"+(Math.floor(dataObj.round_duration/60)%60)
            msg.channel.sendEmbed(new Discord.RichEmbed({"fields":[{"name":"Version","value":dataObj.version,"inline":1},{"name":"Map","value":dataObj.map_name,"inline":1},{"name":"Mode","value":dataObj.mode,"inline":1},{"name":"Players","value":""+dataObj.players,"inline":1},{"name":"Admins","value":""+dataObj.admins,"inline":1},{"name":"Round duration","value":roundDuration,"inline":1}],"color":34952}));
            }
        });
    }
    var fulladmin = msg.member && msg.member.hasPermission("ADMINISTRATOR");
    var admin = msg.member && msg.member.hasPermission("BAN_MEMBERS");
    if(msg.content.startsWith(eyes + "embed") && fulladmin)
    {
        msg.channel.sendEmbed(new Discord.RichEmbed(JSON.parse(msg.content.substring(7))), "");
    }
    
    if(msg.content.startsWith(eyes + "notes") && admin)
    {
        var culprit = msg.content.substring(7).trim().toLowerCase();
        var connection = connectToMysql();
        connection.execute('SELECT timestamp, server, adminckey, notetext FROM notes WHERE ckey = ?', [culprit], function(err, results) {
            if(err) {
                bot.channels.get(channels.executivedecisions).sendMessage(JSON.stringify('Error fetching notes for ' + culprit + ': ' + JSON.stringify(err)));
            } else {
                var notesstring = "";
                for(var i = 0; i < results.length; i++) {
                    var row = results[i];
                    notesstring += "**" + row.timestamp + " | " + row.server + " | " + row.adminckey + "**\n" + row.notetext + "\n\n";
                }
                bot.channels.get(channels.executivedecisions).sendEmbed(new Discord.RichEmbed({"title": "Notes for " + culprit + ":", "description": notesstring, "color": 0xff4444}));
            }
        });
        connection.end();
    }
});

bot.on("disconnected", function () {
    bot.login(bot_key);
});

bot.login(bot_key);

function sendServerMessage(message) {
    var request = '?key=' + server_comms_key + '&announce=' + message;
    http2byond({'ip':'ftl13.com','port':'7777','topic':request},function(body,err){});
}

function execRepo(command, callback) {
    console.log('$ ' + command);
    exec(command, {cwd: "/home/monster860/discord_bot/FTL13"}, callback);
}

var isClIng = 0;

function genchangelogs(bodies) {
    if(isClIng)
        return;
    isClIng = 1;
    flow.exec(function() {
        execRepo('git fetch --all', this);
    }, function(error, stdout, stderr) {
        console.log(stdout + "\n" + stderr);
        execRepo('git reset --hard origin/master', this);
    }, function() {
        var hasClEd = 0;
        console.log('Generating CL files...');
        for(var i = 0; i < bodies.length; i++) {
            var body = bodies[i].replace(/\r/g, '');
            console.log('Parsing: ' + body);
            var result = /:cl:[ \t]*(.*)\n([\w\W]+)\/:cl:/.exec(body);
            if(!result)
                continue;
            hasClEd = 1;
            var author = result[1];
            var changelog = result[2];
            var pieces = changelog.match(/^(fix|fixes|bugfix|wip|rsctweak|tweaks|tweak|soundadd|sounddel|add|adds|rscadd|del|dels|rscdel|imageadd|imagedel|typo|spellcheck|experimental|experiment|tgs):[ \t]*(.*)$/gm);
            var toOutput = 'author: ' + author + '\ndelete-after: True\nchanges:\n';
            for(var j = 0; j < pieces.length; j++) {
                var keyval = /^(fix|fixes|bugfix|wip|rsctweak|tweaks|tweak|soundadd|sounddel|add|adds|rscadd|del|dels|rscdel|imageadd|imagedel|typo|spellcheck|experimental|experiment|tgs):[ \t]*(.*)$/gm.exec(pieces[j]);
                if(!keyval)
                    continue;
                var key = keyval[1];
                if(key == 'fix' || key == 'fixes')
                    key = 'bugfix';
                else if(key == 'rsctweak' || key == 'tweaks')
                    key = 'tweak';
                else if(key == 'add' || key == 'adds')
                    key = 'rscadd';
                else if(key == 'del' || key == 'dels')
                    key = 'rscdel';
                else if(key == 'typo')
                    key = 'spellcheck';
                else if(key == 'experimental')
                    key = 'experiment';
                toOutput += '  - ' + key + ': "' + keyval[2].replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"\n';
            }
            console.log(toOutput);
            
            fs.writeFile("/home/monster860/discord_bot/FTL13/html/changelogs/AutoChangeLog-" + i + ".yml", toOutput, this.MULTI());
        }
        if(!hasClEd)
            isClIng = 0;
    }, function(error, stdout, stderr) {
        console.log(stdout + "\n" + stderr);
        execRepo("python tools/ss13_genchangelog.py html/changelog.html html/changelogs", this);
    }, function(error, stdout, stderr) {
        console.log(stdout + "\n" + stderr);
        execRepo("git add -A", this);
    }, function(error, stdout, stderr) {
        console.log(stdout + "\n" + stderr);
        execRepo("git commit -m \"Automated Changelog [ci skip]\"", this);
    }, function(error, stdout, stderr) {
        console.log(stdout + "\n" + stderr);
        execRepo("git push", this);
    }, function(error, stdout, stderr) {
        console.log(stdout + "\n" + stderr);
        isClIng = 0;
    });
}

function prMessage(type, username, usericon, title, num, url, action, actiondoer)
{
    var color = 0xffffff
    if((type == "Pull request" && action == "merged") || (type == "Issue" && action == "closed")) {
        color = 0x44cc44
    } else if(type == "Pull request" && action == "closed") {
        color = 0xcc4444
    }
    bot.channels.get(channels.coderbus).sendEmbed(new Discord.RichEmbed({"author":{"name":username,"icon_url":usericon},"url":url,"title":"(#"+num+") "+title,"description":type+" "+action+" by "+actiondoer,"thumbnail":{"url":"http://i.imgur.com/YXHL3Gd.png"},"color":color}));
}

// Github Webhook

function handleHttpRequest(request, response) {
    var queryData = ''
    if(request.method == 'POST') {
        request.on('data', function(data) {
            queryData += data;
            if(queryData.length > 1000000) {
                queryData = "";
                response.writeHead(413, {'Content-Type': 'text/plain'}).end();
                request.connection.destroy();
            }
        });
        
        request.on('end', function() {
            
            var queryObj = JSON.parse(queryData)
            if(queryObj.issue) {
                if(queryObj.action == 'opened' || queryObj.action == 'closed' || queryObj.action == 'reopened') {
                    prMessage("Issue", queryObj.issue.user.login, queryObj.issue.user.avatar_url, queryObj.issue.title, queryObj.issue.number, queryObj.issue.html_url, queryObj.action, queryObj.sender.login);
                }
            }
            if(queryObj.pull_request) {
                if(queryObj.action == 'opened' || queryObj.action == 'closed' || queryObj.action == 'reopened') {
                    if(queryObj.action == 'closed' && queryObj.pull_request.merged) {
                        queryObj.action = 'merged';
                        var date = new Date()
                        lastMerge = date.getTime();
                        genchangelogs([queryObj.pull_request.body]);
                    }
                    prMessage("Pull request", queryObj.pull_request.user.login, queryObj.pull_request.user.avatar_url, queryObj.pull_request.title, queryObj.pull_request.number, queryObj.pull_request.html_url, queryObj.action, queryObj.sender.login);
                    sendServerMessage('Pull request ' + queryObj.action + ' by ' + queryObj.sender.login + ' <a href="' + queryObj.pull_request.html_url + '">' + queryObj.pull_request.title + '</a>');
                }
            }
            if(queryObj.commits) {
                var date = new Date()
                if(date.getTime() > (lastMerge + 1000)) {
                    var commitmsgs = []
                    for(var i = 0; i < queryObj.commits.length; i++) {
                        var commit = queryObj.commits[i];
                        if(commit.author.name == 'FTL13-Bot')
                            continue;
                        commitmsgs.push(commit.message);
                        bot.channels.get(channels.coderbus).sendMessage('Commit added by ' + commit.author.name + ': ' + commit.url + ' (' + commit.message + ')');
                        sendServerMessage('Commit added by ' + commit.author.name + ': <a href="' + commit.url + '">' + commit.message + '</a>');
                    }
                    if(commitmsgs.length)
                        genchangelogs(commitmsgs);
                }
            }
            response.end();
        });
    } else {
        console.log('HTTP Get: ' + request.url);
        if(request.url.indexOf('?') >= 0) {
            dataObj = querystring.parse(request.url.replace(/^.*\?/, ''));
            if(dataObj.announce && dataObj.key && dataObj.key.trim() === server_comms_key.trim()) {
                var announceChannel = channels.ss13;
                if(dataObj.announce_channel) {
                    if(dataObj.announce_channel == 'admin') announceChannel = channels.executivedecisions;
                }
                bot.channels.get(announceChannel).sendMessage(dataObj.announce);
            } else if(dataObj.serverStart && dataObj.key && dataObj.key.trim() === server_comms_key.trim()) {
                bot.channels.get(channels.ss13).sendEmbed(new Discord.RichEmbed({"title":"Server is starting!","description":"[byond://ftl13.com:7777](https://ftl13.com/play.php)"}));
            }
        }
        response.writeHead(405, {'Content-Type': 'text/plain'});
        response.end();
    }
}

function connectToMysql() {
    return mysql.createConnection({host:'127.0.0.1',user:'banlist',password:'G2ptWeK6',database:'feedback'})
}

var http_server = http.createServer(handleHttpRequest);

http_server.listen(8081, function(){
    console.log('HTTP server up!');
});
