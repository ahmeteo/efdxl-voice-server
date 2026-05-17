const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

function getRoomClients(room) {
  const users = [];
  const clients = io.sockets.adapter.rooms.get(room);

  if (!clients) return users;

  clients.forEach((id) => {
    const s = io.sockets.sockets.get(id);

    if (!s) return;

    users.push({
      id,
      username: s.username || "Kullanıcı",
      photo: s.photo || "",
      state: s.state || {
        muted: false,
        deafened: false
      },
      screenSharing: !!s.screenSharing
    });
  });

  return users;
}

function leaveCurrentRoom(socket) {
  if (!socket.room) return;

  const oldRoom = socket.room;

  socket.to(oldRoom).emit("user-left", socket.id);

  socket.leave(oldRoom);

  socket.room = null;
  socket.screenSharing = false;
}

io.on("connection", (socket) => {
  socket.state = {
    muted: false,
    deafened: false
  };

  socket.on("join-room", ({ room, username, photo }) => {
    if (!room) return;

    // Aynı socket başka odadaysa önce temiz çıkış yaptır.
    if (socket.room && socket.room !== room) {
      leaveCurrentRoom(socket);
    }

    // Aynı odaya tekrar join olursa duplicate state oluşmasın.
    if (socket.room === room) {
      socket.username = username || socket.username || "Kullanıcı";
      socket.photo = photo || socket.photo || "";
      return;
    }

    socket.join(room);

    socket.room = room;
    socket.username = username || "Kullanıcı";
    socket.photo = photo || "";
    socket.screenSharing = !!socket.screenSharing;

    socket.state = socket.state || {
      muted: false,
      deafened: false
    };

    const users = getRoomClients(room)
      .filter((u) => u.id !== socket.id);

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
    leaveCurrentRoom(socket);
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
    if (!to) return;

    io.to(to).emit("screen-request", {
      from: socket.id
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

  /*
    WebRTC SIGNAL RELAY
    Burada sunucu/Discord mantığı yok.
    Sadece socket id -> socket id sinyal taşıyoruz.
    room bilgisi client tarafında kontrol için geri gönderiliyor.
  */

  socket.on("voice-offer-request", ({ to, room, fromName, photo }) => {
    if (!to) return;

    io.to(to).emit("voice-offer-request", {
      from: socket.id,
      room: room || socket.room || "",
      fromName: fromName || socket.username || "Kullanıcı",
      photo: photo || socket.photo || ""
    });
  });

  socket.on("offer", ({ to, offer, kind, room }) => {
    if (!to || !offer) return;

    io.to(to).emit("offer", {
      from: socket.id,
      offer,
      kind,
      room: room || socket.room || ""
    });
  });

  socket.on("answer", ({ to, answer, kind, room }) => {
    if (!to || !answer) return;

    io.to(to).emit("answer", {
      from: socket.id,
      answer,
      kind,
      room: room || socket.room || ""
    });
  });

  socket.on("ice-candidate", ({ to, candidate, kind, room }) => {
    if (!to || !candidate) return;

    io.to(to).emit("ice-candidate", {
      from: socket.id,
      candidate,
      kind,
      room: room || socket.room || ""
    });
  });

  socket.on("disconnect", () => {
    leaveCurrentRoom(socket);
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("Server started");
});
