const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    maxHttpBufferSize: 10 * 1024 * 1024
});

app.use(express.static(__dirname));

let waitingUser = null;
const partners = new Map();
const lastMessageTime = new Map();
const lastImageTime = new Map();

const audioRooms = new Map();
const audioUserRooms = new Map();

const MAX_MESSAGE_LENGTH = 1000;
const MESSAGE_DELAY = 700;

const MAX_IMAGE_DATA_LENGTH = 7 * 1024 * 1024;
const IMAGE_DELAY = 1500;

const REPORT_FILE = path.join(__dirname, "reports.txt");

function saveReport(reporterId, reportedId) {
    const time = new Date().toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata"
    });

    const reportLog =
        "Type: Text Chat Report\n" +
        "Time: " + time + "\n" +
        "Reporter: " + reporterId + "\n" +
        "Reported: " + reportedId + "\n" +
        "--------------------------\n";

    fs.appendFile(REPORT_FILE, reportLog, function (error) {
        if (error) {
            console.log("Failed to save report:", error);
        } else {
            console.log("Report saved to reports.txt");
        }
    });
}

function updateOnlineUsers() {
    io.emit("onlineUsers", io.engine.clientsCount);
}

function removeFromWaiting(socket) {
    if (waitingUser && waitingUser.id === socket.id) {
        waitingUser = null;
    }
}

function endCurrentChat(socket, notifyPartner = true) {
    const partnerId = partners.get(socket.id);

    if (partnerId) {
        partners.delete(socket.id);
        partners.delete(partnerId);

        if (notifyPartner) {
            io.to(partnerId).emit("partnerLeft");
        }
    }

    removeFromWaiting(socket);
}

function findStranger(socket) {
    removeFromWaiting(socket);

    if (waitingUser && waitingUser.id !== socket.id && waitingUser.connected) {
        const stranger = waitingUser;
        waitingUser = null;

        partners.set(socket.id, stranger.id);
        partners.set(stranger.id, socket.id);

        socket.emit("matched");
        stranger.emit("matched");
    } else {
        waitingUser = socket;
        socket.emit("waiting");
    }
}

function isMessageAllowed(socket, message) {
    if (typeof message !== "string") {
        return false;
    }

    const cleanMessage = message.trim();

    if (cleanMessage.length === 0 || cleanMessage.length > MAX_MESSAGE_LENGTH) {
        socket.emit("warning", "Message must be between 1 and 1000 characters.");
        return false;
    }

    const now = Date.now();
    const lastTime = lastMessageTime.get(socket.id) || 0;

    if (now - lastTime < MESSAGE_DELAY) {
        socket.emit("warning", "You are sending messages too fast.");
        return false;
    }

    lastMessageTime.set(socket.id, now);
    return true;
}

function isImageAllowed(socket, imageData) {
    if (typeof imageData !== "string") {
        return false;
    }

    const allowedImage =
        imageData.startsWith("data:image/jpeg;base64,") ||
        imageData.startsWith("data:image/png;base64,") ||
        imageData.startsWith("data:image/webp;base64,");

    if (!allowedImage) {
        socket.emit("warning", "Only JPG, PNG, and WEBP images are allowed.");
        return false;
    }

    if (imageData.length > MAX_IMAGE_DATA_LENGTH) {
        socket.emit("warning", "Image is too large. Please send an image below 5 MB.");
        return false;
    }

    const now = Date.now();
    const lastTime = lastImageTime.get(socket.id) || 0;

    if (now - lastTime < IMAGE_DELAY) {
        socket.emit("warning", "You are sending images too fast.");
        return false;
    }

    lastImageTime.set(socket.id, now);
    return true;
}

function getAudioPartnerId(socket) {
    const roomCode = audioUserRooms.get(socket.id);

    if (!roomCode) {
        return null;
    }

    const room = audioRooms.get(roomCode);

    if (!room) {
        return null;
    }

    for (const userId of room) {
        if (userId !== socket.id) {
            return userId;
        }
    }

    return null;
}

function leaveAudioRoom(socket) {
    const roomCode = audioUserRooms.get(socket.id);

    if (!roomCode) {
        return;
    }

    const room = audioRooms.get(roomCode);

    if (room) {
        room.delete(socket.id);

        const partnerId = getAudioPartnerIdFromRoom(room, socket.id);

        if (partnerId) {
            io.to(partnerId).emit("audioPartnerLeft");
        }

        if (room.size === 0) {
            audioRooms.delete(roomCode);
        }
    }

    socket.leave("audio-" + roomCode);
    audioUserRooms.delete(socket.id);
}

