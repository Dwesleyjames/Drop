var bcrypt = require("bcryptjs");
var express = require('express');
var router = express.Router();
var mongodb = require('mongodb');
var mc = mongodb.MongoClient;
var ObjectID = mongodb.ObjectID;
var _ = require("underscore");

var notesCollection, usersCollection;

var connectToDBs = function(callback) {
    mc.connect('mongodb://localhost/persistent-notes', function(err, db) {
        if (err) {
            throw err;
        }
        
        notesCollection = db.collection('notes');
	usersCollection = db.collection('users');

        if (callback) {
            callback();
        }
    });
}

// connect to DB when file is loaded
connectToDBs();

router.post('/register', function(req, res) {
    var username = req.body.username;
    var password = req.body.password;

    var checkInsert = function(err, newUsers) {
	if (err) {
	    res.redirect("/?error=Unable to add user");
	} else {
	    res.redirect("/?error=User " + username +
			 " successfully registered");
	}
    }

    var saveHash = function(err, hash) {
      	var newUser = {
      	    username: username,
      	    password: hash
      	};
      	
	// Do an update just in case the username got inserted
	// behind our back.  We'll overwrite the old password but
	// at least we won't get duplicate user records.
      	usersCollection.update({username: username},
			       newUser,
			       {upsert: true},
			       checkInsert);    
    }

    var checkUsername = function(err, user) {
	if (err) {
	    res.redirect("/?error=unable to check username");
	} else if (user === null) {
	    bcrypt.genSalt(10, function(err, salt) {
		bcrypt.hash(password, salt, saveHash);
	    });
	} else {
	    res.redirect("/?error=user already exists");
	}
    }
    
    usersCollection.findOne({username: username}, checkUsername);
});

router.get('/', function(req, res) {
    if (req.session.username) {
        res.redirect("/menu");
    } else {
        res.render('index', { title: 'Drop', 
                              error: req.query.error });
    }
});

router.get('/notes', function(req, res) {
    var username = req.session.username;

    if (username) {
        res.render("notes.jade", {username: username,
                                  title: username +"'s Notes"});
    } else {
        res.redirect("/?error=Not Logged In");
    }
});


//get voice button function something nonsensical 
router.get('/voice', function(req, res) {
    var username = req.session.username;

    if (username) {
        res.render("voice.jade", {username: username,
                                  title: username +"'s Notes"});
    } else {
        res.redirect("/?error=Not Logged In");
    }
});

//get chatroom
router.get('/chat', function(req, res) {
    var username = req.session.username;

    if (username) {
        res.render("chat.jade", {username: username,
                                  title: username +"'s Chatroom"});
    } else {
        res.redirect("/?error=Not Logged In");
    }
});


//=======================
//POST /message
router.post("/message", function(request, response) {

  //The request body expects a param named "message"
  var message = request.body.message;

  //If the message is empty or wasn't sent it's a bad request
  if(_.isUndefined(message) || _.isEmpty(message.trim())) {
    return response.json(400, {error: "Message is invalid"});
  }
    
    //otherwise the message is good
    
    //expecting a name
    var name = request.body.name;

    
    //let our chatroom know there was a new message
    io.sockets.emit("incomingMessage", {message: message, name: name});
    
    response.json(200, {message: "Message received"});
});
//=======================

router.get('/menu', function(req, res) {
    var username = req.session.username;

    if (username) {
        res.render("menu.jade", {username: username,
                                  title: username +"'s menu"});
    } else {
        res.redirect("/?error=Not Logged In");
    }
});

router.post('/login', function(req, res) {
    var username = req.body.username;
    var password = req.body.password;
    
    var checkPassword = function(err, authenticated) {
	if (authenticated) {
	    req.session.username = username;
	    res.redirect("/menu");
	} else {
	    res.redirect("/?error=invalid username or password");	
	}
    }

    var checkUsername = function(err, user){
	if (err || user === null) {
	    res.redirect("/?error=invalid username or password");	
	} else {
	    bcrypt.compare(password, user.password, checkPassword);
	}
    }
    
    usersCollection.findOne({username: username}, checkUsername);
});

router.post('/logout', function(req, res) {
    req.session.destroy(function(err){
        if (err) {
            console.log("Error: %s", err);
        }
    });
    res.redirect("/");
});

