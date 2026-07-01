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
let waitingAudioUser = null;

const partners = new Map();
const audioPartners = new Map();

const lastMessageTime = new Map();
const lastImageTime = new Map();

const MAX_MESSAGE_LENGTH = 1000;
const MESSAGE_DELAY = 700;

const MAX_IMAGE_DATA_LENGTH = 7 * 1024 * 1024;
const IMAGE_DELAY = 1500;

const REPORT_FILE = path.join(__dirname, "reports.txt");

function saveTextReport(reporterId, reportedId) {
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
            console.log("Failed to save text report:", error);
        } else {
            console.log("Text report saved");
        }
    });
}

function saveAudioReport(reporterId, reportedId) {
    const time = new Date().toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata"
    });

    const reportLog =
        "Type: Audio Call Report\n" +
        "Time: " + time + "\n" +
        "Reporter: " + reporterId + "\n" +
        "Reported: " + reportedId + "\n" +
        "--------------------------\n";

    fs.appendFile(REPORT_FILE, reportLog, function (error) {
        if (error) {
            console.log("Failed to save audio report:", error);
        } else {
            console.log("Audio report saved");
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

function removeFromAudioWaiting(socket) {
    if (waitingAudioUser && waitingAudioUser.id === socket.id) {
        waitingAudioUser = null;
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

function endAudioCall(socket, notifyPartner = true) {
    const partnerId = audioPartners.get(socket.id);

    if (partnerId) {
        audioPartners.delete(socket.id);
        audioPartners.delete(partnerId);

        if (notifyPartner) {
            io.to(partnerId).emit("audioPartnerLeft");
        }
    }

    removeFromAudioWaiting(socket);
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

function findAudioStranger(socket) {
    removeFromAudioWaiting(socket);

    if (waitingAudioUser && waitingAudioUser.id !== socket.id && waitingAudioUser.connected) {
        const stranger = waitingAudioUser;
        waitingAudioUser = null;

        audioPartners.set(socket.id, stranger.id);
        audioPartners.set(stranger.id, socket.id);

        stranger.emit("audioMatched", {
            initiator: true
        });

        socket.emit("audioMatched", {
            initiator: false
        });
    } else {
        waitingAudioUser = socket;
        socket.emit("audioWaiting");
    }
}

function getAudioPartnerId(socket) {
    return audioPartners.get(socket.id);
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

        saveTextReport(socket.id, partnerId);

        socket.emit("warning", "Report submitted. Moving you to a new chat.");
        io.to(partnerId).emit("partnerLeft");

        partners.delete(socket.id);
        partners.delete(partnerId);

        findStranger(socket);
    });

    socket.on("findAudioStranger", function () {
        endAudioCall(socket);
        findAudioStranger(socket);
    });

    socket.on("nextAudio", function () {
        endAudioCall(socket);
        findAudioStranger(socket);
    });

    socket.on("leaveAudio", function () {
        endAudioCall(socket);
        socket.emit("audioLeft");
    });

    socket.on("reportAudio", function () {
        const partnerId = getAudioPartnerId(socket);

        if (!partnerId) {
            socket.emit("audioWarning", "No audio stranger to report.");
            return;
        }

        saveAudioReport(socket.id, partnerId);

        socket.emit("audioNotice", "Audio report submitted. Searching for a new audio stranger.");
        io.to(partnerId).emit("audioPartnerLeft");

        audioPartners.delete(socket.id);
        audioPartners.delete(partnerId);

        findAudioStranger(socket);
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

    socket.on("disconnect", function () {
        console.log("User disconnected:", socket.id);

        endCurrentChat(socket);
        endAudioCall(socket);

        lastMessageTime.delete(socket.id);
        lastImageTime.delete(socket.id);

        updateOnlineUsers();
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, function () {
    console.log("Server running on port " + PORT);
});