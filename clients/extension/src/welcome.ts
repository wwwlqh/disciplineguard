// The welcome tab after install (EXPERIENCE §6.1): one button to sign in this browser.
document.getElementById('signin')!.addEventListener('click', () => void chrome.runtime.sendMessage({ type: 'sign_in' }));
