document.addEventListener('DOMContentLoaded', () => {
    // Format bytes to human readable format
    // Helper function to get compression type names
function getCompressionTypeName(type) {
    const typeNames = {
        0: 'XPRESS4K',
        1: 'XPRESS8K',
        2: 'XPRESS16K',
        3: 'LZX'
    };
    return typeNames[type] || `Unknown type ${type}`;
}

function formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Calculate compression savings with color coding
    function calculateSavings(before, after) {
        const savings = ((before - after) / before * 100).toFixed(1);
        let color = '#4bb543'; // green

        if (savings < 20 && savings >= 0) {
            color = '#f9c74f'; // yellow
        } else if (savings < 0) {
            color = '#ef476f'; // red
        }

        return { value: savings, color };
    }

    // Highlight matched terms in game names
    function highlightMatches(text, terms) {
        if (!terms || terms.length === 0) return text;

        // Escape special characters in search terms for regex safety
        const escapedTerms = terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const pattern = escapedTerms.join('|');
        const regex = new RegExp(`(${pattern})`, 'gi');

        return text.replace(regex, '<mark>$1</mark>');
    }

    // Normalize text for searching (lowercase, remove special chars except spaces)
    function normalize(text) {
        if (!text) return '';
        return text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    }

    // Checks if all search terms must be present in the game name
    function matchesSearchTerms(gameName, searchTerms) {
        const normalizedGameName = normalize(gameName);
        const gameWords = normalizedGameName.split(' ').filter(Boolean);

        // All search terms must be present in either the full name or individual words
        return searchTerms.every(term => {
            const normalizedTerm = normalize(term);
            // Check if term is present in full name or any word
            return normalizedGameName.includes(normalizedTerm) || 
                   gameWords.some(word => word.includes(normalizedTerm));
        });
    }

    // Create game card HTML
    function createGameCard(game, searchTerms) {
        const gameName = game.GameName || 'Unknown Game';
        const highlightedName = highlightMatches(gameName, searchTerms);

        // Find the best compression result
        let bestResult = { savings: -Infinity };
        game.CompressionResults.forEach(result => {
            const savings = (result.BeforeBytes - result.AfterBytes) / result.BeforeBytes * 100;
            if (savings > bestResult.savings) {
                bestResult = result;
                bestResult.savings = savings;
            }
        });

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
                            <tr>
                                <th>Type</th>
                                <th>Before</th>
                                <th>After</th>
                                <th>Savings</th>
                                <th>Entries</th>
                            </tr>
                        </thead>
                        <tbody>`;

        game.CompressionResults.forEach(result => {
            const savings = calculateSavings(result.BeforeBytes, result.AfterBytes);
            html += `
                <tr>
                    <td>${getCompressionTypeName(result.CompType)}</td>
                    <td>${formatBytes(result.BeforeBytes)}</td>
                    <td>${formatBytes(result.AfterBytes)}</td>
                    <td style="color: ${savings.color}">${savings.value}%</td>
                    <td>${result.TotalResults}</td>
                </tr>`;
        });

        html += `</tbody></table></div>`;

        if (Object.keys(game.PoorlyCompressedExtensions || {}).length > 0) {
            html += `
                <div class="extension-list">
                    <h4>Inefficient File Types</h4>
                    <div class="extension-grid">
                        ${Object.entries(game.PoorlyCompressedExtensions)
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 5)
                            .map(([ext, count]) => `
                                <div class="extension-item">
                                    <span class="extension-name">${ext}</span>
                                    <span class="extension-count">${count} files</span>
                                </div>`)
                            .join('')}
                    </div>
                </div>`;
        }

        html += `
        </div>`;

        return html;
    }

    // Search function with debounce
    let searchTimeout;
    let isSearching = false;

    async function searchGames(searchTerm) {
        if (isSearching) return;
        
        const container = document.getElementById('results-container');
        
        // Clear any existing timeout
        if (searchTimeout) {
            clearTimeout(searchTimeout);
        }
        
        // Show loading state
        container.innerHTML = `
            <div class="loading">
                <div class="spinner"></div>
                <p>Searching for "${searchTerm}"</p>
            </div>`;
        
        // Add a small delay to prevent too many requests
        isSearching = true;
        searchTimeout = setTimeout(async () => {
            try {
                // Use relative path for game index
                const response = await fetch('./data/game_index.json');
                if (!response.ok) {
                    throw new Error(`Failed to load game_index.json: ${response.status} ${response.statusText}`);
                }
                const index = await response.json();

                if (!searchTerm) {
                    container.innerHTML = '';
                    return;
                }

                const searchTerms = searchTerm.toLowerCase().split(/\s+/).filter(Boolean);
                // Normalize search terms for matching
                const normalizedSearchTerms = searchTerms.map(t => normalize(t));

                const matchingChunkPaths = new Set();

                // Find matching entries in index using robust matching
                for (const [gameName, chunkPaths] of Object.entries(index)) {
                    if (matchesSearchTerms(gameName, normalizedSearchTerms)) {
                        // Use relative paths for chunk files
                        chunkPaths.forEach(path => {
                            // Remove any existing .json extension and add it back
                            const filename = path.replace(/\.json$/, '') + '.json';
                            matchingChunkPaths.add(`./data/chunks/${filename}`);
                        });
                    }
                }

                if (matchingChunkPaths.size === 0) {
                    container.innerHTML = `
                        <div class="no-results">
                            <i class="fas fa-search"></i>
                            <h3>No results found for "${searchTerm}"</h3>
                            <p>Try different search terms or check your spelling</p>
                        </div>`;
                    return;
                }

                // Load chunk files and match actual games
                const results = [];
                const seen = new Set();

                for (const chunkPath of matchingChunkPaths) {
                    try {
                        // Use relative path for chunk file
                        const res = await fetch(chunkPath);
                        if (!res.ok) {
                            console.warn(`Failed to fetch chunk ${chunkPath}: ${res.status}`);
                            continue;
                        }
                        const games = await res.json();

                        for (const game of games) {
                            if (matchesSearchTerms(game.GameName || '', normalizedSearchTerms) && 
                                !seen.has(game.GameName)) {
                                results.push(game);
                                seen.add(game.GameName);
                            }
                        }
                    } catch (err) {
                        console.error(`Failed to load chunk ${chunkPath}:`, err);
                    }
                }

                container.innerHTML = '';
                if (results.length === 0) {
                    container.innerHTML = `
                        <div class="no-results">
                            <i class="fas fa-search"></i>
                            <h3>No results found for "${searchTerm}"</h3>
                            <p>Try different search terms or check your spelling</p>
                        </div>`;
                } else {
                    // Sort results by confidence (highest first)
                    results.sort((a, b) => (b.Confidence || 0) - (a.Confidence || 0));

                    // Add results count header
                    const resultsHeader = document.createElement('div');
                    resultsHeader.className = 'results-header';
                    resultsHeader.innerHTML = `
                        <h3>${results.length} ${results.length === 1 ? 'Result' : 'Results'} for "${searchTerm}"</h3>
                    `;
                    container.appendChild(resultsHeader);

                    // Add results grid
                    const resultsGrid = document.createElement('div');
                    resultsGrid.className = 'results-grid';
                    container.appendChild(resultsGrid);

                    // Add each result card
                    results.forEach(game => {
                        const html = createGameCard(game, searchTerms);
                        const wrapper = document.createElement('div');
                        wrapper.innerHTML = html;
                        resultsGrid.appendChild(wrapper.firstElementChild);
                    });
                }

            } catch (error) {
                console.error('Search failed:', error);
                container.innerHTML = `
                    <div class="error">
                        <i class="fas fa-exclamation-triangle"></i>
                        <h3>Search Failed</h3>
                        <p>An error occurred while searching. Please try again later.</p>
                    </div>`;
            } finally {
                isSearching = false;
            }
        }, 500); // 500ms debounce
    }

    // Initialize search functionality
    const searchInput = document.getElementById('search-input');
    const searchButton = document.getElementById('search-button');


    // Add event listeners
    searchButton.addEventListener('click', () => {
        const searchTerm = searchInput.value.trim();
        if (searchTerm) {
            searchGames(searchTerm);
        }
    });

    searchInput.addEventListener('keyup', (e) => {
        if (e.key === 'Enter') {
            const searchTerm = e.target.value.trim();
            if (searchTerm) {
                searchGames(searchTerm);
            }
        }
    });

    // Focus the search input on page load
    searchInput.focus();
});
