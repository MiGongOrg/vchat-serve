// Setup basic express server
var express = require('express')
  , app = express()
  , path = require('path')
  , server = require('http').createServer(app)
  , io = require('socket.io')(server)
  , port = process.env.PORT || 4000
  , axios = require('axios');

// upyun
var crypto = require('crypto')
  , md5Password = md5('password123')
  , url = require('url')
  , qs = require('querystring');


server.listen(port, () => {
  console.log('Server listening at port %d', port);
});


// Routing
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', function(req, res){
  res.sendFile(__dirname + 'chat.html');
});

// upyun
app.get('/upyun', function (req, res) {
  var query = qs.parse(url.parse(req.url).query)
    , signature = base64Sha1(query.data, md5Password)

  res.writeHead(200, {
    'Content-Type': 'application/json'
  })
  res.end(JSON.stringify({signature}))
})

// 微信登录认证
app.get('/login', function (req, res) {
  var query  = qs.parse(url.parse(req.url).query)
    , APPID  = 'wx25d35c7f445823d2'
    , SECRET = '278db7e366e2fb92b7e051641c516b66'
    , JSCODE = query.code
    , URL    = 'https://api.weixin.qq.com/sns/jscode2session?appid=' + APPID + '&secret=' + SECRET + '&js_code=' + JSCODE + '&grant_type=authorization_code'

  axios.get(URL).then(function(response) {
    var openid = response.data.openid
    var session_key = response.data.session_key
    res.status(response.status).send({openid})
  }).catch(function(error) {
    res.status(error.response.status).send(error.response.data)
  })
})

// Chatroom

// 房间用户名单
var roomInfo = {};

io.on('connection', (socket) => {
  var addedUser = false;
  // 获取 roomId 在请求 socket 连接的 url 中
  var query = qs.parse(url.parse(socket.request.url).query)
  var roomId = query.roomId
  var userOpenid = ''

  // when the client emits 'new message', this listens and executes
  socket.on('new message', (data) => {
    // we tell the client to execute 'new message'
    socket.broadcast.emit('new message', {
      user: socket.user,
      message: data
    });
  });

  // when the client emits 'add user', this listens and executes
  socket.on('add user', (user) => {
    userOpenid = user.openid
    // 将用户 openid 加入房间名单中
    if (!roomInfo[roomId]) {
      roomInfo[roomId] = [];
    }

    roomInfo[roomId].push(userOpenid);

    if (addedUser) return;
    // we store the user in the socket session for this client
    socket.user = user;
    // ++numUsers;
    addedUser = true;
    socket.emit('login', {
      numUsers: roomInfo[roomId].length
    });
    // 加入房间
    socket.join(roomId);
    // 通知该房间内所有人，有新人加入
    io.to(roomId).emit('user joined', {
      user: socket.user,
      numUsers: roomInfo[roomId].length
    });
    
  });

  // when the client emits 'typing', we broadcast it to others
  socket.on('typing', () => {
    socket.broadcast.emit('typing', {
      user: socket.user
    });
  });

  // when the client emits 'stop typing', we broadcast it to others
  socket.on('stop typing', () => {
    socket.broadcast.emit('stop typing', {
      user: socket.user
    });
  });

  // 用户断开连接，移除用户
  socket.on('disconnect', () => {
    if (addedUser) {
      // 从房间名单中移除
      var index = roomInfo[roomId].indexOf(userOpenid);
      if (index !== -1) {
        roomInfo[roomId].splice(index, 1);
      }
      // 退出房间
      socket.leave(roomId);
      io.to(roomId).emit('user left', {
        user: socket.user,
        numUsers: roomInfo[roomId].length
      });
    }
  });
});

// upyun
function md5 (str) {
  return crypto.createHash('md5').update(str, 'utf8').digest('hex')
}

function base64Sha1 (str, secret) {
  return crypto.createHmac('sha1', secret).update(str, 'utf8').digest().toString('base64')
}