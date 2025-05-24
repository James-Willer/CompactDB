import json
import os
from pathlib import Path

def create_index():
    # Get all chunk files
    chunks_dir = Path('../data/chunks')
    if not chunks_dir.exists():
        print("No chunks directory found. Please run split_json.py first.")
        return
    
    index = {}
    
    # Process each chunk
    for chunk_file in chunks_dir.glob('*.json'):
        with open(chunk_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
            # Add each game to index
            for game in data:
                if game['GameName']:
                    game_name = game['GameName'].lower()
                    if game_name not in index:
                        index[game_name] = []
                    # Store just the filename (without any directory)
                    filename = chunk_file.name
                    index[game_name].append(filename)
    
    # Save index in data directory
    index_path = Path('../data/game_index.json')
    index_path.parent.mkdir(exist_ok=True)
    with open(index_path, 'w', encoding='utf-8') as f:
        json.dump(index, f, indent=2)
    
    print(f"Created index with {len(index)} unique game names")

if __name__ == '__main__':
    create_index()
