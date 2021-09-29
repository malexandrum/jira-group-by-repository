(async () => {

    const instanceName = 'cakemarketing';
    const baseUrl = `https://${instanceName}.atlassian.net`;
    // const jql = encodeURIComponent('key in (CK-495, CORE-879, CORE-218, CORE-34, CORE-567, CORE-12, CORE-456, CORE-400, CORE-800)');
    // const jql = encodeURIComponent('key in (CK-495, CORE-1)');
    // const jql = encodeURIComponent('key in (CK-495, CORE-1, TUX-5, TUX-74, TUX-75)');
    const jql = encodeURIComponent('project in (CORE, MAD, TUX, KJ, "Support Engineering", CSIKanban) AND statusCategory = Done AND (labels is EMPTY OR labels != DEPLOY_NOT_NEEDED) AND issuetype in standardIssueTypes() AND statusCategoryChangedDate > startOfDay(-30) AND development[pullrequests].all > 0 and status = "Next Release" ORDER BY Rank ASC');
    const CODELESS = 'CODELESS';
    const REPO_HOSTS = ['GitHub', 'bitbucket'];
    const PLACEHOLDER = '---';

    document.addEventListener('DOMContentLoaded', async () => {

        await getIssues();

        document.querySelectorAll('ul.dropzone').forEach(el => {
            el.addEventListener('drop', event => {
                const sourceElId = event.dataTransfer.getData('text/plain');
                if (event.target.classList.contains('dropzone')) {
                    event.target.appendChild(document.getElementById(sourceElId));
                    event.target.classList.remove('dragover');
                }
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
            } catch {}
        }

        function autoGrow(event) {
            const el = event.target
            if (el.scrollHeight > el.clientHeight) {
                el.style.height = el.scrollHeight + "px";
            }
        }
    })


    async function getIssues() {
        try {
            const result = await fetch(baseUrl + `/rest/api/3/search?jql=${jql}&fields=assignee,summary&expand=names&maxResults=100`);
            if (result.status === 200) {
                const { issues } = await result.json();

                const devInfoPromises = [];
                for (let i of issues) {
                    for (let rh of REPO_HOSTS) {
                        devInfoPromises.push(getRepos(i.id, rh))
                    }
                }
                const promisesResults = await Promise.allSettled(devInfoPromises);

                // build the repos object
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

                let html = '';
                html += '<ul class="dropzone">';
                for (let repo of Object.keys(repos)) {
                    html += `<li class="repo" draggable="true" id="${repo.replace(/[\s,\/]/g, '')}"><span class="repo">${repo}</span>`; // <input class="repo-alias">
                    html += `<ul>`;
                    for (let issueIndex of repos[repo]) {
                        const i = issues[issueIndex];
                        const { key, fields } = i;
                        const { summary } = fields;
                        html += `<li><a href="${baseUrl}/browse/${key}" target="_blank">${key}</a> (${i.fields.assignee.displayName}): ${summary}</li>`;
                    }
                    html += `<li><textarea rows="1" class="callouts hidden">${localStorage.getItem(repo) || ''}</textarea>
                    <p class="callouts">${localStorage.getItem(repo) || PLACEHOLDER}</p>
                    </li>
                    </ul>
                    </li>`;
                }
                html += '</ul>'

                document.getElementById('repos').innerHTML = html;
            } else {
                throw (new Exception(`${result.status}: ${result.statusText}`));
            }

        } catch (ex) {
            console.log(ex);
        }
    }


    async function getRepos(issueId, repoHost) {
        try {
            const result = await fetch(`${baseUrl}/rest/dev-status/latest/issue/detail?issueId=${issueId}&applicationType=${repoHost}&dataType=repository`);
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