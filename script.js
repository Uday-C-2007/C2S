const socket = io();

const homePage = document.getElementById("homePage");
const chatPage = document.getElementById("chatPage");

const startBtn = document.getElementById("startBtn");
const audioCallBtn = document.getElementById("audioCallBtn");

const themeToggle = document.getElementById("themeToggle");
const chatThemeToggle = document.getElementById("chatThemeToggle");
const themeIcon = document.getElementById("themeIcon");
const chatThemeIcon = document.getElementById("chatThemeIcon");

const homeMenuBtn = document.getElementById("homeMenuBtn");
const homeMenuDropdown = document.getElementById("homeMenuDropdown");
const chatMenuBtn = document.getElementById("chatMenuBtn");
const chatMenuDropdown = document.getElementById("chatMenuDropdown");

const messages = document.getElementById("messages");
const statusBox = document.getElementById("status");

const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

const imageBtn = document.getElementById("imageBtn");
const imageInput = document.getElementById("imageInput");

const reportBtn = document.getElementById("reportBtn");
const nextBtn = document.getElementById("nextBtn");
const leaveBtn = document.getElementById("leaveBtn");

const confirmBox = document.getElementById("confirmBox");
const confirmTitle = document.getElementById("confirmTitle");
const confirmMessage = document.getElementById("confirmMessage");
const confirmActionBtn = document.getElementById("confirmActionBtn");
const cancelActionBtn = document.getElementById("cancelActionBtn");

let currentConfirmAction = null;
let chatStarted = false;

function setStatus(text) {
    statusBox.textContent = text;
}

function scrollBottom() {
    messages.scrollTop = messages.scrollHeight;
}

function addMessage(text, type = "system") {
    const div = document.createElement("div");
    div.className = `message ${type}`;
    div.textContent = text;
    messages.appendChild(div);
    scrollBottom();
}

function addImage(src, type = "you") {
    const div = document.createElement("div");
    div.className = `message ${type}`;

    const img = document.createElement("img");
    img.src = src;
    img.alt = "sent image";

    div.appendChild(img);
    messages.appendChild(div);
    scrollBottom();
}

function showConfirm(title, message, action) {
    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    currentConfirmAction = action;
    confirmBox.classList.remove("hidden");
}

function hideConfirm() {
    confirmBox.classList.add("hidden");
    currentConfirmAction = null;
}

confirmActionBtn.addEventListener("click", () => {
    if (currentConfirmAction) currentConfirmAction();
    hideConfirm();
});

cancelActionBtn.addEventListener("click", hideConfirm);

function applyTheme(mode) {
    if (mode === "light") {
        document.body.classList.add("light-mode");
        themeIcon.textContent = "🌙";
        chatThemeIcon.textContent = "🌙";
    } else {
        document.body.classList.remove("light-mode");
        themeIcon.textContent = "☀️";
        chatThemeIcon.textContent = "☀️";
    }

    localStorage.setItem("theme", mode);
}

function toggleTheme() {
    const isLight = document.body.classList.contains("light-mode");
    applyTheme(isLight ? "dark" : "light");
}

applyTheme(localStorage.getItem("theme") || "dark");

themeToggle.addEventListener("click", toggleTheme);
chatThemeToggle.addEventListener("click", toggleTheme);

homeMenuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    homeMenuDropdown.classList.toggle("hidden");
});

chatMenuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    chatMenuDropdown.classList.toggle("hidden");
});

document.addEventListener("click", () => {
    homeMenuDropdown.classList.add("hidden");
    chatMenuDropdown.classList.add("hidden");
});

startBtn.addEventListener("click", () => {
    homePage.classList.add("hidden");
    chatPage.classList.remove("hidden");

    messages.innerHTML = "";
    chatStarted = true;

    setStatus("Searching for stranger...");
    addMessage("System: Searching for stranger...", "system");

    history.pushState({ chat: true }, "", "#chat");

    socket.emit("findStranger");
});

audioCallBtn.addEventListener("click", () => {
    window.location.href = "audio.html";
});

