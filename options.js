document.addEventListener('DOMContentLoaded', function () {
    restore_options();
    document.querySelectorAll('input,textarea').forEach(el => {
        el.addEventListener('change', save_options);
    });
});


function save_options() {

    const instance = document.getElementById('instance').value;
    const jql = document.getElementById('jql').value;
    chrome.storage.sync.set({
        instance,
        jql
    }, function () {
    });
}

function restore_options() {
    chrome.storage.sync.get(['instance', 'jql'], function (settings) {
        if (settings) {
            document.getElementById('instance').value = settings.instance || '';
            document.getElementById('jql').value = settings.jql || '';
        }
    });
}