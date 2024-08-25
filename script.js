const codeChars = '23456789BCDFGHJKMNPQRTVWXY';
const messages = {
    en: {
        title: "Steam Authenticator",
        header: "Steam Authenticator",
        copyButton: "Copy",
        authCodeTitle: "Double-click to copy",
        validFor: "Valid for: {time} seconds",
        copiedToast: "Copied to clipboard!",
    },
    zh: {
        title: "Steam 验证器",
        header: "Steam 验证器",
        copyButton: "复制",
        authCodeTitle: "双击复制",
        validFor: "有效期: {time} 秒",
        copiedToast: "已复制到剪贴板！",
    }
};

function base64ToBytes(base64) {
    return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

function hmacSha1(key, data) {
    const crypto = window.crypto || window.msCrypto;
    return crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
        .then(cryptoKey => crypto.subtle.sign('HMAC', cryptoKey, data))
        .then(signature => new Uint8Array(signature));
}

async function getSteamGuardCode(sharedSecret) {
    const secret = base64ToBytes(sharedSecret);
    const timestamp = Math.floor(Date.now() / 1000 / 30);
    const timeBytes = new ArrayBuffer(8);
    new DataView(timeBytes).setUint32(4, timestamp, false);

    const hmacSha1Result = await hmacSha1(secret, timeBytes);
    const start = hmacSha1Result[19] & 0x0F;
    
    let codeInt = (new DataView(hmacSha1Result.buffer).getUint32(start, false) & 0x7FFFFFFF);

    let code = '';
    for (let i = 0; i < 5; i++) {
        code += codeChars[codeInt % codeChars.length];
        codeInt = Math.floor(codeInt / codeChars.length);
    }

    return code;
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'show';
    setTimeout(() => { toast.className = toast.className.replace('show', ''); }, 3000);
}

function copyAuthCode() {
    const authCode = document.getElementById('authCode').innerText.replace(/Auth Code: /, "");
    navigator.clipboard.writeText(authCode).then(() => {
        const lang = getUserLanguage();
        showToast(messages[lang].copiedToast);
    }).catch(err => {
        console.error('Failed to copy auth code: ', err);
    });
}

function updateAuthCode(sharedSecret) {
    getSteamGuardCode(sharedSecret).then(code => {
        const now = Math.floor(Date.now() / 1000);
        const timeRemaining = 30 - (now % 30);
        const progressBar = document.getElementById('progressBar');

        const authCodeElem = document.getElementById('authCode');
        authCodeElem.innerText = `Auth Code: ${code}`;
        document.getElementById('timeRemaining').innerText = formatMessage('validFor', timeRemaining);

        // 更新进度条宽度
        const progressPercent = (timeRemaining / 30) * 100;
        progressBar.style.width = `${progressPercent}%`;

        setTimeout(() => updateAuthCode(sharedSecret), 1000);
    }).catch(error => {
        console.error("Error generating auth code:", error);
    });
}

function formatMessage(key, time) {
    const lang = getUserLanguage();
    const message = messages[lang][key];
    return message.replace("{time}", time);
}

function getUserLanguage() {
    const lang = navigator.language || navigator.userLanguage;
    return lang.startsWith('zh') ? 'zh' : 'en';
}

document.getElementById('fileInput').addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const maFile = JSON.parse(e.target.result);
                console.log("maFile loaded:", maFile);
                const accountName = maFile.account_name;
                const sharedSecret = maFile.shared_secret;

                document.getElementById('accountName').innerText = `Account: ${accountName}`;
                updateAuthCode(sharedSecret);
            } catch (error) {
                console.error("Failed to parse .maFile:", error);
            }
        };
        reader.readAsText(file);
    }
});

document.getElementById('authCode').addEventListener('dblclick', copyAuthCode);
document.getElementById('copyButton').addEventListener('click', copyAuthCode);

function initializePage() {
    const lang = getUserLanguage();
    document.getElementById('pageTitle').textContent = messages[lang].title;
    document.getElementById('header').textContent = messages[lang].header;
    document.getElementById('copyButton').textContent = messages[lang].copyButton;
}

initializePage();