sendBtn.addEventListener("click", sendMessage);

messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendMessage();
});

function sendMessage() {
    const text = messageInput.value.trim();

    if (!text) return;

    addMessage("You: " + text, "you");
    socket.emit("sendMessage", text);

    messageInput.value = "";
}

imageBtn.addEventListener("click", () => {
    imageInput.click();
});

imageInput.addEventListener("change", () => {
    const file = imageInput.files[0];

    if (!file) return;

    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
        addMessage("System: Only JPG, PNG, and WEBP images are allowed.", "system");
        imageInput.value = "";
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        addMessage("System: Image size must be below 5 MB.", "system");
        imageInput.value = "";
        return;
    }

    const reader = new FileReader();

    reader.onload = () => {
        const imageData = reader.result;

        addImage(imageData, "you");

        socket.emit("sendImage", {
            image: imageData,
            name: file.name,
            type: file.type
        });
    };

    reader.readAsDataURL(file);
    imageInput.value = "";
});

nextBtn.addEventListener("click", () => {
    showConfirm("Confirm to next", "Do you want to search for a new stranger?", () => {
        messages.innerHTML = "";
        setStatus("Searching for new stranger...");
        addMessage("System: Searching for new stranger...", "system");
        socket.emit("nextStranger");
    });
});

reportBtn.addEventListener("click", () => {
    showConfirm("Confirm to report", "Do you want to report this stranger?", () => {
        setStatus("Report submitted. Searching for new stranger...");
        addMessage("System: Report submitted. Searching for new stranger...", "system");
        socket.emit("reportUser");
    });
});

leaveBtn.addEventListener("click", () => {
    showConfirm("Confirm to leave", "Do you want to leave the chat?", () => {
        leaveChat();
    });
});

function leaveChat() {
    socket.emit("leaveChat");

    chatStarted = false;
    messages.innerHTML = "";

    chatPage.classList.add("hidden");
    homePage.classList.remove("hidden");

    setStatus("Click Start Chat to begin.");

    if (location.hash === "#chat") {
        history.pushState(null, "", location.pathname);
    }
}

window.addEventListener("popstate", () => {
    if (chatStarted && !chatPage.classList.contains("hidden")) {
        showConfirm("Confirm to leave", "Do you want to leave the chat and go home?", () => {
            leaveChat();
        });

        history.pushState({ chat: true }, "", "#chat");
    }
});

window.addEventListener("beforeunload", () => {
    if (chatStarted) {
        socket.emit("leaveChat");
    }
});

/* SERVER EVENTS */

socket.on("waiting", () => {
    setStatus("Waiting for stranger...");
    addMessage("System: Waiting for stranger...", "system");
});

socket.on("matched", () => {
    setStatus("Stranger connected.");
    addMessage("System: Stranger connected.", "system");
});

socket.on("strangerFound", () => {
    setStatus("Stranger connected.");
    addMessage("System: Stranger connected.", "system");
});

socket.on("receiveMessage", (msg) => {
    addMessage("Stranger: " + msg, "stranger");
});

socket.on("strangerMessage", (msg) => {
    addMessage("Stranger: " + msg, "stranger");
});

socket.on("receiveImage", (data) => {
    if (typeof data === "string") {
        addImage(data, "stranger");
    } else if (data && data.image) {
        addImage(data.image, "stranger");
    }
});

socket.on("imageMessage", (data) => {
    if (typeof data === "string") {
        addImage(data, "stranger");
    } else if (data && data.image) {
        addImage(data.image, "stranger");
    }
});

socket.on("partnerLeft", () => {
    setStatus("Stranger disconnected. Click Next.");
    addMessage("System: Stranger left the chat.", "system");
});

socket.on("strangerLeft", () => {
    setStatus("Stranger disconnected. Click Next.");
    addMessage("System: Stranger left the chat.", "system");
});

socket.on("reportSuccess", () => {
    setStatus("Report submitted.");
    addMessage("System: Report submitted.", "system");
});

socket.on("warning", (text) => {
    addMessage("System: " + text, "system");
});