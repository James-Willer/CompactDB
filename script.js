document.addEventListener('DOMContentLoaded', async () => {
    let gameIndex = null;
    let searchTimeout;
    let isSearching = false;
    let isLoadingMore = false;

    let currentChunkPaths = [];
    let currentChunkIndex = 0;
    let intersectionObserver = null;
    let globalSeenGames = new Set();

    const resultsContainer = document.getElementById('results-container');
    const searchInput = document.getElementById('search-input');
    const searchButton = document.getElementById('search-button');
    const clearSearchButton = document.getElementById('clear-search-button'); // Added clear button
    const pageHeader = document.getElementById('page-header'); // Added page header

    async function loadGameIndex() {
        try {
            const response = await fetch('./data/game_index.json');
            if (!response.ok) {
                throw new Error(`Failed to load game_index.json: ${response.status} ${response.statusText}`);
            }
            gameIndex = await response.json();
            console.log('Game index loaded successfully.');
            displayInitialState(); // Display initial state after index loads
        } catch (error) {
            console.error('Error loading game index:', error);
            if (resultsContainer) {
                resultsContainer.innerHTML = `
                    <div class="error">
                        <i class="fas fa-exclamation-triangle"></i>
                        <h3>Failed to Load Game Data</h3>
                        <p>The essential game index could not be loaded. Please try refreshing the page.</p>
                    </div>`;
            }
        }
    }

    // New function to display initial welcoming state
    function displayInitialState() {
        if (resultsContainer) {
            resultsContainer.innerHTML = `
                <div class="initial-empty-state">
                    <i class="fas fa-hand-sparkles"></i>
                    <h3>Welcome to CompactDB!</h3>
                    <p>Start by searching for a game in the search bar above to view its compression analysis.</p>
                    <p>You can search by full or partial game names.</p>
                </div>
            `;
            // Reset page header to its original state if it was changed by a previous search
            if (pageHeader) {
                pageHeader.innerHTML = `
                    <h2>Compression Analysis</h2>
                    <p>View and analyze compression results from <a href="https://github.com/IridiumIO/CompactGUI" target="_blank" rel="noopener noreferrer">CompactGUI</a></p>
                `;
            }
        }
    }

    function getCompressionTypeName(type) {
        const typeNames = { 0: 'XPRESS4K', 1: 'XPRESS8K', 2: 'XPRESS16K', 3: 'LZX' };
        return typeNames[type] || `Unknown type ${type}`;
    }

    function formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function calculateSavings(before, after) {
        if (before === 0) return { value: (0).toFixed(1), color: '#6c757d' }; // Neutral color for no data
        const savings = ((before - after) / before * 100).toFixed(1);
        let color = '#4bb543'; // green
        if (savings < 20 && savings >= 0) color = '#f9c74f'; // yellow
        else if (savings < 0) color = '#ef476f'; // red
        return { value: savings, color };
    }

    function highlightMatches(text, terms) {
        if (!text || !terms || terms.length === 0) return text;
        const escapedTerms = terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const pattern = escapedTerms.join('|');
        const regex = new RegExp(`(${pattern})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    }

    function normalize(text) {
        if (!text) return '';
        return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    }

    function matchesSearchTerms(gameName, normalizedSearchTermsArray) {
        const normalizedGameName = normalize(gameName);
        const gameWords = normalizedGameName.split(' ').filter(Boolean);
        return normalizedSearchTermsArray.every(term => {
            return normalizedGameName.includes(term) || gameWords.some(word => word.includes(term));
        });
    }

    function createGameCard(game, searchTermsForHighlight) {
        const gameName = game.GameName || 'Unknown Game';
        const highlightedName = highlightMatches(gameName, searchTermsForHighlight);

        let bestResult = { savings: -Infinity, BeforeBytes: 0, AfterBytes: 0 };
        if (game.CompressionResults && game.CompressionResults.length > 0) {
            game.CompressionResults.forEach(result => {
                const currentSavings = result.BeforeBytes > 0 ? (result.BeforeBytes - result.AfterBytes) / result.BeforeBytes * 100 : -Infinity;
                if (currentSavings > bestResult.savings) {
                    bestResult = { ...result, savings: currentSavings };
                }
            });
        }
        
        const bestSavings = calculateSavings(bestResult.BeforeBytes, bestResult.AfterBytes);

        let html = `
            <div class="game-card">
                <div class="game-header">
                    <h3 class="game-name">${highlightedName}</h3>
                </div>
                <div class="compression-summary">
                    <div class="summary-item">
                        <span class="summary-label">Best Savings</span>
                        <span class="summary-value" style="color: ${bestSavings.color};">${bestSavings.value}%</span>
                    </div>
                    <div class="summary-item">
                        <span class="summary-label">Original Size</span>
                        <span class="summary-value">${formatBytes(bestResult.BeforeBytes)}</span>
                    </div>
                    <div class="summary-item">
                        <span class="summary-label">Compressed</span>
                        <span class="summary-value">${formatBytes(bestResult.AfterBytes)}</span>
                    </div>
                </div>
                <div class="compression-details">
                    <h4>Compression Details</h4>
                    <table class="results-table">
                        <thead>
                            <tr><th>Type</th><th>Before</th><th>After</th><th>Savings</th><th>Entries</th></tr>
                        </thead>
                        <tbody>`;
        (game.CompressionResults || []).forEach(result => {
            const savings = calculateSavings(result.BeforeBytes, result.AfterBytes);
            html += `
                <tr>
                    <td>${getCompressionTypeName(result.CompType)}</td>
                    <td>${formatBytes(result.BeforeBytes)}</td>
                    <td>${formatBytes(result.AfterBytes)}</td>
                    <td style="color: ${savings.color}">${savings.value}%</td>
                    <td>${result.TotalResults || 0}</td>
                </tr>`;
        });
        html += `</tbody></table></div>`;

        const poorlyCompressed = game.PoorlyCompressedExtensions || {};
        if (Object.keys(poorlyCompressed).length > 0) {
            html += `
                <div class="extension-list">
                    <h4>Inefficient File Types</h4>
                    <div class="extension-grid">
                        ${Object.entries(poorlyCompressed)
                            .sort((a, b) => b[1] - a[1])
                            .map(([ext, count]) => `
                                <div class="extension-item">
                                    <span class="extension-name">${ext}</span>
                                    <span class="extension-count">${count} files</span>
                                </div>`)
                            .join('')}
                    </div>
                </div>`;
        }
        html += `</div>`;
        return html;
    }

    async function getTotalResultsCount(pathsToScan, normalizedSearchTermsForCount) {
        const uniqueGameNamesForCount = new Set();
        const chunkPromises = pathsToScan.map(async (path) => {
            try {
                const response = await fetch(path);
                if (!response.ok) {
                    console.warn(`Pre-count: Failed to fetch chunk ${path}: ${response.status}`);
                    return [];
                }
                return await response.json();
            } catch (err) {
                console.error(`Pre-count: Error fetching chunk ${path}:`, err);
                return [];
            }
        });

        const settledResults = await Promise.allSettled(chunkPromises);

        for (const result of settledResults) {
            if (result.status === 'fulfilled' && Array.isArray(result.value)) {
                const gamesInChunk = result.value;
                for (const game of gamesInChunk) {
                    if (matchesSearchTerms(game.GameName || '', normalizedSearchTermsForCount)) {
                        uniqueGameNamesForCount.add(game.GameName);
                    }
                }
            }
        }
        return uniqueGameNamesForCount.size;
    }

    async function loadAndDisplayChunks(originalSearchTerm, normalizedSearchTerms, termsForHighlight) {
        if (isLoadingMore) return;
        isLoadingMore = true;

        const existingSentinel = resultsContainer.querySelector('#lazy-load-sentinel');
        if (existingSentinel) existingSentinel.remove();

        let newCardsAddedCount = 0;
        const CHUNK_BATCH_SIZE = 1;

        for (let i = 0; i < CHUNK_BATCH_SIZE && currentChunkIndex < currentChunkPaths.length; i++) {
            const chunkPath = currentChunkPaths[currentChunkIndex];
            
            try {
                const response = await fetch(chunkPath);
                currentChunkIndex++;
                if (!response.ok) {
                    console.warn(`Failed to fetch chunk ${chunkPath}: ${response.status} ${response.statusText}`);
                    continue;
                }
                const gamesInChunk = await response.json();
                const fragment = document.createDocumentFragment();

                for (const game of gamesInChunk) {
                    if (matchesSearchTerms(game.GameName || '', normalizedSearchTerms) && !globalSeenGames.has(game.GameName)) {
                        globalSeenGames.add(game.GameName);
                        const cardHtml = createGameCard(game, termsForHighlight);
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = cardHtml;
                        if (tempDiv.firstElementChild) {
                            fragment.appendChild(tempDiv.firstElementChild);
                            newCardsAddedCount++;
                        }
                    }
                }
                resultsContainer.appendChild(fragment);
            } catch (err) {
                console.error(`Error loading or processing chunk ${chunkPath}:`, err);
            }
        }

        if (newCardsAddedCount === 0 && currentChunkIndex < currentChunkPaths.length) {
            isLoadingMore = false;
            await loadAndDisplayChunks(originalSearchTerm, normalizedSearchTerms, termsForHighlight);
            return;
        }

        if (currentChunkIndex < currentChunkPaths.length) {
            const sentinel = document.createElement('div');
            sentinel.id = 'lazy-load-sentinel';
            resultsContainer.appendChild(sentinel);

            if (intersectionObserver) intersectionObserver.disconnect();

            intersectionObserver = new IntersectionObserver(async (entries) => {
                if (entries[0].isIntersecting && !isLoadingMore) {
                    await loadAndDisplayChunks(originalSearchTerm, normalizedSearchTerms, termsForHighlight);
                }
            }, { threshold: 0.1 });
            intersectionObserver.observe(sentinel);
        } else {
            if (intersectionObserver) {
                intersectionObserver.disconnect();
                intersectionObserver = null;
            }
        }
        isLoadingMore = false;
    }

    async function searchGames(searchTerm) {
        if (isSearching) return;
        isSearching = true;

        if (searchTimeout) clearTimeout(searchTimeout);
        if (intersectionObserver) {
            intersectionObserver.disconnect();
            intersectionObserver = null;
        }
        currentChunkPaths = [];
        currentChunkIndex = 0;
        globalSeenGames.clear();
        isLoadingMore = false;

        resultsContainer.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p>Searching for "${searchTerm}"...</p>
            </div>`;
        
        if (pageHeader) {
            pageHeader.innerHTML = `
                <h2>Search Results</h2>
                <p>Displaying compression analysis for games matching "${searchTerm}".</p>
            `;
        }

        searchTimeout = setTimeout(async () => {
            try {
                if (!gameIndex) {
                    throw new Error('Game index not loaded. Cannot perform search.');
                }

                const trimmedSearchTerm = searchTerm.trim();
                if (!trimmedSearchTerm) {
                    displayInitialState();
                    isSearching = false;
                    return;
                }

                const termsForHighlight = trimmedSearchTerm.toLowerCase().split(/\s+/).filter(Boolean);
                const normalizedSearchTerms = termsForHighlight.map(normalize);

                const matchingChunkPathsSet = new Set();
                for (const [gameNameKey, chunkPathsForGame] of Object.entries(gameIndex)) {
                    if (matchesSearchTerms(gameNameKey, normalizedSearchTerms)) {
                        chunkPathsForGame.forEach(path => {
                            const filename = path.replace(/\.json$/, '') + '.json';
                            matchingChunkPathsSet.add(`./data/chunks/${filename}`);
                        });
                    }
                }
                currentChunkPaths = Array.from(matchingChunkPathsSet);

                if (currentChunkPaths.length === 0) {
                    resultsContainer.innerHTML = `
                        <div class="no-results">
                            <i class="fas fa-search"></i>
                            <h3>No results found for "${trimmedSearchTerm}"</h3>
                            <p>Try different search terms or check your spelling.</p>
                        </div>`;
                    isSearching = false;
                    return;
                }

                const loadingP = resultsContainer.querySelector('.loading p');
                if (loadingP) loadingP.textContent = `Calculating total results for "${trimmedSearchTerm}"...`;

                const totalResults = await getTotalResultsCount(currentChunkPaths, normalizedSearchTerms);

                if (totalResults === 0) {
                    resultsContainer.innerHTML = `
                        <div class="no-results">
                            <i class="fas fa-search"></i>
                            <h3>No results found for "${trimmedSearchTerm}"</h3>
                            <p>Try different search terms or check your spelling.</p>
                        </div>`;
                    isSearching = false;
                    return;
                }
                
                resultsContainer.innerHTML = '';

                const resultsHeader = document.createElement('div');
                resultsHeader.className = 'results-header';
                resultsHeader.innerHTML = `<h3>${totalResults} ${totalResults === 1 ? 'Result' : 'Results'} for "${trimmedSearchTerm}"</h3>`;
                resultsContainer.appendChild(resultsHeader);

                currentChunkIndex = 0;
                globalSeenGames.clear();

                await loadAndDisplayChunks(trimmedSearchTerm, normalizedSearchTerms, termsForHighlight);

            } catch (error) {
                console.error('Search failed:', error);
                resultsContainer.innerHTML = `
                    <div class="error">
                        <i class="fas fa-exclamation-triangle"></i>
                        <h3>Search Failed</h3>
                        <p>An error occurred: ${error.message}. Please try again.</p>
                    </div>`;
            } finally {
                isSearching = false;
            }
        }, 500);
    }

    function toggleClearButton() {
        if (searchInput.value.trim() !== '') {
            clearSearchButton.classList.add('visible');
        } else {
            clearSearchButton.classList.remove('visible');
        }
    }

    searchButton.addEventListener('click', () => searchGames(searchInput.value));
    searchInput.addEventListener('keyup', (e) => {
        toggleClearButton();
        if (e.key === 'Enter') {
            searchGames(searchInput.value);
        } else if (e.key === 'Escape' && searchInput.value.trim() !== '') {
            searchInput.value = '';
            toggleClearButton();
            displayInitialState();
        }
    });

    clearSearchButton.addEventListener('click', () => {
        searchInput.value = '';
        toggleClearButton();
        if (intersectionObserver) {
            intersectionObserver.disconnect();
            intersectionObserver = null;
        }
        displayInitialState();
    });

    searchInput.addEventListener('input', toggleClearButton);

    if (searchInput) searchInput.focus();
    loadGameIndex(); 
});