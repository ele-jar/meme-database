document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIGURATION ---
    const repoOwner = 'ele-jar'; // Your GitHub username
    const repoName = 'meme-database'; // The name of your meme database repository
    const memesJsonPath = 'memes.json';
    const hashesTxtPath = 'approved_hashes.txt';
    const memesFolderPath = 'Memes';

    // --- DOM ELEMENTS ---
    const tokenInput = document.getElementById('github-token');
    const saveTokenBtn = document.getElementById('save-token');
    const authSection = document.getElementById('auth-section');
    const uploaderSection = document.getElementById('uploader-section');
    const memeFilesInput = document.getElementById('meme-files');
    const previewsContainer = document.getElementById('meme-previews');
    const submitBtn = document.getElementById('submit-all');
    const statusLog = document.getElementById('status-log');
    const tagManagerInput = document.getElementById('tag-manager-input');
    const addTagBtn = document.getElementById('add-tag-btn');
    const managedTagsContainer = document.getElementById('managed-tags-container');
    const tagSuggestionsList = document.getElementById('tag-suggestions');

    // --- STATE & LOCAL STORAGE ---
    let githubToken = localStorage.getItem('githubToken');
    let managedTags = JSON.parse(localStorage.getItem('managedTags')) || ['Reddit', 'Modi', 'Cat', 'Dog', '18+'];
    let pendingMemes = JSON.parse(localStorage.getItem('pendingMemes')) || {};

    // --- INITIALIZATION ---
    function initialize() {
        if (githubToken) {
            tokenInput.value = githubToken;
            authSection.style.display = 'none';
            uploaderSection.style.display = 'block';
        }
        updateManagedTagsUI();
        loadPendingMemesFromStorage();
        setupEventListeners();
    }

    function setupEventListeners() {
        saveTokenBtn.addEventListener('click', saveToken);
        addTagBtn.addEventListener('click', addManagedTag);
        memeFilesInput.addEventListener('change', handleFileSelection);
        submitBtn.addEventListener('click', handleSubmitAll);
    }

    // --- AUTHENTICATION ---
    function saveToken() {
        if (tokenInput.value) {
            githubToken = tokenInput.value;
            localStorage.setItem('githubToken', githubToken);
            authSection.style.display = 'none';
            uploaderSection.style.display = 'block';
            logStatus('Token saved. You can now upload memes.');
        } else {
            alert('Please enter a token.');
        }
    }

    // --- TAG MANAGEMENT ---
    function addManagedTag() {
        const newTag = tagManagerInput.value.trim();
        if (newTag && !managedTags.includes(newTag)) {
            managedTags.push(newTag);
            localStorage.setItem('managedTags', JSON.stringify(managedTags));
            updateManagedTagsUI();
            tagManagerInput.value = '';
        }
    }

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

    // --- FILE HANDLING & PREVIEWS ---
    function handleFileSelection(event) {
        for (const file of event.target.files) {
            const reader = new FileReader();
            reader.onload = (e) => {
                createMemePreview(file, e.target.result);
            };
            reader.readAsDataURL(file);
        }
    }
    
    function createMemePreview(file, dataUrl) {
        const id = file.name; // Use filename as a unique ID
        if (document.getElementById(`preview-${id}`)) return; // Don't add duplicates

        const card = document.createElement('div');
        card.className = 'meme-preview-card';
        card.id = `preview-${id}`;
        card.dataset.id = id;

        const img = document.createElement('img');
        img.src = dataUrl;
        
        const titleLabel = document.createElement('label');
        titleLabel.textContent = 'Title';
        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.placeholder = 'Enter meme title';
        titleInput.value = pendingMemes[id]?.title || '';
        titleInput.oninput = () => savePendingMeme(id, 'title', titleInput.value, file, dataUrl);

        const tagsLabel = document.createElement('label');
        tagsLabel.textContent = 'Tags (space-separated)';
        const tagsInput = document.createElement('input');
        tagsInput.type = 'text';
        tagsInput.placeholder = 'e.g., Cat reddit 18+';
        tagsInput.setAttribute('list', 'tag-suggestions'); // For autocomplete
        tagsInput.value = pendingMemes[id]?.tags || '';
        tagsInput.oninput = () => savePendingMeme(id, 'tags', tagsInput.value, file, dataUrl);
        
        card.append(img, titleLabel, titleInput, tagsLabel, tagsInput);
        previewsContainer.appendChild(card);
        
        // Save initial state
        savePendingMeme(id, 'title', titleInput.value, file, dataUrl);
        savePendingMeme(id, 'tags', tagsInput.value, file, dataUrl);
    }
    
    // --- LOCAL STORAGE FOR PENDING MEMES ---
    function savePendingMeme(id, field, value, file, dataUrl) {
        if (!pendingMemes[id]) {
            pendingMemes[id] = { file: null, dataUrl, title: '', tags: '' };
        }
        pendingMemes[id][field] = value;
        // We can't store the File object, but we can store the dataUrl to rebuild it.
        localStorage.setItem('pendingMemes', JSON.stringify(pendingMemes));
    }

    function loadPendingMemesFromStorage() {
        for (const id in pendingMemes) {
            const data = pendingMemes[id];
            // Recreate file object from dataUrl (a bit tricky, simpler to just re-select)
            // For now, we just restore the UI. The user will need to re-select files if they refresh.
            // A more robust solution would store files in IndexedDB, but this is simpler.
            createMemePreview({ name: id }, data.dataUrl);
        }
        // Let's clear the files input to encourage re-selection to ensure we have the file object.
        memeFilesInput.value = '';
        logStatus('Pending edits loaded. Please re-select your files to enable submission.')
    }

    // --- HASHING ---
    async function calculateHash(file) {
        const buffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // --- GITHUB API HELPERS ---
    async function githubApiRequest(endpoint, method, body) {
        const response = await fetch(`https://api.github.com/repos/${repoOwner}/${repoName}/${endpoint}`, {
            method,
            headers: {
                'Authorization': `token ${githubToken}`,
                'Accept': 'application/vnd.github.v3+json',
            },
            body: body ? JSON.stringify(body) : null,
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(`GitHub API Error (${response.status}): ${error.message}`);
        }
        return response.json();
    }

    async function getFileContent(path) {
        try {
            const data = await githubApiRequest(`contents/${path}`, 'GET');
            return { content: atob(data.content), sha: data.sha };
        } catch (e) {
            if (e.message.includes("404")) return { content: '', sha: null }; // File doesn't exist
            throw e;
        }
    }

    async function uploadFile(path, content, sha) {
        const message = sha ? `Update ${path}` : `Create ${path}`;
        const body = {
            message,
            content: btoa(content), // Base64 encode content
            sha: sha, // Include SHA if updating an existing file
        };
        return await githubApiRequest(`contents/${path}`, 'PUT', body);
    }

    // --- SUBMISSION LOGIC ---
    async function handleSubmitAll() {
        submitBtn.disabled = true;
        logStatus('Starting submission process...');

        try {
            const { content: existingHashesContent } = await getFileContent(hashesTxtPath);
            const approvedHashes = new Set(existingHashesContent.split('\n').filter(h => h));
            logStatus(`Loaded ${approvedHashes.size} existing hashes.`);

            const newMemeEntries = [];
            let newHashes = [];

            const files = memeFilesInput.files;
            if (files.length === 0) {
                 throw new Error("No files selected. Please select the meme files again before submitting.");
            }

            for (const file of files) {
                const id = file.name;
                const memeData = pendingMemes[id];
                if (!memeData || !memeData.title || !memeData.tags) {
                    logStatus(`Skipping ${id}: Missing title or tags.`);
                    continue;
                }

                logStatus(`Processing ${id}...`);
                const hash = await calculateHash(file);

                if (approvedHashes.has(hash)) {
                    logStatus(`Skipping ${id}: Duplicate meme detected.`);
                    continue;
                }

                const tagsArray = memeData.tags.split(' ').filter(t => t);
                const folderName = tagsArray.length > 0 ? tagsArray[0] : 'Uncategorized';
                const filePath = `${memesFolderPath}/${folderName}/${id}`;
                
                // Read file content for upload
                const fileContent = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = e => resolve(e.target.result.split(',')[1]); // Get base64 part
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
                
                const uploadResult = await githubApiRequest(`contents/${filePath}`, 'PUT', {
                    message: `feat: Add new meme ${id}`,
                    content: fileContent
                });
                
                logStatus(`Uploaded ${id} successfully.`);

                newMemeEntries.push({
                    name: memeData.title,
                    url: uploadResult.content.download_url,
                    tags: tagsArray,
                });
                newHashes.push(hash);
                approvedHashes.add(hash); // Add to set to prevent duplicate uploads in the same batch
            }
            
            if (newMemeEntries.length > 0) {
                // Update memes.json
                logStatus('Updating memes.json...');
                const { content: memesJsonContent, sha: memesJsonSha } = await getFileContent(memesJsonPath);
                const memes = memesJsonContent ? JSON.parse(memesJsonContent) : [];
                const updatedMemes = [...memes, ...newMemeEntries];
                await uploadFile(memesJsonPath, JSON.stringify(updatedMemes, null, 2), memesJsonSha);
                logStatus('memes.json updated.');

                // Update approved_hashes.txt
                logStatus('Updating approved_hashes.txt...');
                const { sha: hashesTxtSha } = await getFileContent(hashesTxtPath);
                const updatedHashesContent = existingHashesContent + '\n' + newHashes.join('\n');
                await uploadFile(hashesTxtPath, updatedHashesContent.trim(), hashesTxtSha);
                logStatus('approved_hashes.txt updated.');
            }

            logStatus('✅ Submission complete!');
            
            // Cleanup
            localStorage.removeItem('pendingMemes');
            pendingMemes = {};
            previewsContainer.innerHTML = '';
            memeFilesInput.value = '';

        } catch (error) {
            logStatus(`❌ ERROR: ${error.message}`);
            console.error(error);
        } finally {
            submitBtn.disabled = false;
        }
    }
    
    function logStatus(message) {
        statusLog.textContent = `[${new Date().toLocaleTimeString()}] ${message}\n` + statusLog.textContent;
    }

    // --- START THE APP ---
    initialize();
});
