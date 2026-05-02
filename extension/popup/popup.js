document.getElementById('open-sidebar').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'open-sidebar' }, () => {
        window.close(); // Close popup
      });
    }
  });
});
