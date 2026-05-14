const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

io.on("connection", (socket) => {

  socket.on("join-room", (data) => {

    socket.join(data.room);

    socket.to(data.room).emit("user-joined", {
      username: data.username
    });

  });

});

server.listen(process.env.PORT || 3000, () => {
  console.log("Server started");
});