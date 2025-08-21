document.addEventListener('DOMContentLoaded', () => {
    const repoOwner = 'ele-jar'; 
    const repoName = 'meme-database';
    const memesJsonPath = 'memes.json';
    const hashesTxtPath = 'approved_hashes.txt';
    const memesFolderPath = 'Memes';

    const tokenInput = document.getElementById('github-token');
    const saveTokenBtn = document.getElementById('save-token');
    const authSection = document.getElementById('auth-section');

    const uploaderSection = document.getElementById('uploader-section');
    const managerSection = document.getElementById('manager-section');
    
    let githubToken = localStorage.getItem('githubToken');
    let allMemes = [];
    
    function initializeAuth() {
        if (githubToken) {
            tokenInput.value = githubToken;
            authSection.style.display = 'none';
            if (uploaderSection) uploaderSection.style.display = 'block';
            if (managerSection) managerSection.style.display = 'block';
            return true;
        }
        return false;
    }

    function saveToken() {
        if (tokenInput.value) {
            githubToken = tokenInput.value;
            localStorage.setItem('githubToken', githubToken);
            authSection.style.display = 'none';
            if (uploaderSection) uploaderSection.style.display = 'block';
            if (managerSection) managerSection.style.display = 'block';
            if (managerSection) initManagerPage();
        }
    }
    
    saveTokenBtn.addEventListener('click', saveToken);

    if (initializeAuth()) {
        if (uploaderSection) initUploaderPage();
        if (managerSection) initManagerPage();
    }

    async function githubApiRequest(endpoint, method = 'GET', body = null) {
        const headers = {
            'Authorization': `token ${githubToken}`,
            'Accept': 'application/vnd.github.v3+json',
        };
        const options = { method, headers };
        if (body) options.body = JSON.stringify(body);
        
        const response = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/${endpoint}`, options);
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(`GitHub API Error (${response.status}): ${error.message}`);
        }
        if (response.status === 204 || response.headers.get('Content-Length') === '0') return null;
        return response.json();
    }

    async function getFileContent(path) {
        try {
            const data = await githubApiRequest(`contents/${path}`);
            return { content: atob(data.content), sha: data.sha };
        } catch (e) {
            if (e.message.includes("404")) return { content: '', sha: null };
            throw e;
        }
    }

    async function updateFile(path, newContent, message, sha) {
        return await githubApiRequest(`contents/${path}`, 'PUT', {
            message,
            content: btoa(newContent),
            sha,
        });
    }

    async function deleteFile(path, message, sha) {
        return await githubApiRequest(`contents/${path}`, 'DELETE', {
            message,
            sha,
        });
    }

    function logStatus(message) {
        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const statusLog = document.getElementById('status-log');
        if (statusLog) {
            statusLog.textContent = `[${timestamp}] ${message}\n` + statusLog.textContent;
        }
    }

    async function calculateHash(file) {
        const buffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function initUploaderPage() {
        const memeFilesInput = document.getElementById('meme-files');
        const previewsContainer = document.getElementById('meme-previews');
        const submitBtn = document.getElementById('submit-all');
        const tagManagerInput = document.getElementById('tag-manager-input');
        const addTagBtn = document.getElementById('add-tag-btn');
        const managedTagsContainer = document.getElementById('managed-tags-container');
        const tagSuggestionsList = document.getElementById('tag-suggestions');
        const clearAllBtn = document.getElementById('clear-all-btn');

        let managedTags = JSON.parse(localStorage.getItem('managedTags')) || ['Reddit', 'Modi', 'Cat', 'Dog', '18+'];
        let pendingMemes = JSON.parse(localStorage.getItem('pendingMemes')) || {};

        function updateManagedTagsUI() {
            managedTagsContainer.innerHTML = '';
            tagSuggestionsList.innerHTML = '';
            managedTags.forEach(tag => {
                const tagEl = document.createElement('span');
                tagEl.className = 'managed-tag';
                tagEl.textContent = tag;
                managedTagsContainer.appendChild(tagEl);
                const optionEl = document.createElement('option');
                optionEl.value = tag;
                tagSuggestionsList.appendChild(optionEl);
            });
        }
        
        function addManagedTag() {
            const newTag = tagManagerInput.value.trim();
            if (newTag && !managedTags.includes(newTag)) {
                managedTags.push(newTag);
                localStorage.setItem('managedTags', JSON.stringify(managedTags));
                updateManagedTagsUI();
                tagManagerInput.value = '';
            }
        }
        
        function clearAllPreviews() {
            pendingMemes = {};
            localStorage.removeItem('pendingMemes');
            previewsContainer.innerHTML = '';
            memeFilesInput.value = '';
        }

        function createMemePreview(file) {
            const id = file.name;
            if (document.getElementById(`preview-${id}`)) return;
            
            const reader = new FileReader();
            reader.onload = (e) => {
                const dataUrl = e.target.result;
                const card = document.createElement('div');
                card.className = 'meme-preview-card';
                card.id = `preview-${id}`;
                card.innerHTML = `
                    <div class="card-header">
                        <label>${id}</label>
                        <button class="secondary danger">X</button>
                    </div>
                    <img src="${dataUrl}" alt="Meme preview">
                    <label>Title</label>
                    <input type="text" placeholder="Auto-filled from filename..." value="${pendingMemes[id]?.title || file.name.split('.').slice(0, -1).join('.').replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}">
                    <label>Tags (space-separated)</label>
                    <input type="text" list="tag-suggestions" placeholder="e.g., Cat reddit 18+" value="${pendingMemes[id]?.tags || ''}">
                    <div class="clickable-tags-container"></div>
                `;
                previewsContainer.appendChild(card);
                
                const removeBtn = card.querySelector('button');
                removeBtn.onclick = () => {
                    delete pendingMemes[id];
                    localStorage.setItem('pendingMemes', JSON.stringify(pendingMemes));
                    card.remove();
                };

                const titleInput = card.querySelector('input[type="text"]');
                const tagsInput = card.querySelectorAll('input[type="text"]')[1];
                
                const saveState = () => {
                    pendingMemes[id] = { title: titleInput.value, tags: tagsInput.value };
                    localStorage.setItem('pendingMemes', JSON.stringify(pendingMemes));
                };
                
                titleInput.oninput = saveState;
                tagsInput.oninput = saveState;

                const clickableTagsContainer = card.querySelector('.clickable-tags-container');
                managedTags.forEach(tag => {
                    const tagBtn = document.createElement('span');
                    tagBtn.className = 'clickable-tag';
                    tagBtn.textContent = tag;
                    tagBtn.onclick = () => {
                        const currentTags = new Set(tagsInput.value.split(' ').filter(Boolean));
                        currentTags.add(tag);
                        tagsInput.value = Array.from(currentTags).join(' ');
                        saveState();
                    };
                    clickableTagsContainer.appendChild(tagBtn);
                });
                saveState();
            };
            reader.readAsDataURL(file);
        }

        async function processFileUpload(file, approvedHashes, current, total) {
            const id = file.name;
            const memeData = pendingMemes[id];
            
            if (!memeData || !memeData.title || !memeData.tags) {
                logStatus(`(${current}/${total}) Skipping ${id}: Missing title or tags.`);
                return null;
            }

            logStatus(`(${current}/${total}) Processing ${id}...`);
            const hash = await calculateHash(file);

            if (approvedHashes.has(hash)) {
                logStatus(`(${current}/${total}) Skipping ${id}: Duplicate hash detected.`);
                return null;
            }

            const tagsArray = memeData.tags.split(' ').filter(Boolean);
            const folderName = tagsArray.length > 0 ? tagsArray[0] : 'Uncategorized';
            const filePath = `${memesFolderPath}/${folderName}/${id}`;
            
            const fileContent = await file.arrayBuffer().then(buffer => btoa(String.fromCharCode(...new Uint8Array(buffer))));

            const uploadResult = await githubApiRequest(`contents/${filePath}`, 'PUT', {
                message: `feat: Add new meme ${id}`,
                content: fileContent,
            });

            logStatus(`(${current}/${total}) Uploaded ${id} successfully.`);
            approvedHashes.add(hash); 
            
            return {
                entry: {
                    name: memeData.title,
                    url: uploadResult.content.download_url,
                    tags: tagsArray,
                },
                hash: hash,
            };
        }

        async function handleSubmitAll() {
            submitBtn.disabled = true;
            logStatus('Starting submission process...');

            try {
                const { content: existingHashesContent } = await getFileContent(hashesTxtPath);
                const approvedHashes = new Set(existingHashesContent.split('\n').filter(Boolean));
                logStatus(`Loaded ${approvedHashes.size} existing hashes.`);

                const filesToProcess = Array.from(memeFilesInput.files);
                if (filesToProcess.length === 0) throw new Error("No files selected.");
                
                const allResults = [];
                const batchSize = 5;
                for (let i = 0; i < filesToProcess.length; i += batchSize) {
                    const batch = filesToProcess.slice(i, i + batchSize);
                    const promises = batch.map((file, index) => processFileUpload(file, approvedHashes, i + index + 1, filesToProcess.length));
                    const batchResults = await Promise.all(promises);
                    allResults.push(...batchResults.filter(Boolean));
                }
                
                const newMemeEntries = allResults.map(r => r.entry);
                const newHashes = allResults.map(r => r.hash);
                
                if (newMemeEntries.length > 0) {
                    logStatus(`Updating database with ${newMemeEntries.length} new memes...`);
                    const { content: memesJsonContent, sha: memesJsonSha } = await getFileContent(memesJsonPath);
                    const memes = memesJsonContent ? JSON.parse(memesJsonContent) : [];
                    const updatedMemes = [...newMemeEntries, ...memes];
                    await updateFile(memesJsonPath, JSON.stringify(updatedMemes, null, 2), `feat: Add ${newMemeEntries.length} new memes`, memesJsonSha);
                    logStatus('memes.json updated.');

                    const { sha: hashesTxtSha } = await getFileContent(hashesTxtPath);
                    const updatedHashesContent = existingHashesContent + '\n' + newHashes.join('\n');
                    await updateFile(hashesTxtPath, updatedHashesContent.trim(), `chore: Update hashes for ${newHashes.length} memes`, hashesTxtSha);
                    logStatus('approved_hashes.txt updated.');
                }
                
                logStatus('✅ Submission complete!');
                clearAllPreviews();

            } catch (error) {
                logStatus(`❌ ERROR: ${error.message}`);
            } finally {
                submitBtn.disabled = false;
            }
        }

        updateManagedTagsUI();
        memeFilesInput.addEventListener('change', (e) => Array.from(e.target.files).forEach(createMemePreview));
        addTagBtn.addEventListener('click', addManagedTag);
        submitBtn.addEventListener('click', handleSubmitAll);
        clearAllBtn.addEventListener('click', clearAllPreviews);
    }

    function initManagerPage() {
        const searchInput = document.getElementById('search-input');
        const container = document.getElementById('manager-container');
        const statusEl = document.getElementById('manager-status');

        async function loadMemes() {
            try {
                statusEl.textContent = 'Loading memes from GitHub...';
                const { content } = await getFileContent(memesJsonPath);
                allMemes = content ? JSON.parse(content) : [];
                statusEl.textContent = `Loaded ${allMemes.length} memes.`;
                renderMemes();
            } catch (e) {
                statusEl.textContent = `Error loading memes: ${e.message}`;
            }
        }

        function renderMemes(filter = '') {
            container.innerHTML = '';
            const filteredMemes = allMemes.filter(meme => 
                meme.name.toLowerCase().includes(filter) || 
                meme.tags.join(' ').toLowerCase().includes(filter)
            );

            if (filteredMemes.length === 0 && filter) {
                container.textContent = 'No memes match your search.';
            }

            filteredMemes.forEach((meme, index) => {
                const card = document.createElement('div');
                card.className = 'manager-meme-card';
                card.innerHTML = `
                    <img src="${meme.url}" alt="${meme.name}">
                    <div class="content">
                        <label>Title</label>
                        <input type="text" value="${meme.name}" readonly>
                        <label>Tags (space-separated)</label>
                        <input type="text" value="${meme.tags.join(' ')}" readonly>
                    </div>
                    <div class="actions">
                        <button class="edit secondary">Edit</button>
                        <button class="delete danger">Delete</button>
                        <button class="save" style="display:none;">Save</button>
                        <button class="cancel secondary" style="display:none;">Cancel</button>
                    </div>`;
                container.appendChild(card);

                const editBtn = card.querySelector('.edit');
                const deleteBtn = card.querySelector('.delete');
                const saveBtn = card.querySelector('.save');
                const cancelBtn = card.querySelector('.cancel');
                const titleInput = card.querySelector('input[type="text"]');
                const tagsInput = card.querySelectorAll('input[type="text"]')[1];

                editBtn.onclick = () => {
                    card.classList.add('editing');
                    titleInput.readOnly = false;
                    tagsInput.readOnly = false;
                    editBtn.style.display = 'none';
                    deleteBtn.style.display = 'none';
                    saveBtn.style.display = 'inline-block';
                    cancelBtn.style.display = 'inline-block';
                };

                cancelBtn.onclick = () => {
                    card.classList.remove('editing');
                    titleInput.readOnly = true;
                    tagsInput.readOnly = true;
                    titleInput.value = meme.name;
                    tagsInput.value = meme.tags.join(' ');
                    editBtn.style.display = 'inline-block';
                    deleteBtn.style.display = 'inline-block';
                    saveBtn.style.display = 'none';
                    cancelBtn.style.display = 'none';
                };

                deleteBtn.onclick = async () => {
                    if (confirm(`Are you sure you want to delete "${meme.name}"? This cannot be undone.`)) {
                        try {
                            statusEl.textContent = `Deleting ${meme.name}...`;
                            
                            const originalIndex = allMemes.findIndex(m => m.url === meme.url);
                            allMemes.splice(originalIndex, 1);
                            
                            const { sha } = await getFileContent(memesJsonPath);
                            await updateFile(memesJsonPath, JSON.stringify(allMemes, null, 2), `refactor: Delete meme ${meme.name}`, sha);

                            const filePath = new URL(meme.url).pathname.substring(1).split('/').slice(4).join('/');
                            const { sha: fileSha } = await getFileContent(filePath);
                            if (fileSha) {
                                await deleteFile(filePath, `refactor: Delete meme asset for ${meme.name}`, fileSha);
                            }
                            
                            statusEl.textContent = `Successfully deleted ${meme.name}.`;
                            card.remove();
                        } catch(e) {
                             statusEl.textContent = `Error deleting: ${e.message}`;
                             loadMemes();
                        }
                    }
                };

                saveBtn.onclick = async () => {
                     try {
                        statusEl.textContent = `Saving ${meme.name}...`;
                        const originalIndex = allMemes.findIndex(m => m.url === meme.url);
                        allMemes[originalIndex].name = titleInput.value;
                        allMemes[originalIndex].tags = tagsInput.value.split(' ').filter(Boolean);

                        const { sha } = await getFileContent(memesJsonPath);
                        await updateFile(memesJsonPath, JSON.stringify(allMemes, null, 2), `refactor: Update meme ${meme.name}`, sha);

                        statusEl.textContent = `Successfully updated ${meme.name}.`;
                        cancelBtn.click();
                     } catch(e) {
                         statusEl.textContent = `Error saving: ${e.message}`;
                         loadMemes();
                     }
                };
            });
        }
        
        searchInput.addEventListener('input', () => renderMemes(searchInput.value.toLowerCase()));
        loadMemes();
    }
});
