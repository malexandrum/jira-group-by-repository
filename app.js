(async () => {
    const MAX_ISSUES = 100;
    const CODELESS = 'CODELESS';
    const REPO_HOSTS = ['GitHub', 'bitbucket'];
    const PLACEHOLDER = '---';


    let settings;
    chrome.storage.sync.get(['instance', 'jql'], async s => {
        if (!s.instance || !s.jql) {
            chrome.runtime.openOptionsPage();
            debugger;
        } else {

            settings = s;
            settings.baseUrl = `https://${settings.instance}.atlassian.net`;

            try {
                const { issues, repos } = await getIssuesAndRepos(settings);
                render(issues, repos);
                setupDragDrop();
                setupReactiveInput();

            } catch (ex) {
                alert(ex);
            }

            otherListeners();
        }
    });


    function otherListeners() {
        document.querySelector('#settings').addEventListener('click', event => {
            chrome.runtime.openOptionsPage();
        })
    }

    function setupDragDrop() {
        document.querySelectorAll('ul.dropzone').forEach(el => {
            el.addEventListener('drop', event => {
                const sourceElId = event.dataTransfer.getData('text/plain');
                let target = event.target;
                while (!target.classList.contains('dropzone')) {
                    if (!target.parentElement) {
                        break;
                    }
                    target = target.parentElement;
                }
                target.appendChild(document.getElementById(sourceElId));
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

        document.querySelectorAll('li.repo').forEach(el => {
            el.addEventListener('dragstart', event => {
                event.dataTransfer.setData('text/plain', event.target.id);
                event.dataTransfer.dropEffect = "move";
            })
        })
    }

    function setupReactiveInput() {
        document.querySelectorAll('textarea.callouts').forEach(el => {
            el.addEventListener('change', calloutTextAreaLostFocus);
            el.addEventListener('blur', calloutTextAreaLostFocus);
            el.addEventListener('keyup', autoGrow);
        });

        document.querySelectorAll('p.callouts').forEach(el => {
            el.addEventListener('click', event => {
                event.target.classList.add('hidden');
                const textArea = event.target.previousElementSibling;
                textArea.classList.remove('hidden');
                textArea.focus();
            })
        })

        function calloutTextAreaLostFocus(event) {
            event.target.classList.add('hidden');
            event.target.nextElementSibling.classList.remove('hidden')
            event.target.nextElementSibling.innerText = event.target.value || PLACEHOLDER;
            let repo;
            try {
                repo = event.target.parentElement.parentElement.parentElement.id
                localStorage.setItem(repo, event.target.value);
            } catch { }
        }

        function autoGrow(event) {
            const el = event.target
            if (el.scrollHeight > el.clientHeight) {
                el.style.height = el.scrollHeight + "px";
            }
        }

    }

    async function getIssuesAndRepos(settings) {

        const result = await fetch(settings.baseUrl + `/rest/api/3/search?jql=${encodeURIComponent(settings.jql)}&fields=assignee,summary&expand=names&maxResults=100`);
        if (result.status === 200) {
            const { issues } = await result.json();

            if (issues.length > MAX_ISSUES) {
                throw ('Too many issues returned by your JQL, please add more filters.');
            }

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
            return { issues, repos };

        } else if (result.status === 400) {
            throw ('Please make sure you are logged into Jira in this window and check the configured JQL in Jira search');
        } else if (result.status === 404) {
            throw ('Invalid cookie, please login to Atlassian Jira in a new tab of same window');
        } else {
            throw (`${result.status}: ${result.statusText}`);
        }

    }


    function render(issues, repos) {
        let html = '';
        html += '<ul class="dropzone">';
        for (let repo of Object.keys(repos)) {
            html += `<li class="repo" draggable="true" id="${repo.replace(/[\s,\/]/g, '')}"><span class="repo">${repo}</span>`; // <input class="repo-alias">
            html += `<ul>`;
            for (let issueIndex of repos[repo]) {
                const i = issues[issueIndex];
                const { key, fields } = i;
                const { summary } = fields;
                html += `<li><a href="${settings.baseUrl}/browse/${key}" target="_blank">${key}</a> (${i.fields.assignee ? i.fields.assignee.displayName : '<Unassigned>'}): ${summary}</li>`;
            }
            html += `<li><textarea rows="1" class="callouts hidden">${localStorage.getItem(repo) || ''}</textarea>
                    <p class="callouts">${localStorage.getItem(repo) || PLACEHOLDER}</p>
                    </li>
                    </ul>
                    </li>`;
        }
        html += '</ul>'
        if (issues.length === 0) {
            document.getElementById('repos').innerHTML = `No issues match filter <b>${settings.jql}</b>`;
        } else {
            document.getElementById('repos').innerHTML = html;
        }

    }


    async function getRepos(issueId, repoHost) {
        try {
            const result = await fetch(`${settings.baseUrl}/rest/dev-status/latest/issue/detail?issueId=${issueId}&applicationType=${repoHost}&dataType=repository`);
            if (result.status === 200) {
                return await result.json();
            } else {
                throw (new Exception(`${result.status}: ${result.statusText}`));
            }
        } catch (ex) {
            return ex;
        }
    }

})()