const socket = io();

const startAudioBtn = document.getElementById("startAudioBtn");
const muteBtn = document.getElementById("muteBtn");
const nextAudioBtn = document.getElementById("nextAudioBtn");
const reportAudioBtn = document.getElementById("reportAudioBtn");
const leaveAudioBtn = document.getElementById("leaveAudioBtn");
const backHomeBtn = document.getElementById("backHomeBtn");
const audioStatus = document.getElementById("audioStatus");
const remoteAudio = document.getElementById("remoteAudio");

const audioThemeSwitch = document.getElementById("audioThemeSwitch");

const audioConfirmBox = document.getElementById("audioConfirmBox");
const audioConfirmTitle = document.getElementById("audioConfirmTitle");
const audioConfirmMessage = document.getElementById("audioConfirmMessage");
const audioConfirmActionBtn = document.getElementById("audioConfirmActionBtn");
const audioCancelActionBtn = document.getElementById("audioCancelActionBtn");

let localStream = null;
let peerConnection = null;
let isMuted = false;
let hasAudioPartner = false;
let audioConfirmAction = null;
let allowAudioPageExit = false;

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

/* Theme setup */
const savedTheme = localStorage.getItem("theme");

if (savedTheme === "light") {
    document.body.classList.add("light-mode");
}

updateAudioThemeSwitch();

audioThemeSwitch.addEventListener("change", function () {
    if (audioThemeSwitch.checked) {
        document.body.classList.add("light-mode");
        localStorage.setItem("theme", "light");
    } else {
        document.body.classList.remove("light-mode");
        localStorage.setItem("theme", "dark");
    }

    updateAudioThemeSwitch();
});

function updateAudioThemeSwitch() {
    const isLight = document.body.classList.contains("light-mode");
    audioThemeSwitch.checked = isLight;
}

/* Device/browser back button control */
window.history.pushState({ audioPage: true }, "", window.location.href);

window.addEventListener("popstate", function () {
    if (allowAudioPageExit) {
        return;
    }

    window.history.pushState({ audioPage: true }, "", window.location.href);

    if (audioConfirmBox.style.display !== "flex") {
        showAudioConfirm(
            "Go back home?",
            "Do you want to go back to home page?",
            "Confirm to Leave",
            function () {
                allowAudioPageExit = true;
                socket.emit("leaveAudio");
                resetFullAudioCall();
                window.location.href = "index.html";
            }
        );
    }
});

/* Confirm popup */
function showAudioConfirm(title, message, buttonText, action) {
    audioConfirmTitle.textContent = title;
    audioConfirmMessage.textContent = message;
    audioConfirmActionBtn.textContent = buttonText;
    audioConfirmAction = action;

    audioConfirmBox.style.display = "flex";
}

audioCancelActionBtn.addEventListener("click", function () {
    audioConfirmBox.style.display = "none";
    audioConfirmAction = null;
});

audioConfirmActionBtn.addEventListener("click", function () {
    audioConfirmBox.style.display = "none";

    if (audioConfirmAction) {
        audioConfirmAction();
    }

    audioConfirmAction = null;
});

/* Start audio call */
startAudioBtn.addEventListener("click", async function () {
    try {
        audioStatus.textContent = "Requesting microphone permission...";

        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false
        });

        startAudioBtn.disabled = true;
        muteBtn.disabled = false;
        nextAudioBtn.disabled = false;
        leaveAudioBtn.disabled = false;
        reportAudioBtn.disabled = true;

        audioStatus.textContent = "Searching for an audio stranger...";
        socket.emit("findAudioStranger");
    } catch (error) {
        console.log(error);
        audioStatus.textContent = "Microphone permission denied.";
        alert("Please allow microphone permission to start audio call.");
        resetFullAudioCall();
    }
});

/* Mute / Unmute */
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

/* Next audio stranger */
nextAudioBtn.addEventListener("click", function () {
    showAudioConfirm(
        "Next audio stranger?",
        "Current audio call will be disconnected. Do you want to find a new audio stranger?",
        "Confirm Next",
        function () {
            closePeerConnection();

            hasAudioPartner = false;
            reportAudioBtn.disabled = true;
            audioStatus.textContent = "Searching for a new audio stranger...";

            socket.emit("nextAudio");
        }
    );
});

/* Report audio stranger */
reportAudioBtn.addEventListener("click", function () {
    if (!hasAudioPartner) {
        alert("No audio stranger to report.");
        return;
    }

    showAudioConfirm(
        "Report this audio stranger?",
        "This report will be saved and the call will be disconnected.",
        "Confirm Report",
        function () {
            closePeerConnection();

            hasAudioPartner = false;
            reportAudioBtn.disabled = true;
            audioStatus.textContent = "Submitting report...";

            socket.emit("reportAudio");
        }
    );
});

/* Leave audio call */
leaveAudioBtn.addEventListener("click", function () {
    showAudioConfirm(
        "Leave audio call?",
        "Do you want to leave this audio call?",
        "Confirm to Leave",
        function () {
            socket.emit("leaveAudio");
            resetFullAudioCall();
            audioStatus.textContent = "Audio call ended.";
        }
    );
});

/* Back Home button */
backHomeBtn.addEventListener("click", function () {
    showAudioConfirm(
        "Go back home?",
        "Do you want to go back to home page?",
        "Confirm to Leave",
        function () {
            allowAudioPageExit = true;
            socket.emit("leaveAudio");
            resetFullAudioCall();
            window.location.href = "index.html";
        }
    );
});

/* WebRTC connection */
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

function closePeerConnection() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    remoteAudio.srcObject = null;
}

function resetFullAudioCall() {
    closePeerConnection();

    if (localStream) {
        localStream.getTracks().forEach(function (track) {
            track.stop();
        });

        localStream = null;
    }

    startAudioBtn.disabled = false;
    muteBtn.disabled = true;
    nextAudioBtn.disabled = true;
    reportAudioBtn.disabled = true;
    leaveAudioBtn.disabled = true;

    muteBtn.textContent = "Mute Mic";
    isMuted = false;
    hasAudioPartner = false;
}

/* Socket events */
socket.on("audioWaiting", function () {
    audioStatus.textContent = "Waiting for an audio stranger...";
    hasAudioPartner = false;
    reportAudioBtn.disabled = true;
});

socket.on("audioMatched", async function (data) {
    hasAudioPartner = true;
    reportAudioBtn.disabled = false;

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
    closePeerConnection();

    hasAudioPartner = false;
    reportAudioBtn.disabled = true;

    audioStatus.textContent = "Audio stranger left. Click Next to find a new audio stranger.";
});

socket.on("audioLeft", function () {
    resetFullAudioCall();
    audioStatus.textContent = "Audio call ended.";
});

socket.on("audioNotice", function (message) {
    closePeerConnection();

    hasAudioPartner = false;
    reportAudioBtn.disabled = true;

    audioStatus.textContent = message;
});

socket.on("audioWarning", function (message) {
    alert(message);
    audioStatus.textContent = message;
});

/* Page close / refresh */
window.addEventListener("beforeunload", function () {
    socket.emit("leaveAudio");
});