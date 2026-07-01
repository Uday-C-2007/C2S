const socket = io();

const roomInput = document.getElementById("roomInput");
const joinAudioBtn = document.getElementById("joinAudioBtn");
const leaveAudioBtn = document.getElementById("leaveAudioBtn");
const muteBtn = document.getElementById("muteBtn");
const backHomeBtn = document.getElementById("backHomeBtn");
const audioStatus = document.getElementById("audioStatus");
const remoteAudio = document.getElementById("remoteAudio");

let localStream = null;
let peerConnection = null;
let currentRoom = "";
let isMuted = false;

const rtcConfig = {
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302"
        },
        {
            urls: "stun:stun1.l.google.com:19302"
        }
    ]
};

joinAudioBtn.addEventListener("click", async function () {
    const roomCode = roomInput.value.trim();

    if (roomCode.length < 3) {
        alert("Please enter a room code with at least 3 characters.");
        return;
    }

    try {
        audioStatus.textContent = "Requesting microphone permission...";

        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false
        });

        currentRoom = roomCode;

        joinAudioBtn.disabled = true;
        roomInput.disabled = true;
        leaveAudioBtn.disabled = false;
        muteBtn.disabled = false;

        audioStatus.textContent = "Joining audio room...";
        socket.emit("joinAudioRoom", currentRoom);
    } catch (error) {
        console.log(error);
        audioStatus.textContent = "Microphone permission denied.";
        alert("Please allow microphone permission to start audio call.");
        resetAudioCall();
    }
});

leaveAudioBtn.addEventListener("click", function () {
    socket.emit("leaveAudioRoom");
    resetAudioCall();
    audioStatus.textContent = "Audio call ended.";
});

muteBtn.addEventListener("click", function () {
    if (!localStream) {
        return;
    }

    isMuted = !isMuted;

    localStream.getAudioTracks().forEach(function (track) {
        track.enabled = !isMuted;
    });

    if (isMuted) {
        muteBtn.textContent = "Unmute Mic";
        audioStatus.textContent = "Your mic is muted.";
    } else {
        muteBtn.textContent = "Mute Mic";
        audioStatus.textContent = "Your mic is active.";
    }
});

backHomeBtn.addEventListener("click", function () {
    socket.emit("leaveAudioRoom");
    window.location.href = "index.html";
});

function createPeerConnection() {
    if (peerConnection) {
        return;
    }

    peerConnection = new RTCPeerConnection(rtcConfig);

    if (localStream) {
        localStream.getTracks().forEach(function (track) {
            peerConnection.addTrack(track, localStream);
        });
    }

    peerConnection.ontrack = function (event) {
        remoteAudio.srcObject = event.streams[0];

        remoteAudio.play().catch(function (error) {
            console.log("Audio play error:", error);
        });

        audioStatus.textContent = "Audio call connected.";
    };

    peerConnection.onicecandidate = function (event) {
        if (event.candidate) {
            socket.emit("audioIceCandidate", event.candidate);
        }
    };

    peerConnection.onconnectionstatechange = function () {
        if (!peerConnection) {
            return;
        }

        if (peerConnection.connectionState === "connected") {
            audioStatus.textContent = "Audio call connected.";
        }

        if (
            peerConnection.connectionState === "disconnected" ||
            peerConnection.connectionState === "failed" ||
            peerConnection.connectionState === "closed"
        ) {
            audioStatus.textContent = "Audio call disconnected.";
        }
    };
}

socket.on("audioJoined", function (roomCode) {
    audioStatus.textContent = "Joined room: " + roomCode;
});

socket.on("audioWaiting", function () {
    audioStatus.textContent = "Waiting for another user to join same room code...";
});

socket.on("audioReady", async function (data) {
    createPeerConnection();

    audioStatus.textContent = "Connecting audio call...";

    if (data.initiator) {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit("audioOffer", offer);
    }
});

socket.on("audioOffer", async function (offer) {
    createPeerConnection();

    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    socket.emit("audioAnswer", answer);
});

socket.on("audioAnswer", async function (answer) {
    if (!peerConnection) {
        return;
    }

    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
});

socket.on("audioIceCandidate", async function (candidate) {
    if (!peerConnection) {
        return;
    }

    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
        console.log("ICE candidate error:", error);
    }
});

socket.on("audioPartnerLeft", function () {
    resetAudioCall();
    audioStatus.textContent = "Other user left the audio call.";
});

socket.on("audioLeft", function () {
    resetAudioCall();
    audioStatus.textContent = "Audio call ended.";
});

socket.on("audioWarning", function (message) {
    alert(message);
    audioStatus.textContent = message;
    resetAudioCall();
});

function resetAudioCall() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    if (localStream) {
        localStream.getTracks().forEach(function (track) {
            track.stop();
        });

        localStream = null;
    }

    remoteAudio.srcObject = null;

    joinAudioBtn.disabled = false;
    roomInput.disabled = false;
    leaveAudioBtn.disabled = true;
    muteBtn.disabled = true;

    muteBtn.textContent = "Mute Mic";
    isMuted = false;
    currentRoom = "";
}

window.addEventListener("beforeunload", function () {
    socket.emit("leaveAudioRoom");
});