router.get('/getNotes', function(req, res) {
    var username = req.session.username;

    var renderNotes = function(err, notes) {
        if (err) {
            notes = [{"title": "Couldn't get notes",
                      "owner": username,
                      "content": "Error fetching notes!"}];
        }
        res.send(notes);
    }
    
    if (username) {
        notesCollection.find({owner: username}).toArray(renderNotes);
    } else {
        res.send([{"title": "Not Logged In",
                   "owner": "None",
                   "content": "Nobody seems to be logged in!"}]);
    }    
});

router.post('/updateNote', function(req, res) {
    var username = req.session.username;
    var id = req.body.id;
    var title = req.body.title;
    var content = req.body.content;
    
    var checkUpdate = function(err, result) {
        if (err) {
            res.send("ERROR: update failed");
        } else {
            res.send("update succeeded");
        }
    }
    
    if (username) {
        if (id && title && content) {
            // should get note and check 
            // if it really belongs to the current user
            notesCollection.update({_id: ObjectID(id)},
                                   {$set: {title: title,
                                           content: content}},
                                   checkUpdate);
        } else {
            res.send("ERROR: bad parameters");
        }
    } else {
        res.send("ERROR: not logged in");
    }
});

router.post('/deleteNote', function(req, res) {
    var username = req.session.username;
    var id = req.body.id;
    
    var checkDelete = function(err, result) {
        if (err) {
            res.send("ERROR: note not deleted");
        } else {
            res.send("note deleted");
        }
    }
    
    if (username) {
        if (id) {
            // should get note and check 
            // if it really belongs to the current user
            notesCollection.remove({_id: ObjectID(id)},
                                   checkDelete);
        } else {
            res.send("ERROR: bad parameters");
        }
    } else {
        res.send("ERROR: not logged in");
    }
});

router.post('/newNote', function(req, res) {
    var username = req.session.username;
    var newNote;

    var reportInserted = function(err, notesInserted) {
        if (err) {
            res.send("ERROR: Could not create a new note");
        } else {
            res.send(notesInserted[0]._id);
        }
    }

    if (username) {
        newNote = {title: "Untitled",
                   owner: username,
                   content: "No content"};

        notesCollection.insert(newNote, reportInserted);
    } else {
        res.send("ERROR: Not Logged In");
    }

    var oldUsername = req.session.username;
});

router.post('/changeusername', function(req, res) {
    var oldUsername = req.session.username;
    var newUsername = req.body.username;

    var reportResult = function(status) {
	res.send(status);
    }

    var usernameUpdated = function(err, result) {
	if (err) {
	    req.session.username = oldUsername;
	    reportResult("ERROR: username not changed because of database update issue.");
	} else {
	    reportResult("username changed to " + newUsername);
	}
    }

    var checkNewUsername = function(err, note) {
	if (err) {
	    reportResult("ERROR: username not changed because database check for new username failed.");
	} else {
	    if (note) {
		reportResult("ERROR: username not changed because notes are already owned by " +
			     newUsername + ".");
	    } else {
		req.session.username = newUsername;
		notesCollection.update({owner: oldUsername},
				       {$set: {owner: newUsername}},
				       {multi: true},
				       usernameUpdated);
	    }
	}
    }

    if (oldUsername) {
	notesCollection.findOne({owner: newUsername}, checkNewUsername);
    } else {
	reportResult("ERROR: Not Logged In");
    }
});

var participants = [];

module.exports = 
    
    function(io) {
    
        
        
        //=================================
        //socket.io events
        io.on("connection", function(socket){

          /*
            When a new user connects to our server, we expect an event called "newUser"
            and then we'll emit an event called "newConnection" with a list of all
            participants to all connected clients
          */
          socket.on("newUser", function(data) {
            participants.push({id: data.id, name: data.name});
            io.sockets.emit("newConnection", {participants: participants});
          });

          /*
            When a user changes his name, we are expecting an event called "nameChange"
            and then we'll emit an event called "nameChanged" to all participants with
            the id and new name of the user who emitted the original message
          */
          socket.on("nameChange", function(data) {
            _.findWhere(participants, {id: socket.id}).name = data.name;
            io.sockets.emit("nameChanged", {id: data.id, name: data.name});
          });

          /*
            When a client disconnects from the server, the event "disconnect" is automatically
            captured by the server. It will then emit an event called "userDisconnected" to
            all participants with the id of the client that disconnected
          */
          socket.on("disconnect", function() {
            participants = _.without(participants,_.findWhere(participants, {id: socket.id}));
            io.sockets.emit("userDisconnected", {id: socket.id, sender:"system"});
          });

        });
        //===============================
        
        return router;
    
};
