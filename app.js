(async () => {
    const MAX_ISSUES = 100;
    const CODELESS = '_WITHOUT_STORY_KEY_IN_COMMIT_MESSAGE_';
    const REPO_HOSTS = ['GitHub', 'bitbucket'];
    const PLACEHOLDER = '[Add Deploy Notes]';
    const REL_NOTES_FIELD = 'customfield_14357';
    const SCHEDULE_TARGETS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    let scheduledRepos = {};

    let settings;
    try {
        settings = await restoreSettings();
    }
    catch (ex) {
        console.log(ex);
        alert('After configuring settings, please refresh')
        return
    }
    document.getElementById('version').innerHTML = 'v' + chrome?.runtime?.getManifest?.().version || ''
    document.getElementById('copy-confirmation').style.display = 'none'

    try {
        var { issues, repos, components, filesByRepo } = await getData(settings);
        render();

    } catch (ex) {
        alert(ex);
    }

    otherListeners();

    document.getElementById('copy').addEventListener('click', copySelection)

    document.getElementById('reset-schedule').addEventListener('click', () => { scheduledRepos = {}; render(); })

    function otherListeners() {
        document.querySelector('#settings').addEventListener('click', event => {
            chrome.runtime.openOptionsPage();
        })
    }

    function setupDragDrop() {
        document.querySelectorAll('li.dropzone').forEach(el => {
            let dragEnterCounter = 0;
            el.addEventListener('drop', event => {
                const sourceElId = event.dataTransfer.getData('text/plain');
                const existingIndex = scheduledRepos[el.id]?.indexOf(sourceElId)
                if (existingIndex !== undefined && existingIndex !== -1) {
                    scheduledRepos[el.id].splice(existingIndex, 1);
                }
                scheduledRepos[el.id] = [...scheduledRepos[el.id] || [], sourceElId]

                render();
            });
            el.addEventListener('dragover', event => {
                // console.log('dragover', event, el)
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
            })
            el.addEventListener('dragenter', event => {
                dragEnterCounter++;
                // console.log('ondragenter', event, el)                
                el.classList.add('dragover');
            })
            el.addEventListener('dragleave', event => {
                // console.log('ondragleave', event, el)
                if (--dragEnterCounter === 0)
                    el.classList.remove('dragover');
            })
        })

        document.querySelectorAll('li[draggable]').forEach(el => {
            el.addEventListener('dragstart', event => {
                event.dataTransfer.setData('text/plain', el.id);
                event.dataTransfer.setDragImage(el.querySelector('div.repo'), 0, 20);
                el.classList.add('isdragged');
            })
            el.addEventListener('dragend', () => {
                el.classList.remove('isdragged');
            })
        })

        const removeFromScheduleZone = document.querySelector('#remove-from-schedule');
        removeFromScheduleZone?.addEventListener('dragenter', e => {
            e.target.classList.add('active')
        })
        removeFromScheduleZone?.addEventListener('dragleave', e => {
            e.target.classList.remove('active')
        })
        removeFromScheduleZone?.addEventListener('dragover', e => {
            e.preventDefault()
            e.dataTransfer.dropEffect = "move";
        })
        removeFromScheduleZone?.addEventListener('drop', e => {
            const repo = e.dataTransfer.getData('text/plain');
            let changed = false
            for (let schedRepos of Object.values(scheduledRepos)) {
                const idx = schedRepos?.indexOf(repo)
                if (idx !== undefined && idx !== -1) {
                    schedRepos.splice(idx, 1)
                    changed = true
                }
            }
            e.target.classList.remove('active')

            if (changed) {
                render()
            }
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
        selectionDiv.querySelectorAll('.repo li').forEach(el => { if (el.innerText === PLACEHOLDER) { el.parentElement.removeChild(el) } })
        selectionDiv.append(document.createElement('br'))
        selectionDiv.append(document.getElementById('release-notes').previousElementSibling.cloneNode(true));
        selectionDiv.append(document.getElementById('release-notes').cloneNode(true));

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
        setTimeout(() => { copyConfirmation.style.display = 'none' }, 5000)
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

        const result = await fetch(settings.baseUrl + `/rest/api/3/search?jql=${encodeURIComponent(settings.jql)}&fields=assignee,summary,components,${REL_NOTES_FIELD}&expand=names&maxResults=100`);
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

            let repos = {};
            const filesByRepo = {};
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

                        filesByRepo[repo] = filesByRepo[repo] || new Set();
                        r.commits?.forEach(commit => {
                            commit.files?.forEach(f => {
                                f.path && filesByRepo[repo].add(f.path);
                            })
                        });
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
            repos = Object.keys(repos).sort((a, b) => a.toLocaleLowerCase().localeCompare(b.toLocaleLowerCase())).reduce((ordered, key) => { ordered[key] = repos[key]; return ordered }, {})
            return { issues, repos, components, filesByRepo };

        } else if (result.status === 400) {
            throw ('Please make sure you are logged into Jira in this window and check the configured JQL in Jira search');
        } else if (result.status === 404) {
            throw ('Invalid cookie, please login to Atlassian Jira in a new tab of same window');
        } else {
            throw (`${result.status}: ${result.statusText}`);
        }

    }

    async function getRepos(issueId, repoHost) {
        const result = await fetch(`${settings.baseUrl}/rest/dev-status/latest/issue/detail?issueId=${issueId}&applicationType=${repoHost}&dataType=repository`);
        if (result.status === 200) {
            return await result.json();
        } else {
            throw (new Exception(`${result.status}: ${result.statusText}`));
        }
    }

    function render() {
        let reposHtml = '';
        reposHtml += '<h3>Repositories Ready for Scheduling</h3><ul>';
        for (let repo of Object.keys(repos)) {
            let skip = false
            for (let sr of Object.values(scheduledRepos)) {
                if (sr.indexOf(repo) !== -1) {
                    skip = true
                    break;
                }
            }
            !skip && (reposHtml += renderRepo(repo, repos, issues, false))
        }
        reposHtml += '</ul>'
        if (issues.length === 0) {
            document.getElementById('repos').innerHTML = `No issues match filter <b>${settings.jql}</b>`;
        } else {
            document.getElementById('repos').innerHTML = reposHtml;
        }

        let scheduleHtml = '';
        SCHEDULE_TARGETS.forEach(st => {
            scheduleHtml += `<li class="dayofweek dropzone" id="${st}">
            <span>🗓 ${st}</span>
            <ol>${scheduledRepos[st]?.map(sr => renderRepo(sr, repos, issues, true)).join('') || ''}</ol>`
        })
        document.getElementById('days').innerHTML = scheduleHtml;

        let releaseNotesHtml = '';
        const mentionedStories = new Set()
        const releaseNotes = []
        Object.values(scheduledRepos).forEach(srs => {
            srs.forEach(sr => {
                repos[sr].forEach(issueId => {
                    if (!mentionedStories.has(issueId)) {
                        mentionedStories.add(issueId);
                        releaseNotes.push(issues[issueId].fields[REL_NOTES_FIELD] || issues[issueId].fields.summary)
                    }
                })
            })
        });
        releaseNotes.sort((a, b) => a.toLocaleLowerCase().localeCompare(b.toLocaleLowerCase()));
        releaseNotes.forEach(relNote => {
            const relNoteLower = relNote?.toLowerCase();
            if (relNoteLower.indexOf('fix') != -1 || relNoteLower.indexOf('bug') !== -1) {
                relNote = '🔴 ' + relNote;
            } else {
                relNote = '🆕 ' + relNote;
            }
            releaseNotesHtml += `<li>${relNote}</li>`
        })
        document.getElementById('release-notes').innerHTML = releaseNotesHtml;

        setupDragDrop()
        setupReactiveInput()
    }

    function reusableServiceComponent(c) {
        return `<li class="service-component dropzone" draggable="true" id="${c}">${c}
        <ul class="repos"></ul></li>`;
    }

    function handlerAddComponent() {
        const componentsWrapper = document.querySelector('ul.service-components');
        componentsWrapper.appendChild()
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

    function renderIssue(issue, ignoreRelNotes = false) {
        const { fields, key } = issue;
        const { summary, assignee } = fields;
        let result = `<li class="issue"><a draggable="false" href="${settings.baseUrl}/browse/${key}" target="_blank">${key}</a> (${assignee ? assignee.displayName : '<Unassigned>'}): ${summary}`;
        if (!ignoreRelNotes) {
            const relNotes = fields[REL_NOTES_FIELD] || '<i style="color: orange;">⚠️ null | None | nil</i>';
            result += `<ul><li>Release Notes: ${relNotes}</li></ul>`;
        }
        result += '</li>';
        return result
    }

    function renderRepo(repo, repos, issues, ignoreRelNotes = false) {
        let result = `<li class="repo" draggable="true" id="${repo.replace(/[\s,\/]/g, '')}"><div class="repo">${repo}</div>` +
            `<ul>`;
        for (let issueIndex of repos[repo]) {
            const i = issues[issueIndex];
            result += renderIssue(i, ignoreRelNotes);
        }
        const files = Array.from(filesByRepo[repo] || []).map(f => f.split('/').slice(-1)[0]).sort();
        result += `<li title="${files.join('\n')}">Files: ${files.length > 0 ? files.slice(0, 5).join(', ') +
            (files.length > 5 ? ' <b>+' + (files.length - 5) + ' more</b>' : '')
            : 'N/A'}</li>`;
        result += `<li><textarea rows="1" class="callouts hidden">${localStorage.getItem(repo)?.trim() || ''}</textarea>
                    <p class="callouts">${localStorage.getItem(repo)?.trim() || PLACEHOLDER}</p>
                    </li>
                    </ul>
                    </li>`;
        return result;
    }

})()