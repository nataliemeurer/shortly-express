var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var bcrypt = require('bcrypt-nodejs');
var session = require('express-session');


var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');

var app = express();

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));
app.use(cookieParser('parseit'));
app.use(session({
  secret: 'smellycat'
}));

var restrict = function(req, res, next) {
  console.log("SESSION USER: ", req.session.user);
  if (req.session.user) {
    console.log("ACCESS GRANTED");
    next();
  } else {
    console.log("ACCESS DENIED");
    req.session.error = 'Access denied!';
    res.redirect('/login');
  }
};

app.get('/', restrict,
function(req, res) {
  res.render('index');
});

app.get('/create', restrict,
function(req, res) {
  res.render('index');
});

app.get('/links', restrict,
function(req, res) {
  Links.reset().fetch().then(function(links) {
    res.send(200, links.models);
  });
});

app.post('/links', restrict,
function(req, res) {
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.send(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.send(200, found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.send(404);
        }

        var link = new Link({
          url: uri,
          title: title,
          base_url: req.headers.origin
        });

        link.save().then(function(newLink) {
          Links.add(newLink);
          res.send(200, newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/

// SIGNUP
app.get('/signup', function(req, res){
  res.render('signup');
});
app.post('/signup', function(req, res){
  // get info from the form
  var username = req.body.username;
  var password = req.body.password;

  bcrypt.hash(password, null, null, function(err, hash){
    var newUser = new User({
      username: username,
      password: hash
    });
    // once pass is hashed --> save to DB, then add model to user collection and reroute
    newUser.save().then(function(user){
      Users.add(user);
      req.session.regenerate(function(){
        req.session.user = username;
        res.redirect('/');
        res.send(200, user);
      });
    });
  });

  // save info to database in users table
});

// LOGIN
app.get('/login', function(req, res){
  res.render('login');
});
app.post('/login', function(req, res){
  var username = req.body.username;
  var password = req.body.password;
  // Get the user information from the database w/ fetch
  new User({username: username})
    .fetch()
    .then(function(model){
      if( model === null ){
        console.log("USERNAME IS NOT IN THE FUCKING DATABASE");
        res.redirect('/login');
        res.send(404);
      }
      bcrypt.compare(password, model.get('password'), function(err, result){
        if(result){
          req.session.regenerate(function(){
            req.session.user = username;
            console.log(req.session.user);
            res.redirect('/');
          });
          //util.createSession(req, res, username);
        } else {
          res.redirect('/login');
          res.send(404);
        }
      });
    });
    // then run bcrypt.compare on it
    // if compare sends back true, then successful login
    // redirect to /
});

app.post('/logout', function(req, res){
  req.session.destroy(function(){
    res.redirect('/login');
  });
});


/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        link_id: link.get('id')
      });

      click.save().then(function() {
        db.knex('urls')
          .where('code', '=', link.get('code'))
          .update({
            visits: link.get('visits') + 1,
          }).then(function() {
            return res.redirect(link.get('url'));
          });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);
