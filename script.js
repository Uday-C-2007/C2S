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

const photoBtn = document.getElementById("photoBtn");
const photoInput = document.getElementById("photoInput");

const confirmBox = document.getElementById("confirmBox");
const confirmTitle = document.getElementById("confirmTitle");
const confirmMessage = document.getElementById("confirmMessage");
const confirmActionBtn = document.getElementById("confirmActionBtn");
const cancelActionBtn = document.getElementById("cancelActionBtn");

const themeSwitches = document.querySelectorAll(".themeSwitch");

let connectedToStranger = false;
let confirmAction = null;
let backButtonLocked = false;

let typingTimer;
let strangerTypingTimer;
const TYPING_DELAY = 1000;

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

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

/* Back button control */
function lockBackButton() {
    if (!backButtonLocked) {
        window.history.pushState({ chatOpen: true }, "", window.location.href);
        backButtonLocked = true;
    }
}

function unlockBackButton() {
    backButtonLocked = false;
}

window.addEventListener("popstate", function () {
    if (chatContainer.style.display === "flex") {
        window.history.pushState({ chatOpen: true }, "", window.location.href);

        if (confirmBox.style.display !== "flex") {
            showConfirm(
                "Leave this chat?",
                "Do you want to go back to home page?",
                "Confirm to Leave",
                function () {
                    socket.emit("leave");
                }
            );
        }
    }
});

/* Confirm popup */
function showConfirm(title, message, buttonText, action) {
    confirmTitle.textContent = title;
    confirmMessage.textContent = message;
    confirmActionBtn.textContent = buttonText;
    confirmAction = action;

    confirmBox.style.display = "flex";
}

cancelActionBtn.addEventListener("click", function () {
    confirmBox.style.display = "none";
    confirmAction = null;
});

confirmActionBtn.addEventListener("click", function () {
    confirmBox.style.display = "none";

    if (confirmAction) {
        confirmAction();
    }

    confirmAction = null;
});

function goToHomePage() {
    connectedToStranger = false;

    confirmBox.style.display = "none";
    chatContainer.style.display = "none";
    home.style.display = "block";

    messages.innerHTML = "";
    messageInput.value = "";
    statusText.textContent = "Searching...";

    unlockBackButton();
}

/* Start chat */
startBtn.addEventListener("click", function () {
    home.style.display = "none";
    chatContainer.style.display = "flex";

    messages.innerHTML = "";
    statusText.textContent = "Searching for a stranger...";
    connectedToStranger = false;

    lockBackButton();

    socket.emit("findStranger");
});

/* Send text message */
sendBtn.addEventListener("click", function () {
    sendMessage();
});

messageInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
        sendMessage();
    }
});

/* Send photo */
photoBtn.addEventListener("click", function () {
    if (!connectedToStranger) {
        alert("Please wait until a stranger connects.");
        return;
    }

    photoInput.click();
});

photoInput.addEventListener("change", function () {
    const file = photoInput.files[0];

    if (!file) {
        return;
    }

    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
        alert("Only JPG, PNG, and WEBP images are allowed.");
        photoInput.value = "";
        return;
    }

    if (file.size > MAX_IMAGE_SIZE) {
        alert("Image is too large. Please select an image below 5 MB.");
        photoInput.value = "";
        return;
    }

    const reader = new FileReader();

    reader.onload = function () {
        const imageData = reader.result;

        addImageMessage(imageData, "you", "You sent a photo");
        socket.emit("imageMessage", imageData);

        photoInput.value = "";
    };

    reader.readAsDataURL(file);
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
    showConfirm(
        "Next stranger?",
        "Current stranger will be disconnected. Do you want to find a new stranger?",
        "Confirm Next",
        function () {
            messages.innerHTML = "";
            statusText.textContent = "Searching for a new stranger...";
            connectedToStranger = false;

            socket.emit("next");
        }
    );
});

/* Report */
reportBtn.addEventListener("click", function () {
    showConfirm(
        "Report this stranger?",
        "This report will be saved and you will be moved to a new chat.",
        "Confirm Report",
        function () {
            socket.emit("report");
        }
    );
});

/* Leave */
leaveBtn.addEventListener("click", function () {
    showConfirm(
        "Leave this chat?",
        "If you leave, this stranger will be disconnected.",
        "Confirm to Leave",
        function () {
            socket.emit("leave");
        }
    );
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

function addImageMessage(imageData, type, label) {
    const newMessage = document.createElement("div");
    newMessage.classList.add("message", type, "image-message");

    const imageLabel = document.createElement("div");
    imageLabel.classList.add("image-label");
    imageLabel.textContent = label;

    const image = document.createElement("img");
    image.src = imageData;
    image.alt = "Chat photo";
    image.classList.add("chat-photo");

    newMessage.appendChild(imageLabel);
    newMessage.appendChild(image);

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

socket.on("imageMessage", function (imageData) {
    addImageMessage(imageData, "stranger", "Stranger sent a photo");
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
    goToHomePage();
});