function getAudioPartnerIdFromRoom(room, socketId) {
    for (const userId of room) {
        if (userId !== socketId) {
            return userId;
        }
    }

    return null;
}

io.on("connection", function (socket) {
    console.log("User connected:", socket.id);
    updateOnlineUsers();

    socket.on("findStranger", function () {
        endCurrentChat(socket);
        findStranger(socket);
    });

    socket.on("chatMessage", function (message) {
        const partnerId = partners.get(socket.id);

        if (!partnerId) {
            return;
        }

        if (!isMessageAllowed(socket, message)) {
            return;
        }

        const cleanMessage = message.trim();
        io.to(partnerId).emit("chatMessage", cleanMessage);
    });

    socket.on("imageMessage", function (imageData) {
        const partnerId = partners.get(socket.id);

        if (!partnerId) {
            socket.emit("warning", "Please wait until a stranger connects.");
            return;
        }

        if (!isImageAllowed(socket, imageData)) {
            return;
        }

        io.to(partnerId).emit("imageMessage", imageData);
    });

    socket.on("typing", function (isTyping) {
        const partnerId = partners.get(socket.id);

        if (partnerId) {
            io.to(partnerId).emit("typing", isTyping);
        }
    });

    socket.on("next", function () {
        endCurrentChat(socket);
        findStranger(socket);
    });

    socket.on("leave", function () {
        endCurrentChat(socket);
        socket.emit("leftChat");
    });

    socket.on("report", function () {
        const partnerId = partners.get(socket.id);

        if (!partnerId) {
            socket.emit("warning", "No stranger to report.");
            return;
        }

        console.log("Report received");
        console.log("Reporter:", socket.id);
        console.log("Reported user:", partnerId);

        saveReport(socket.id, partnerId);

        socket.emit("warning", "Report submitted. Moving you to a new chat.");
        io.to(partnerId).emit("partnerLeft");

        partners.delete(socket.id);
        partners.delete(partnerId);

        findStranger(socket);
    });

    socket.on("joinAudioRoom", function (roomCode) {
        if (typeof roomCode !== "string") {
            socket.emit("audioWarning", "Invalid room code.");
            return;
        }

        const cleanRoomCode = roomCode.trim().slice(0, 30);

        if (cleanRoomCode.length < 3) {
            socket.emit("audioWarning", "Room code must be at least 3 characters.");
            return;
        }

        leaveAudioRoom(socket);

        let room = audioRooms.get(cleanRoomCode);

        if (!room) {
            room = new Set();
            audioRooms.set(cleanRoomCode, room);
        }

        if (room.size >= 2) {
            socket.emit("audioWarning", "This audio room is full. Try another room code.");
            return;
        }

        room.add(socket.id);
        audioUserRooms.set(socket.id, cleanRoomCode);
        socket.join("audio-" + cleanRoomCode);

        socket.emit("audioJoined", cleanRoomCode);

        if (room.size === 1) {
            socket.emit("audioWaiting");
        }

        if (room.size === 2) {
            const users = Array.from(room);

            io.to(users[0]).emit("audioReady", {
                initiator: true
            });

            io.to(users[1]).emit("audioReady", {
                initiator: false
            });
        }
    });

    socket.on("audioOffer", function (offer) {
        const partnerId = getAudioPartnerId(socket);

        if (partnerId) {
            io.to(partnerId).emit("audioOffer", offer);
        }
    });

    socket.on("audioAnswer", function (answer) {
        const partnerId = getAudioPartnerId(socket);

        if (partnerId) {
            io.to(partnerId).emit("audioAnswer", answer);
        }
    });

    socket.on("audioIceCandidate", function (candidate) {
        const partnerId = getAudioPartnerId(socket);

        if (partnerId) {
            io.to(partnerId).emit("audioIceCandidate", candidate);
        }
    });

    socket.on("leaveAudioRoom", function () {
        leaveAudioRoom(socket);
        socket.emit("audioLeft");
    });

    socket.on("disconnect", function () {
        console.log("User disconnected:", socket.id);

        endCurrentChat(socket);
        leaveAudioRoom(socket);

        lastMessageTime.delete(socket.id);
        lastImageTime.delete(socket.id);

        updateOnlineUsers();
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, function () {
    console.log("Server running on port " + PORT);
});