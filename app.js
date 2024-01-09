(async () => {
    const MAX_ISSUES = 100;
    const CODELESS = 'CODELESS';
    const REPO_HOSTS = ['GitHub', 'bitbucket'];
    const PLACEHOLDER = '---';

    let settings;
    try {
        settings = await restoreSettings();
    }
    catch (ex) {
        console.log(ex);
        alert('After configuring settings, please refresh')
        return
    }

    document.getElementById('copy-confirmation').style.display = 'none'

    try {
        const { issues, repos, components } = await getData(settings);
        render(issues, repos, components);
        setupDragDrop();
        setupReactiveInput();

    } catch (ex) {
        alert(ex);
    }

    otherListeners();

    document.getElementById('copy').addEventListener('click', copySelection)

    function otherListeners() {
        document.querySelector('#settings').addEventListener('click', event => {
            chrome.runtime.openOptionsPage();
        })
    }

    function setupDragDrop() {
        document.querySelectorAll('li.dropzone').forEach(el => {
            el.addEventListener('drop', event => {
                const sourceElId = event.dataTransfer.getData('text/plain');
                const sourceEl = document.getElementById(sourceElId);
                let target = event.target;

                const childList = target.querySelector('ol');
                if (childList) {
                    childList.appendChild(sourceEl);
                }
                // while (!target.classList.contains('dropzone')) {
                //     if (!target.parentElement) {
                //         break;
                //     }
                //     target = target.parentElement;
                // }
                // target.appendChild(document.getElementById(sourceElId));
                target.classList.remove('dragover');
            });
            el.addEventListener('dragover', event => {
                event.preventDefault();
            })
            el.addEventListener('dragenter', event => {
                event.preventDefault();
                event.target.classList.add('dragover');
            })
            el.addEventListener('dragleave', event => {
                event.preventDefault();
                event.target.classList.remove('dragover');
            })
        })

        document.querySelectorAll('li[draggable]').forEach(el => {
            el.addEventListener('dragstart', event => {
                event.dataTransfer.setData('text/plain', event.target.id);
                event.dataTransfer.dropEffect = "move";
            })
        })
    }

    function removeDraggable() {
        const elements = document.querySelectorAll('[draggable]');
        elements?.forEach(el => el.removeAttribute('draggable'))
        return elements
    }

    function reEnableDraggable(elements) {
        elements?.forEach(el => el.setAttribute('draggable', 'true'))
    }

    function copySelection() {
        if (!window.getSelection) return
        const draggableElems = removeDraggable()
        
        const selectionDiv = document.createElement('div')
        document.body.append(selectionDiv)
        selectionDiv.append(document.querySelector('#days').cloneNode(true))
        selectionDiv.append(document.createElement('br'))
        selectionDiv.append(document.getElementById('root-callout').parentElement.cloneNode(true))
        const range = document.createRange()
        range.selectNodeContents(selectionDiv)
        const selection = window.getSelection()
        selection.removeAllRanges()
        selection.addRange(range)
                
        document.execCommand('copy')
        selection.removeAllRanges()
        document.body.removeChild(selectionDiv)

        reEnableDraggable(draggableElems)
        const copyConfirmation = document.getElementById('copy-confirmation')
        copyConfirmation.style.display = '';
        setTimeout(() => {copyConfirmation.style.display = 'none'}, 5000)
    }

    function setupReactiveInput() {
        document.querySelectorAll('textarea.callouts')?.forEach(el => {
            el.addEventListener('change', calloutTextAreaLostFocus);
            el.addEventListener('blur', calloutTextAreaLostFocus);
            el.addEventListener('keyup', autoGrow);
        });

        const pCallouts = document.querySelectorAll('p.callouts')
        if (pCallouts) {
            for (const el of pCallouts) {
                el.addEventListener('click', event => {
                    event.target.classList.add('hidden');
                    const textArea = event.target.previousElementSibling;
                    textArea.classList.remove('hidden');
                    textArea.focus();
                })
            } 
        }

        document.getElementById('root-callout').value = localStorage.getItem('rootCallout');
        document.getElementById('root-callout').nextElementSibling.innerText = localStorage.getItem('rootCallout') || PLACEHOLDER;

        function calloutTextAreaLostFocus(event) {
            event.target.classList.add('hidden');
            event.target.nextElementSibling.classList.remove('hidden')
            event.target.nextElementSibling.innerText = event.target.value.trim() || PLACEHOLDER;
            let key;
            try {
                key = event.target.parentElement.parentElement.parentElement.id || 'rootCallout'
            } catch { 
                key = 'rootCallout'
            }
            if (event.target.value.trim()) {
                localStorage.setItem(key, event.target.value.trim());
            } else {
                localStorage.removeItem(key)
            }
        }

        function autoGrow(event) {
            const el = event.target
            if (el.scrollHeight > el.clientHeight) {
                el.style.height = el.scrollHeight + "px";
            }
        }

    }

    async function getData(settings) {

        const result = await fetch(settings.baseUrl + `/rest/api/3/search?jql=${encodeURIComponent(settings.jql)}&fields=assignee,summary,components&expand=names&maxResults=100`);
        if (result.status === 200) {
            const { issues } = await result.json();

            if (issues.length > MAX_ISSUES) {
                throw ('Too many issues returned by your JQL, please add more filters.');
            }

            const components = [];
            issues.forEach(i => {
                for (let c of i.fields.components) {
                    if (components.indexOf(c.name) === -1) {
                        components.push(c.name)
                    }
                }
            });
            components.sort();

            const devInfoPromises = [];
            for (let i of issues) {
                for (let rh of REPO_HOSTS) {
                    devInfoPromises.push(getRepos(i.id, rh))
                }
            }
            const promisesResults = await Promise.allSettled(devInfoPromises);

            const repos = {};
            const issuesWithRepos = {}; // keep track if an issue has repos
            for (let i in promisesResults) {
                const devInfo = promisesResults[i];
                if (devInfo.status === 'fulfilled') {
                    const issueIndex = Math.floor(i / 2);
                    devInfo.value.detail[0].repositories.forEach(r => {
                        issuesWithRepos[issueIndex] = true;
                        const repo = /* devInfo.value.detail[0]._instance.name + ' / ' + */ r.name.split('/').slice(-1)[0]
                        if (!repos[repo]) {
                            repos[repo] = [issueIndex]
                        } else {
                            if (repos[repo].indexOf(issueIndex) === -1) {
                                repos[repo].push(issueIndex)
                            }
                        }
                    })
                    if (i % REPO_HOSTS.length === REPO_HOSTS.length - 1 && !issuesWithRepos[issueIndex]) {
                        if (repos[CODELESS]) {
                            if (repos[CODELESS].indexOf(issueIndex) === -1) {
                                repos[CODELESS].push(issueIndex);
                            }
                        } else {
                            repos[CODELESS] = [issueIndex];
                        }
                    }
                }
            }
            return { issues, repos, components };

        } else if (result.status === 400) {
            throw ('Please make sure you are logged into Jira in this window and check the configured JQL in Jira search');
        } else if (result.status === 404) {
            throw ('Invalid cookie, please login to Atlassian Jira in a new tab of same window');
        } else {
            throw (`${result.status}: ${result.statusText}`);
        }

    }


    function render(issues, repos, components) {
        let html = '';
        html += `<ul>`;
        // html += `<li class="dropzone">Services <button id="add-service">Add</button>`;
        // html += `<ul class="service-components">`;
        // for (let c of components) {
        //     html += reusableServiceComponent(c);
        // }
        // html += `</ul></li>`;
        html += '<li class="dropzone">Repos:<ul>';
        for (let repo of Object.keys(repos)) {
            html += `<li class="repo" draggable="true" id="${repo.replace(/[\s,\/]/g, '')}"><span class="repo">${repo}</span>`; // <input class="repo-alias">
            html += `<ul>`;
            for (let issueIndex of repos[repo]) {
                const i = issues[issueIndex];
                const { key, fields } = i;
                const { summary } = fields;
                html += `<li><a href="${settings.baseUrl}/browse/${key}" target="_blank">${key}</a> (${i.fields.assignee ? i.fields.assignee.displayName : '<Unassigned>'}): ${summary}</li>`;
            }
            html += `<li><textarea rows="1" class="callouts hidden">${localStorage.getItem(repo)?.trim() || ''}</textarea>
                    <p class="callouts">${localStorage.getItem(repo)?.trim() || PLACEHOLDER}</p>
                    </li>
                    </ul>
                    </li>`;
        }
        html += '</ul></li></ul>'
        if (issues.length === 0) {
            document.getElementById('repos').innerHTML = `No issues match filter <b>${settings.jql}</b>`;
        } else {
            document.getElementById('repos').innerHTML = html;
        }        

    }

    function reusableServiceComponent(c) {
        return `<li class="service-component dropzone" draggable="true" id="${c}">${c}
        <ul class="repos"></ul></li>`;
    }

    function handlerAddComponent() {
        const componentsWrapper = document.querySelector('ul.service-components');
        componentsWrapper.appendChild()
    }


    async function getRepos(issueId, repoHost) {        
        const result = await fetch(`${settings.baseUrl}/rest/dev-status/latest/issue/detail?issueId=${issueId}&applicationType=${repoHost}&dataType=repository`);
        if (result.status === 200) {
            return await result.json();
        } else {
            throw (new Exception(`${result.status}: ${result.statusText}`));
        }
    }

    async function restoreSettings() {
        return new Promise((resolve, reject) => {
            chrome.storage.sync.get(['instance', 'jql'], s => {
                if (!s.instance || !s.jql) {
                    chrome.runtime.openOptionsPage();
                    reject('Settings not set')
                } else {
                    s.baseUrl = `https://${s.instance}.atlassian.net`;
                }
                resolve(s)
            })

        })
    }

})()