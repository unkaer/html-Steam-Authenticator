let authCodeTimer = null; // 用于存储定时器 ID
const codeChars = '23456789BCDFGHJKMNPQRTVWXY';
const messages = {
    en: {
        title: "Steam Authenticator",
        header: "Steam Authenticator",
        fileLabel: "Import .maFile:",
        accountLabel: "Select Account:",
        accountNamePrefix: "Account: ",
        authCodePrefix: "Auth Code: ",
        authCodeTitle: "Double-click to copy",
        validFor: "Valid for: {time} seconds",
        copyButton: "Copy",
        deleteAccountButton: "Delete Account",
        clearAllButton: "Clear All Accounts",
        copiedToast: "Copied to clipboard!",
        toastSuccess: "Copied to clipboard!",
        deleteConfirm: "Are you sure you want to delete this account?",
        clearAllConfirm: "Are you sure you want to clear all accounts?",
    },
    zh: {
        title: "Steam 验证器",
        header: "Steam 验证器",
        fileLabel: "导入 .maFile 文件:",
        accountLabel: "选择账号:",
        accountNamePrefix: "账号: ",
        authCodePrefix: "验证码: ",
        authCodeTitle: "双击复制",
        validFor: "有效期: {time} 秒",
        copyButton: "复制",
        deleteAccountButton: "删除账号",
        clearAllButton: "清空所有账号",
        copiedToast: "已复制到剪贴板！",
        toastSuccess: "已复制到剪贴板！",
        deleteConfirm: "确定要删除此账号吗？",
        clearAllConfirm: "确定要清空所有账号吗？",
    }
};

function updateTextContent() {
    const lang = getUserLanguage();
    document.getElementById('pageTitle').textContent = messages[lang].title;
    document.getElementById('header').textContent = messages[lang].header;
    document.querySelector('label[for="fileInput"]').textContent = messages[lang].fileLabel;
    document.querySelector('label[for="accountList"]').textContent = messages[lang].accountLabel;
    document.getElementById('copyButton').textContent = messages[lang].copyButton;
    document.getElementById('deleteAccountButton').textContent = messages[lang].deleteAccountButton;
    document.getElementById('clearAllButton').textContent = messages[lang].clearAllButton;
    document.getElementById('authCode').title = messages[lang].authCodeTitle;
}

function saveAllMaFiles(accounts) {
    localStorage.setItem('steamAuthenticatorAccounts', JSON.stringify(accounts));
}

function deleteAccount() {
    const lang = getUserLanguage();
    const accountList = document.getElementById('accountList');
    const selectedAccount = accountList.value;

    if (confirm(messages[lang].deleteConfirm)) {
        let accounts = loadAllMaFiles();
        delete accounts[selectedAccount];
        saveAllMaFiles(accounts);
        updateAccountList();
        initializePage(); // 重新初始化页面
    }
}

function clearAllAccounts() {
    const lang = getUserLanguage();
    
    if (confirm(messages[lang].clearAllConfirm)) {
        localStorage.removeItem('steamAuthenticatorAccounts');
        updateAccountList();
        initializePage(); // 重新初始化页面
    }
}

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
    if (authCodeTimer) {
        clearTimeout(authCodeTimer); // 清除之前的定时器
    }
    
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

        // 设置新的定时器
        authCodeTimer = setTimeout(() => updateAuthCode(sharedSecret), 1000);
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

function saveMaFile(accountName, maFile) {
    let accounts = loadAllMaFiles();
    accounts[accountName] = maFile;
    saveAllMaFiles(accounts);
}

function loadAllMaFiles() {
    const storedAccounts = localStorage.getItem('steamAuthenticatorAccounts');
    return storedAccounts ? JSON.parse(storedAccounts) : {};
}

function handleFileInput(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const maFile = JSON.parse(e.target.result);
                console.log("maFile loaded:", maFile);
                saveMaFile(maFile.account_name, maFile);
                updateAccountList();
                // 设置选择新导入的账号
                const accountList = document.getElementById('accountList');
                accountList.value = maFile.account_name;
                displayAccountAndStartAuth(maFile.account_name);
            } catch (error) {
                console.error("Failed to parse .maFile:", error);
            }
        };
        reader.readAsText(file);
    }
}

function updateAccountList() {
    const accountList = document.getElementById('accountList');
    accountList.innerHTML = ''; // 清空列表
    const accounts = loadAllMaFiles();

    for (const accountName in accounts) {
        const option = document.createElement('option');
        option.value = accountName;
        option.textContent = accountName;
        accountList.appendChild(option);
    }

    if (Object.keys(accounts).length === 0) {
        document.getElementById('accountName').innerText = '';
        document.getElementById('authCode').innerText = '';
    }
}

function displayAccountAndStartAuth(accountName) {
    const accounts = loadAllMaFiles();
    const maFile = accounts[accountName];
    if (!maFile) return;

    const sharedSecret = maFile.shared_secret;
    const lang = getUserLanguage();
    document.getElementById('accountName').innerText = `${messages[lang].accountNamePrefix}${accountName}`;
    updateAuthCode(sharedSecret);
}

function initializePage() {
    updateTextContent();
    updateAccountList();

    // 自动选择第一个账户并显示
    const accountList = document.getElementById('accountList');
    if (accountList.options.length > 0) {
        accountList.selectedIndex = 0;
        displayAccountAndStartAuth(accountList.value);
    }
}

document.getElementById('fileInput').addEventListener('change', handleFileInput);
document.getElementById('accountList').addEventListener('change', function() {
    displayAccountAndStartAuth(this.value);
});
document.getElementById('authCode').addEventListener('dblclick', copyAuthCode);
document.getElementById('copyButton').addEventListener('click', copyAuthCode);
document.getElementById('deleteAccountButton').addEventListener('click', deleteAccount);
document.getElementById('clearAllButton').addEventListener('click', clearAllAccounts);

initializePage();
