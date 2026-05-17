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

/*
  EFDXL Voice server.js
  Bu sürüm eski/root kanal mantığına uygundur.
  Sunucu/Discord server sistemi YOK.
  Sadece ses odası roomId üzerinden çalışır.

  Client tarafındaki eventler:
  - join-room
  - leave-room
  - user-state
  - screen-started
  - screen-request
  - offer
  - answer
  - ice-candidate
  - screen-stopped
*/

function getRoomUsers(room, excludeSocketId = null) {
  const users = [];
  const clients = io.sockets.adapter.rooms.get(room);

  if (!clients) return users;

  clients.forEach((id) => {
    if (excludeSocketId && id === excludeSocketId) return;

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
  socket.room = null;
  socket.username = "Kullanıcı";
  socket.photo = "";
  socket.screenSharing = false;
  socket.state = {
    muted: false,
    deafened: false
  };

  socket.on("join-room", ({ room, username, photo }) => {
    if (!room) return;

    /*
      Client kanal listesi render olunca aynı odaya tekrar join-room gönderebiliyor.
      Aynı odaya tekrar gelirse user-left/user-joined basmıyoruz.
      Böylece ses bağlantısı gereksiz resetlenmez.
    */
    if (socket.room === room) {
      socket.username = username || socket.username || "Kullanıcı";
      socket.photo = photo || socket.photo || "";

      socket.to(room).emit("user-state", {
        id: socket.id,
        state: socket.state
      });

      return;
    }

    /*
      Socket başka odadaysa önce eski odadan temiz çıkar.
    */
    if (socket.room && socket.room !== room) {
      leaveCurrentRoom(socket);
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

    const users = getRoomUsers(room, socket.id);

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
    WebRTC sinyal aktarıcıları.
    Bu client kodu offer/answer/ice için room parametresi göndermiyor.
    O yüzden burada sadece eski yapıya uygun şekilde from, offer/answer/candidate, kind dönüyoruz.
  */

  socket.on("offer", ({ to, offer, kind }) => {
    if (!to || !offer) return;

    io.to(to).emit("offer", {
      from: socket.id,
      offer,
      kind
    });
  });

  socket.on("answer", ({ to, answer, kind }) => {
    if (!to || !answer) return;

    io.to(to).emit("answer", {
      from: socket.id,
      answer,
      kind
    });
  });

  socket.on("ice-candidate", ({ to, candidate, kind }) => {
    if (!to || !candidate) return;

    io.to(to).emit("ice-candidate", {
      from: socket.id,
      candidate,
      kind
    });
  });

  socket.on("disconnect", () => {
    leaveCurrentRoom(socket);
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log("EFDXL Voice server started");
});
