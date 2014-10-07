var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');
var bodyParser = require('body-parser');


var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');
var cP = require('cookie-parser');
var session = require('express-session');

var app = express();

app.use(cP());
app.use(session({secret: '123'}));

app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
app.use(partials());
// Parse JSON (uniform resource locators)
app.use(bodyParser.json());
// Parse forms (signup/login)
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + '/public'));


app.get('/login',
function(req, res) {
  res.render('login');
});

app.get('/signup',
function(req, res) {
  res.render('signup');
});

app.get('/',
function(req, res) {
  if(!req.session.user){
    res.redirect(301, 'login');
  } else {
    res.render('index');
  }
});

app.get('/logout',
function(req, res) {
  req.session.destroy();
  res.redirect(301, 'login');
});

app.get('/create',
function(req, res) {
  if(!req.session.user){
    res.redirect(301, 'login');
  } else {
    res.render('create');
  }
});

app.get('/links',
function(req, res) {
  Links.reset().fetch().then(function(links) {
    var userName = req.session.user;
    console.log(req.session.cUserId, 'CURRENT USERS ID');

    if(!req.session.user){
      res.redirect(301, 'login');
    } else {
      var models = links.models.filter(function(model){
        console.log(model.get('user_id'), 'LINK USER ID');
        return model.get('user_id') === req.session.cUserId;
      });

      console.log('MODELS FILTERED', models);
      res.send(200, models);
    }
  });
});

app.post('/login',
function(req, res) {
  var userName = req.body.username;
  var password = req.body.password;
  var hashedPassword = null;
  var passCorrect = null;
  var id = null;

  new User({username: userName}).fetch()
  .then(function(model){
    hashedPassword = model.get('password');
    id = model.get('id');
    passCorrect = util.hashCompare(password, hashedPassword);
  })
  .then(function() {
    if (passCorrect) {
      req.session.regenerate(function(){
        req.session.user = userName;
        req.session.cUserId = id;
        res.redirect(301,'/');
      });
    } else {
      res.redirect(301, '/login');
    }
  });
});

app.post('/signup',
function(req, res) {
  var userName = req.body.username;
  var password = req.body.password;
  var hashedPassword = util.passwordHash(password);
  new User({username: userName, password: hashedPassword}).fetch().then(function(found) {
    if (found) {
      res.redirect(301,'login');
    } else {
      var user = new User({username: userName, password: hashedPassword});
      user.save().then(function(newUser){
        Users.add(newUser);
        res.redirect(301, '/');
      });
    }
  });
});

app.post('/links',
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
      var userName = req.session.user;
      new User({username: userName}).fetch()
      .then(function(model) {
        if (model) {
          var id = model.get('id');
          util.getUrlTitle(uri, function(err, title) {
            if (err) {
              return res.send(404);
            }
            var link = new Link({
              url: uri,
              title: title,
              base_url: req.headers.origin,
              user_id: id
            });
            link.save().then(function(newLink) {
              Links.add(newLink);
              res.send(200, newLink);
            });
          });
        }
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/



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
