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

    function initialize() {
        if (githubToken) {
            tokenInput.value = githubToken;
            authSection.style.display = 'none';
            if (uploaderSection) {
                uploaderSection.style.display = 'block';
                initUploaderPage();
            }
            if (managerSection) {
                managerSection.style.display = 'block';
                initManagerPage();
            }
        }
    }

    function saveToken() {
        if (tokenInput.value) {
            githubToken = tokenInput.value;
            localStorage.setItem('githubToken', githubToken);
            initialize();
        }
    }

    if (saveTokenBtn) saveTokenBtn.addEventListener('click', saveToken);
    
    initialize();

    async function githubApiRequest(endpoint, method = 'GET', body = null) {
        const headers = { 'Authorization': `token ${githubToken}`, 'Accept': 'application/vnd.github.v3+json' };
        const options = { method, headers };
        if (body) options.body = JSON.stringify(body);
        const response = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/${endpoint}`, options);
        if (!response.ok) throw new Error(`GitHub API Error (${response.status}): ${(await response.json()).message}`);
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
        return await githubApiRequest(`contents/${path}`, 'PUT', { message, content: btoa(unescape(encodeURIComponent(newContent))), sha });
    }
    
    async function deleteFile(path, message, sha) {
        return await githubApiRequest(`contents/${path}`, 'DELETE', { message, sha });
    }

    function logStatus(message) {
        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
        const statusLog = document.getElementById('status-log');
        if (statusLog) statusLog.textContent = `[${timestamp}] ${message}\n` + statusLog.textContent;
    }

    async function calculateHash(file) {
        const buffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
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
        const uploadPrompt = document.getElementById('upload-prompt');

        let managedTags = JSON.parse(localStorage.getItem('managedTags')) || ['Reddit', 'Modi', 'Cat', 'Dog', '18+'];
        let pendingMemes = JSON.parse(localStorage.getItem('pendingMemes')) || {};
        let selectedFiles = new Map();

        const updateUIState = () => {
            uploadPrompt.style.display = Object.keys(pendingMemes).length === 0 ? 'block' : 'none';
            submitBtn.disabled = selectedFiles.size === 0 || selectedFiles.size !== Object.keys(pendingMemes).length;
        };

        const updateManagedTagsUI = () => {
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
        };

        const addManagedTag = () => {
            const newTag = tagManagerInput.value.trim();
            if (newTag && !managedTags.includes(newTag)) {
                managedTags.push(newTag);
                localStorage.setItem('managedTags', JSON.stringify(managedTags));
                updateManagedTagsUI();
                tagManagerInput.value = '';
            }
        };

        const clearAllPreviews = () => {
            pendingMemes = {};
            localStorage.removeItem('pendingMemes');
            selectedFiles.clear();
            previewsContainer.innerHTML = '';
            memeFilesInput.value = '';
            updateUIState();
        };

        const createMemePreview = (file, dataUrl) => {
            const id = file.name;
            if (document.getElementById(`preview-${id}`)) return;

            selectedFiles.set(id, file);

            const card = document.createElement('div');
            card.className = 'meme-preview-card';
            card.id = `preview-${id}`;
            card.innerHTML = `
                <button class="remove-btn">X</button>
                <img src="${dataUrl}" alt="Preview of ${id}">
                <label>Title</label>
                <input type="text" placeholder="Enter meme title" value="${pendingMemes[id]?.title || ''}">
                <label>Tags (space-separated)</label>
                <input type="text" list="tag-suggestions" placeholder="e.g., Cat reddit 18+" value="${pendingMemes[id]?.tags || ''}">
                <div class="clickable-tags-container"></div>
            `;
            previewsContainer.appendChild(card);

            card.querySelector('.remove-btn').onclick = () => {
                delete pendingMemes[id];
                selectedFiles.delete(id);
                localStorage.setItem('pendingMemes', JSON.stringify(pendingMemes));
                card.remove();
                updateUIState();
            };

            const titleInput = card.querySelector('input[type="text"]');
            const tagsInput = card.querySelectorAll('input[type="text"]')[1];

            const saveState = () => {
                pendingMemes[id] = { title: titleInput.value, tags: tagsInput.value, dataUrl };
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
                    currentTags.has(tag) ? currentTags.delete(tag) : currentTags.add(tag);
                    tagsInput.value = Array.from(currentTags).join(' ');
                    saveState();
                };
                clickableTagsContainer.appendChild(tagBtn);
            });
            saveState();
            updateUIState();
        };
        
        const loadFromLocalStorage = () => {
            previewsContainer.innerHTML = '';
            for (const id in pendingMemes) {
                const card = document.createElement('div');
                card.className = 'meme-preview-card is-pending';
                card.id = `preview-${id}`;
                card.innerHTML = `
                    <div class="card-overlay">Please re-select this file to upload.</div>
                    <img src="${pendingMemes[id].dataUrl}" alt="Preview of ${id}">
                    <label>Title</label>
                    <input type="text" value="${pendingMemes[id].title}" disabled>
                    <label>Tags</label>
                    <input type="text" value="${pendingMemes[id].tags}" disabled>
                `;
                previewsContainer.appendChild(card);
            }
             updateUIState();
        };

        const handleFileSelection = (event) => {
            previewsContainer.innerHTML = ''; 
            selectedFiles.clear();
            for (const file of event.target.files) {
                const reader = new FileReader();
                reader.onload = (e) => createMemePreview(file, e.target.result);
                reader.readAsDataURL(file);
            }
        };

        async function handleSubmitAll() {
            submitBtn.disabled = true;
            logStatus('Starting submission process...');

            try {
                const { content: existingHashesContent } = await getFileContent(hashesTxtPath);
                const approvedHashes = new Set(existingHashesContent.split('\n').filter(Boolean));
                logStatus(`Loaded ${approvedHashes.size} existing hashes.`);

                const filesToProcess = Array.from(selectedFiles.values());
                if (filesToProcess.length === 0) throw new Error("No valid files to submit.");
                
                const allResults = [];
                for (let i = 0; i < filesToProcess.length; i++) {
                    const file = filesToProcess[i];
                    const current = i + 1;
                    const total = filesToProcess.length;
                    const id = file.name;
                    const memeData = pendingMemes[id];
                    
                    if (!memeData || !memeData.title || !memeData.tags) {
                        logStatus(`(${current}/${total}) Skipping ${id}: Missing data.`);
                        continue;
                    }

                    logStatus(`(${current}/${total}) Processing ${id}...`);
                    const hash = await calculateHash(file);

                    if (approvedHashes.has(hash)) {
                        logStatus(`(${current}/${total}) Skipping ${id}: Duplicate hash.`);
                        continue;
                    }

                    const tagsArray = memeData.tags.split(' ').filter(Boolean);
                    const folderName = tagsArray.length > 0 ? tagsArray[0] : 'Uncategorized';
                    const filePath = `${memesFolderPath}/${folderName}/${id}`;
                    
                    const fileContent = await new Promise(r => {
                        const reader = new FileReader();
                        reader.onload = e => r(e.target.result.split(',')[1]);
                        reader.readAsDataURL(file);
                    });
                    
                    const uploadResult = await githubApiRequest(`contents/${filePath}`, 'PUT', { message: `feat: Add new meme ${id}`, content: fileContent });
                    
                    logStatus(`(${current}/${total}) Uploaded ${id}`);
                    approvedHashes.add(hash);
                    allResults.push({
                        entry: { name: memeData.title, url: uploadResult.content.download_url, tags: tagsArray },
                        hash: hash,
                    });
                }
                
                if (allResults.length > 0) {
                    const newMemeEntries = allResults.map(r => r.entry);
                    const newHashes = allResults.map(r => r.hash);
                    
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
        loadFromLocalStorage();
        memeFilesInput.addEventListener('change', handleFileSelection);
        addTagBtn.addEventListener('click', addManagedTag);
        submitBtn.addEventListener('click', handleSubmitAll);
        clearAllBtn.addEventListener('click', clearAllPreviews);
    }
    
    function initManagerPage() {
        const searchInput = document.getElementById('search-input');
        const container = document.getElementById('manager-container');
        const statusEl = document.getElementById('manager-status');
        let allMemes = [];

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
            if (filteredMemes.length === 0) statusEl.textContent = 'No memes found.';

            filteredMemes.forEach(meme => {
                const card = document.createElement('div');
                card.className = 'manager-meme-card';
                card.innerHTML = `
                    <img src="${meme.url}" alt="${meme.name}">
                    <label>Title</label>
                    <input type="text" value="${meme.name}" readonly>
                    <label>Tags (space-separated)</label>
                    <input type="text" value="${meme.tags.join(' ')}" readonly>
                    <div class="actions">
                        <button class="edit btn-secondary">Edit</button>
                        <button class="delete btn-danger">Delete</button>
                        <button class="save" style="display:none;">Save</button>
                        <button class="cancel btn-secondary" style="display:none;">Cancel</button>
                    </div>`;
                container.appendChild(card);

                const titleInput = card.querySelector('input[type="text"]');
                const tagsInput = card.querySelectorAll('input[type="text"]')[1];
                const editBtn = card.querySelector('.edit');
                const deleteBtn = card.querySelector('.delete');
                const saveBtn = card.querySelector('.save');
                const cancelBtn = card.querySelector('.cancel');

                const toggleEdit = (isEditing) => {
                    titleInput.readOnly = !isEditing;
                    tagsInput.readOnly = !isEditing;
                    editBtn.style.display = isEditing ? 'none' : 'inline-block';
                    deleteBtn.style.display = isEditing ? 'none' : 'inline-block';
                    saveBtn.style.display = isEditing ? 'inline-block' : 'none';
                    cancelBtn.style.display = isEditing ? 'inline-block' : 'none';
                };

                editBtn.onclick = () => toggleEdit(true);
                cancelBtn.onclick = () => {
                    titleInput.value = meme.name;
                    tagsInput.value = meme.tags.join(' ');
                    toggleEdit(false);
                };

                deleteBtn.onclick = async () => {
                    if (!confirm(`Are you sure you want to delete "${meme.name}"?`)) return;
                    try {
                        statusEl.textContent = `Deleting ${meme.name}...`;
                        const originalIndex = allMemes.findIndex(m => m.url === meme.url);
                        allMemes.splice(originalIndex, 1);
                        
                        const { sha } = await getFileContent(memesJsonPath);
                        await updateFile(memesJsonPath, JSON.stringify(allMemes, null, 2), `refactor: Delete meme ${meme.name}`, sha);

                        try {
                            const filePath = new URL(meme.url).pathname.split('/').slice(3).join('/');
                            const { sha: fileSha } = await getFileContent(filePath);
                            if (fileSha) await deleteFile(filePath, `refactor: Delete asset for ${meme.name}`, fileSha);
                        } catch (assetError) {
                            console.warn(`Could not delete asset for ${meme.name}: ${assetError.message}`);
                        }

                        statusEl.textContent = `Successfully deleted ${meme.name}.`;
                        card.remove();
                    } catch(e) {
                         statusEl.textContent = `Error deleting: ${e.message}`;
                         loadMemes();
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
                        meme.name = titleInput.value;
                        meme.tags = tagsInput.value.split(' ').filter(Boolean);
                        toggleEdit(false);
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