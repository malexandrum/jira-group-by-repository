let tab;

chrome.action.onClicked.addListener(function () {
    if (!tab) {
        tab = chrome.tabs.create({
            url: 'index.html'
        });
    } else {
        chrome.tabs.update(tab.id, { active: true });
    }
});

chrome.tabs.onRemoved.addListener(function () {   
    tab = undefined;
 })
