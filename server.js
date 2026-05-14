const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

io.on("connection", (socket) => {
  socket.on("join-room", ({ room, username, photo }) => {
    socket.join(room);
    socket.room = room;
    socket.username = username || "Kullanıcı";
    socket.photo = photo || "";
    socket.state = socket.state || {
      muted: false,
      deafened: false
    };

    const users = [];
    const clients = io.sockets.adapter.rooms.get(room);

    if (clients) {
      clients.forEach((id) => {
        if (id !== socket.id) {
          const s = io.sockets.sockets.get(id);
          users.push({
            id,
            username: s?.username || "Kullanıcı",
            photo: s?.photo || "",
            state: s?.state || {
              muted: false,
              deafened: false
            },
            screenSharing: !!s?.screenSharing
          });
        }
      });
    }

    socket.emit("existing-users", users);

    socket.to(room).emit("user-joined", {
      id: socket.id,
      username: socket.username,
      photo: socket.photo,
      state: socket.state,
      screenSharing: !!socket.screenSharing
    });
  });

  socket.on("leave-room", () => {
    if (!socket.room) return;

    const oldRoom = socket.room;

    socket.to(oldRoom).emit("user-left", socket.id);

    socket.leave(oldRoom);

    socket.room = null;
    socket.screenSharing = false;
  });

  socket.on("user-state", ({ state }) => {
    socket.state = {
      muted: !!state?.muted,
      deafened: !!state?.deafened
    };

    if (socket.room) {
      socket.to(socket.room).emit("user-state", {
        id: socket.id,
        state: socket.state
      });
    }
  });

  socket.on("screen-started", ({ username, to }) => {
    socket.screenSharing = true;

    if (to) {
      io.to(to).emit("screen-started", {
        from: socket.id,
        username: username || socket.username || "Kullanıcı"
      });
      return;
    }

    if (socket.room) {
      socket.to(socket.room).emit("screen-started", {
        from: socket.id,
        username: username || socket.username || "Kullanıcı"
      });
    }
  });

  socket.on("screen-request", ({ to }) => {
    io.to(to).emit("screen-request", {
      from: socket.id
    });
  });

  socket.on("offer", ({ to, offer, kind }) => {
    io.to(to).emit("offer", {
      from: socket.id,
      offer,
      kind
    });
  });

  socket.on("answer", ({ to, answer, kind }) => {
    io.to(to).emit("answer", {
      from: socket.id,
      answer,
      kind
    });
  });

  socket.on("ice-candidate", ({ to, candidate, kind }) => {
    io.to(to).emit("ice-candidate", {
      from: socket.id,
      candidate,
      kind
    });
  });

  socket.on("screen-stopped", () => {
    socket.screenSharing = false;

    if (socket.room) {
      socket.to(socket.room).emit("screen-stopped", {
        from: socket.id
      });
    }
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
