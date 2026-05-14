const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

io.on("connection", (socket) => {
  socket.on("join-room", ({ room, username }) => {
    socket.join(room);
    socket.room = room;
    socket.username = username;

    const users = [];

    const clients = io.sockets.adapter.rooms.get(room);
    if (clients) {
      clients.forEach((id) => {
        if (id !== socket.id) {
          const userSocket = io.sockets.sockets.get(id);
          users.push({
            id,
            username: userSocket?.username || "Kullanıcı"
          });
        }
      });
    }

    socket.emit("existing-users", users);

    socket.to(room).emit("user-joined", {
      id: socket.id,
      username
    });
  });

  socket.on("offer", ({ to, offer }) => {
    io.to(to).emit("offer", {
      from: socket.id,
      offer
    });
  });

  socket.on("answer", ({ to, answer }) => {
    io.to(to).emit("answer", {
      from: socket.id,
      answer
    });
  });

  socket.on("ice-candidate", ({ to, candidate }) => {
    io.to(to).emit("ice-candidate", {
      from: socket.id,
      candidate
    });
  });

  socket.on("disconnect", () => {
    if (socket.room) {
      socket.to(socket.room).emit("user-left", socket.id);
    }
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("Server started");
});
