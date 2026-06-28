const socket = io();

const startBtn = document.getElementById("startBtn");
const home = document.getElementById("home");
const chatContainer = document.getElementById("chatContainer");

const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const messages = document.getElementById("messages");
const nextBtn = document.getElementById("nextBtn");
const reportBtn = document.getElementById("reportBtn");
const leaveBtn = document.getElementById("leaveBtn");
const statusText = document.getElementById("status");
const onlineCount = document.getElementById("onlineCount");

const confirmBox = document.getElementById("confirmBox");
const confirmLeaveBtn = document.getElementById("confirmLeaveBtn");
const cancelLeaveBtn = document.getElementById("cancelLeaveBtn");

const themeSwitches = document.querySelectorAll(".themeSwitch");

let connectedToStranger = false;

let typingTimer;
let strangerTypingTimer;
const TYPING_DELAY = 1000;

/* Theme setup */
const savedTheme = localStorage.getItem("theme");

if (savedTheme === "light") {
    document.body.classList.add("light-mode");
}

updateThemeSwitches();

themeSwitches.forEach(function (themeSwitch) {
    themeSwitch.addEventListener("change", function () {
        if (themeSwitch.checked) {
            document.body.classList.add("light-mode");
            localStorage.setItem("theme", "light");
        } else {
            document.body.classList.remove("light-mode");
            localStorage.setItem("theme", "dark");
        }

        updateThemeSwitches();
    });
});

function updateThemeSwitches() {
    const isLight = document.body.classList.contains("light-mode");

    themeSwitches.forEach(function (themeSwitch) {
        themeSwitch.checked = isLight;
    });
}

/* Start chat */
startBtn.addEventListener("click", function () {
    home.style.display = "none";
    chatContainer.style.display = "flex";

    messages.innerHTML = "";
    statusText.textContent = "Searching for a stranger...";
    connectedToStranger = false;

    socket.emit("findStranger");
});

/* Send message */
sendBtn.addEventListener("click", function () {
    sendMessage();
});

messageInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
        sendMessage();
    }
});

/* Typing indicator */
messageInput.addEventListener("input", function () {
    if (!connectedToStranger) {
        return;
    }

    socket.emit("typing", true);

    clearTimeout(typingTimer);

    typingTimer = setTimeout(function () {
        socket.emit("typing", false);
    }, TYPING_DELAY);
});

/* Next stranger */
nextBtn.addEventListener("click", function () {
    messages.innerHTML = "";
    statusText.textContent = "Searching for a new stranger...";
    connectedToStranger = false;

    socket.emit("next");
});

/* Report */
reportBtn.addEventListener("click", function () {
    socket.emit("report");
});

/* Leave confirmation */
leaveBtn.addEventListener("click", function () {
    confirmBox.style.display = "flex";
});

cancelLeaveBtn.addEventListener("click", function () {
    confirmBox.style.display = "none";
});

confirmLeaveBtn.addEventListener("click", function () {
    socket.emit("leave");
});

function sendMessage() {
    const text = messageInput.value.trim();

    if (text === "") {
        return;
    }

    if (!connectedToStranger) {
        alert("Please wait until a stranger connects.");
        return;
    }

    addMessage("You: " + text, "you");

    socket.emit("chatMessage", text);
    socket.emit("typing", false);
    clearTimeout(typingTimer);

    messageInput.value = "";
}

function addMessage(text, type) {
    const newMessage = document.createElement("div");
    newMessage.classList.add("message", type);
    newMessage.textContent = text;

    messages.appendChild(newMessage);
    messages.scrollTop = messages.scrollHeight;
}

/* Socket events */
socket.on("waiting", function () {
    statusText.textContent = "Waiting for a stranger...";
});

socket.on("matched", function () {
    connectedToStranger = true;
    statusText.textContent = "Connected to a stranger";
    addMessage("System: Stranger connected.", "stranger");
});

socket.on("chatMessage", function (message) {
    addMessage("Stranger: " + message, "stranger");
});

socket.on("partnerLeft", function () {
    connectedToStranger = false;
    statusText.textContent = "Stranger disconnected. Click Next.";
    addMessage("System: Stranger left the chat.", "stranger");
});

socket.on("warning", function (message) {
    alert(message);
});

socket.on("onlineUsers", function (count) {
    onlineCount.textContent = "Online users: " + count;
});

socket.on("typing", function (isTyping) {
    if (!connectedToStranger) {
        return;
    }

    if (isTyping) {
        statusText.textContent = "Stranger is typing...";

        clearTimeout(strangerTypingTimer);

        strangerTypingTimer = setTimeout(function () {
            if (connectedToStranger) {
                statusText.textContent = "Connected to a stranger";
            }
        }, 1500);
    } else {
        clearTimeout(strangerTypingTimer);

        if (connectedToStranger) {
            statusText.textContent = "Connected to a stranger";
        }
    }
});

socket.on("leftChat", function () {
    connectedToStranger = false;

    confirmBox.style.display = "none";
    chatContainer.style.display = "none";
    home.style.display = "block";

    messages.innerHTML = "";
    messageInput.value = "";
    statusText.textContent = "Searching...";
});